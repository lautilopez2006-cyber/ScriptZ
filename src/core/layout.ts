// Pagination engine. One algorithm drives the on-screen page breaks, PDF, DOCX, printing and stats.
import type { Block, ElementType, PageLock, PageSettings, Project } from './model';
import { getTemplate, localeTokens, pageGeometry, resolveStyles, type ElementStyle, type LocaleTokens, type PageGeometry, type StyleMap, type Template } from './format';
import { textWidth, upperSameLength, wrap, endsSentence, type WrappedLine } from './text';
import { autoContdIds, buildScenes, characterName, sceneOptions } from './scenes';

/** Dual dialogue geometry inside the 60-column text area. */
export const DUAL = {
  rightOrigin: 31,
  colWidth: 29,
  character: { indent: 8, width: 21 },
  parenthetical: { indent: 3, width: 22 },
  dialogue: { indent: 0, width: 28 },
};

export function dualStyle(type: ElementType): { indent: number; width: number } {
  if (type === 'character') return DUAL.character;
  if (type === 'parenthetical') return DUAL.parenthetical;
  return DUAL.dialogue;
}

export interface LayoutLine {
  kind: 'text' | 'more' | 'contd';
  blockId: string;
  type: ElementType;
  /** Display text of the line. */
  text: string;
  /** Offsets of the line in the block's display text. */
  dStart: number;
  dEnd: number;
  /** Display offset of block text offset 0 (length of the printed prefix). */
  textStart: number;
  /** Column (from the left text margin) where the line's text begins. */
  col: number;
  /** Line slot on the page, 0-based. */
  row: number;
  column?: 'L' | 'R';
  /** First line of its block. */
  first: boolean;
}

export interface LayoutPage {
  index: number;
  label: string;
  lines: LayoutLine[];
  /** Line slots used. */
  used: number;
}

export interface PageBreak {
  /** Index of the page that starts here. */
  pageIndex: number;
  label: string;
  blockId: string;
  /** Offset in the block's text where the page starts (0 = at the block). */
  offset: number;
  /** Lines used on the previous page. */
  prevUsed: number;
  /** A (MORE) line was printed at the bottom of the previous page. */
  more: boolean;
  /** CHARACTER (CONT'D) printed at the top of the new page. */
  contd: string;
}

export interface Layout {
  pages: LayoutPage[];
  breaks: PageBreak[];
  /** Block id → index of the page where it starts. */
  blockPage: Map<string, number>;
  /** Block id → display info. */
  display: Map<string, BlockDisplay>;
  geometry: PageGeometry;
  linesPerPage: number;
  sceneLabels: Map<string, string>;
}

export interface BlockDisplay {
  text: string;
  textStart: number;
  style: ElementStyle;
  indent: number;
  width: number;
  lines: WrappedLine[];
  contd: boolean;
}

export interface LayoutOptions {
  includeNotes?: boolean;
  /** Override locked pages (e.g. preview without locks). */
  ignoreLocks?: boolean;
}

// --- wrap cache -------------------------------------------------------------------------------
const cache = new Map<string, WrappedLine[]>();
function cachedWrap(text: string, cols: number): WrappedLine[] {
  const key = cols + '\u0001' + text;
  let v = cache.get(key);
  if (!v) {
    if (cache.size > 30000) cache.clear();
    v = wrap(text, cols);
    cache.set(key, v);
  }
  return v;
}

export function displayText(b: Block, style: ElementStyle, tokens: LocaleTokens, contd: boolean): { text: string; textStart: number } {
  let base = b.omitted ? tokens.omitted : b.text;
  if (style.upper) base = upperSameLength(base);
  const text = style.prefix + base + style.suffix + (contd ? ' ' + tokens.contd : '');
  return { text, textStart: style.prefix.length };
}

interface Unit {
  kind: 'single' | 'dual' | 'av';
  blocks: Block[];
  /** For dual/av: index boundary between left and right blocks. */
  split: number;
  style: ElementStyle;
  spaceBefore: number;
  height: number;
  splittable: boolean;
  keepWithNext: boolean;
  newPage: boolean;
}

function lineCol(style: { indent: number; width: number }, align: ElementStyle['align'], text: string): number {
  if (align === 'left') return style.indent;
  const w = textWidth(text.trimEnd());
  if (align === 'center') return style.indent + Math.max(0, Math.floor((style.width - w) / 2));
  return style.indent + Math.max(0, style.width - w);
}

