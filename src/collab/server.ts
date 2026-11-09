// ScriptlZ collaboration server — Node 18+, no dependencies.
// Build: npm run build:server  →  server/collab-server.mjs
// Run:   node server/collab-server.mjs [--port 4735] [--host 0.0.0.0] [--data ./scriptz-rooms] [--cert cert.pem --key key.pem]
import { officialProject } from '../core/suggest';
import http from 'node:http';
import https from 'node:https';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Duplex } from 'node:stream';
import { applyChange, hashDoc, transformChange, type Change, type SyncDoc } from './ot';
import { docToProject, projectToDoc } from './sync';
import { loadProject } from '../core/migrate';
import { toHtml } from '../io/text';
import type { Project } from '../core/model';

const args = process.argv.slice(2);
const arg = (name: string, def: string) => { const i = args.indexOf('--' + name); return i >= 0 && args[i + 1] ? args[i + 1] : process.env['SCRIPTZ_' + name.toUpperCase()] ?? def; };
const PORT = Number(arg('port', '4735'));
const HOST = arg('host', '0.0.0.0');
const DATA = path.resolve(arg('data', './scriptz-rooms'));
const CERT = arg('cert', ''), KEY = arg('key', '');
const MAX_MSG = 48 * 1024 * 1024;
const HISTORY = 5000;
fs.mkdirSync(DATA, { recursive: true });

type Role = 'owner' | 'editor' | 'viewer';
interface Conn { id: string; sock: Duplex; name: string; color: string; role: Role; alive: boolean }
interface Room { id: string; base: Project; doc: SyncDoc; rev: number; history: Change[]; historyStart: number; tokens: Record<Role, string>; conns: Set<Conn>; graveyard: Map<string, string | null>; dirty: boolean; updatedAt: number }

const rooms = new Map<string, Room>();
const token = () => crypto.randomBytes(18).toString('base64url');
const roomFile = (id: string) => path.join(DATA, `${id.replace(/[^\w-]/g, '')}.json`);

function loadRoom(id: string): Room | null {
  if (rooms.has(id)) return rooms.get(id)!;
  const f = roomFile(id);
  if (!fs.existsSync(f)) return null;
  try {
    const j = JSON.parse(fs.readFileSync(f, 'utf8'));
    const r: Room = { id, base: loadProject(j.base), doc: j.doc, rev: j.rev, history: [], historyStart: j.rev, tokens: j.tokens, conns: new Set(), graveyard: new Map(Array.isArray(j.graveyard) ? j.graveyard : []), dirty: false, updatedAt: j.updatedAt ?? Date.now() };
    rooms.set(id, r);
    return r;
  } catch (e) { console.error('room load failed', id, e); return null; }
}

function persist(r: Room) {
  if (!r.dirty) return;
  r.dirty = false;
  const tmp = roomFile(r.id) + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify({ base: r.base, doc: r.doc, rev: r.rev, tokens: r.tokens, updatedAt: r.updatedAt, graveyard: [...r.graveyard] }));
  fs.renameSync(tmp, roomFile(r.id));
}
setInterval(() => { for (const r of rooms.values()) { try { persist(r); } catch (e) { console.error(e); } } }, 3000).unref();

function roleOf(r: Room, tk: string): Role | null {
  const given = Buffer.from(tk.slice(0, 64).padEnd(64), 'latin1');
  for (const role of ['owner', 'editor', 'viewer'] as Role[]) {
    const want = Buffer.from((r.tokens[role] ?? '').padEnd(64), 'latin1');
    if (r.tokens[role] && want.length === given.length && crypto.timingSafeEqual(want, given)) return role;
  }
  return null;
}

// ---------------------------------------------------------------- WebSocket framing

function sendFrame(sock: Duplex, data: string, opcode = 1) {
  const payload = Buffer.from(data, 'utf8');
  const len = payload.length;
  let header: Buffer;
  if (len < 126) { header = Buffer.alloc(2); header[1] = len; }
  else if (len < 65536) { header = Buffer.alloc(4); header[1] = 126; header.writeUInt16BE(len, 2); }
  else { header = Buffer.alloc(10); header[1] = 127; header.writeBigUInt64BE(BigInt(len), 2); }
  header[0] = 0x80 | opcode;
  try { sock.write(Buffer.concat([header, payload])); } catch { /* closed */ }
}

