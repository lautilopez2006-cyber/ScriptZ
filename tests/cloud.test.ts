import { test, eq, ok } from './harness';
import { emptyProject, type Project } from '../src/core/model';
import { serializeProject, loadProject } from '../src/core/migrate';
import { syncLibrary, fileNameFor, idOfFile, type SyncStore, type SyncMeta } from '../src/cloud/sync';
import type { CloudProvider, RemoteFile } from '../src/cloud/providers';
import { summarize } from '../src/platform';

function fakeCloud() {
  const files = new Map<string, { f: RemoteFile; data: Uint8Array }>();
  let n = 0;
  const c: CloudProvider & { files: typeof files } = {
    id: 'dropbox', files,
    async list() { return [...files.values()].map((x) => x.f); },
    async download(f) { return files.get(f.id)!.data; },
    async upload(name, data, existing) { const id = existing?.id ?? '/' + name.toLowerCase(); const f = { id, name, modified: new Date(Date.UTC(2026, 10, 5, 12, ++n)).toISOString(), rev: 'r' + n }; files.set(id, { f, data }); return f; },
    async remove(f) { files.delete(f.id); },
  };
  return c;
}
function fakeStore(list: Project[]) {
  const db = new Map(list.map((p) => [p.id, p]));
  let k = 0;
  const s: SyncStore & { db: typeof db } = {
    db,
    async list() { return [...db.values()].map(summarize); },
    async load(id) { return structuredClone(db.get(id)!); },
    async save(p) { db.set(p.id, structuredClone(p)); },
    serialize: serializeProject,
    parse: (t) => loadProject(t),
    newId: () => 'copy' + ++k + 'xxxxxx',
  };
  return s;
}
const proj = (id: string, title: string, text: string, at: string) => { const p = emptyProject({ title }); p.id = id; p.updatedAt = at; p.blocks = [{ id: 'b1', type: 'action', text }]; return p; };

test('file names carry the project id', () => {
  const n = fileNameFor({ id: 'abc123def', title: 'La última luz: final?' });
  eq(n, 'La última luz final--abc123def.scriptz');
  eq(idOfFile(n), 'abc123def');
});

test('sync: first upload, download on another device, then edits flow both ways', async () => {
  const cloud = fakeCloud();
  const a = fakeStore([proj('aaaaaaaa1', 'Faro', 'Uno.', '2026-11-01T10:00:00Z')]);
  let r = await syncLibrary(cloud, a, {});
  eq(r.report.uploaded.length, 1);
  let metaA: SyncMeta = r.meta;
  // Second device starts empty and downloads.
  const b = fakeStore([]);
  r = await syncLibrary(cloud, b, {});
  eq(r.report.downloaded, ['Faro']);
  let metaB = r.meta;
  // Nothing changed: nothing happens.
  r = await syncLibrary(cloud, a, metaA);
  eq([r.report.uploaded.length, r.report.downloaded.length], [0, 0]);
  // B edits → uploads; A then downloads the edit.
  const pb = await b.load('aaaaaaaa1'); pb.blocks[0].text = 'Dos.'; pb.updatedAt = '2026-11-02T10:00:00Z'; await b.save(pb);
  r = await syncLibrary(cloud, b, metaB); metaB = r.meta;
  eq(r.report.uploaded, ['Faro']);
  r = await syncLibrary(cloud, a, metaA); metaA = r.meta;
  eq(r.report.downloaded, ['Faro']);
  eq((await a.load('aaaaaaaa1')).blocks[0].text, 'Dos.');
});

test('sync: both sides changed → keep both, nothing lost', async () => {
  const cloud = fakeCloud();
  const a = fakeStore([proj('aaaaaaaa1', 'Faro', 'Uno.', '2026-11-01T10:00:00Z')]);
  const metaA = (await syncLibrary(cloud, a, {})).meta;
  const b = fakeStore([]);
  const metaB = (await syncLibrary(cloud, b, {})).meta;
  const pa = await a.load('aaaaaaaa1'); pa.blocks[0].text = 'Versión A.'; pa.updatedAt = '2026-11-03T10:00:00Z'; await a.save(pa);
  const pb = await b.load('aaaaaaaa1'); pb.blocks[0].text = 'Versión B.'; pb.updatedAt = '2026-11-03T11:00:00Z'; await b.save(pb);
  await syncLibrary(cloud, b, metaB);
  const r = await syncLibrary(cloud, a, metaA);
  eq(r.report.conflicts, ['Faro']);
  const texts = [...a.db.values()].map((p) => p.blocks[0].text).sort();
  eq(texts, ['Versión A.', 'Versión B.']);
  ok([...a.db.values()].some((p) => /otra versión/.test(p.title)), 'conflict copy is labelled');
  eq(cloud.files.size, 2);
});