export function layoutProject(project: Project, opts: LayoutOptions = {}): Layout {
  const styles = resolveStyles(project);
  const template = getTemplate(project.template);
  const tokens = localeTokens(project.locale);
  const geometry = pageGeometry(project.page.paper);
  const scenes = buildScenes(project.blocks, sceneOptions(project));
  const sceneLabels = new Map<string, string>();
  for (const s of scenes) sceneLabels.set(s.id, s.label);
  const contd = project.page.autoContd ? autoContdIds(project.blocks, project.locale) : new Set<string>();
  const locks = opts.ignoreLocks ? null : project.revisions?.pageLocks ?? null;
  return paginate(project.blocks, { styles, template, tokens, geometry, page: project.page, contd, locks, includeNotes: !!opts.includeNotes, sceneLabels });
}

export interface PaginateInput {
  styles: StyleMap;
  template: Template;
  tokens: LocaleTokens;
  geometry: PageGeometry;
  page: PageSettings;
  contd: Set<string>;
  locks: PageLock[] | null;
  includeNotes: boolean;
  sceneLabels: Map<string, string>;
}

export function paginate(allBlocks: Block[], input: PaginateInput): Layout {
  const { styles, tokens, geometry, page, template } = input;
  const cap = geometry.lines;
  const blocks = input.includeNotes ? allBlocks : allBlocks.filter((b) => styles[b.type]?.printable !== false);
  const display = new Map<string, BlockDisplay>();

  const twoCol = !!template.twoColumn;
  const geom = (b: Block, inDual: boolean): { indent: number; width: number } => {
    const st = styles[b.type];
    if (inDual) return dualStyle(b.type);
    return { indent: st.indent, width: st.width };
  };
  const measure = (b: Block, inDual: boolean): BlockDisplay => {
    const st = styles[b.type];
    const isContd = input.contd.has(b.id);
    const { text, textStart } = displayText(b, st, tokens, isContd);
    const g = geom(b, inDual);
    const lines = cachedWrap(text, g.width);
    const d: BlockDisplay = { text, textStart, style: st, indent: g.indent, width: g.width, lines, contd: isContd };
    display.set(b.id, d);
    return d;
  };
  const blockHeight = (b: Block, inDual: boolean) => measure(b, inDual).lines.length * styles[b.type].lineSpacing;

  // --- build flow units ---
  const units: Unit[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const st = styles[b.type];
    if (b.dual === 'L' && (b.type === 'character' || b.type === 'dialogue' || b.type === 'parenthetical')) {
      let j = i;
      const left: Block[] = [];
      while (j < blocks.length && blocks[j].dual === 'L') left.push(blocks[j++]);
      const right: Block[] = [];
      while (j < blocks.length && blocks[j].dual === 'R') right.push(blocks[j++]);
      if (right.length) {
        const colH = (list: Block[]) => list.reduce((h, x, k) => h + (k ? styles[x.type].spaceBefore : 0) + blockHeight(x, true), 0);
        const height = Math.max(colH(left), colH(right));
        units.push({ kind: 'dual', blocks: [...left, ...right], split: left.length, style: st, spaceBefore: st.spaceBefore, height, splittable: false, keepWithNext: false, newPage: false });
        i = j - 1;
        continue;
      }
    }
    if (twoCol && (b.type === 'video' || b.type === 'audio')) {
      const pair: Block[] = [b];
      let split = b.type === 'video' ? 1 : 0;
      if (b.type === 'video' && blocks[i + 1]?.type === 'audio') { pair.push(blocks[i + 1]); i++; }
      const left = pair.filter((x) => x.type === 'video');
      const right = pair.filter((x) => x.type === 'audio');
      split = left.length;
      const hL = left.reduce((h, x) => h + blockHeight(x, false), 0);
      const hR = right.reduce((h, x) => h + blockHeight(x, false), 0);
      units.push({ kind: 'av', blocks: [...left, ...right], split, style: st, spaceBefore: st.spaceBefore, height: Math.max(hL, hR), splittable: false, keepWithNext: false, newPage: false });
      continue;
    }
    units.push({ kind: 'single', blocks: [b], split: 1, style: st, spaceBefore: st.spaceBefore, height: blockHeight(b, false), splittable: st.splittable, keepWithNext: st.keepWithNext, newPage: st.newPage });
  }

  // --- locks ---
  const lockQueue = (input.locks ?? []).filter((l) => l && l.blockId);
  const lockByBlock = new Map<string, PageLock[]>();
  for (const l of lockQueue) {
    const arr = lockByBlock.get(l.blockId) ?? [];
    arr.push(l);
    lockByBlock.set(l.blockId, arr.sort((a, b) => a.offset - b.offset));
  }
  const presentIds = new Set(blocks.map((b) => b.id));
  const locked = !!input.locks;
  let lockBase = '1';
  let overflow = 0;
  const nextLabel = (): string => {
    if (!locked) return String(pages.length + 1);
    overflow++;
    let s = '';
    let n = overflow;
    while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26); }
    return lockBase + s;
  };

  // --- placement ---
  const pages: LayoutPage[] = [];
  const breaks: PageBreak[] = [];
  const blockPage = new Map<string, number>();
  let cur: LayoutPage = { index: 0, label: '1', lines: [], used: 0 };
  pages.push(cur);
  interface Placed { unit: number; from: number; lines: number; used: number }
  let placed: Placed[] = [];

  const startPage = (label: string, at: { blockId: string; offset: number; more?: boolean; contd?: string }) => {
    const prevUsed = cur.used;
    cur = { index: pages.length, label, lines: [], used: 0 };
    pages.push(cur);
    placed = [];
    breaks.push({ pageIndex: cur.index, label, blockId: at.blockId, offset: at.offset, prevUsed, more: !!at.more, contd: at.contd ?? '' });
  };

  const pushLine = (line: Omit<LayoutLine, 'row'>, rowOffset: number) => {
    cur.lines.push({ ...line, row: rowOffset });
  };

  /** Place lines [from, to) of a single block at the current position. */
  const placeSingle = (b: Block, from: number, to: number, sb: number) => {
    const d = display.get(b.id)!;
    const ls = d.style.lineSpacing;
    let row = cur.used + sb;
    if (from === 0 && !blockPage.has(b.id)) blockPage.set(b.id, cur.index);
    for (let k = from; k < to; k++) {
      const l = d.lines[k];
      const text = d.text.slice(l.start, l.end);
      pushLine({ kind: 'text', blockId: b.id, type: b.type, text, dStart: l.start, dEnd: l.end, textStart: d.textStart, col: lineCol(d, d.style.align, text), first: k === 0 }, row);
      row += ls;
    }
    cur.used = row;
  };

  const placeColumns = (u: Unit, sb: number) => {
    const top = cur.used + sb;
    let maxRow = top;
    const left = u.blocks.slice(0, u.split);
    const right = u.blocks.slice(u.split);
    const place = (list: Block[], column: 'L' | 'R') => {
      let row = top;
      list.forEach((b, k) => {
        const d = display.get(b.id)!;
        if (k) row += styles[b.type].spaceBefore;
        if (!blockPage.has(b.id)) blockPage.set(b.id, cur.index);
        const origin = u.kind === 'dual' && column === 'R' ? DUAL.rightOrigin : 0;
        d.lines.forEach((l, li) => {
          const text = d.text.slice(l.start, l.end);
          pushLine({ kind: 'text', blockId: b.id, type: b.type, text, dStart: l.start, dEnd: l.end, textStart: d.textStart, col: origin + lineCol(d, d.style.align, text), column, first: li === 0 }, row);
          row += d.style.lineSpacing;
        });
      });
      maxRow = Math.max(maxRow, row);
    };
    place(left, 'L');
    place(right, 'R');
    cur.used = maxRow;
  };

  /** Speaker of a dialogue block, for (CONT'D) after a page break. */
  const speakerBefore = (unitIndex: number): string => {
    for (let k = unitIndex - 1; k >= 0 && k >= unitIndex - 6; k--) {
      const b = units[k].blocks[0];
      if (units[k].kind !== 'single') return '';
      if (b.type === 'character') return characterName(b.text);
      if (b.type !== 'parenthetical' && b.type !== 'dialogue') return '';
    }
    return '';
  };

  const minFollow = (i: number, depth = 0): number => {
    const n = units[i + 1];
    if (!n || depth > 3) return 0;
    const sb = n.spaceBefore;
    if (n.splittable) {
      const d = display.get(n.blocks[0].id)!;
      return sb + Math.min(2, d.lines.length) * d.style.lineSpacing;
    }
    return sb + n.height + (n.keepWithNext ? minFollow(i + 1, depth + 1) : 0);
  };

  const lockFor = (b: Block, offset: number): PageLock | undefined => lockByBlock.get(b.id)?.find((l) => l.offset === offset);

  for (let ui = 0; ui < units.length; ui++) {
    const u = units[ui];
    const first = u.blocks[0];

    // Forced page start from a locked page at this block.
    const lk = lockFor(first, 0);
    if (lk) {
      lockBase = lk.label; overflow = 0;
      if (cur.lines.length) startPage(lk.label, { blockId: first.id, offset: 0 });
      else { cur.label = lk.label; if (breaks.length && breaks[breaks.length - 1].pageIndex === cur.index) breaks[breaks.length - 1].label = lk.label; }
    } else if (u.newPage && cur.lines.length) {
      startPage(nextLabel(), { blockId: first.id, offset: 0 });
    }

    let sb = cur.used === 0 ? 0 : u.spaceBefore;
    const need = sb + u.height + (u.keepWithNext ? minFollow(ui) : 0);

    // Inner locks (offset > 0) force a split inside a splittable block.
    const innerLocks = u.kind === 'single' ? (lockByBlock.get(first.id) ?? []).filter((l) => l.offset > 0) : [];

    if (u.kind === 'single' && (innerLocks.length || cur.used + need > cap)) {
      const d = display.get(first.id)!;
      const ls = d.style.lineSpacing;
      const total = d.lines.length;
      const lineOfOffset = (offset: number) => d.lines.findIndex((x) => x.start >= offset + d.textStart);
      const isDialogue = first.type === 'dialogue' && page.moreContd;
      const contdName = isDialogue ? speakerBefore(ui) : '';
      const reserve = isDialogue && contdName ? 1 : 0;
      let from = 0;
      let guard = 0;
      while (from < total && guard++ < 100000) {
        sb = cur.used === 0 ? 0 : from === 0 ? u.spaceBefore : 0;
        const avail = cap - cur.used - sb;
        const remaining = total - from;
        const chainOk = from > 0 || !u.keepWithNext || cur.used === 0 || cur.used + sb + remaining * ls + minFollow(ui) <= cap;
        const nextLock = innerLocks.find((l) => lineOfOffset(l.offset) > from);
        const lockLine = nextLock ? lineOfOffset(nextLock.offset) : -1;
        if (lockLine < 0 && remaining * ls <= avail && chainOk) {
          placeSingle(first, from, total, sb);
          placed.push({ unit: ui, from, lines: remaining, used: cur.used });
          from = total;
          break;
        }
        if (nextLock && lockLine > from && (lockLine - from) * ls <= avail) {
          placeSingle(first, from, lockLine, sb);
          placed.push({ unit: ui, from, lines: lockLine - from, used: cur.used });
          lockBase = nextLock.label; overflow = 0;
          startPage(nextLock.label, { blockId: first.id, offset: nextLock.offset });
          from = lockLine;
          continue;
        }
        let k = 0;
        if (u.splittable) {
          k = chooseSplitFrom(d, from, avail - reserve, cur.used === 0 || remaining * ls > cap);
          if (lockLine > from) k = Math.min(k, lockLine - from);
        }
        if (k > 0) {
          placeSingle(first, from, from + k, sb);
          placed.push({ unit: ui, from, lines: k, used: cur.used });
          const at = from + k;
          const more = reserve > 0;
          if (more) {
            pushLine({ kind: 'more', blockId: first.id, type: 'character', text: tokens.more, dStart: 0, dEnd: 0, textStart: 0, col: styles.character.indent, first: false }, cur.used);
            cur.used += 1;
          }
          const offset = Math.max(0, d.lines[at].start - d.textStart);
          startPage(nextLabel(), { blockId: first.id, offset, more, contd: more ? contdName : '' });
          if (more) {
            pushLine({ kind: 'contd', blockId: first.id, type: 'character', text: `${contdName} ${tokens.contd}`, dStart: 0, dEnd: 0, textStart: 0, col: styles.character.indent, first: false }, 0);
            cur.used = 1;
          }
          from = at;
          continue;
        }
        if (cur.used > 0) {
          const pulled = from === 0 ? pullKeepers() : [];
          startPage(nextLabel(), { blockId: pulled.length ? units[pulled[0]].blocks[0].id : first.id, offset: from === 0 ? 0 : Math.max(0, d.lines[from].start - d.textStart) });
          for (const pi of pulled) replayUnit(pi);
          continue;
        }
        // Empty page and an unsplittable element taller than a page: fill the page.
        const n = Math.max(1, Math.min(remaining, Math.floor(avail / ls)));
        placeSingle(first, from, from + n, 0);
        placed.push({ unit: ui, from, lines: n, used: cur.used });
        from += n;
        if (from < total) startPage(nextLabel(), { blockId: first.id, offset: Math.max(0, d.lines[from].start - d.textStart) });
      }
      continue;
    }

    if (cur.used + need > cap && cur.used > 0) {
      const pulled = pullKeepers();
      startPage(nextLabel(), { blockId: pulled.length ? units[pulled[0]].blocks[0].id : first.id, offset: 0 });
      for (const pi of pulled) replayUnit(pi);
      sb = cur.used === 0 ? 0 : u.spaceBefore;
    }
    if (u.kind === 'single') placeSingle(first, 0, display.get(first.id)!.lines.length, sb);
    else placeColumns(u, sb);
    placed.push({ unit: ui, from: 0, lines: 0, used: cur.used });
  }

  function chooseSplitFrom(d: BlockDisplay, from: number, avail: number, force: boolean): number {
    const ls = d.style.lineSpacing;
    const total = d.lines.length - from;
    const maxK = Math.min(total - 1, Math.floor(avail / ls));
    if (maxK <= 0) return 0;
    for (let k = maxK; k >= 2; k--) {
      if (total - k < 2) continue;
      if (endsSentence(d.text, d.lines[from + k - 1].end)) return k;
    }
    if (force) return Math.max(1, maxK);
    return 0;
  }

  /** Remove trailing keep-with-next units from the current page; returns their unit indexes (in order) followed by `ui`. */
  function pullKeepers(): number[] {
    const pulled: number[] = [];
    // Never empty the page completely.
    while (placed.length > 1) {
      const last = placed[placed.length - 1];
      const lu = units[last.unit];
      if (!lu.keepWithNext || last.from !== 0 || lu.kind !== 'single') break;
      placed.pop();
      const id = lu.blocks[0].id;
      cur.lines = cur.lines.filter((l) => l.blockId !== id);
      blockPage.delete(id);
      pulled.unshift(last.unit);
    }
    cur.used = placed.length ? placed[placed.length - 1].used : 0;
    // A trailing blank space is not stored; `used` from the previous placement is exact.
    return pulled;
  }

  function replayUnit(pi: number) {
    const pu = units[pi];
    const sb = cur.used === 0 ? 0 : pu.spaceBefore;
    if (pu.kind === 'single') placeSingle(pu.blocks[0], 0, display.get(pu.blocks[0].id)!.lines.length, sb);
    else placeColumns(pu, sb);
    placed.push({ unit: pi, from: 0, lines: 0, used: cur.used });
  }

  // Locks whose anchor disappeared merge their label into the page that now holds that content.
  if (locked && input.locks) {
    for (const l of input.locks) {
      if (!presentIds.has(l.blockId)) {
        // Find the last page whose label sorts before this lock and append "-label".
        const target = [...pages].reverse().find((p) => compareLabels(p.label.split('-')[0], l.label) < 0) ?? pages[0];
        if (!target.label.split('-').includes(l.label)) target.label = `${target.label}-${l.label}`;
      }
    }
  }

  return { pages, breaks, blockPage, display, geometry, linesPerPage: cap, sceneLabels: input.sceneLabels };
}

