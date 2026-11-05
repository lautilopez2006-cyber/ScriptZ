// Production revisions: revision sets, change stamping, locked scenes and pages.
import { REVISION_SEQUENCE, uid, type Block, type Project, type RevColor, type RevisionSet } from './model';
import { blockEqual } from './diff';
import { buildScenes, sceneOptions } from './scenes';
import { capturePageLocks, layoutProject } from './layout';

export const REV_HEX: Record<RevColor, string> = {
  white: '#ffffff', blue: '#cfe3ff', pink: '#ffd6e5', yellow: '#fff3a6', green: '#d4f5c9', goldenrod: '#f5d27a',
  buff: '#f3e3c3', salmon: '#ffc8b0', cherry: '#ffb3c1', blue2: '#b8d6ff', pink2: '#ffc2da', yellow2: '#ffeb80', green2: '#bfeeb0', goldenrod2: '#efc35a',
};

export function nextRevisionColor(sets: RevisionSet[]): RevColor {
  const used = sets.length;
  // White is the original (locked) draft; the first revision pages are blue, then pink, yellow…
  return REVISION_SEQUENCE[Math.min(used + 1, REVISION_SEQUENCE.length - 1)];
}

export function newRevisionSet(p: Project, name: string): RevisionSet {
  return { id: uid(), name, color: nextRevisionColor(p.revisions.sets), date: new Date().toISOString().slice(0, 10), mark: '*' };
}

/** Stamp changed/new blocks with the active revision set. */
export function stampRevisions(prev: Block[], next: Block[], setId: string): Block[] {
  if (!setId) return next;
  const before = new Map(prev.map((b) => [b.id, b]));
  let out: Block[] | null = null;
  for (let i = 0; i < next.length; i++) {
    const b = next[i];
    const p = before.get(b.id);
    if (b.rev === setId) continue;
    const changed = !p || (p.text !== b.text || p.type !== b.type || (p.dual ?? '') !== (b.dual ?? ''));
    if (!changed) continue;
    if (!out) out = next.slice();
    out[i] = { ...b, rev: setId };
  }
  return out ?? next;
}

/** With locked scene numbers: deleted numbered scenes come back as OMITTED placeholders. */
export function preserveLockedScenes(prev: Block[], next: Block[]): Block[] {
  const nextIds = new Set(next.map((b) => b.id));
  const lost = prev.map((b, i) => ({ b, i })).filter(({ b }) => b.type === 'scene' && b.num && !b.omitted && !nextIds.has(b.id));
  if (!lost.length) return next;
  const out = next.slice();
  for (const { b, i } of lost) {
    // Insert after the closest preceding block that survived.
    let at = 0;
    for (let k = i - 1; k >= 0; k--) {
      const idx = out.findIndex((x) => x.id === prev[k].id);
      if (idx >= 0) { at = idx + 1; break; }
    }
    // Skip forward past the surviving content of that scene so the placeholder sits between scenes.
    while (at < out.length && out[at].type !== 'scene') at++;
    out.splice(at, 0, { id: b.id, type: 'scene', text: b.text, num: b.num, omitted: true, rev: b.rev });
  }
  return out;
}

export function lockScenes(p: Project): Project {
  const scenes = buildScenes(p.blocks, { ...sceneOptions(p), locked: false });
  const labels = new Map(scenes.map((s) => [s.id, s.label]));
  const blocks = p.blocks.map((b) => (b.type === 'scene' ? { ...b, num: b.num ?? labels.get(b.id) } : b));
  return { ...p, blocks, revisions: { ...p.revisions, scenesLocked: true } };
}

export function unlockScenes(p: Project): Project {
  const blocks = p.blocks.filter((b) => !b.omitted).map((b) => { if (b.type !== 'scene' || !b.num) return b; const nb = { ...b }; delete nb.num; return nb; });
  return { ...p, blocks, revisions: { ...p.revisions, scenesLocked: false } };
}

export function lockPages(p: Project): Project {
  const layout = layoutProject({ ...p, revisions: { ...p.revisions, pageLocks: null } });
  return { ...p, revisions: { ...p.revisions, pageLocks: capturePageLocks(layout) } };
}

export function unlockPages(p: Project): Project {
  return { ...p, revisions: { ...p.revisions, pageLocks: null } };
}

/** Clear revision marks (e.g. after publishing a revision). */
export function clearRevisionMarks(p: Project, setId?: string): Project {
  const blocks = p.blocks.map((b) => { if (!b.rev || (setId && b.rev !== setId)) return b; const nb = { ...b }; delete nb.rev; return nb; });
  return { ...p, blocks };
}

export function revisedSceneIds(p: Project): Set<string> {
  const out = new Set<string>();
  let scene = '';
  for (const b of p.blocks) {
    if (b.type === 'scene') scene = b.id;
    if (b.rev && scene) out.add(scene);
  }
  return out;
}

export function hasRealChange(a: Block[], b: Block[]): boolean {
  if (a.length !== b.length) return true;
  for (let i = 0; i < a.length; i++) if (!blockEqual(a[i], b[i])) return true;
  return false;
}
