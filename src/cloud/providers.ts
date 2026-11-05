// Cloud storage providers. Both keep ScriptZ files in a folder the app owns:
// Dropbox → "Apps/ScriptZ" (app-folder access), Google Drive → only files ScriptZ created (drive.file).
export interface RemoteFile { id: string; name: string; modified: string; rev: string }

export interface CloudProvider {
  id: 'dropbox' | 'gdrive';
  list(): Promise<RemoteFile[]>;
  download(f: RemoteFile): Promise<Uint8Array>;
  upload(name: string, data: Uint8Array, existing?: RemoteFile): Promise<RemoteFile>;
  remove(f: RemoteFile): Promise<void>;
}

/** App credentials. They are public identifiers (no secrets); the user can also set their own in Settings. */
export const CLOUD_APPS = {
  dropboxKey: '',
  googleClientId: '',
};

export class CloudAuthError extends Error { constructor(msg = 'auth') { super(msg); this.name = 'CloudAuthError'; } }

// ---------------------------------------------------------------- tokens (per device)
const TK = 'sz.cloud.tokens.v1';
export interface Tokens { access: string; refresh?: string; expires: number }
export function readTokens(p: string): Tokens | null { try { return (JSON.parse(localStorage.getItem(TK) || '{}') as Record<string, Tokens>)[p] ?? null; } catch { return null; } }
export function writeTokens(p: string, t: Tokens | null): void {
  try { const all = JSON.parse(localStorage.getItem(TK) || '{}') as Record<string, Tokens>; if (t) all[p] = t; else delete all[p]; localStorage.setItem(TK, JSON.stringify(all)); } catch { /* private mode */ }
}

