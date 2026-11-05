// Operational transformation for screenplay documents.
// Text inside a block uses classic retain/insert/delete operations (UTF-16 units).
// Structure uses id-based block inserts/deletes; attributes, marks and metadata are last-writer-wins.
import type { Block, Mark } from '../core/model';
import { normalizeMarks } from '../core/marks';

// ---------------------------------------------------------------- text operations

/** Positive number = retain, string = insert, negative number = delete. */
export type TextComp = number | string;
export type TextOp = TextComp[];

const isRetain = (c: TextComp): c is number => typeof c === 'number' && c > 0;
const isInsert = (c: TextComp): c is string => typeof c === 'string';
const isDelete = (c: TextComp): c is number => typeof c === 'number' && c < 0;

function push(op: TextOp, c: TextComp): void {
  if (c === 0 || c === '') return;
  const last = op[op.length - 1];
  if (op.length && typeof c === typeof last && (typeof c === 'string' || (c > 0) === ((last as number) > 0))) {
    op[op.length - 1] = (typeof c === 'string' ? (last as string) + c : (last as number) + c) as TextComp;
    return;
  }
  // Keep inserts before deletes at the same position (canonical form).
  if (isInsert(c) && isDelete(last)) {
    const prev = op[op.length - 2];
    if (isInsert(prev)) { op[op.length - 2] = prev + c; return; }
    op.splice(op.length - 1, 0, c);
    return;
  }
  op.push(c);
}

export function baseLength(op: TextOp): number { return op.reduce<number>((a, c) => a + (isRetain(c) ? c : isDelete(c) ? -c : 0), 0); }

/** Minimal op turning `a` into `b` (common prefix/suffix). */
export function textDiff(a: string, b: string): TextOp {
  if (a === b) return [a.length].filter(Boolean) as TextOp;
  let s = 0;
  const min = Math.min(a.length, b.length);
  while (s < min && a.charCodeAt(s) === b.charCodeAt(s)) s++;
  // Do not split surrogate pairs.
  if (s > 0 && a.charCodeAt(s - 1) >= 0xd800 && a.charCodeAt(s - 1) <= 0xdbff) s--;
  let e = 0;
  while (e < min - s && a.charCodeAt(a.length - 1 - e) === b.charCodeAt(b.length - 1 - e)) e++;
  if (e > 0 && a.charCodeAt(a.length - e) >= 0xdc00 && a.charCodeAt(a.length - e) <= 0xdfff) e--;
  const op: TextOp = [];
  push(op, s);
  push(op, b.slice(s, b.length - e));
  push(op, -(a.length - s - e));
  push(op, e);
  return op;
}

export function applyText(text: string, op: TextOp): string {
  if (baseLength(op) !== text.length) throw new Error('ot: base length mismatch');
  let out = '';
  let i = 0;
  for (const c of op) {
    if (isRetain(c)) { out += text.slice(i, i + c); i += c; }
    else if (isInsert(c)) out += c;
    else i -= c;
  }
  return out;
}

/** Transform two concurrent ops on the same text. `b` has priority (applied first by the server). Returns [a', b']. */
export function transformText(a: TextOp, b: TextOp): [TextOp, TextOp] {
  const A: TextOp = [], B: TextOp = [];
  let i = 0, j = 0;
  let x = a[i++], y = b[j++];
  while (x !== undefined || y !== undefined) {
    // Inserts from b go first (priority), then a's.
    if (isInsert(y)) { push(A, y.length); push(B, y); y = b[j++]; continue; }
    if (isInsert(x)) { push(A, x); push(B, x.length); x = a[i++]; continue; }
    if (x === undefined || y === undefined) throw new Error('ot: length mismatch');
    const lx = Math.abs(x as number), ly = Math.abs(y as number);
    const m = Math.min(lx, ly);
    if (isRetain(x) && isRetain(y)) { push(A, m); push(B, m); }
    else if (isDelete(x) && isDelete(y)) { /* both deleted */ }
    else if (isDelete(x) && isRetain(y)) push(A, -m);
    else if (isRetain(x) && isDelete(y)) push(B, -m);
    const rest = (v: number, len: number) => (v > 0 ? len - m : -(len - m));
    x = lx > m ? rest(x as number, lx) : a[i++];
    y = ly > m ? rest(y as number, ly) : b[j++];
  }
  return [A, B];
}

/** Map a position through an op. `after` keeps the position after an insert at the same place. */
export function mapPosition(pos: number, op: TextOp, after = false): number {
  let src = 0, dst = 0;
  for (const c of op) {
    if (isRetain(c)) {
      if (pos < src + c) return dst + (pos - src);
      src += c; dst += c;
    } else if (isInsert(c)) {
      if (src === pos && !after) return dst;
      dst += c.length;
      if (src === pos && after) continue;
    } else {
      const len = -c;
      if (pos < src + len) return dst;
      src += len;
    }
  }
  return dst + Math.max(0, pos - src);
}