/** Compare production page labels: "2" < "2A" < "2B" < "3". */
export function compareLabels(a: string, b: string): number {
  const pa = /^(\d+)([A-Z]*)$/.exec(a);
  const pb = /^(\d+)([A-Z]*)$/.exec(b);
  if (!pa || !pb) return a.localeCompare(b);
  const d = Number(pa[1]) - Number(pb[1]);
  if (d) return d;
  if (pa[2].length !== pb[2].length) return pa[2].length - pb[2].length;
  return pa[2].localeCompare(pb[2]);
}

/** Capture current page starts as locks (page 2 onward). */
export function capturePageLocks(layout: Layout): PageLock[] {
  return layout.breaks.map((b) => ({ label: b.label, blockId: b.blockId, offset: b.offset }));
}

/** Page count for stats (eighths of a page per scene etc.). */
export function sceneLengths(layout: Layout, blocks: Block[]): Map<string, number> {
  // Measure each scene in line slots, using the rows of its lines across pages.
  const out = new Map<string, number>();
  const sceneOf = new Map<string, string>();
  let current = '';
  for (const b of blocks) {
    if (b.type === 'scene') current = b.id;
    if (current) sceneOf.set(b.id, current);
  }
  const cap = layout.linesPerPage;
  for (const p of layout.pages) {
    // Count spacing as belonging to the scene of the following line.
    let prevRow = -1;
    for (const l of p.lines) {
      const sid = sceneOf.get(l.blockId);
      const h = l.row - prevRow;
      prevRow = Math.max(prevRow, l.row);
      if (!sid || h <= 0) continue;
      out.set(sid, (out.get(sid) ?? 0) + h);
    }
  }
  for (const [k, v] of out) out.set(k, v / cap);
  return out;
}

/** "1 3/8" style length in eighths of a page. */
export function eighths(pages: number): string {
  const total = Math.max(1, Math.round(pages * 8));
  const whole = Math.floor(total / 8);
  const rest = total % 8;
  if (!whole) return `${rest}/8`;
  return rest ? `${whole} ${rest}/8` : String(whole);
}

export type { ElementStyle };
