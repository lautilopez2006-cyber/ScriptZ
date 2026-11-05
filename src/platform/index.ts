// Platform layer: Tauri desktop or plain browser (web / PWA). Everything async and feature-detected.
import type { Project, ProjectSummary } from '../core/model';
import { projectWords } from '../core/model';
import { loadProject } from '../core/migrate';

export const isTauri = (): boolean => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const core = await import('@tauri-apps/api/core');
  return core.invoke<T>(cmd, args);
}

export interface SnapshotSummary { id: string; kind: 'auto' | 'manual'; createdAtMs: number; revision: number; title: string; words: number; scenes: number }

export interface ProjectStore {
  list(): Promise<ProjectSummary[]>;
  load(id: string): Promise<Project>;
  save(project: Project): Promise<void>;
  remove(id: string): Promise<void>;
  snapshots(id: string): Promise<SnapshotSummary[]>;
  snapshot(id: string): Promise<SnapshotSummary>;
  restore(id: string, snapshotId: string): Promise<Project>;
  /** Read a backup without restoring it (for comparisons). */
  loadSnapshot(id: string, snapshotId: string): Promise<Project>;
  /** Linked external .scriptz file (synced on every save), if any. */
  linkedFile(id: string): Promise<string | null>;
  linkFile(id: string, path: string): Promise<void>;
}

export function summarize(p: Project): ProjectSummary {
  return { id: p.id, title: p.title, updatedAt: p.updatedAt, scenes: p.blocks.filter((b) => b.type === 'scene' && b.text.trim()).length, words: projectWords(p), template: p.template };
}

// ---------------------------------------------------------------- Tauri

class TauriStore implements ProjectStore {
  async list() { return invoke<ProjectSummary[]>('list_projects'); }
  async load(id: string) { return loadProject(await invoke<unknown>('load_project', { id })); }
  async save(project: Project) { await invoke('save_project', { project }); }
  async remove(id: string) { await invoke('delete_project', { id }); }
  async snapshots(id: string) { return invoke<SnapshotSummary[]>('list_snapshots', { id }); }
  async snapshot(id: string) { return invoke<SnapshotSummary>('create_snapshot', { id }); }
  async restore(id: string, snapshotId: string) { return loadProject(await invoke<unknown>('restore_snapshot', { id, snapshotId })); }
  async loadSnapshot(id: string, snapshotId: string) { return loadProject(await invoke<unknown>('load_snapshot', { id, snapshotId })); }
  async linkedFile(id: string) { return invoke<string | null>('get_project_file_path', { id }); }
  async linkFile(id: string, path: string) { await invoke('link_project_file', { id, path }); }
}

// ---------------------------------------------------------------- Web (IndexedDB)

