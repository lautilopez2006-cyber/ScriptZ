// Suggestion mode (track changes). Edits are kept as proposals: inserted text carries an `si` mark,
// removed text stays in place with an `sd` mark, new paragraphs carry `sug: ins`, removed ones `sug: del`.
// Accepting or rejecting a suggestion resolves every mark and paragraph with its id.
import type { Block, Mark, Project, Suggestion } from './model';
import { normalizeMarks } from './marks';

export interface SuggestCtx {
  author: string;
  /** Suggestion id to use for edits in this paragraph (stable while the same person keeps editing it). */
  idFor: (blockId: string) => string;
}
interface Pos { id: string; off: number }
interface Sel { anchor: Pos; focus: Pos }

const has = (b: Block, k: 'si' | 'sd', at: number) => (b.marks ?? []).some((m) => m.k === k && m.s <= at && at < m.e);

/** Turn a normal edit (prev → next) into suggestions. Returns the blocks to keep and the caret to show. */
export function suggestCommit(prev: Block[], next: Block[], sel: Sel | null, before: Sel | null, ctx: SuggestCtx): { blocks: Block[]; sel: Sel | null; used: Set<string> } {
  const used = new Set<string>();
  const prevById = new Map(prev.map((b) => [b.id, b]));
  const nextIds = new Set(next.map((b) => b.id));
  let caret = sel;
  const out: Block[] = next.map((nb) => {
    const pb = prevById.get(nb.id);
    if (!pb) {
      // A new paragraph is a proposed insertion (unless it already is one).
      if (nb.sug) return nb;
      const id = ctx.idFor(nb.id);
      used.add(id);
      return { ...nb, sug: { k: 'ins', id }, marks: stripSuggestionMarks(nb.marks) };
    }
    if (pb.text === nb.text || pb.sug?.k === 'ins') return nb; // formatting-only change, or editing one's own new paragraph
    const r = mergeText(pb, nb, ctx.idFor(nb.id), caret?.focus.id === nb.id ? caret.focus.off : null, before?.focus.id === nb.id ? before.focus.off : null);
    if (r.changed) used.add(ctx.idFor(nb.id));
    if (r.caret !== null && caret && caret.focus.id === nb.id) caret = { anchor: { id: nb.id, off: r.caret }, focus: { id: nb.id, off: r.caret } };
    return r.block;
  });
  // Removed paragraphs come back struck through (proposed deletion), at their old position.
  for (let i = 0; i < prev.length; i++) {
    const pb = prev[i];
    if (nextIds.has(pb.id)) continue;
    if (pb.sug?.k === 'ins') continue; // removing a proposed paragraph really removes it
    const id = pb.sug?.k === 'del' ? pb.sug.id : ctx.idFor(pb.id);
    used.add(id);
    let at = 0;
    for (let j = i - 1; j >= 0; j--) { const k = out.findIndex((b) => b.id === prev[j].id); if (k >= 0) { at = k + 1; break; } }
    out.splice(at, 0, { ...pb, sug: { k: 'del', id } });
  }
  return { blocks: out, sel: caret, used };
}

/** Re-insert deleted text as `sd` and mark inserted text as `si`. */
function mergeText(pb: Block, nb: Block, id: string, caretNext: number | null, caretBefore: number | null): { block: Block; caret: number | null; changed: boolean } {
  const a = pb.text, b = nb.text;
  const min = Math.min(a.length, b.length);
  let s = 0;
  let e = 0;
  // Align the change with the caret when possible: the edit ends where the caret is now.
  const tail = caretNext !== null ? b.length - caretNext : -1;
  if (tail >= 0 && tail <= a.length && a.endsWith(b.slice(caretNext!))) {
    e = tail;
    while (s < Math.min(a.length - e, caretNext!) && a[s] === b[s]) s++;
  } else {
    while (s < min && a[s] === b[s]) s++;
    while (e < min - s && a[a.length - 1 - e] === b[b.length - 1 - e]) e++;
  }
  const delA = [s, a.length - e] as const; // deleted range in prev
  const insB = [s, b.length - e] as const; // inserted range in next
  // Split the deleted range: text that was itself a proposed insertion is really removed; the rest is kept as sd.
  const kept: { from: number; to: number }[] = [];
  for (let i = delA[0]; i < delA[1];) {
    let j = i;
    const isIns = has(pb, 'si', i);
    while (j < delA[1] && has(pb, 'si', j) === isIns) j++;
    if (!isIns) kept.push({ from: i, to: j });
    i = j;
  }
  const keptText = kept.map((k) => a.slice(k.from, k.to)).join('');
  // Merged text: prefix + inserted + kept deleted text + suffix (deleted text goes after the insertion, like Word).
  const ins = b.slice(insB[0], insB[1]);
  const text = b.slice(0, s) + ins + keptText + b.slice(insB[1]);
  // Offsets in `next` → merged text. At the insertion point, a mark that starts there belongs to the suffix
  // (moves past the struck text) while one that ends there belongs to the prefix (stays).
  const k = keptText.length;
  const shiftStart = (off: number) => (off >= insB[1] && (off > insB[1] || k > 0) ? off + k : off);
  const shiftEnd = (off: number) => (off > insB[1] ? off + k : off);
  const shift = (off: number) => (off > insB[1] ? off + k : off);
  const marks: Mark[] = [];
  for (const m of nb.marks ?? []) marks.push({ ...m, s: shiftStart(m.s), e: Math.max(shiftStart(m.s), shiftEnd(m.e)) });
  // Original marks of the kept text, then the sd mark itself (keeping an existing sd id).
  let cur = insB[1];
  for (const k of kept) {
    for (const m of pb.marks ?? []) {
      const ms = Math.max(m.s, k.from), me = Math.min(m.e, k.to);
      if (me > ms) marks.push({ ...m, s: cur + ms - k.from, e: cur + me - k.from });
    }
    if (!(pb.marks ?? []).some((m) => m.k === 'sd' && m.s <= k.from && k.to <= m.e)) marks.push({ s: cur, e: cur + k.to - k.from, k: 'sd', v: id });
    cur += k.to - k.from;
  }
  if (ins) marks.push({ s: insB[0], e: insB[1], k: 'si', v: id });
  // Typed text never inherits a deletion mark.
  const clean = marks.filter((m) => !(m.k === 'sd' && m.s < insB[1] && m.e > insB[0] && m.s >= insB[0]));
  const block: Block = { ...nb, text, marks: normalizeMarks(clean, text.length) };
  // Caret: after typing, stay after the typed text. After Delete (forward), jump over the struck text.
  let caret: number | null = null;
  if (caretNext !== null) {
    caret = shift(caretNext);
    const forwardDelete = !ins && keptText.length > 0 && caretBefore !== null && caretBefore === s;
    if (forwardDelete) caret = insB[1] + keptText.length;
  }
  return { block, caret, changed: !!ins || keptText.length > 0 || delA[1] > delA[0] };
}

