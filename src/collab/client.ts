// Real-time collaboration client: OT state machine over WebSocket, presence, consistency checks.
import { getState, setState, subscribe, toast } from '../app/store';
import { getEditor, adoptProject } from '../app/actions';
import { block, type Project } from '../core/model';
import { loadProject } from '../core/migrate';
import { applyChange, hashDoc, mapPosition, transformChange, type Change, type SyncDoc } from './ot';
import { diffDocs, docToProject, projectToDoc } from './sync';
import { clearRemoteCursors, removeRemoteCursor, setRemoteCursor } from './presence';
import type { Pos, Sel } from '../editor/engine';
import { t } from '../i18n';

export interface Invite { server: string; room: string; token: string }

type ServerMsg =
  | { type: 'hello'; rev: number; project: unknown; doc: SyncDoc; role: 'owner' | 'editor' | 'viewer'; peers: Peer[]; you: string; tokens?: Record<string, string> }
  | { type: 'ack'; seq: number; rev: number; hash: string }
  | { type: 'op'; rev: number; change: Change; from: string }
  | { type: 'cursor'; from: string; anchor: Pos | null; focus: Pos | null }
  | { type: 'join'; peer: Peer }
  | { type: 'leave'; id: string }
  | { type: 'error'; message: string }
  | { type: 'resync' };

interface Peer { id: string; name: string; color: string }