const DB = 'scriptz';
const AUTO_INTERVAL = 10 * 60 * 1000;
const MAX_AUTO = 20;
const MAX_MANUAL = 30;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('snapshots')) {
        const s = db.createObjectStore('snapshots', { keyPath: 'key' });
        s.createIndex('project', 'projectId');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(db: IDBDatabase, stores: string[], mode: IDBTransactionMode, fn: (t: IDBTransaction) => IDBRequest<T> | void): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(stores, mode);
    let result: T;
    const r = fn(t);
    if (r) r.onsuccess = () => { result = r.result; };
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

interface SnapRow { key: string; projectId: string; kind: 'auto' | 'manual'; createdAtMs: number; data: Project }

class WebStore implements ProjectStore {
  private dbp: Promise<IDBDatabase> | null = null;
  private db() { return (this.dbp ??= openDb()); }

  async list(): Promise<ProjectSummary[]> {
    const db = await this.db();
    const rows = await tx<Project[]>(db, ['projects'], 'readonly', (t) => t.objectStore('projects').getAll());
    return (rows ?? []).map((r) => { try { return summarize(loadProject(r)); } catch { return null; } }).filter(Boolean).sort((a, b) => b!.updatedAt.localeCompare(a!.updatedAt)) as ProjectSummary[];
  }
  async load(id: string): Promise<Project> {
    const db = await this.db();
    const row = await tx<Project | undefined>(db, ['projects'], 'readonly', (t) => t.objectStore('projects').get(id));
    if (!row) {
      const snaps = await this.snapRows(id);
      if (snaps.length) return loadProject(snaps[0].data);
      throw new Error('not-found');
    }
    return loadProject(row);
  }
  async save(project: Project): Promise<void> {
    const db = await this.db();
    const old = await tx<Project | undefined>(db, ['projects'], 'readonly', (t) => t.objectStore('projects').get(project.id));
    if (old && old.revision > project.revision) throw new Error('conflict');
    if (old) {
      const snaps = await this.snapRows(project.id);
      const lastAuto = snaps.find((s) => s.kind === 'auto');
      if (!lastAuto || Date.now() - lastAuto.createdAtMs >= AUTO_INTERVAL) await this.addSnap(old, 'auto');
    }
    await tx(db, ['projects'], 'readwrite', (t) => t.objectStore('projects').put(JSON.parse(JSON.stringify(project))));
  }
  async remove(id: string): Promise<void> {
    const db = await this.db();
    const snaps = await this.snapRows(id);
    await tx(db, ['projects', 'snapshots'], 'readwrite', (t) => {
      t.objectStore('projects').delete(id);
      for (const s of snaps) t.objectStore('snapshots').delete(s.key);
    });
  }
  private async snapRows(id: string): Promise<SnapRow[]> {
    const db = await this.db();
    const rows = await tx<SnapRow[]>(db, ['snapshots'], 'readonly', (t) => t.objectStore('snapshots').index('project').getAll(id));
    return (rows ?? []).sort((a, b) => b.createdAtMs - a.createdAtMs);
  }
  private async addSnap(p: Project, kind: 'auto' | 'manual'): Promise<SnapRow> {
    const db = await this.db();
    const row: SnapRow = { key: `${p.id}:${Date.now()}:${kind}:${Math.random().toString(36).slice(2, 7)}`, projectId: p.id, kind, createdAtMs: Date.now(), data: JSON.parse(JSON.stringify(p)) };
    await tx(db, ['snapshots'], 'readwrite', (t) => t.objectStore('snapshots').put(row));
    const all = await this.snapRows(p.id);
    const extra = [...all.filter((s) => s.kind === 'auto').slice(MAX_AUTO), ...all.filter((s) => s.kind === 'manual').slice(MAX_MANUAL)];
    if (extra.length) await tx(db, ['snapshots'], 'readwrite', (t) => { for (const s of extra) t.objectStore('snapshots').delete(s.key); });
    return row;
  }
  private toSummary(r: SnapRow): SnapshotSummary {
    const s = summarize(loadProject(r.data));
    return { id: r.key, kind: r.kind, createdAtMs: r.createdAtMs, revision: r.data.revision, title: s.title, words: s.words, scenes: s.scenes };
  }
  async snapshots(id: string) { return (await this.snapRows(id)).map((r) => this.toSummary(r)); }
  async snapshot(id: string) { return this.toSummary(await this.addSnap(await this.load(id), 'manual')); }
  async restore(id: string, snapshotId: string): Promise<Project> {
    const db = await this.db();
    const row = await tx<SnapRow | undefined>(db, ['snapshots'], 'readonly', (t) => t.objectStore('snapshots').get(snapshotId));
    if (!row) throw new Error('not-found');
    const current = await this.load(id);
    await this.addSnap(current, 'manual');
    const restored = loadProject(row.data);
    restored.revision = Math.max(current.revision, restored.revision) + 1;
    restored.updatedAt = new Date().toISOString();
    await tx(db, ['projects'], 'readwrite', (t) => t.objectStore('projects').put(JSON.parse(JSON.stringify(restored))));
    return restored;
  }
  async loadSnapshot(_id: string, snapshotId: string): Promise<Project> {
    const db = await this.db();
    const row = await tx<SnapRow | undefined>(db, ['snapshots'], 'readonly', (t) => t.objectStore('snapshots').get(snapshotId));
    if (!row) throw new Error('not-found');
    return loadProject(row.data);
  }
  async linkedFile() { return null; }
  async linkFile() { throw new Error('unsupported'); }
}

let store: ProjectStore | null = null;
export function projectStore(): ProjectStore {
  return (store ??= isTauri() ? new TauriStore() : new WebStore());
}

// ---------------------------------------------------------------- files

export interface PickedFile { name: string; path?: string; bytes: Uint8Array }
export interface FileFilter { name: string; extensions: string[] }

export async function pickFile(filters: FileFilter[]): Promise<PickedFile | null> {
  if (isTauri()) {
    const dialog = await import('@tauri-apps/plugin-dialog');
    const fs = await import('@tauri-apps/plugin-fs');
    const path = await dialog.open({ multiple: false, directory: false, filters });
    if (!path || Array.isArray(path)) return null;
    const bytes = await fs.readFile(path as string);
    return { name: String(path).split(/[\\/]/).pop() ?? 'file', path: path as string, bytes };
  }
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = filters.flatMap((f) => f.extensions.map((e) => '.' + e)).join(',');
    input.style.display = 'none';
    document.body.appendChild(input);
    let done = false;
    input.onchange = async () => {
      done = true;
      const f = input.files?.[0];
      input.remove();
      if (!f) return resolve(null);
      resolve({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) });
    };
    window.addEventListener('focus', () => setTimeout(() => { if (!done) { input.remove(); resolve(null); } }, 800), { once: true });
    input.click();
  });
}