export function mapMarks(marks: Mark[] | undefined, op: TextOp, len: number): Mark[] | undefined {
  if (!marks) return undefined;
  return normalizeMarks(marks.map((m) => ({ ...m, s: mapPosition(m.s, op, true), e: mapPosition(m.e, op, m.k !== 'cmt' && m.k !== 'tag') })), len);
}

// ---------------------------------------------------------------- document operations

export type MetaPath = [string] | [string, string];

export type DocOp =
  | { t: 'text'; id: string; op: TextOp }
  | { t: 'marks'; id: string; marks: Mark[] | null }
  | { t: 'attr'; id: string; attrs: Partial<Pick<Block, 'type' | 'dual' | 'num' | 'omitted' | 'rev' | 'bookmark'>> & Record<string, unknown> }
  | { t: 'ins'; block: Block; after: string | null }
  | { t: 'del'; id: string }
  | { t: 'meta'; path: MetaPath; value: unknown };

export type Change = DocOp[];

const samePath = (a: MetaPath, b: MetaPath) => a.length === b.length && a.every((x, i) => x === b[i]);
const overlaps = (a: MetaPath, b: MetaPath) => a[0] === b[0] && (a.length === 1 || b.length === 1 || a[1] === b[1]);

/** Transform single ops: `b` has priority. Returns [a' list, b' list]. */
function transformPair(a: DocOp, b: DocOp): [DocOp[], DocOp[]] {
  if (a.t === 'meta' && b.t === 'meta') {
    if (samePath(a.path, b.path)) return [[a], []];
    if (overlaps(a.path, b.path)) {
      // Whole collection vs one key: the later write (a) wins as a whole.
      if (a.path.length === 1) return [[a], []];
      return [[a], [b]];
    }
    return [[a], [b]];
  }
  if (a.t === 'meta' || b.t === 'meta') return [[a], [b]];
  if (a.t === 'ins' && b.t === 'ins') {
    if (a.block.id === b.block.id) return [[], []];
    if (a.after === b.after) return [[a], [{ ...b, after: a.block.id }]];
    return [[a], [b]];
  }
  const ida = a.t === 'ins' ? a.block.id : a.id;
  const idb = b.t === 'ins' ? b.block.id : b.id;
  if (a.t === 'ins' || b.t === 'ins') return [[a], [b]]; // anchors to deleted blocks resolve via graveyard on apply
  if (ida !== idb) return [[a], [b]];
  // Same block.
  if (a.t === 'del' && b.t === 'del') return [[], []];
  if (a.t === 'del') return [[a], []];
  if (b.t === 'del') return [[], [b]];
  if (a.t === 'text' && b.t === 'text') { const [x, y] = transformText(a.op, b.op); return [[{ ...a, op: x }], [{ ...b, op: y }]]; }
  if (a.t === 'marks' && b.t === 'marks') return [[a], []];
  if (a.t === 'marks' && b.t === 'text') return [[{ ...a, marks: a.marks ? (mapMarks(a.marks, b.op, Number.MAX_SAFE_INTEGER) ?? []) : null }], [b]];
  if (a.t === 'text' && b.t === 'marks') return [[a], [{ ...b, marks: b.marks ? (mapMarks(b.marks, a.op, Number.MAX_SAFE_INTEGER) ?? []) : null }]];
  if (a.t === 'attr' && b.t === 'attr') {
    const rest: Record<string, unknown> = { ...b.attrs };
    for (const k of Object.keys(a.attrs)) delete rest[k];
    return [[a], Object.keys(rest).length ? [{ ...b, attrs: rest }] : []];
  }
  return [[a], [b]];
}

/** Transform change `a` against change `b` (b has priority). Returns [a', b'] with apply(apply(S,b),a') == apply(apply(S,a),b'). */
export function transformChange(a: Change, b: Change): [Change, Change] {
  if (!a.length || !b.length) return [a, b];
  if (a.length === 1 && b.length === 1) return transformPair(a[0], b[0]);
  if (a.length > 1) {
    const [a1, b1] = transformChange([a[0]], b);
    const [a2, b2] = transformChange(a.slice(1), b1);
    return [[...a1, ...a2], b2];
  }
  const [a1, b1] = transformChange(a, [b[0]]);
  const [a2, b2] = transformChange(a1, b.slice(1));
  return [a2, [...b1, ...b2]];
}

// ---------------------------------------------------------------- applying

export interface SyncDoc { blocks: Block[]; meta: Record<string, unknown> }