export function httpBase(server: string): string {
  return server.replace(/^ws(s?):\/\//i, 'http$1://').replace(/\/ws\/?$/, '').replace(/\/+$/, '');
}
function wsBase(server: string): string {
  return server.replace(/^http(s?):\/\//i, 'ws$1://').replace(/\/+$/, '');
}

export function parseInvite(text: string): Invite | null {
  const s = text.trim();
  const m = /^(wss?:\/\/[^#\s]+|https?:\/\/[^#\s]+)#room=([\w-]+)&token=([\w-]+)$/i.exec(s);
  if (m) return { server: m[1], room: m[2], token: m[3] };
  try {
    const u = new URL(s);
    const room = u.searchParams.get('room') ?? /\/view\/([\w-]+)/.exec(u.pathname)?.[1];
    const token = u.searchParams.get('token');
    if (room && token) return { server: `${u.protocol}//${u.host}`, room, token };
  } catch { /* not a URL */ }
  return null;
}

export function inviteText(server: string, room: string, token: string): string { return `${wsBase(server)}#room=${room}&token=${token}`; }
export function viewUrl(server: string, room: string, token: string): string { return `${httpBase(server)}/view/${room}?token=${token}`; }

class Client {
  ws: WebSocket | null = null;
  invite: Invite | null = null;
  rev = 0;
  seq = 0;
  pending: { seq: number; change: Change } | null = null;
  buffer: Change | null = null;
  base: SyncDoc | null = null;
  graveyard = new Map<string, string | null>();
  unsub: (() => void) | null = null;
  applyingRemote = false;
  retry = 0;
  retryTimer = 0;
  cursorTimer = 0;
  lastCursor = '';
  closedByUser = false;
  peers: Peer[] = [];
  tokens: Record<string, string> = {};

  status(patch: Partial<ReturnType<typeof getState>['collab']>) { setState((s) => ({ collab: { ...s.collab, ...patch } })); }

  async connect(inv: Invite): Promise<void> {
    this.disconnect(false);
    this.closedByUser = false;
    this.invite = inv;
    this.status({ state: 'connecting', room: inv.room, message: '' });
    let s = getState().settings;
    if (!s.collab.name && !s.author) {
      // Never broadcast "You": pick a friendly default once and remember it.
      const { setSettings } = await import('../app/actions');
      setSettings({ collab: { ...s.collab, name: `${t('co.anon')} ${10 + Math.floor(Math.random() * 90)}` } });
      s = getState().settings;
    }
    const name = encodeURIComponent(s.collab.name || s.author);
    const color = encodeURIComponent(s.collab.color);
    const url = `${wsBase(inv.server)}/ws?room=${encodeURIComponent(inv.room)}&token=${encodeURIComponent(inv.token)}&name=${name}&color=${color}`;
    let ws: WebSocket;
    try { ws = new WebSocket(url); } catch (e) { this.status({ state: 'error', message: String((e as Error).message) }); return; }
    this.ws = ws;
    ws.onmessage = (ev) => { try { this.onMessage(JSON.parse(String(ev.data)) as ServerMsg); } catch (e) { console.error(e); this.requestResync(); } };
    ws.onclose = () => {
      this.ws = null;
      clearRemoteCursors();
      if (this.closedByUser) { this.status({ state: 'off', peers: [], role: '' }); return; }
      this.status({ state: 'offline', peers: [] });
      // Exponential back-off; local edits are kept and re-sent after reconnecting.
      clearTimeout(this.retryTimer);
      this.retryTimer = window.setTimeout(() => { if (this.invite) void this.reconnect(); }, Math.min(30000, 1000 * 2 ** this.retry++));
    };
    ws.onerror = () => this.status({ message: t('err.network') });
  }

  private async reconnect() {
    if (!this.invite) return;
    // Unsent local work survives in the project; after the new hello we diff it against the server state.
    await this.connect(this.invite);
  }

  disconnect(user = true): void {
    this.closedByUser = user;
    clearTimeout(this.retryTimer);
    this.unsub?.(); this.unsub = null;
    clearInterval(this.cursorTimer);
    if (this.ws) { try { this.ws.close(); } catch { /* ignore */ } }
    this.ws = null;
    if (user) { this.invite = null; clearRemoteCursors(); this.status({ state: 'off', room: '', role: '', peers: [], message: '' }); }
  }

  private send(msg: unknown) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(msg)); }

  private onMessage(m: ServerMsg) {
    switch (m.type) {
      case 'hello': return this.onHello(m);
      case 'ack': {
        if (!this.pending || this.pending.seq !== m.seq) return;
        this.rev = m.rev;
        this.pending = null;
        if (this.buffer) { const c = this.buffer; this.buffer = null; this.sendChange(c); }
        else if (this.base && hashDoc(this.base) !== m.hash) this.requestResync();
        return;
      }
      case 'op': return this.onRemote(m.change, m.rev);
      case 'cursor': {
        const peer = this.peers.find((p) => p.id === m.from);
        if (peer) setRemoteCursor({ id: peer.id, name: peer.name, color: peer.color, anchor: m.anchor, focus: m.focus, at: Date.now() });
        return;
      }
      case 'join': this.peers = [...this.peers.filter((p) => p.id !== m.peer.id), m.peer]; this.status({ peers: this.peers }); toast(t('co.joined', { name: m.peer.name }), 'info', undefined, 2500); return;
      case 'leave': this.peers = this.peers.filter((p) => p.id !== m.id); removeRemoteCursor(m.id); this.status({ peers: this.peers }); return;
      case 'resync': return this.requestResync();
      case 'error': this.status({ state: 'error', message: m.message }); toast(m.message, 'error'); return;
    }
  }

  private async onHello(m: Extract<ServerMsg, { type: 'hello' }>) {
    this.retry = 0;
    this.rev = m.rev;
    this.pending = null;
    this.buffer = null;
    this.graveyard = new Map();
    this.peers = m.peers;
    if (m.tokens) this.tokens = m.tokens;
    const local = getState().project;
    const remoteBase = loadProject(m.project);
    let unsynced: Change = [];
    if (local && local.id === remoteBase.id && this.base) {
      // Reconnection: keep local edits made while offline (diff against our last synced state).
      unsynced = diffDocs(this.base, projectToDoc(local));
    }
    const merged = docToProject(local && local.id === remoteBase.id ? local : remoteBase, m.doc);
    this.base = m.doc;
    if (!local || local.id !== remoteBase.id) await adoptProject(merged, { message: t('co.joinedRoom', { title: merged.title }) });
    else this.adoptRemote(merged);
    this.status({ state: 'online', role: m.role, peers: m.peers, message: '' });
    if (unsynced.length && m.role !== 'viewer') { this.base = applyChange(this.base, unsynced, this.graveyard); this.adoptRemote(docToProject(getState().project!, this.base)); this.sendChange(unsynced); }
    this.watch();
  }

  private watch() {
    this.unsub?.();
    let last = getState().project;
    this.unsub = subscribe(() => {
      const p = getState().project;
      if (p === last) return;
      last = p;
      if (!p || this.applyingRemote || !this.base) return;
      this.onLocal(p);
    });
    // Cursor broadcast.
    clearInterval(this.cursorTimer);
    this.cursorTimer = window.setInterval(() => {
      const ed = getEditor();
      const sel = ed?.getSelection() ?? null;
      const key = JSON.stringify(sel);
      if (key !== this.lastCursor) { this.lastCursor = key; this.send({ type: 'cursor', anchor: sel?.anchor ?? null, focus: sel?.focus ?? null }); }
    }, 400);
  }

  private onLocal(p: Project) {
    if (!this.base) return;
    const doc = projectToDoc(p);
    const change = diffDocs(this.base, doc);
    if (!change.length) return;
    if (getState().collab.role === 'viewer') {
      // Read-only: revert local edits.
      this.adoptRemote(docToProject(p, this.base));
      return;
    }
    this.base = doc;
    if (this.pending) this.buffer = this.buffer ? [...this.buffer, ...change] : change;
    else this.sendChange(change);
  }

  private sendChange(change: Change) {
    this.pending = { seq: ++this.seq, change };
    this.send({ type: 'op', rev: this.rev, seq: this.seq, change });
  }

  private onRemote(change: Change, rev: number) {
    const p = getState().project;
    if (!p || !this.base) return;
    // Flush local edits not yet diffed.
    this.onLocal(p);
    let c = change;
    if (this.pending) { const [pend, cc] = transformChange(this.pending.change, c); this.pending = { ...this.pending, change: pend }; c = cc; }
    if (this.buffer) { const [buf, cc] = transformChange(this.buffer, c); this.buffer = buf; c = cc; }
    try {
      const sel = getEditor()?.getSelection() ?? null;
      this.base = applyChange(this.base, c, this.graveyard);
      this.rev = rev;
      this.adoptRemote(docToProject(getState().project!, this.base), sel ? transformSel(sel, c) : null);
      // Everything was deleted remotely: recreate an empty scene heading as a regular, synced edit.
      if (!this.base.blocks.length && getState().collab.role !== 'viewer') queueMicrotask(() => void import('../app/actions').then((m) => m.updateProject((x) => (x.blocks.length ? x : { ...x, blocks: [block('scene', '')] }))));
    } catch (e) {
      console.error(e);
      this.requestResync();
    }
  }

  private adoptRemote(p: Project, sel?: Sel | null) {
    this.applyingRemote = true;
    try {
      const ed = getEditor();
      if (ed && ed.getBlocks() !== p.blocks) ed.setBlocks(p.blocks, { history: false, local: false, sel: sel ?? undefined });
      setState({ project: p });
    } finally { this.applyingRemote = false; }
    // Persist locally (without the saving touching sync state).
    void import('../app/actions').then((m) => m.markDirty());
  }

  requestResync() { this.send({ type: 'resync' }); }
}

function transformSel(sel: Sel, change: Change): Sel {
  const map = (p: Pos): Pos => {
    let off = p.off;
    for (const op of change) if (op.t === 'text' && op.id === p.id) off = mapPosition(off, op.op, false); // remote text typed exactly at my caret goes after it
    return { id: p.id, off };
  };
  return { anchor: map(sel.anchor), focus: map(sel.focus) };
}

export const collab = new Client();

/** Owner: publish the current project as a new room. */
export async function shareProject(server: string): Promise<{ room: string; tokens: Record<string, string> } | null> {
  const p = getState().project;
  if (!p) return null;
  const s = getState().settings;
  const r = await fetch(httpBase(server) + '/api/rooms', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ project: p, name: s.collab.name || s.author || t('co.anon') }),
  });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const j = (await r.json()) as { room: string; tokens: Record<string, string> };
  await collab.connect({ server, room: j.room, token: j.tokens.owner });
  collab.tokens = j.tokens;
  return j;
}