/** Ask where to save and write the file. Returns the path (desktop) or the file name (web), or null if cancelled. */
export async function saveFile(name: string, data: Uint8Array | string, filters: FileFilter[]): Promise<string | null> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  if (isTauri()) {
    const dialog = await import('@tauri-apps/plugin-dialog');
    const fs = await import('@tauri-apps/plugin-fs');
    const path = await dialog.save({ defaultPath: name, filters });
    if (!path) return null;
    await fs.writeFile(path, bytes);
    return path;
  }
  const mime = mimeOf(name);
  const blob = new Blob([bytes as BlobPart], { type: mime });
  const w = window as unknown as { showSaveFilePicker?: (o: unknown) => Promise<{ createWritable(): Promise<{ write(b: Blob): Promise<void>; close(): Promise<void> }> ; name: string }> };
  if (w.showSaveFilePicker) {
    try {
      const h = await w.showSaveFilePicker({ suggestedName: name, types: filters.map((f) => ({ description: f.name, accept: { [mimeOf('x.' + f.extensions[0])]: f.extensions.map((e) => '.' + e) } })) });
      const wr = await h.createWritable();
      await wr.write(blob);
      await wr.close();
      return h.name;
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return null;
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  // Chromium drops a non-ASCII download name ("última" → "download"), so strip accents in this fallback path.
  a.download = /^[\x20-\x7e]+$/.test(name) ? name : name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7e]/g, '_');
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  return name;
}

/** Desktop: choose a .scriptz path (for "Save as" / synced folder). */
export async function chooseScriptzPath(defaultName: string): Promise<string | null> {
  if (!isTauri()) return null;
  const dialog = await import('@tauri-apps/plugin-dialog');
  const p = await dialog.save({ defaultPath: defaultName, filters: [{ name: 'ScriptZ', extensions: ['scriptz'] }] });
  return p ?? null;
}

export function mimeOf(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'pdf': return 'application/pdf';
    case 'fdx': return 'application/xml';
    case 'docx': return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case 'epub': return 'application/epub+zip';
    case 'html': return 'text/html';
    case 'md': return 'text/markdown';
    case 'csv': return 'text/csv';
    case 'json': case 'scriptz': return 'application/json';
    case 'wav': return 'audio/wav';
    default: return 'text/plain';
  }
}

export async function openExternal(url: string): Promise<void> {
  if (isTauri()) {
    try { const o = await import('@tauri-apps/plugin-opener'); await o.openUrl(url); return; } catch { /* fall back */ }
  }
  window.open(url, '_blank', 'noopener');
}

// ---------------------------------------------------------------- Windows voices (desktop WAV export)

export async function windowsVoices(): Promise<{ name: string; lang: string }[]> {
  if (!isTauri()) return [];
  try { return await invoke<{ name: string; lang: string }[]>('list_windows_voices'); } catch { return []; }
}

export async function renderAudio(path: string, lines: { speaker: string; text: string; pause: number }[], voiceMap: Record<string, string>, speed: number): Promise<string> {
  return invoke<string>('render_script_audio', { path, lines, voiceMap, pronunciation: {}, speed });
}

export async function chooseWavPath(name: string): Promise<string | null> {
  if (!isTauri()) return null;
  const dialog = await import('@tauri-apps/plugin-dialog');
  return (await dialog.save({ defaultPath: name, filters: [{ name: 'WAV', extensions: ['wav'] }] })) ?? null;
}