export function applyChange(doc: SyncDoc, change: Change, graveyard: Map<string, string | null>): SyncDoc {
  let blocks = doc.blocks;
  let meta = doc.meta;
  let index: Map<string, number> | null = null;
  const idx = () => (index ??= new Map(blocks.map((b, i) => [b.id, i])));
  const mutable = () => { if (blocks === doc.blocks) blocks = blocks.slice(); };
  for (const op of change) {
    if (op.t === 'meta') {
      if (meta === doc.meta) meta = { ...meta };
      if (op.path.length === 1) meta[op.path[0]] = op.value;
      else {
        const coll = { ...((meta[op.path[0]] as Record<string, unknown>) ?? {}) };
        if (op.value === null || op.value === undefined) delete coll[op.path[1]]; else coll[op.path[1]] = op.value;
        meta[op.path[0]] = coll;
      }
      continue;
    }
    if (op.t === 'ins') {
      if (idx().has(op.block.id)) continue;
      const x = op.block.id;
      if (graveyard.has(x)) {
        // Re-inserting a deleted id: unlink its tombstone first.
        const px = graveyard.get(x)!;
        const nx = deadAfter(graveyard, x);
        if (nx !== undefined) graveyard.set(nx, px);
        graveyard.delete(x);
      }
      const y = op.after;
      let at: number;
      if (y === null) at = 0;
      else if (idx().has(y)) at = idx().get(y)! + 1;
      else if (graveyard.has(y)) {
        // Anchor is a tombstone: land after the closest live block before it in the full order.
        let p: string | null = graveyard.get(y)!;
        let guard = 0;
        while (p !== null && !idx().has(p) && guard++ < 1_000_000) p = graveyard.has(p) ? graveyard.get(p)! : null;
        at = p === null ? 0 : idx().get(p)! + 1;
      } else at = blocks.length; // unknown anchor (e.g. after a resync): append; the server hash check repairs it
      // Keep the full order (live + tombstones) up to date: whatever followed `y` now follows `x`.
      if (y === null || idx().has(y) || graveyard.has(y)) { const t = deadAfter(graveyard, y); if (t !== undefined) graveyard.set(t, x); }
      mutable();
      blocks.splice(at, 0, op.block);
      index = null;
      continue;
    }
    const i = idx().get(op.id);
    if (i === undefined) continue;
    if (op.t === 'del') {
      // Predecessor in the full order: the previous live block, then any tombstones that follow it.
      let pred: string | null = i > 0 ? blocks[i - 1].id : null;
      for (let t = deadAfter(graveyard, pred), guard = 0; t !== undefined && guard < 1_000_000; t = deadAfter(graveyard, pred), guard++) pred = t;
      graveyard.set(op.id, pred);
      mutable();
      blocks.splice(i, 1);
      index = null;
      continue;
    }
    const b = blocks[i];
    let nb: Block = b;
    if (op.t === 'text') {
      if (baseLength(op.op) !== b.text.length) throw new Error('ot: stale text op');
      const text = applyText(b.text, op.op);
      nb = { ...b, text };
      const m = mapMarks(b.marks, op.op, text.length);
      if (m) nb.marks = m; else delete nb.marks;
    } else if (op.t === 'marks') {
      nb = { ...b };
      const m = op.marks ? normalizeMarks(op.marks, b.text.length) : undefined;
      if (m) nb.marks = m; else delete nb.marks;
    } else if (op.t === 'attr') {
      nb = { ...b } as Block;
      for (const [k, v] of Object.entries(op.attrs)) {
        if (v === null || v === undefined || v === false || v === '') delete (nb as unknown as Record<string, unknown>)[k];
        else (nb as unknown as Record<string, unknown>)[k] = v;
      }
    }
    mutable();
    blocks[i] = nb;
  }
  // An empty document is valid here; the editor adds a block as a normal (synced) edit.
  return { blocks, meta };
}

/** The tombstone that immediately follows `id` in the full order, if any. */
function deadAfter(graveyard: Map<string, string | null>, id: string | null): string | undefined {
  for (const [k, v] of graveyard) if (v === id) return k;
  return undefined;
}

// ---------------------------------------------------------------- hashing

export function hashDoc(doc: SyncDoc): string {
  let h = 0x811c9dc5;
  const feed = (s: string) => { for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } };
  for (const b of doc.blocks) { feed(b.id); feed(b.type); feed(b.text); feed(b.dual ?? ''); feed(JSON.stringify(b.marks ?? [])); }
  feed(stableStringify(doc.meta));
  return (h >>> 0).toString(16);
}

export function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
  const o = v as Record<string, unknown>;
  return '{' + Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => JSON.stringify(k) + ':' + stableStringify(o[k])).join(',') + '}';
}