function send(c: Conn, msg: unknown) { sendFrame(c.sock, JSON.stringify(msg)); }

function attachParser(sock: Duplex, onText: (s: string) => void, onClose: () => void) {
  let buf = Buffer.alloc(0);
  let fragments: Buffer[] = [];
  sock.on('data', (chunk: Buffer) => {
    buf = Buffer.concat([buf, chunk]);
    for (;;) {
      if (buf.length < 2) return;
      const fin = (buf[0] & 0x80) !== 0;
      const op = buf[0] & 0x0f;
      const masked = (buf[1] & 0x80) !== 0;
      let len = buf[1] & 0x7f;
      let off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (buf.length < 10) return; const big = buf.readBigUInt64BE(2); if (big > BigInt(MAX_MSG)) { sock.destroy(); return; } len = Number(big); off = 10; }
      if (len > MAX_MSG) { sock.destroy(); return; }
      const maskLen = masked ? 4 : 0;
      if (buf.length < off + maskLen + len) return;
      const mask = masked ? buf.subarray(off, off + 4) : null;
      const payload = Buffer.from(buf.subarray(off + maskLen, off + maskLen + len));
      if (mask) for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
      buf = buf.subarray(off + maskLen + len);
      if (op === 8) { try { sendFrame(sock, '', 8); } catch { /* ignore */ } sock.end(); onClose(); return; }
      if (op === 9) { const pong = Buffer.concat([Buffer.from([0x8a, payload.length]), payload]); try { sock.write(pong); } catch { /* ignore */ } continue; }
      if (op === 10) continue;
      if (op === 1 || op === 0) {
        fragments.push(payload);
        if (fin) { const text = Buffer.concat(fragments).toString('utf8'); fragments = []; onText(text); }
      }
    }
  });
  sock.on('close', onClose);
  sock.on('error', onClose);
}

// ---------------------------------------------------------------- room protocol

function peersOf(r: Room, except?: Conn) { return [...r.conns].filter((c) => c !== except).map((c) => ({ id: c.id, name: c.name, color: c.color })); }

function hello(r: Room, c: Conn) {
  send(c, { type: 'hello', rev: r.rev, project: r.base, doc: r.doc, role: c.role, peers: peersOf(r, c), you: c.id, tokens: c.role === 'owner' ? r.tokens : undefined });
}

function onMessage(r: Room, c: Conn, raw: string) {
  let m: { type: string; rev?: number; seq?: number; change?: Change; anchor?: unknown; focus?: unknown };
  try { m = JSON.parse(raw); } catch { return; }
  if (m.type === 'resync') { hello(r, c); return; }
  if (m.type === 'cursor') { for (const o of r.conns) if (o !== c) send(o, { type: 'cursor', from: c.id, anchor: m.anchor ?? null, focus: m.focus ?? null }); return; }
  if (m.type !== 'op' || !Array.isArray(m.change)) return;
  if (c.role === 'viewer') { send(c, { type: 'error', message: 'read-only' }); hello(r, c); return; }
  const base = Number(m.rev);
  if (!Number.isFinite(base) || base < r.historyStart || base > r.rev) { hello(r, c); return; }
  let change = m.change;
  try {
    for (let k = base; k < r.rev; k++) change = transformChange(change, r.history[k - r.historyStart])[0];
    r.doc = applyChange(r.doc, change, r.graveyard);
  } catch (e) {
    console.warn('rejected op from', c.name, (e as Error).message);
    hello(r, c);
    return;
  }
  r.history.push(change);
  r.rev++;
  if (r.history.length > HISTORY) { const drop = r.history.length - HISTORY; r.history.splice(0, drop); r.historyStart += drop; }
  r.dirty = true;
  r.updatedAt = Date.now();
  send(c, { type: 'ack', seq: m.seq, rev: r.rev, hash: hashDoc(r.doc) });
  for (const o of r.conns) if (o !== c) send(o, { type: 'op', rev: r.rev, change, from: c.id });
}

