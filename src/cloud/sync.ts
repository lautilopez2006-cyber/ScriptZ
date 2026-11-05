// Two-way sync between the local library and a cloud folder. One file per script ("Title--id.scriptz").
// Remembers what each side looked like at the last sync, so it can tell who changed what:
// only local changed → upload; only remote changed → download; both → keep both (conflict copy).
import type { Project, ProjectSummary } from '../core/model';
import type { CloudProvider, RemoteFile } from './providers';

export interface SyncStore {
  list(): Promise<ProjectSummary[]>;
  load(id: string): Promise<Project>;
  save(p: Project): Promise<void>;
  serialize(p: Project): string;
  parse(text: string): Project;
  newId(): string;
}

/** Per script: the remote revision and local updatedAt seen at the last successful sync. */
export type SyncMeta = Record<string, { rev: string; file: string; local: string }>;

export interface SyncReport { uploaded: string[]; downloaded: string[]; conflicts: string[]; errors: string[] }

const ID_RE = /--([A-Za-z0-9_-]{6,})\.scriptz$/;
export const fileNameFor = (p: { id: string; title: string }) => `${(p.title || 'guion').replace(/[\\/:*?"<>|#%]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 60) || 'guion'}--${p.id}.scriptz`;
export const idOfFile = (name: string) => ID_RE.exec(name)?.[1] ?? null;

export async function syncLibrary(cloud: CloudProvider, store: SyncStore, meta: SyncMeta, onProgress?: (done: number, total: number) => void, otherLabel = 'otra versión'): Promise<{ report: SyncReport; meta: SyncMeta }> {
  const report: SyncReport = { uploaded: [], downloaded: [], conflicts: [], errors: [] };
  const next: SyncMeta = { ...meta };
  const [local, remote] = await Promise.all([store.list(), cloud.list()]);
  const remoteById = new Map<string, RemoteFile>();
  for (const f of remote) { const id = idOfFile(f.name); if (id) remoteById.set(id, f); }
  const localById = new Map(local.map((p) => [p.id, p]));
  const ids = [...new Set([...localById.keys(), ...remoteById.keys()])];
  let done = 0;
  const enc = new TextEncoder(), dec = new TextDecoder();
  const upload = async (p: Project, existing?: RemoteFile) => {
    const f = await cloud.upload(fileNameFor(p), enc.encode(store.serialize(p)), existing);
    next[p.id] = { rev: f.rev, file: f.id, local: p.updatedAt };
    report.uploaded.push(p.title || p.id);
  };
  for (const id of ids) {
    try {
      const l = localById.get(id);
      const r = remoteById.get(id);
      const m = meta[id];
      if (l && !r) {
        // Never synced, or deleted remotely after a sync. A deletion elsewhere doesn't delete here: upload again.
        await upload(await store.load(id));
      } else if (!l && r) {
        if (m && m.rev === r.rev) {
          // Deleted on this device after the last sync: leave the cloud copy alone (no remote deletes).
        } else {
          const p = store.parse(dec.decode(await cloud.download(r)));
          await store.save(p);
          next[id] = { rev: r.rev, file: r.id, local: p.updatedAt };
          report.downloaded.push(p.title || id);
        }
      } else if (l && r) {
        const localChanged = !m || m.local !== l.updatedAt;
        const remoteChanged = !m || m.rev !== r.rev;
        if (!localChanged && !remoteChanged) { done++; onProgress?.(done, ids.length); continue; }
        if (localChanged && !remoteChanged) await upload(await store.load(id), r);
        else if (!localChanged && remoteChanged) {
          const p = store.parse(dec.decode(await cloud.download(r)));
          await store.save(p);
          next[id] = { rev: r.rev, file: r.id, local: p.updatedAt };
          report.downloaded.push(p.title || id);
        } else {
          // Both changed. If the contents are the same (first sync of an existing copy), there's nothing to do.
          const theirs = store.parse(dec.decode(await cloud.download(r)));
          const mine = await store.load(id);
          if (JSON.stringify(theirs.blocks) === JSON.stringify(mine.blocks) && theirs.title === mine.title) {
            next[id] = { rev: r.rev, file: r.id, local: mine.updatedAt };
          } else {
            // Keep both: the cloud version comes in as a copy, this device's version goes up.
            const copy: Project = { ...theirs, id: store.newId(), title: `${theirs.title || 'Guion'} (${conflictLabel(r.modified, otherLabel)})` };
            await store.save(copy);
            await upload(mine, r);
            const fc = await cloud.upload(fileNameFor(copy), enc.encode(store.serialize(copy)));
            next[copy.id] = { rev: fc.rev, file: fc.id, local: copy.updatedAt };
            report.conflicts.push(mine.title || id);
          }
        }
      }
    } catch (e) {
      report.errors.push(String((e as Error)?.message ?? e));
      if ((e as Error)?.name === 'CloudAuthError') throw e;
    }
    done++;
    onProgress?.(done, ids.length);
  }
  return { report, meta: next };
}

function conflictLabel(iso: string, label: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return isNaN(+d) ? label : `${label} ${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