// ---------------------------------------------------------------- PKCE
const b64u = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export async function pkce(): Promise<{ verifier: string; challenge: string }> {
  const r = crypto.getRandomValues(new Uint8Array(48));
  const verifier = b64u(r);
  const challenge = b64u(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  return { verifier, challenge };
}

/** Redirect page for web logins (served next to the app). */
export const redirectUri = () => new URL('oauth.html', document.baseURI).href;

/** Opens the login in a popup and resolves with the ?code= it returns to oauth.html. */
export function popupCode(url: string): Promise<string> {
  return new Promise((res, rej) => {
    const w = window.open(url, 'sz-oauth', 'width=520,height=720');
    if (!w) { rej(new Error('popup-blocked')); return; }
    const done = (code: string | null, err?: string) => { window.removeEventListener('message', on); clearInterval(timer); if (code) res(code); else rej(new Error(err || 'cancelled')); };
    const on = (e: MessageEvent) => { if (e.origin !== location.origin || (e.data as { type?: string })?.type !== 'sz-oauth') return; const d = e.data as { code?: string; error?: string }; done(d.code ?? null, d.error); };
    window.addEventListener('message', on);
    const timer = setInterval(() => { if (w.closed) { const r = localStorage.getItem('sz.oauth.result'); localStorage.removeItem('sz.oauth.result'); if (r) { const d = JSON.parse(r) as { code?: string; error?: string }; done(d.code ?? null, d.error); } else done(null, 'cancelled'); } }, 600);
  });
}

// ---------------------------------------------------------------- Dropbox
export class Dropbox implements CloudProvider {
  id = 'dropbox' as const;
  constructor(private key: string) {}

  /** Web: popup with redirect. Desktop: Dropbox shows a code that the user pastes (askCode). */
  static async connect(key: string, opts: { desktop: boolean; open: (url: string) => void; askCode: () => Promise<string | null> }): Promise<void> {
    const { verifier, challenge } = await pkce();
    const q = new URLSearchParams({ client_id: key, response_type: 'code', code_challenge: challenge, code_challenge_method: 'S256', token_access_type: 'offline' });
    if (!opts.desktop) q.set('redirect_uri', redirectUri());
    const url = 'https://www.dropbox.com/oauth2/authorize?' + q;
    let code: string | null;
    if (opts.desktop) { opts.open(url); code = await opts.askCode(); } else code = await popupCode(url);
    if (!code) throw new Error('cancelled');
    const body = new URLSearchParams({ code: code.trim(), grant_type: 'authorization_code', code_verifier: verifier, client_id: key });
    if (!opts.desktop) body.set('redirect_uri', redirectUri());
    const r = await fetch('https://api.dropboxapi.com/oauth2/token', { method: 'POST', body });
    if (!r.ok) throw new Error('dropbox-token ' + r.status);
    const j = await r.json() as { access_token: string; refresh_token: string; expires_in: number };
    writeTokens('dropbox', { access: j.access_token, refresh: j.refresh_token, expires: Date.now() + (j.expires_in - 60) * 1000 });
  }

  private async token(): Promise<string> {
    const t = readTokens('dropbox');
    if (!t) throw new CloudAuthError();
    if (Date.now() < t.expires) return t.access;
    if (!t.refresh) throw new CloudAuthError();
    const r = await fetch('https://api.dropboxapi.com/oauth2/token', { method: 'POST', body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: t.refresh, client_id: this.key }) });
    if (!r.ok) { if (r.status === 400 || r.status === 401) writeTokens('dropbox', null); throw new CloudAuthError(); }
    const j = await r.json() as { access_token: string; expires_in: number };
    writeTokens('dropbox', { ...t, access: j.access_token, expires: Date.now() + (j.expires_in - 60) * 1000 });
    return j.access_token;
  }

  private async api<T>(path: string, arg: unknown): Promise<T> {
    const r = await fetch('https://api.dropboxapi.com/2/' + path, { method: 'POST', headers: { Authorization: 'Bearer ' + await this.token(), 'Content-Type': 'application/json' }, body: JSON.stringify(arg) });
    if (r.status === 401) throw new CloudAuthError();
    if (!r.ok) throw new Error(`dropbox ${path} ${r.status}`);
    return r.json() as Promise<T>;
  }

  async list(): Promise<RemoteFile[]> {
    type E = { '.tag': string; id: string; name: string; server_modified: string; rev: string; path_lower: string };
    let r = await this.api<{ entries: E[]; cursor: string; has_more: boolean }>('files/list_folder', { path: '', recursive: false });
    const all = [...r.entries];
    while (r.has_more) { r = await this.api('files/list_folder/continue', { cursor: r.cursor }); all.push(...r.entries); }
    return all.filter((e) => e['.tag'] === 'file' && e.name.endsWith('.scriptz')).map((e) => ({ id: e.path_lower, name: e.name, modified: e.server_modified, rev: e.rev }));
  }

  async download(f: RemoteFile): Promise<Uint8Array> {
    const r = await fetch('https://content.dropboxapi.com/2/files/download', { method: 'POST', headers: { Authorization: 'Bearer ' + await this.token(), 'Dropbox-API-Arg': JSON.stringify({ path: f.id }) } });
    if (!r.ok) throw new Error('dropbox download ' + r.status);
    return new Uint8Array(await r.arrayBuffer());
  }

  async upload(name: string, data: Uint8Array, existing?: RemoteFile): Promise<RemoteFile> {
    const arg = existing ? { path: existing.id, mode: { '.tag': 'update', update: existing.rev }, mute: true } : { path: '/' + name, mode: 'add', autorename: true, mute: true };
    // Dropbox-API-Arg must be ASCII: escape everything else.
    const header = JSON.stringify(arg).replace(/[\u007f-￿]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
    const r = await fetch('https://content.dropboxapi.com/2/files/upload', { method: 'POST', headers: { Authorization: 'Bearer ' + await this.token(), 'Dropbox-API-Arg': header, 'Content-Type': 'application/octet-stream' }, body: data as BodyInit });
    if (r.status === 409 && existing) return this.upload(name, data); // changed meanwhile: keep both
    if (!r.ok) throw new Error('dropbox upload ' + r.status);
    const e = await r.json() as { path_lower: string; name: string; server_modified: string; rev: string };
    return { id: e.path_lower, name: e.name, modified: e.server_modified, rev: e.rev };
  }

  async remove(f: RemoteFile): Promise<void> { await this.api('files/delete_v2', { path: f.id }); }
}

