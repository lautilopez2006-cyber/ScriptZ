// Inline marks: shifting on edits, toggling, normalisation and slicing.
import type { Block, Mark, MarkKind } from './model';

const sameKind = (a: Mark, b: Mark) => a.k === b.k && (a.v ?? '') === (b.v ?? '');

/** Merge overlapping/adjacent marks of the same kind+value; drop empty ones. */
export function normalizeMarks(marks: Mark[] | undefined, len: number): Mark[] | undefined {
  if (!marks || !marks.length) return undefined;
  const list = marks
    .map((m) => ({ ...m, s: Math.max(0, Math.min(len, m.s)), e: Math.max(0, Math.min(len, m.e)) }))
    .filter((m) => m.e > m.s)
    .sort((a, b) => (a.k + (a.v ?? '')).localeCompare(b.k + (b.v ?? '')) || a.s - b.s);
  const out: Mark[] = [];
  for (const m of list) {
    const last = out[out.length - 1];
    if (last && sameKind(last, m) && m.s <= last.e) last.e = Math.max(last.e, m.e);
    else out.push({ ...m });
  }
  out.sort((a, b) => a.s - b.s || a.k.localeCompare(b.k));
  return out.length ? out : undefined;
}

/**
 * Adjust marks for replacing [pos, pos+deleted) with `inserted` characters.
 * Text typed at the end of a formatting mark extends it (like word processors), except for comments/tags.
 */
export function shiftMarks(marks: Mark[] | undefined, pos: number, deleted: number, inserted: number): Mark[] | undefined {
  if (!marks || !marks.length) return marks;
  const end = pos + deleted;
  const delta = inserted - deleted;
  const out: Mark[] = [];
  for (const m of marks) {
    const extend = m.k === 'b' || m.k === 'i' || m.k === 'u' || m.k === 'x' || m.k === 'hl';
    const s = m.s < pos ? m.s : m.s >= end ? m.s + delta : pos + inserted;
    let e = m.e <= pos ? m.e : m.e >= end ? m.e + delta : pos;
    if (deleted === 0 && inserted > 0 && m.e === pos && m.s < pos && extend) e = m.e + inserted;
    if (e > s) out.push({ ...m, s, e });
  }
  return out.length ? out : undefined;
}

/** Marks covering [s, e) shifted to start at 0 (for copy/split). */
export function sliceMarks(marks: Mark[] | undefined, s: number, e: number): Mark[] | undefined {
  if (!marks) return undefined;
  const out: Mark[] = [];
  for (const m of marks) {
    const a = Math.max(m.s, s), b = Math.min(m.e, e);
    if (b > a) out.push({ ...m, s: a - s, e: b - s });
  }
  return out.length ? out : undefined;
}

export function concatMarks(a: Mark[] | undefined, b: Mark[] | undefined, offset: number, len: number): Mark[] | undefined {
  const list = [...(a ?? []), ...(b ?? []).map((m) => ({ ...m, s: m.s + offset, e: m.e + offset }))];
  return normalizeMarks(list, len);
}

export function hasMark(marks: Mark[] | undefined, s: number, e: number, k: MarkKind, v?: string): boolean {
  if (!marks) return false;
  if (s === e) return marks.some((m) => m.k === k && (v === undefined || m.v === v) && m.s < s && m.e >= s);
  // Entire range covered?
  let pos = s;
  const list = marks.filter((m) => m.k === k && (v === undefined || m.v === v)).sort((x, y) => x.s - y.s);
  for (const m of list) {
    if (m.s > pos) break;
    if (m.e > pos) pos = m.e;
    if (pos >= e) return true;
  }
  return pos >= e;
}

export function addMark(marks: Mark[] | undefined, s: number, e: number, k: MarkKind, v: string | undefined, len: number): Mark[] | undefined {
  if (e <= s) return marks;
  // Highlights/tags of a different value are replaced in the range.
  let base = marks ?? [];
  if (k === 'hl') base = removeMark(base, s, e, 'hl') ?? [];
  const m: Mark = { s, e, k };
  if (v !== undefined) m.v = v;
  return normalizeMarks([...base, m], len);
}

export function removeMark(marks: Mark[] | undefined, s: number, e: number, k: MarkKind, v?: string): Mark[] | undefined {
  if (!marks) return marks;
  const out: Mark[] = [];
  for (const m of marks) {
    if (m.k !== k || (v !== undefined && m.v !== v) || m.e <= s || m.s >= e) { out.push(m); continue; }
    if (m.s < s) out.push({ ...m, e: s });
    if (m.e > e) out.push({ ...m, s: e });
  }
  return out.length ? out : undefined;
}

export function toggleMark(marks: Mark[] | undefined, s: number, e: number, k: MarkKind, len: number): Mark[] | undefined {
  return hasMark(marks, s, e, k) ? removeMark(marks, s, e, k) : addMark(marks, s, e, k, undefined, len);
}

/** Replace text [s, e) with `insert` in a block, keeping marks consistent. */
export function replaceText(b: Block, s: number, e: number, insert: string, insertMarks?: Mark[]): Block {
  const text = b.text.slice(0, s) + insert + b.text.slice(e);
  let marks = shiftMarks(b.marks, s, e - s, insert.length);
  if (insertMarks && insertMarks.length) marks = normalizeMarks([...(marks ?? []), ...insertMarks.map((m) => ({ ...m, s: m.s + s, e: m.e + s }))], text.length);
  marks = normalizeMarks(marks, text.length);
  const nb: Block = { ...b, text };
  if (marks) nb.marks = marks; else delete nb.marks;
  return nb;
}

export function marksEqual(a: Mark[] | undefined, b: Mark[] | undefined): boolean {
  const x = a ?? [], y = b ?? [];
  if (x.length !== y.length) return false;
  for (let i = 0; i < x.length; i++) if (x[i].s !== y[i].s || x[i].e !== y[i].e || x[i].k !== y[i].k || (x[i].v ?? '') !== (y[i].v ?? '')) return false;
  return true;
}