// ---------------------------------------------------------------- HTTP

function json(res: http.ServerResponse, code: number, body: unknown) {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'GET,POST,OPTIONS' });
  res.end(JSON.stringify(body));
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => { size += c.length; if (size > MAX_MSG) { reject(new Error('too large')); req.destroy(); return; } chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function handle(req: http.IncomingMessage, res: http.ServerResponse) {
  const url = new URL(req.url ?? '/', 'http://x');
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-max-age': '86400' }); res.end(); return; }
  if (url.pathname === '/health') return json(res, 200, { ok: true, rooms: rooms.size });
  if (url.pathname === '/api/rooms' && req.method === 'POST') {
    try {
      const body = JSON.parse(await readBody(req)) as { project: unknown };
      const project = loadProject(body.project);
      const id = crypto.randomBytes(8).toString('base64url');
      const r: Room = { id, base: { ...project, blocks: [] }, doc: projectToDoc(project), rev: 0, history: [], historyStart: 0, tokens: { owner: token(), editor: token(), viewer: token() }, conns: new Set(), graveyard: new Map(), dirty: true, updatedAt: Date.now() };
      rooms.set(id, r);
      persist(r);
      return json(res, 201, { room: id, tokens: r.tokens });
    } catch (e) { return json(res, 400, { error: String((e as Error).message) }); }
  }
  const view = /^\/view\/([\w-]+)$/.exec(url.pathname);
  if (view && req.method === 'GET') {
    const r = loadRoom(view[1]);
    if (!r || !roleOf(r, url.searchParams.get('token') ?? '')) { res.writeHead(404, { 'content-type': 'text/plain' }); res.end('Not found'); return; }
    const html = toHtml(officialProject(docToProject(r.base, r.doc))).replace('</body>', `<script>setTimeout(()=>location.reload(),60000)</script></body>`);
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    res.end(html);
    return;
  }
  res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('ScriptlZ collaboration server is running.\n');
}

const server = CERT && KEY ? https.createServer({ cert: fs.readFileSync(CERT), key: fs.readFileSync(KEY) }, handle) : http.createServer(handle);

server.on('upgrade', (req, sock) => {
  const url = new URL(req.url ?? '/', 'http://x');
  const key = req.headers['sec-websocket-key'];
  if (url.pathname !== '/ws' || typeof key !== 'string') { sock.destroy(); return; }
  const r = loadRoom(url.searchParams.get('room') ?? '');
  const role = r ? roleOf(r, url.searchParams.get('token') ?? '') : null;
  if (!r || !role) { sock.write('HTTP/1.1 403 Forbidden\r\n\r\n'); sock.destroy(); return; }
  const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  sock.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  const c: Conn = { id: crypto.randomBytes(6).toString('base64url'), sock, name: (url.searchParams.get('name') ?? 'Anon').slice(0, 40), color: (url.searchParams.get('color') ?? '#e8590c').slice(0, 16), role, alive: true };
  r.conns.add(c);
  let closed = false;
  attachParser(sock, (text) => onMessage(r, c, text), () => {
    if (closed) return;
    closed = true;
    r.conns.delete(c);
    for (const o of r.conns) send(o, { type: 'leave', id: c.id });
    try { persist(r); } catch { /* ignore */ }
  });
  hello(r, c);
  for (const o of r.conns) if (o !== c) send(o, { type: 'join', peer: { id: c.id, name: c.name, color: c.color } });
});

// Keep connections alive through proxies.
setInterval(() => { for (const r of rooms.values()) for (const c of r.conns) { try { c.sock.write(Buffer.from([0x89, 0])); } catch { /* ignore */ } } }, 25000).unref();

server.listen(PORT, HOST, () => {
  console.log(`ScriptlZ collaboration server on ${CERT ? 'https/wss' : 'http/ws'}://${HOST}:${PORT}  ·  data: ${DATA}`);
});

for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => { for (const r of rooms.values()) { r.dirty = true; try { persist(r); } catch { /* ignore */ } } process.exit(0); });