// ---------------------------------------------------------------- Google Drive
interface GisClient { requestAccessToken: (o?: { prompt?: string }) => void }
declare global { interface Window { google?: { accounts: { oauth2: { initTokenClient: (o: { client_id: string; scope: string; callback: (r: { access_token?: string; expires_in?: number; error?: string }) => void; error_callback?: (e: { type: string }) => void }) => GisClient } } } } }

function loadGis(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => res();
    s.onerror = () => rej(new Error('gis-load'));
    document.head.append(s);
  });
}

export class GoogleDrive implements CloudProvider {
  id = 'gdrive' as const;
  constructor(private clientId: string) {}

  /** Browser only (Google Identity Services). Tokens last an hour and are renewed without asking while the user stays signed in. */
  static async connect(clientId: string, prompt = 'consent'): Promise<void> {
    await loadGis();
    await new Promise<void>((res, rej) => {
      const c = window.google!.accounts.oauth2.initTokenClient({
        client_id: clientId, scope: 'https://www.googleapis.com/auth/drive.file',
        callback: (r) => { if (r.access_token) { writeTokens('gdrive', { access: r.access_token, expires: Date.now() + ((r.expires_in ?? 3600) - 60) * 1000 }); res(); } else rej(new Error(r.error || 'cancelled')); },
        error_callback: (e) => rej(new Error(e.type)),
      });
      c.requestAccessToken({ prompt });
    });
  }

  private async token(): Promise<string> {
    const t = readTokens('gdrive');
    if (t && Date.now() < t.expires) return t.access;
    try { await GoogleDrive.connect(this.clientId, ''); } catch { throw new CloudAuthError(); }
    return readTokens('gdrive')!.access;
  }

  private async req(url: string, init: RequestInit = {}): Promise<Response> {
    const r = await fetch(url, { ...init, headers: { ...(init.headers ?? {}), Authorization: 'Bearer ' + await this.token() } });
    if (r.status === 401) { writeTokens('gdrive', null); throw new CloudAuthError(); }
    if (!r.ok) throw new Error(`drive ${r.status}`);
    return r;
  }

  async list(): Promise<RemoteFile[]> {
    const out: RemoteFile[] = [];
    let page = '';
    do {
      const q = new URLSearchParams({ q: "appProperties has { key='scriptz' and value='1' } and trashed=false", fields: 'nextPageToken,files(id,name,modifiedTime,version)', pageSize: '200', spaces: 'drive' });
      if (page) q.set('pageToken', page);
      const j = await (await this.req('https://www.googleapis.com/drive/v3/files?' + q)).json() as { files: { id: string; name: string; modifiedTime: string; version: string }[]; nextPageToken?: string };
      out.push(...j.files.map((f) => ({ id: f.id, name: f.name, modified: f.modifiedTime, rev: f.version })));
      page = j.nextPageToken ?? '';
    } while (page);
    return out;
  }

  async download(f: RemoteFile): Promise<Uint8Array> {
    return new Uint8Array(await (await this.req(`https://www.googleapis.com/drive/v3/files/${f.id}?alt=media`)).arrayBuffer());
  }

  async upload(name: string, data: Uint8Array, existing?: RemoteFile): Promise<RemoteFile> {
    const meta = existing ? { name } : { name, mimeType: 'application/json', appProperties: { scriptz: '1' } };
    const boundary = 'sz' + Math.random().toString(36).slice(2);
    const body = new Blob([`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n`, data as BlobPart, `\r\n--${boundary}--`]);
    const url = existing ? `https://www.googleapis.com/upload/drive/v3/files/${existing.id}?uploadType=multipart&fields=id,name,modifiedTime,version` : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime,version';
    const j = await (await this.req(url, { method: existing ? 'PATCH' : 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body })).json() as { id: string; name: string; modifiedTime: string; version: string };
    return { id: j.id, name: j.name, modified: j.modifiedTime, rev: j.version };
  }

  async remove(f: RemoteFile): Promise<void> { await this.req(`https://www.googleapis.com/drive/v3/files/${f.id}`, { method: 'DELETE' }); }
}