function stripSuggestionMarks(m: Mark[] | undefined): Mark[] | undefined {
  const r = (m ?? []).filter((x) => x.k !== 'si' && x.k !== 'sd');
  return r.length ? r : undefined;
}

/** Remove the text of every mark of kind `k` with id `id` (or any id when null), shifting other marks. */
function cutMarked(b: Block, k: 'si' | 'sd', id: string | null): Block {
  const ranges = (b.marks ?? []).filter((m) => m.k === k && (id === null || m.v === id)).map((m) => [m.s, m.e] as [number, number]).sort((x, y) => x[0] - y[0]);
  if (!ranges.length) return b;
  let text = '';
  let last = 0;
  const cutBefore = (off: number) => { let n = 0; for (const [s, e] of ranges) { if (e <= off) n += e - s; else if (s < off) n += off - s; } return n; };
  for (const [s, e] of ranges) { if (s > last) text += b.text.slice(last, s); last = Math.max(last, e); }
  text += b.text.slice(last);
  const marks = (b.marks ?? []).filter((m) => !(m.k === k && (id === null || m.v === id))).map((m) => ({ ...m, s: m.s - cutBefore(m.s), e: m.e - cutBefore(m.e) }));
  return { ...b, text, marks: normalizeMarks(marks, text.length) };
}

function dropMarks(b: Block, k: 'si' | 'sd', id: string | null): Block {
  if (!(b.marks ?? []).some((m) => m.k === k && (id === null || m.v === id))) return b;
  return { ...b, marks: normalizeMarks((b.marks ?? []).filter((m) => !(m.k === k && (id === null || m.v === id))), b.text.length) };
}

/** Accept (keep the proposal) or reject (restore the original) one suggestion, or all of them with id = null. */
export function resolveSuggestion(blocks: Block[], id: string | null, accept: boolean): Block[] {
  const out: Block[] = [];
  for (const b0 of blocks) {
    let b = b0;
    if (b.sug && (id === null || b.sug.id === id)) {
      const removeBlock = accept ? b.sug.k === 'del' : b.sug.k === 'ins';
      if (removeBlock) continue;
      const { sug: _s, ...rest } = b;
      void _s;
      b = rest;
    }
    b = accept ? dropMarks(cutMarked(b, 'sd', id), 'si', id) : dropMarks(cutMarked(b, 'si', id), 'sd', id);
    out.push(b);
  }
  return out.length ? out : [{ id: blocks[0]?.id ?? 'empty', type: 'scene', text: '' }];
}

/** The official script: every pending suggestion rejected. Used for exports, printing and the read-only link. */
export function officialBlocks(blocks: Block[]): Block[] {
  if (!blocks.some((b) => b.sug || b.marks?.some((m) => m.k === 'si' || m.k === 'sd'))) return blocks;
  return resolveSuggestion(blocks, null, false);
}
export function officialProject(p: Project): Project {
  const blocks = officialBlocks(p.blocks);
  return blocks === p.blocks ? p : { ...p, blocks };
}

export interface SuggestionView { id: string; meta: Suggestion | undefined; blockIds: string[]; inserted: string; deleted: string; firstBlock: string }

/** Pending suggestions in document order, with what each one adds and removes. */
export function listSuggestions(blocks: Block[], meta: Record<string, Suggestion>): SuggestionView[] {
  const map = new Map<string, SuggestionView>();
  const get = (id: string, blockId: string) => {
    let v = map.get(id);
    if (!v) { v = { id, meta: meta[id], blockIds: [], inserted: '', deleted: '', firstBlock: blockId }; map.set(id, v); }
    if (!v.blockIds.includes(blockId)) v.blockIds.push(blockId);
    return v;
  };
  for (const b of blocks) {
    if (b.sug) { const v = get(b.sug.id, b.id); if (b.sug.k === 'ins') v.inserted += (v.inserted ? '\n' : '') + (b.text || '¶'); else v.deleted += (v.deleted ? '\n' : '') + (b.text || '¶'); }
    for (const m of b.marks ?? []) {
      if ((m.k === 'si' || m.k === 'sd') && m.v) {
        const v = get(m.v, b.id);
        const t = b.text.slice(m.s, m.e);
        if (m.k === 'si') v.inserted += t; else v.deleted += t;
      }
    }
  }
  return [...map.values()];
}
