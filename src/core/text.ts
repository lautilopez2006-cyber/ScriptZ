// Text measurement for a fixed-pitch layout: grapheme clusters, column widths, line wrapping.
// The wrapping rules mirror CSS `white-space: pre-wrap; overflow-wrap: anywhere` closely enough
// that the editor and every export paginate the same way.

export interface Grapheme { s: number; e: number; w: number; t: string }

type SegmenterLike = { segment(input: string): Iterable<{ segment: string; index: number }> };
let segmenter: SegmenterLike | null | undefined;
function getSegmenter(): SegmenterLike | null {
  if (segmenter !== undefined) return segmenter;
  const I = (globalThis as unknown as { Intl?: { Segmenter?: new (l?: string, o?: { granularity: string }) => SegmenterLike } }).Intl;
  segmenter = I && I.Segmenter ? new I.Segmenter(undefined, { granularity: 'grapheme' }) : null;
  return segmenter;
}

const ASCII = /^[\x20-\x7e]*$/;

function isWideCodePoint(cp: number): boolean {
  return (
    (cp >= 0x1100 && cp <= 0x115f) || (cp >= 0x2e80 && cp <= 0x303e) || (cp >= 0x3041 && cp <= 0x33ff) ||
    (cp >= 0x3400 && cp <= 0x4dbf) || (cp >= 0x4e00 && cp <= 0x9fff) || (cp >= 0xa000 && cp <= 0xa4cf) ||
    (cp >= 0xac00 && cp <= 0xd7a3) || (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0xfe30 && cp <= 0xfe4f) ||
    (cp >= 0xff00 && cp <= 0xff60) || (cp >= 0xffe0 && cp <= 0xffe6) || (cp >= 0x1f000 && cp <= 0x1faff) ||
    (cp >= 0x20000 && cp <= 0x3fffd)
  );
}

const ZERO = /^[\p{M}​-‏⁠︀-️]+$/u;

export function graphemeWidth(g: string): number {
  if (g.length === 1) {
    const c = g.charCodeAt(0);
    if (c < 0x300) return c === 0x09 ? 4 : 1;
  }
  if (ZERO.test(g)) return 0;
  const cp = g.codePointAt(0) ?? 0;
  if (isWideCodePoint(cp)) return 2;
  // Text symbol turned into an emoji with VS16 (e.g. ❤️).
  if (g.includes('️') && /\p{Extended_Pictographic}/u.test(g)) return 2;
  return 1;
}

export function graphemes(text: string): Grapheme[] {
  const out: Grapheme[] = [];
  if (ASCII.test(text)) {
    for (let i = 0; i < text.length; i++) out.push({ s: i, e: i + 1, w: 1, t: text[i] });
    return out;
  }
  const seg = getSegmenter();
  if (seg) {
    for (const part of seg.segment(text)) {
      const t = part.segment;
      out.push({ s: part.index, e: part.index + t.length, w: t === '\n' ? 0 : graphemeWidth(t), t });
    }
    return out;
  }
  let i = 0;
  for (const ch of Array.from(text)) {
    out.push({ s: i, e: i + ch.length, w: ch === '\n' ? 0 : graphemeWidth(ch), t: ch });
    i += ch.length;
  }
  return out;
}

export function textWidth(text: string): number {
  if (ASCII.test(text)) return text.length;
  let w = 0;
  for (const g of graphemes(text)) w += g.w;
  return w;
}

/** A wrapped line: [start, end) offsets into the source string, trailing spaces excluded from `width`. */
export interface WrappedLine { start: number; end: number; width: number }

const BREAK_AFTER = new Set(['-', '‐', '–', '—', '/', '…']);

/**
 * Greedy word wrap. Spaces hang at the end of a line; a break is allowed after spaces,
 * after hyphens/dashes followed by a letter, and anywhere when a word is longer than the line.
 * Hard line breaks ("\n") always start a new line.
 */
export function wrap(text: string, cols: number): WrappedLine[] {
  const max = Math.max(1, Math.floor(cols));
  const lines: WrappedLine[] = [];
  if (!text) return [{ start: 0, end: 0, width: 0 }];
  const gs = graphemes(text);
  let lineStart = 0;      // grapheme index
  let width = 0;          // width of non-trailing-space content
  let pendingSpaces = 0;  // trailing spaces width since last word char
  let breakAt = -1;       // grapheme index at which next line may start
  let widthAtBreak = 0;
  const push = (startIdx: number, endIdx: number, w: number) => {
    const s = startIdx < gs.length ? gs[startIdx].s : text.length;
    const e = endIdx > 0 ? (endIdx <= gs.length ? gs[endIdx - 1].e : text.length) : s;
    lines.push({ start: s, end: Math.max(s, e), width: w });
  };
  for (let i = 0; i < gs.length; i++) {
    const g = gs[i];
    if (g.t === '\n') {
      push(lineStart, i, width);
      // The newline character itself belongs to no line; next line starts after it.
      lineStart = i + 1; width = 0; pendingSpaces = 0; breakAt = -1;
      continue;
    }
    if (g.t === ' ' || g.t === '\t') {
      pendingSpaces += g.w;
      breakAt = i + 1; widthAtBreak = width;
      continue;
    }
    const next = width + pendingSpaces + g.w;
    if (next > max && (width + pendingSpaces > 0)) {
      if (breakAt > lineStart && breakAt <= i) {
        // Break at the last opportunity.
        push(lineStart, breakAt, widthAtBreak);
        lineStart = breakAt;
        // Recompute width of the carried-over segment [breakAt, i).
        let w = 0;
        for (let j = breakAt; j < i; j++) w += gs[j].w;
        width = w; pendingSpaces = 0; breakAt = -1;
      } else {
        // Emergency break inside a long word.
        push(lineStart, i, width + pendingSpaces);
        lineStart = i; width = 0; pendingSpaces = 0; breakAt = -1;
      }
    }
    width += pendingSpaces + g.w;
    pendingSpaces = 0;
    if (BREAK_AFTER.has(g.t)) {
      const n = gs[i + 1];
      if (n && /[\p{L}]/u.test(n.t) && i > lineStart) { breakAt = i + 1; widthAtBreak = width; }
    }
  }
  push(lineStart, gs.length, width);
  return lines;
}

/** Uppercase without changing string length, so offsets (marks, cursors) stay valid. */
export function upperSameLength(text: string): string {
  const u = text.toUpperCase();
  if (u.length === text.length) return u;
  let out = '';
  for (const ch of text) {
    const c = ch.toUpperCase();
    out += c.length === ch.length ? c : ch;
  }
  return out;
}

/** True when a line ends a sentence (good place to split a block across pages). */
export function endsSentence(text: string, end: number): boolean {
  const before = text.slice(Math.max(0, end - 4), end).trimEnd();
  return /[.!?…:;]["'”’)\]]*$/.test(before);
}

export function normalizeSpaces(text: string): string {
  return text.replace(/ /g, ' ').replace(/\r\n?/g, '\n');
}
