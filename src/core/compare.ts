// Version comparison: aligned block diff with word-level changes.
import type { Block } from './model';
import { lcsIds, wordDiff, type WordDiffPart } from './diff';
import { buildScenes } from './scenes';

export interface CompareRow { kind: 'same' | 'add' | 'del' | 'mod'; a?: Block; b?: Block; parts?: WordDiffPart[]; sceneLabel: string }
export interface CompareResult { rows: CompareRow[]; added: number; removed: number; modified: number; wordsAdded: number; wordsRemoved: number; scenesChanged: string[] }

const key = (b: Block) => `${b.type}\u0001${b.text.trim()}`;

export function compareBlocks(A: Block[], B: Block[]): CompareResult {
  // Align by id when versions share ancestry, otherwise by content.
  const idsA = new Set(A.map((b) => b.id));
  const common = B.filter((b) => idsA.has(b.id)).length;
  let ka: string[], kb: string[];
  if (common > Math.min(A.length, B.length) * 0.3) { ka = A.map((b) => b.id); kb = B.map((b) => b.id); }
  else {
    const seen = new Map<string, number>();
    const tag = (b: Block) => { const k = key(b); const n = (seen.get(k) ?? 0) + 1; seen.set(k, n); return k + '#' + n; };
    ka = A.map(tag); seen.clear(); kb = B.map(tag);
  }
  const kept = lcsIds(ka, kb);
  const sceneA = buildScenes(A), sceneB = buildScenes(B);
  const labelAt = (scenes: ReturnType<typeof buildScenes>, i: number) => { let l = ''; for (const s of scenes) { if (s.start <= i) l = s.label; else break; } return l; };
  const rows: CompareRow[] = [];
  let i = 0, j = 0;
  let added = 0, removed = 0, modified = 0, wordsAdded = 0, wordsRemoved = 0;
  const changed = new Set<string>();
  const words = (s: string) => (s.match(/\S+/g) ?? []).length;
  while (i < A.length || j < B.length) {
    if (i < A.length && !kept.has(ka[i])) {
      rows.push({ kind: 'del', a: A[i], sceneLabel: labelAt(sceneA, i) }); removed++; wordsRemoved += words(A[i].text); changed.add(labelAt(sceneA, i)); i++; continue;
    }
    if (j < B.length && !kept.has(kb[j])) {
      rows.push({ kind: 'add', b: B[j], sceneLabel: labelAt(sceneB, j) }); added++; wordsAdded += words(B[j].text); changed.add(labelAt(sceneB, j)); j++; continue;
    }
    if (i < A.length && j < B.length) {
      const a = A[i], b = B[j];
      if (a.text !== b.text || a.type !== b.type) {
        const parts = wordDiff(a.text, b.text);
        for (const p of parts) { if (p.kind === 'add') wordsAdded += words(p.text); if (p.kind === 'del') wordsRemoved += words(p.text); }
        rows.push({ kind: 'mod', a, b, parts, sceneLabel: labelAt(sceneB, j) }); modified++; changed.add(labelAt(sceneB, j));
      } else rows.push({ kind: 'same', a, b, sceneLabel: labelAt(sceneB, j) });
      i++; j++;
      continue;
    }
    break;
  }
  return { rows, added, removed, modified, wordsAdded, wordsRemoved, scenesChanged: [...changed].filter(Boolean) };
}
