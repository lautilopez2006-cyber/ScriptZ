// Block-level diff/patch. Used by undo history, real-time collaboration and version comparison.
import type { Block } from './model';
import { marksEqual } from './marks';

export type BlockOp =
  | { t: 'ins'; block: Block; after: string | null }
  | { t: 'del'; id: string; block: Block; after: string | null }
  | { t: 'set'; before: Block; after: Block };

export function blockEqual(a: Block, b: Block): boolean {
  if (a === b) return true;
  return a.id === b.id && a.type === b.type && a.text === b.text && (a.dual ?? '') === (b.dual ?? '') && (a.num ?? '') === (b.num ?? '') &&
    !!a.omitted === !!b.omitted && (a.rev ?? '') === (b.rev ?? '') && (a.bookmark ?? '') === (b.bookmark ?? '') && marksEqual(a.marks, b.marks);
}

/** Myers diff on sequences of ids; returns the longest common subsequence as a set of kept ids. */
export function lcsIds(a: string[], b: string[]): Set<string> {
  // Trim common prefix/suffix first (the usual case for edits).
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length, endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB--; }
  const kept = new Set<string>();
  for (let i = 0; i < start; i++) kept.add(a[i]);
  for (let i = endA; i < a.length; i++) kept.add(a[i]);
  const A = a.slice(start, endA), B = b.slice(start, endB);
  if (!A.length || !B.length) return kept;
  const bSet = new Set(B);
  const aSet = new Set(A);
  const A2 = A.filter((x) => bSet.has(x));
  const B2 = B.filter((x) => aSet.has(x));
  // Patience-style LIS over positions of A2 elements in B2 (ids are unique).
  const posInB = new Map<string, number>();
  B2.forEach((x, i) => posInB.set(x, i));
  const seq = A2.map((x) => posInB.get(x)!);
  const tails: number[] = [];
  const tailIdx: number[] = [];
  const prev: number[] = new Array(seq.length).fill(-1);
  for (let i = 0; i < seq.length; i++) {
    let lo = 0, hi = tails.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (tails[mid] < seq[i]) lo = mid + 1; else hi = mid; }
    tails[lo] = seq[i];
    tailIdx[lo] = i;
    prev[i] = lo > 0 ? tailIdx[lo - 1] : -1;
  }
  let k = tails.length ? tailIdx[tails.length - 1] : -1;
  while (k >= 0) { kept.add(A2[k]); k = prev[k]; }
  return kept;
}

/** Operations that transform `prev` into `next`. */
export function diffBlocks(prev: Block[], next: Block[]): BlockOp[] {
  const ops: BlockOp[] = [];
  // Fast path: same ids in the same order.
  if (prev.length === next.length) {
    let same = true;
    for (let i = 0; i < prev.length; i++) if (prev[i].id !== next[i].id) { same = false; break; }
    if (same) {
      for (let i = 0; i < prev.length; i++) if (prev[i] !== next[i] && !blockEqual(prev[i], next[i])) ops.push({ t: 'set', before: prev[i], after: next[i] });
      return ops;
    }
  }
  const prevIds = prev.map((b) => b.id);
  const nextIds = next.map((b) => b.id);
  const kept = lcsIds(prevIds, nextIds);
  const prevMap = new Map(prev.map((b) => [b.id, b]));
  // Deletions (including moved blocks), in reverse order so 'after' anchors stay meaningful for undo.
  for (let i = prev.length - 1; i >= 0; i--) {
    const b = prev[i];
    if (!kept.has(b.id)) ops.push({ t: 'del', id: b.id, block: b, after: i > 0 ? prev[i - 1].id : null });
  }
  // Insertions in order.
  for (let i = 0; i < next.length; i++) {
    const b = next[i];
    if (!kept.has(b.id)) ops.push({ t: 'ins', block: b, after: i > 0 ? next[i - 1].id : null });
  }
  // Content changes of kept blocks.
  for (const b of next) {
    if (!kept.has(b.id)) continue;
    const p = prevMap.get(b.id)!;
    if (p !== b && !blockEqual(p, b)) ops.push({ t: 'set', before: p, after: b });
  }
  return ops;
}

/**
 * Apply operations. Insertions whose anchor no longer exists go after the closest surviving
 * predecessor recorded in `graveyard` (or at the start).
 */
export function applyOps(blocks: Block[], ops: BlockOp[], graveyard: Map<string, string | null> = new Map()): Block[] {
  let list = blocks.slice();
  let index: Map<string, number> | null = null;
  const reindex = () => { index = new Map(list.map((b, i) => [b.id, i])); return index; };
  for (const op of ops) {
    const idx = index ?? reindex();
    if (op.t === 'set') {
      const i = idx.get(op.after.id);
      if (i !== undefined) list[i] = op.after;
    } else if (op.t === 'del') {
      const i = idx.get(op.id);
      if (i !== undefined) {
        graveyard.set(op.id, i > 0 ? list[i - 1].id : null);
        list.splice(i, 1);
        index = null;
      }
    } else {
      if (idx.has(op.block.id)) { list[idx.get(op.block.id)!] = op.block; continue; }
      let anchor = op.after;
      let guard = 0;
      while (anchor !== null && !idx.has(anchor) && guard++ < 10000) anchor = graveyard.has(anchor) ? graveyard.get(anchor)! : null;
      const at = anchor === null ? 0 : idx.get(anchor)! + 1;
      list.splice(at, 0, op.block);
      index = null;
    }
  }
  if (!list.length) list = [{ id: blocks[0]?.id ?? 'empty', type: 'scene', text: '' }];
  return list;
}

/** Inverse operations (for undo), to be applied in the returned order. */
export function invertOps(ops: BlockOp[]): BlockOp[] {
  const inv: BlockOp[] = [];
  for (let i = ops.length - 1; i >= 0; i--) {
    const op = ops[i];
    if (op.t === 'set') inv.push({ t: 'set', before: op.after, after: op.before });
    else if (op.t === 'ins') inv.push({ t: 'del', id: op.block.id, block: op.block, after: op.after });
    else inv.push({ t: 'ins', block: op.block, after: op.after });
  }
  // Deletions first (reverse of insert order), then insertions in document order.
  const dels = inv.filter((o) => o.t === 'del');
  const ins = inv.filter((o) => o.t === 'ins');
  const sets = inv.filter((o) => o.t === 'set');
  return [...dels, ...ins, ...sets];
}

// --- word level diff for version comparison ---------------------------------------------------

export interface WordDiffPart { kind: 'same' | 'add' | 'del'; text: string }

export function wordDiff(a: string, b: string): WordDiffPart[] {
  const ta = a.match(/\s+|[^\s]+/g) ?? [];
  const tb = b.match(/\s+|[^\s]+/g) ?? [];
  const n = ta.length, m = tb.length;
  if (n * m > 4_000_000) return [{ kind: 'del', text: a }, { kind: 'add', text: b }];
  const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = ta[i] === tb[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: WordDiffPart[] = [];
  const push = (kind: WordDiffPart['kind'], text: string) => {
    const last = out[out.length - 1];
    if (last && last.kind === kind) last.text += text; else out.push({ kind, text });
  };
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (ta[i] === tb[j]) { push('same', ta[i]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { push('del', ta[i]); i++; }
    else { push('add', tb[j]); j++; }
  }
  while (i < n) push('del', ta[i++]);
  while (j < m) push('add', tb[j++]);
  return out;
}
