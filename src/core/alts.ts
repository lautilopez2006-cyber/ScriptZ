// Alternate versions of a paragraph. The visible version is `text`; the others wait in `alts`.
import type { Block } from './model';

/** Save the current wording as an alternate and keep editing a copy of it. */
export function addAlternate(b: Block): Block {
  return { ...b, alts: [...(b.alts ?? []), b.marks ? { text: b.text, marks: b.marks } : { text: b.text }].slice(-19) };
}

/** Show the next (dir 1) or previous (dir -1) version. */
export function cycleAlternate(b: Block, dir: 1 | -1): Block {
  const alts = b.alts ?? [];
  if (!alts.length) return b;
  const cur = b.marks ? { text: b.text, marks: b.marks } : { text: b.text };
  if (dir === 1) {
    const [first, ...rest] = alts;
    return { ...b, text: first.text, marks: first.marks, alts: [...rest, cur] };
  }
  const last = alts[alts.length - 1];
  return { ...b, text: last.text, marks: last.marks, alts: [cur, ...alts.slice(0, -1)] };
}

/** Make alternate `i` the visible version (the current one takes its place). */
export function useAlternate(b: Block, i: number): Block {
  const alts = [...(b.alts ?? [])];
  const pick = alts[i];
  if (!pick) return b;
  alts[i] = b.marks ? { text: b.text, marks: b.marks } : { text: b.text };
  return { ...b, text: pick.text, marks: pick.marks, alts };
}

export function removeAlternate(b: Block, i: number): Block {
  const alts = (b.alts ?? []).filter((_, k) => k !== i);
  const { alts: _a, ...rest } = b;
  void _a;
  return alts.length ? { ...b, alts } : rest;
}

export function keepOnlyCurrent(b: Block): Block {
  const { alts: _a, ...rest } = b;
  void _a;
  return rest;
}
