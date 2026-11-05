// ScriptEditor: a page-accurate WYSIWYG screenplay editor on top of contentEditable.
// The model (Block[]) is the source of truth. Typing is applied to the model first and mirrored
// into the DOM; IME composition and in-paragraph deletions are read back from the DOM.
import type { Block, ElementType, Mark, MarkKind, PageLock, PageSettings } from '../core/model';
import { uid } from '../core/model';
import { getTemplate, localeTokens, pageGeometry, type ElementStyle, type LocaleTokens, type PageGeometry, type StyleMap, type Template } from '../core/format';
import { paginate, DUAL, type Layout } from '../core/layout';
import { autoContdIds, buildScenes, characterName, isSceneHeadingText } from '../core/scenes';
import { addMark, hasMark, normalizeMarks, removeMark, replaceText, sliceMarks, concatMarks, marksEqual } from '../core/marks';
import { applyOps, diffBlocks, invertOps, type BlockOp } from '../core/diff';
import { blockElOf, domToOffset, isCanonical, isDeco, offsetToDom, parseContent, renderContent, textNodes, DECO_ATTR } from './dom';
import { parseFountain, toFountain } from '../io/fountain';

export interface Pos { id: string; off: number }
export interface Sel { anchor: Pos; focus: Pos }

export interface EditorConfig {
  styles: StyleMap;
  template: string;
  locale: string;
  page: PageSettings;
  locks: PageLock[] | null;
  sceneLetters: boolean;
  scenesLocked: boolean;
  lang: string;
  readOnly: boolean;
  zoom: number;
  /** Page view (true) or a single continuous sheet without breaks (false). */
  pageView: boolean;
  showSceneNumbers: boolean;
  focusMode: 'off' | 'scene' | 'paragraph';
  typewriter: boolean;
  elementKeys: Record<string, ElementType>;
  macros: Record<string, { text: string; type?: ElementType }>;
  knownCharacters: () => string[];
  tagCategory: (id: string) => string | undefined;
  isRevised: (b: Block) => boolean;
  header: (pageIndex: number, label: string) => { left: string; center: string; right: string };
  footer: (pageIndex: number, label: string) => { left: string; center: string; right: string };
}

export interface CaretContext {
  block: Block | null;
  index: number;
  sceneId: string;
  page: number;
  pageCount: number;
  collapsed: boolean;
  /** Character marks at the caret / selection start. */
  marks: Mark[];
}

export interface EditorHooks {
  onChange?: (blocks: Block[], info: { structural: boolean; local: boolean }) => void;
  onSelection?: (sel: Sel | null, ctx: CaretContext) => void;
  onLayout?: (layout: Layout) => void;
  /** Return true to swallow the key (autocomplete popups etc.). */
  keyHook?: (e: KeyboardEvent) => boolean;
  /** May rewrite a commit (locked scenes, revision marks, suggestions); can also move the caret. */
  transformCommit?: (prev: Block[], next: Block[], sel: Sel | null, before: Sel | null) => Block[] | { blocks: Block[]; sel: Sel | null };
  onElementMenu?: (rect: DOMRect, current: ElementType) => void;
  onContextMenu?: (e: MouseEvent, pos: Pos | null) => void;
  onMarkClick?: (kind: 'cmt' | 'tag', id: string, e: MouseEvent) => void;
  onFocusChange?: (focused: boolean) => void;
}

interface HistoryEntry { ops: BlockOp[]; before: Sel | null; after: Sel | null; key: string; time: number }

const MAX_HISTORY = 400;
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

export function comboOf(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('Mod');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  let k = e.key;
  if (e.code && /^Digit\d$/.test(e.code)) k = e.code.slice(5);
  else if (e.code && /^Key[A-Z]$/.test(e.code)) k = e.code.slice(3);
  else if (k.length === 1) k = k.toUpperCase();
  parts.push(k);
  return parts.join('+');
}

export class ScriptEditor {
  readonly host: HTMLElement;
  readonly paper: HTMLDivElement;
  readonly doc: HTMLDivElement;
  private styleEl: HTMLStyleElement;
  private blocks: Block[];
  private index = new Map<string, number>();
  private els = new Map<string, HTMLElement>();
  private groups = new Map<string, HTMLElement>();
  private decos = new Map<string, HTMLElement>();
  private cfg: EditorConfig;
  private hooks: EditorHooks;
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private composing = false;
  private pendingMarks: Mark[] | null = null;
  private layoutTimer = 0;
  private selTimer = 0;
  private layout: Layout | null = null;
  private lastSel: Sel | null = null;
  private focusIds: string[] = [];
  private tokens: LocaleTokens;
  private template: Template;
  private geometry: PageGeometry;
  private destroyed = false;
  private listeners: [EventTarget, string, EventListener, boolean | AddEventListenerOptions | undefined][] = [];
  private suppressSelection = false;

  constructor(host: HTMLElement, blocks: Block[], cfg: EditorConfig, hooks: EditorHooks = {}) {
    this.host = host;
    this.cfg = cfg;
    this.hooks = hooks;
    this.blocks = blocks.length ? blocks : [{ id: uid(), type: 'scene', text: '' }];
    this.tokens = localeTokens(cfg.locale);
    this.template = getTemplate(cfg.template);
    this.geometry = pageGeometry(cfg.page.paper);
    this.paper = document.createElement('div');
    this.paper.className = 'sz-paper';
    this.doc = document.createElement('div');
    this.doc.className = 'sz-doc';
    this.doc.setAttribute('role', 'textbox');
    this.doc.setAttribute('aria-multiline', 'true');
    this.doc.setAttribute('aria-label', 'Guion');
    this.styleEl = document.createElement('style');
    this.paper.appendChild(this.styleEl);
    this.paper.appendChild(this.doc);
    host.appendChild(this.paper);
    this.applyConfig();
    this.reindex();
    this.renderAll();
    this.bind();
    this.relayout();
  }

  // ------------------------------------------------------------------ public API

  getBlocks(): Block[] { return this.blocks; }
  getLayout(): Layout | null { return this.layout; }
  getSelection(): Sel | null { return this.readSelection() ?? this.lastSel; }

  setConfig(patch: Partial<EditorConfig>): void {
    const prev = this.cfg;
    this.cfg = { ...this.cfg, ...patch };
    this.tokens = localeTokens(this.cfg.locale);
    this.template = getTemplate(this.cfg.template);
    this.geometry = pageGeometry(this.cfg.page.paper);
    this.applyConfig();
    const needsRender = prev.styles !== this.cfg.styles || prev.template !== this.cfg.template;
    if (needsRender) { const sel = this.getSelection(); this.syncStructure(true); if (sel) this.setSelection(sel, false); }
    this.relayout();
  }

  /** Replace the document from outside (remote change, scene move, restore...). */
  setBlocks(next: Block[], opts: { history?: boolean; local?: boolean; sel?: Sel | null } = {}): void {
    const prev = this.blocks;
    if (next === prev) return;
    const sel = opts.sel ?? this.getSelection();
    if (opts.history) {
      const ops = diffBlocks(prev, next);
      if (ops.length) this.pushHistory({ ops, before: sel, after: opts.sel ?? sel, key: 'ext', time: Date.now() }, false);
    }
    this.blocks = next.length ? next : [{ id: uid(), type: 'scene', text: '' }];
    this.reindex();
    this.syncStructure(false, prev);
    if (sel) this.setSelection(this.clampSel(sel), false);
    this.scheduleLayout(0);
    this.hooks.onChange?.(this.blocks, { structural: true, local: !!opts.local });
  }

  focus(): void { this.doc.focus({ preventScroll: true }); if (this.lastSel) this.setSelection(this.lastSel, false); }

  undo(): void {
    const e = this.undoStack.pop();
    if (!e) return;
    const inv = invertOps(e.ops);
    const next = applyOps(this.blocks, inv);
    this.redoStack.push(e);
    this.applyCommitted(next, true, e.before);
  }

  redo(): void {
    const e = this.redoStack.pop();
    if (!e) return;
    const next = applyOps(this.blocks, e.ops);
    this.undoStack.push(e);
    this.applyCommitted(next, true, e.after);
  }

  canUndo(): boolean { return this.undoStack.length > 0; }
  canRedo(): boolean { return this.redoStack.length > 0; }

  scrollToBlock(id: string, opts: { select?: boolean; offset?: number; center?: boolean } = {}): void {
    const el = this.els.get(id);
    if (!el) return;
    const scroller = this.scroller();
    const r = el.getBoundingClientRect();
    const sr = scroller.getBoundingClientRect();
    const y = scroller.scrollTop + r.top - sr.top - (opts.center === false ? 80 : sr.height / 3);
    scroller.scrollTo({ top: Math.max(0, y) });
    if (opts.select) {
      this.doc.focus({ preventScroll: true });
      this.setSelection({ anchor: { id, off: opts.offset ?? 0 }, focus: { id, off: opts.offset ?? 0 } }, false);
    }
  }

  selectRange(a: Pos, b: Pos, scroll = true): void {
    this.doc.focus({ preventScroll: true });
    this.setSelection({ anchor: a, focus: b }, scroll);
  }

  /** Element types of the blocks touched by the selection. */
  selectedBlocks(): Block[] {
    const sel = this.getSelection();
    if (!sel) return [];
    const [s, e] = this.ordered(sel);
    return this.blocks.slice(this.index.get(s.id)!, this.index.get(e.id)! + 1);
  }

  setType(type: ElementType): void {
    if (this.cfg.readOnly) return;
    const sel = this.getSelection();
    if (!sel) return;
    const [s, e] = this.ordered(sel);
    const i0 = this.index.get(s.id)!, i1 = this.index.get(e.id)!;
    const next = this.blocks.slice();
    let newSel = sel;
    for (let i = i0; i <= i1; i++) {
      const b = next[i];
      if (b.type === type) continue;
      const nb: Block = { ...b, type };
      if (b.dual && type !== 'character' && type !== 'dialogue' && type !== 'parenthetical') delete nb.dual;
      if (type === 'parenthetical' && !b.text.trim()) {
        nb.text = '()';
        delete nb.marks;
        if (i0 === i1) newSel = { anchor: { id: b.id, off: 1 }, focus: { id: b.id, off: 1 } };
      }
      if (b.type === 'parenthetical' && b.text === '()') nb.text = '';
      if (type === 'scene' && b.omitted === undefined) { /* keep */ }
      next[i] = nb;
    }
    this.commit(next, { sel: newSel, key: 'type', structural: true });
  }

  cycleType(backward = false): void {
    const sel = this.getSelection();
    if (!sel) return;
    const b = this.blocks[this.index.get(sel.focus.id)!];
    const st = this.style(b.type);
    let target = backward ? st.shiftTab : st.tab;
    if (!this.template.order.includes(target)) target = this.template.order[0];
    this.setType(target);
  }

  toggleMark(k: MarkKind): void {
    if (this.cfg.readOnly) return;
    const sel = this.getSelection();
    if (!sel) return;
    if (this.isCollapsed(sel)) {
      const b = this.blocks[this.index.get(sel.focus.id)!];
      const current = this.pendingMarks ?? (b.marks ?? []).filter((m) => m.s < sel.focus.off && m.e >= sel.focus.off && (m.k === 'b' || m.k === 'i' || m.k === 'u' || m.k === 'x'));
      const has = current.some((m) => m.k === k);
      this.pendingMarks = has ? current.filter((m) => m.k !== k) : [...current, { s: 0, e: 0, k }];
      this.emitSelection();
      return;
    }
    const ranges = this.rangesOf(sel);
    const all = ranges.every(({ b, s, e }) => e <= s || hasMark(b.marks, s, e, k));
    this.updateRanges(ranges, (b, s, e) => all ? removeMark(b.marks, s, e, k) : addMark(b.marks, s, e, k, undefined, b.text.length), 'fmt');
  }

  /** Add (value) or remove (null) a valued mark (highlight color, tag id, comment id) over the selection. */
  setValuedMark(k: 'hl' | 'tag' | 'cmt', value: string | null, removeValue?: string): boolean {
    const sel = this.getSelection();
    if (!sel || this.isCollapsed(sel)) return false;
    const ranges = this.rangesOf(sel);
    this.updateRanges(ranges, (b, s, e) => value === null ? removeMark(b.marks, s, e, k, removeValue) : addMark(b.marks, s, e, k, value, b.text.length), 'fmt');
    return true;
  }

  /** Remove every mark of kind/value in the whole document (e.g. a deleted comment). */
  stripMark(k: MarkKind, value: string): void {
    let changed = false;
    const next = this.blocks.map((b) => {
      if (!b.marks?.some((m) => m.k === k && m.v === value)) return b;
      changed = true;
      const marks = b.marks.filter((m) => !(m.k === k && m.v === value));
      const nb: Block = { ...b, marks };
      if (!marks.length) delete nb.marks;
      return nb;
    });
    if (changed) this.commit(next, { key: 'fmt', structural: false });
  }

  selectedText(): string {
    const sel = this.getSelection();
    if (!sel) return '';
    return this.rangesOf(sel).map(({ b, s, e }) => b.text.slice(s, e)).join('\n');
  }

  insertText(text: string, marks?: Mark[]): void {
    if (this.cfg.readOnly) return;
    let sel = this.getSelection();
    if (!sel) return;
    let blocks = this.blocks;
    if (!this.isCollapsed(sel)) {
      const r = this.deleteRange(blocks, sel);
      blocks = r.blocks; sel = r.sel;
    }
    const i = this.index.get(sel.focus.id) ?? this.indexIn(blocks, sel.focus.id);
    const b = blocks[i];
    const off = sel.focus.off;
    const extra = marks ?? (this.pendingMarks ? this.pendingMarks.map((m) => ({ ...m, s: 0, e: text.length })) : undefined);
    let nb = replaceText(b, off, off, text);
    if (this.pendingMarks) {
      // Pending marks replace inherited formatting for the inserted text.
      for (const k of ['b', 'i', 'u', 'x'] as MarkKind[]) nb = { ...nb, marks: removeMark(nb.marks, off, off + text.length, k) };
      if (!nb.marks) delete nb.marks;
    }
    if (extra && extra.length) {
      const m = normalizeMarks([...(nb.marks ?? []), ...extra.map((x) => ({ ...x, s: off + x.s, e: off + x.e }))], nb.text.length);
      nb = { ...nb }; if (m) nb.marks = m; else delete nb.marks;
    }
    // Smart type: an action that starts like a scene heading becomes a scene heading.
    if (nb.type === 'action' && off + text.length === nb.text.length && /^(INT|EXT|I\/E|INT\.\/EXT|EXT\.\/INT|EST)[.]\s?$/i.test(nb.text.trim() + (text.endsWith(' ') ? '' : '')) && /\s$/.test(nb.text)) {
      nb = { ...nb, type: 'scene' };
    }
    const next = blocks === this.blocks ? blocks.slice() : blocks.slice();
    next[i] = nb;
    const pos = { id: b.id, off: off + text.length };
    this.commit(next, { sel: { anchor: pos, focus: pos }, key: 'type:' + b.id, structural: nb.type !== b.type || blocks !== this.blocks, fastText: blocks === this.blocks && nb.type === b.type ? b.id : undefined });
  }

  /** Insert whole blocks after the caret's block (or split it). */
  insertBlocks(list: Block[]): void {
    if (this.cfg.readOnly || !list.length) return;
    let sel = this.getSelection();
    if (!sel) return;
    let blocks = this.blocks;
    if (!this.isCollapsed(sel)) { const r = this.deleteRange(blocks, sel); blocks = r.blocks; sel = r.sel; }
    const idx = this.indexIn(blocks, sel.focus.id);
    const b = blocks[idx];
    const off = sel.focus.off;
    const fresh = list.map((x) => ({ ...x, id: uid() }));
    const next = blocks.slice();
    if (!b.text) {
      next.splice(idx, 1, ...fresh);
    } else if (off >= b.text.length) {
      next.splice(idx + 1, 0, ...fresh);
    } else if (off === 0) {
      next.splice(idx, 0, ...fresh);
    } else {
      const left: Block = { ...b, text: b.text.slice(0, off), marks: sliceMarks(b.marks, 0, off) };
      const right: Block = { ...b, id: uid(), text: b.text.slice(off), marks: sliceMarks(b.marks, off, b.text.length) };
      if (!left.marks) delete left.marks; if (!right.marks) delete right.marks;
      next.splice(idx, 1, left, ...fresh, right);
    }
    const last = fresh[fresh.length - 1];
    const pos = { id: last.id, off: last.text.length };
    this.commit(next, { sel: { anchor: pos, focus: pos }, key: 'paste', structural: true });
  }

  /** Convert the current speech and the previous one into dual dialogue (or undo it). */
  toggleDual(): void {
    const sel = this.getSelection();
    if (!sel) return;
    const i = this.index.get(sel.focus.id)!;
    const speechAt = (k: number): [number, number] | null => {
      let s = k;
      while (s >= 0 && (this.blocks[s].type === 'dialogue' || this.blocks[s].type === 'parenthetical')) s--;
      if (s < 0 || this.blocks[s].type !== 'character') return null;
      let e = s + 1;
      while (e < this.blocks.length && (this.blocks[e].type === 'dialogue' || this.blocks[e].type === 'parenthetical')) e++;
      return [s, e];
    };
    const cur = speechAt(i);
    if (!cur) return;
    const next = this.blocks.slice();
    if (this.blocks[cur[0]].dual) {
      // Remove dual from this pair (both sides).
      let a = cur[0];
      while (a > 0 && next[a - 1].dual) a--;
      let z = cur[1];
      while (z < next.length && next[z].dual) z++;
      for (let k = a; k < z; k++) { const nb = { ...next[k] }; delete nb.dual; next[k] = nb; }
    } else {
      const prev = speechAt(cur[0] - 1);
      if (!prev || prev[1] !== cur[0]) return;
      for (let k = prev[0]; k < prev[1]; k++) next[k] = { ...next[k], dual: 'L' };
      for (let k = cur[0]; k < cur[1]; k++) next[k] = { ...next[k], dual: 'R' };
    }
    this.commit(next, { sel, key: 'dual', structural: true });
  }

  setBookmark(label: string | null): void {
    const sel = this.getSelection();
    if (!sel) return;
    const i = this.index.get(sel.focus.id)!;
    const next = this.blocks.slice();
    const nb = { ...next[i] };
    if (label) nb.bookmark = label; else delete nb.bookmark;
    next[i] = nb;
    this.commit(next, { sel, key: 'bm', structural: false });
  }

  /** Model positions → client rects (for remote cursors, popups). */
  rectAt(pos: Pos): DOMRect | null {
    const el = this.els.get(pos.id);
    if (!el) return null;
    const p = offsetToDom(el, Math.min(pos.off, this.blocks[this.index.get(pos.id)!]?.text.length ?? 0));
    const r = document.createRange();
    try { r.setStart(p.node, p.offset); r.collapse(true); } catch { return el.getBoundingClientRect(); }
    const rects = r.getClientRects();
    if (rects.length) return rects[rects.length - 1];
    const er = el.getBoundingClientRect();
    return new DOMRect(er.left, er.top, 1, er.height || 16);
  }

  rangeRects(a: Pos, b: Pos): DOMRect[] {
    const ra = this.domRange(a, b);
    return ra ? Array.from(ra.getClientRects()) : [];
  }

  domRange(a: Pos, b: Pos): Range | null {
    const ea = this.els.get(a.id), eb = this.els.get(b.id);
    if (!ea || !eb) return null;
    const pa = offsetToDom(ea, a.off), pb = offsetToDom(eb, b.off);
    const r = document.createRange();
    try { r.setStart(pa.node, pa.offset); r.setEnd(pb.node, pb.offset); } catch { return null; }
    return r;
  }

  /** Paint search results with the CSS Custom Highlight API (no DOM changes). */
  highlight(name: string, ranges: { a: Pos; b: Pos }[]): void {
    const H = (globalThis as unknown as { Highlight?: new (...r: Range[]) => unknown; CSS?: { highlights?: Map<string, unknown> } });
    const reg = H.CSS?.highlights;
    if (!reg || !H.Highlight) return;
    if (!ranges.length) { reg.delete(name); return; }
    const list: Range[] = [];
    for (const r of ranges) { const d = this.domRange(r.a, r.b); if (d) list.push(d); }
    reg.set(name, new H.Highlight(...list));
  }

  pageOf(id: string): number { return this.layout?.blockPage.get(id) ?? 0; }

  private readingId = '';
  /** Highlight the block being read aloud (or clear with null). */
  markReading(id: string | null): void {
    if (this.readingId) this.els.get(this.readingId)?.classList.remove('reading');
    this.readingId = id ?? '';
    if (!id) return;
    const el = this.els.get(id);
    if (!el) return;
    el.classList.add('reading');
    const sc = this.scroller();
    const r = el.getBoundingClientRect(), sr = sc.getBoundingClientRect();
    if (r.top < sr.top + 60 || r.bottom > sr.bottom - 60) sc.scrollTop += r.top - sr.top - sr.height / 3;
  }

  scroller(): HTMLElement {
    let n: HTMLElement | null = this.host;
    while (n) {
      const s = getComputedStyle(n);
      if (/(auto|scroll)/.test(s.overflowY) && n.scrollHeight > n.clientHeight) return n;
      n = n.parentElement;
    }
    return (document.scrollingElement as HTMLElement) ?? document.body;
  }

  destroy(): void {
    this.destroyed = true;
    for (const [t, ev, fn, o] of this.listeners) t.removeEventListener(ev, fn, o);
    clearTimeout(this.layoutTimer);
    this.paper.remove();
  }

  // ------------------------------------------------------------------ config & styles

  private style(type: ElementType): ElementStyle { return this.cfg.styles[type] ?? this.cfg.styles.action; }

  private applyConfig(): void {
    const g = this.geometry;
    const z = this.cfg.zoom;
    const p = this.paper;
    p.style.setProperty('--z', String(z));
    p.style.setProperty('--pw', `calc(${g.widthIn} * var(--in))`);
    p.dataset.paper = g.paper;
    p.classList.toggle('no-pages', !this.cfg.pageView);
    p.classList.toggle('focus-scene', this.cfg.focusMode === 'scene');
    p.classList.toggle('focus-paragraph', this.cfg.focusMode === 'paragraph');
    p.classList.toggle('show-nums', this.cfg.showSceneNumbers);
    this.doc.contentEditable = this.cfg.readOnly ? 'false' : 'true';
    this.doc.spellcheck = !this.cfg.readOnly;
    this.doc.lang = this.cfg.lang;
    const css: string[] = [];
    const types = Object.keys(this.cfg.styles) as ElementType[];
    for (const t of types) {
      const st = this.cfg.styles[t];
      const rules = [
        `--bl: calc(var(--ml) + ${st.indent}ch)`,
        `margin-left: calc(var(--ml) + ${st.indent}ch)`,
        `width: ${st.width}ch`,
        `margin-top: calc(var(--ln) * ${st.spaceBefore})`,
        `text-align: ${st.align}`,
        `line-height: calc(var(--ln) * ${st.lineSpacing})`,
      ];
      if (st.upper) rules.push('text-transform: uppercase');
      if (st.bold) rules.push('font-weight: 700');
      if (st.italic) rules.push('font-style: italic');
      if (st.underline) rules.push('text-decoration: underline');
      css.push(`.sz-doc .t-${t}{${rules.join(';')}}`);
      if (st.prefix) css.push(`.sz-doc .t-${t}::before{content:${JSON.stringify(st.prefix)};}`);
      if (st.suffix) css.push(`.sz-doc .t-${t}:not(:empty)::after{content:${JSON.stringify(st.suffix)};}`);
    }
    // Dual dialogue columns.
    css.push(`.sz-doc .grp.dual{margin-left:var(--ml);width:60ch;display:flex;gap:${DUAL.rightOrigin - DUAL.colWidth}ch;margin-top:calc(var(--ln) * ${this.style('character').spaceBefore})}`);
    css.push(`.sz-doc .grp.dual>.col{width:${DUAL.colWidth}ch;flex:none}`);
    css.push(`.sz-doc .grp.dual .t-character{margin-left:${DUAL.character.indent}ch;width:${DUAL.character.width}ch;margin-top:0}`);
    css.push(`.sz-doc .grp.dual .t-parenthetical{margin-left:${DUAL.parenthetical.indent}ch;width:${DUAL.parenthetical.width}ch}`);
    css.push(`.sz-doc .grp.dual .t-dialogue{margin-left:${DUAL.dialogue.indent}ch;width:${DUAL.dialogue.width}ch}`);
    const tc = this.template.twoColumn;
    if (tc) {
      const v = this.style('video'), a = this.style('audio');
      css.push(`.sz-doc .grp.av{margin-left:var(--ml);width:60ch;display:flex;gap:${a.indent - v.width}ch;margin-top:calc(var(--ln) * ${v.spaceBefore})}`);
      css.push(`.sz-doc .grp.av>.col.L{width:${v.width}ch;flex:none}.sz-doc .grp.av>.col.R{width:${a.width}ch;flex:none}`);
      css.push(`.sz-doc .grp.av .b{margin-left:0;width:auto;margin-top:0}`);
    }
    css.push(`.sz-doc{--ml:calc(${g.marginLeft} * var(--in));}`);
    this.styleEl.textContent = css.join('\n');
  }

  // ------------------------------------------------------------------ rendering

  private reindex(): void {
    this.index.clear();
    this.blocks.forEach((b, i) => this.index.set(b.id, i));
  }

  private indexIn(blocks: Block[], id: string): number {
    if (blocks === this.blocks) return this.index.get(id) ?? 0;
    const i = blocks.findIndex((b) => b.id === id);
    return i < 0 ? 0 : i;
  }

  private makeEl(b: Block): HTMLElement {
    const el = document.createElement('div');
    el.dataset.id = b.id;
    this.decorateEl(el, b);
    this.paint(el, b);
    (el as unknown as { _b: Block })._b = b;
    return el;
  }

  private paint(el: HTMLElement, b: Block): void {
    if (b.omitted) {
      el.contentEditable = 'false';
      renderContent(el, { ...b, text: this.tokens.omitted, marks: undefined }, {});
      return;
    }
    if (el.getAttribute('contenteditable') === 'false') el.removeAttribute('contenteditable');
    renderContent(el, b, { tagCategory: this.cfg.tagCategory });
  }

  private decorateEl(el: HTMLElement, b: Block): void {
    const cls = `b t-${b.type}${b.omitted ? ' omitted' : ''}${b.bookmark ? ' bm' : ''}`;
    // Preserve dynamic classes.
    const keep = ['pt', 'cur', 'cur-scene', 'reading'].filter((c) => el.classList.contains(c));
    el.className = cls + (keep.length ? ' ' + keep.join(' ') : '');
    if (b.dual) el.dataset.dual = b.dual; else delete el.dataset.dual;
    if (b.bookmark) el.dataset.bookmark = b.bookmark; else delete el.dataset.bookmark;
    if (b.alts?.length) el.dataset.alts = String(b.alts.length + 1); else delete el.dataset.alts;
    if (b.sug) el.dataset.sug = b.sug.k; else delete el.dataset.sug;
  }

  private renderAll(): void {
    this.doc.textContent = '';
    this.els.clear();
    this.groups.clear();
    this.decos.clear();
    this.syncStructure(true);
  }

  /** Bring the DOM in line with this.blocks, reusing elements. */
  private syncStructure(force = false, prev?: Block[]): void {
    const live = new Set<string>();
    const nodes: HTMLElement[] = [];
    const usedGroups = new Set<string>();
    const twoCol = !!this.template.twoColumn;
    const elFor = (b: Block): HTMLElement => {
      live.add(b.id);
      let el = this.els.get(b.id);
      const old = el ? (el as unknown as { _b: Block })._b : undefined;
      if (!el) { el = this.makeEl(b); this.els.set(b.id, el); }
      else if (force || old !== b) {
        this.decorateEl(el, b);
        if (force || !old || old.text !== b.text || !marksEqual(old.marks, b.marks) || !isCanonical(el)) this.rerenderContent(el, b);
        (el as unknown as { _b: Block })._b = b;
      }
      return el;
    };
    const groupFor = (key: string, kind: 'dual' | 'av', left: Block[], right: Block[]): HTMLElement => {
      usedGroups.add(key);
      let g = this.groups.get(key);
      if (!g || !g.classList.contains(kind)) {
        g?.remove();
        g = document.createElement('div');
        g.className = `grp ${kind}`;
        g.dataset.group = key;
        const L = document.createElement('div'); L.className = 'col L';
        const R = document.createElement('div'); R.className = 'col R';
        g.append(L, R);
        this.groups.set(key, g);
      }
      const [L, R] = [g.children[0] as HTMLElement, g.children[1] as HTMLElement];
      const fill = (col: HTMLElement, list: Block[]) => {
        let ref: ChildNode | null = col.firstChild;
        for (const b of list) {
          const el = elFor(b);
          if (ref !== el) col.insertBefore(el, ref); else ref = ref.nextSibling;
        }
        while (ref) { const n = ref.nextSibling; if (!(ref as HTMLElement).dataset?.id || !live.has((ref as HTMLElement).dataset.id!)) ref.remove(); ref = n; }
      };
      fill(L, left); fill(R, right);
      return g;
    };
    const bl = this.blocks;
    for (let i = 0; i < bl.length; i++) {
      const b = bl[i];
      if (b.dual === 'L') {
        let j = i;
        const left: Block[] = [];
        while (j < bl.length && bl[j].dual === 'L') left.push(bl[j++]);
        const right: Block[] = [];
        while (j < bl.length && bl[j].dual === 'R') right.push(bl[j++]);
        if (right.length) { nodes.push(groupFor('d:' + b.id, 'dual', left, right)); i = j - 1; continue; }
      }
      if (twoCol && b.type === 'video') {
        const right = bl[i + 1]?.type === 'audio' ? [bl[i + 1]] : [];
        nodes.push(groupFor('a:' + b.id, 'av', [b], right));
        i += right.length;
        continue;
      }
      if (twoCol && b.type === 'audio') { nodes.push(groupFor('a:' + b.id, 'av', [], [b])); continue; }
      nodes.push(elFor(b));
    }
    // Remove stale elements/groups.
    for (const [id, el] of this.els) if (!live.has(id)) { el.remove(); this.els.delete(id); }
    for (const [k, g] of this.groups) if (!usedGroups.has(k)) { g.remove(); this.groups.delete(k); }
    // Order top-level nodes; leave decorations where they are for now.
    let ref: ChildNode | null = this.doc.firstChild;
    for (const n of nodes) {
      while (ref && isDeco(ref)) ref = ref.nextSibling;
      if (ref !== n) this.doc.insertBefore(n, ref);
      else ref = ref.nextSibling;
    }
    // Anything left that is not a node we placed nor a decoration is foreign: drop it.
    const placed = new Set<Node>(nodes);
    for (let c: ChildNode | null = this.doc.firstChild; c;) {
      const n = c.nextSibling;
      if (!placed.has(c) && !isDeco(c)) c.remove();
      c = n;
    }
    void prev;
  }

  private rerenderContent(el: HTMLElement, b: Block): void {
    // Inline decorations are re-inserted by the layout pass.
    this.paint(el, b);
    for (const [k, d] of this.decos) if (!d.isConnected) this.decos.delete(k);
  }

  // ------------------------------------------------------------------ layout & decorations

  private scheduleLayout(delay = 120): void {
    clearTimeout(this.layoutTimer);
    this.layoutTimer = window.setTimeout(() => { if (!this.destroyed) this.relayout(); }, delay);
  }

  relayout(): void {
    if (this.composing) { this.scheduleLayout(200); return; }
    const contd = this.cfg.page.autoContd ? autoContdIds(this.blocks, this.cfg.locale) : new Set<string>();
    const scenes = buildScenes(this.blocks, { letters: this.cfg.sceneLetters, locked: this.cfg.scenesLocked });
    const sceneLabels = new Map(scenes.map((s) => [s.id, s.label]));
    const layout = paginate(this.blocks, {
      styles: this.cfg.styles, template: this.template, tokens: this.tokens, geometry: this.geometry, page: this.cfg.page,
      contd, locks: this.cfg.locks, includeNotes: true, sceneLabels,
    });
    this.layout = layout;
    const sel = this.readSelection();
    const changedBlocks = this.syncDecorations(layout);
    this.syncAttributes(layout, contd, sceneLabels);
    if (sel && changedBlocks.has(sel.focus.id) || (sel && changedBlocks.has(sel.anchor.id))) this.setSelection(sel, false);
    this.hooks.onLayout?.(layout);
    this.emitSelection();
  }

  private px(v: number): string { return `calc(${v} * var(--in))`; }

  private buildDeco(kind: 'top' | 'break' | 'end', pageIndex: number, label: string, prevUsed: number, more: boolean, contd: string, inline: boolean): HTMLElement {
    const g = this.geometry;
    const cap = g.lines;
    const el = document.createElement('span');
    el.setAttribute(DECO_ATTR, kind);
    el.contentEditable = 'false';
    el.className = `pd pd-${kind}${inline ? ' pd-in' : ''}`;
    const add = (cls: string, height: string, content?: (n: HTMLElement) => void) => {
      const s = document.createElement('span');
      s.className = cls;
      s.style.height = height;
      content?.(s);
      el.appendChild(s);
      return s;
    };
    const hf = (n: HTMLElement, data: { left: string; center: string; right: string }, cls: string) => {
      const row = document.createElement('span');
      row.className = cls;
      for (const k of ['left', 'center', 'right'] as const) {
        const c = document.createElement('span');
        c.className = 'hf-' + k;
        c.textContent = data[k];
        row.appendChild(c);
      }
      n.appendChild(row);
    };
    if (kind !== 'top') {
      const filler = Math.max(0, cap - prevUsed);
      add('pd-fill', `calc(var(--ln) * ${filler})`, (n) => {
        if (more) {
          const m = document.createElement('span');
          m.className = 'pd-more';
          m.style.marginLeft = `calc(var(--ml) + ${this.style('character').indent}ch)`;
          m.textContent = this.tokens.more;
          n.appendChild(m);
        }
      });
      add('pd-foot', this.px(g.marginBottom), (n) => hf(n, this.cfg.footer(Math.max(0, pageIndex - 1), ''), 'hf foot'));
    }
    if (kind !== 'end') {
      if (kind === 'break') add('pd-gap', 'calc(28px * var(--z))');
      add('pd-head', this.px(g.marginTop), (n) => hf(n, this.cfg.header(pageIndex, label), 'hf head'));
      if (contd) {
        add('pd-contd', 'var(--ln)', (n) => {
          const c = document.createElement('span');
          c.style.marginLeft = `calc(var(--ml) + ${this.style('character').indent}ch)`;
          c.textContent = contd;
          n.appendChild(c);
        });
      }
    }
    el.dataset.page = String(pageIndex + 1);
    return el;
  }

  private syncDecorations(layout: Layout): Set<string> {
    const changedBlocks = new Set<string>();
    const want = new Map<string, { kind: 'top' | 'break' | 'end'; pageIndex: number; label: string; prevUsed: number; more: boolean; contd: string; blockId: string; offset: number }>();
    if (this.cfg.pageView) {
      want.set('top', { kind: 'top', pageIndex: 0, label: layout.pages[0]?.label ?? '1', prevUsed: 0, more: false, contd: '', blockId: '', offset: 0 });
      for (const b of layout.breaks) {
        const contd = b.contd ? `${b.contd} ${this.tokens.contd}` : '';
        want.set(`${b.blockId}@${b.offset}`, { kind: 'break', pageIndex: b.pageIndex, label: b.label, prevUsed: b.prevUsed - (b.more ? 1 : 0), more: b.more, contd, blockId: b.blockId, offset: b.offset });
      }
      const last = layout.pages[layout.pages.length - 1];
      want.set('end', { kind: 'end', pageIndex: layout.pages.length, label: '', prevUsed: last?.used ?? 0, more: false, contd: '', blockId: '', offset: 0 });
    }
    const sig = (w: { label: string; prevUsed: number; more: boolean; contd: string; pageIndex: number }) => `${w.label}|${w.prevUsed}|${w.more}|${w.contd}|${w.pageIndex}|${this.cfg.zoom}|${this.geometry.paper}`;
    // Remove unwanted.
    for (const [k, el] of this.decos) {
      if (!want.has(k) || !el.isConnected) {
        const parentBlock = el.parentElement ? blockElOf(el.parentElement, this.doc) ?? (el.parentElement.classList.contains('b') ? el.parentElement : null) : null;
        el.remove();
        this.decos.delete(k);
        if (parentBlock) { parentBlock.normalize(); changedBlocks.add(parentBlock.dataset.id!); }
      }
    }
    for (const [k, w] of want) {
      let el = this.decos.get(k);
      const s = sig(w);
      if (el && el.dataset.sig !== s) {
        const fresh = this.buildDeco(w.kind, w.pageIndex, w.label, w.prevUsed, w.more, w.contd, w.offset > 0);
        fresh.dataset.sig = s;
        el.replaceWith(fresh);
        el = fresh;
        this.decos.set(k, el);
      }
      if (!el) {
        el = this.buildDeco(w.kind, w.pageIndex, w.label, w.prevUsed, w.more, w.contd, w.offset > 0);
        el.dataset.sig = s;
        this.decos.set(k, el);
      }
      // Position.
      if (w.kind === 'top') { if (this.doc.firstChild !== el) this.doc.insertBefore(el, this.doc.firstChild); continue; }
      if (w.kind === 'end') { if (this.doc.lastChild !== el) this.doc.appendChild(el); continue; }
      const bel = this.els.get(w.blockId);
      if (!bel) { el.remove(); this.decos.delete(k); continue; }
      if (w.offset === 0) {
        // Before the block, or before its group container.
        const container = bel.parentElement?.classList.contains('col') ? (bel.parentElement.parentElement as HTMLElement) : bel;
        if (container.previousSibling !== el) this.doc.insertBefore(el, container);
      } else {
        // Inside the block at a text offset.
        if (el.parentNode && blockElOf(el.parentNode, this.doc) === bel && this.decoOffset(bel, el) === w.offset) continue;
        el.remove();
        const p = offsetToDom(bel, w.offset);
        if (p.node.nodeType === 3) {
          const t = p.node as Text;
          if (p.offset > 0 && p.offset < t.data.length) { const rest = t.splitText(p.offset); rest.parentNode!.insertBefore(el, rest); }
          else if (p.offset === 0) t.parentNode!.insertBefore(el, t);
          else t.parentNode!.insertBefore(el, t.nextSibling);
        } else bel.appendChild(el);
        changedBlocks.add(w.blockId);
      }
    }
    // Stray decorations from previous renders (e.g. inside removed groups).
    for (const d of Array.from(this.doc.querySelectorAll('[' + DECO_ATTR + ']'))) {
      if (![...this.decos.values()].includes(d as HTMLElement)) d.remove();
    }
    return changedBlocks;
  }

  private decoOffset(bel: HTMLElement, deco: HTMLElement): number {
    let acc = 0;
    for (const t of textNodes(bel)) {
      if (deco.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_FOLLOWING) return acc;
      acc += t.data.length;
    }
    return acc;
  }

  private syncAttributes(layout: Layout, contd: Set<string>, sceneLabels: Map<string, string>): void {
    const pageTop = new Set<string>();
    if (this.blocks[0]) pageTop.add(this.blocks[0].id);
    for (const b of layout.breaks) if (b.offset === 0) pageTop.add(b.blockId);
    const mode = this.cfg.page.sceneNumbers;
    const show = this.cfg.showSceneNumbers || mode !== 'none';
    for (const b of this.blocks) {
      const el = this.els.get(b.id);
      if (!el) continue;
      const container = el.parentElement?.classList.contains('col') ? (el.parentElement.parentElement as HTMLElement) : el;
      const top = pageTop.has(b.id);
      if (container.classList.contains('pt') !== top) container.classList.toggle('pt', top);
      const c = contd.has(b.id) ? this.tokens.contd : '';
      if ((el.dataset.contd ?? '') !== c) { if (c) el.dataset.contd = c; else delete el.dataset.contd; }
      const revised = this.cfg.isRevised(b);
      if (b.type === 'scene') {
        const label = sceneLabels.get(b.id) ?? '';
        const left = show && (mode === 'left' || mode === 'both' || mode === 'none') ? label : '';
        const right = (show && (mode === 'right' || mode === 'both') ? label : '') + (revised ? ' *' : '');
        if ((el.dataset.num ?? '') !== left) { if (left) el.dataset.num = left; else delete el.dataset.num; }
        if ((el.dataset.rnum ?? '') !== right.trim()) { if (right.trim()) el.dataset.rnum = right.trim(); else delete el.dataset.rnum; }
      } else {
        const ast = revised ? (this.style(b.type).prefix ? 'after' : 'before') : '';
        if ((el.dataset.ast ?? '') !== ast) { if (ast) el.dataset.ast = ast; else delete el.dataset.ast; }
      }
    }
  }

  // ------------------------------------------------------------------ selection

  private ordered(sel: Sel): [Pos, Pos] {
    const ia = this.index.get(sel.anchor.id) ?? 0, ib = this.index.get(sel.focus.id) ?? 0;
    if (ia < ib || (ia === ib && sel.anchor.off <= sel.focus.off)) return [sel.anchor, sel.focus];
    return [sel.focus, sel.anchor];
  }

  private isCollapsed(sel: Sel): boolean { return sel.anchor.id === sel.focus.id && sel.anchor.off === sel.focus.off; }

  private clampSel(sel: Sel): Sel {
    const fix = (p: Pos): Pos => {
      const i = this.index.get(p.id);
      if (i === undefined) {
        const b = this.blocks[Math.min(this.blocks.length - 1, 0)];
        return { id: b.id, off: 0 };
      }
      return { id: p.id, off: Math.max(0, Math.min(p.off, this.blocks[i].text.length)) };
    };
    return { anchor: fix(sel.anchor), focus: fix(sel.focus) };
  }

  private pointToPos(node: Node | null, offset: number): Pos | null {
    if (!node) return null;
    if (!this.doc.contains(node) && node !== this.doc) return null;
    let el = blockElOf(node, this.doc);
    if (el) return { id: el.dataset.id!, off: domToOffset(el, node, offset) };
    // Inside a decoration or between blocks: snap to a neighbouring block.
    let n: Node | null = node;
    if (n === this.doc || (n as HTMLElement).classList?.contains('grp') || (n as HTMLElement).classList?.contains('col')) {
      const child = n.childNodes[offset] ?? null;
      n = child ?? n.childNodes[offset - 1] ?? null;
      if (!n) return null;
      const after = !!n && n === node.childNodes[offset];
      const target = after ? this.firstBlockFrom(n, true) : this.firstBlockFrom(n, false);
      if (!target) return null;
      return { id: target.dataset.id!, off: after ? 0 : (this.blocks[this.index.get(target.dataset.id!)!]?.text.length ?? 0) };
    }
    // In a decoration: go to the following text.
    let d: Node | null = node;
    while (d && d !== this.doc && !isDeco(d)) d = d.parentNode;
    if (d && isDeco(d)) {
      el = blockElOf(d.parentNode, this.doc) ?? ((d.parentNode as HTMLElement)?.classList?.contains('b') ? d.parentNode as HTMLElement : null);
      if (el) return { id: el.dataset.id!, off: this.decoOffset(el, d as HTMLElement) };
      const target = this.firstBlockFrom(d.nextSibling ?? d, true) ?? this.firstBlockFrom(d, false);
      if (target) return { id: target.dataset.id!, off: 0 };
    }
    return null;
  }

  private firstBlockFrom(n: Node | null, forward: boolean): HTMLElement | null {
    let cur: Node | null = n;
    while (cur) {
      if (cur.nodeType === 1) {
        const e = cur as HTMLElement;
        if (e.classList.contains('b') && e.dataset.id) return e;
        if (e.classList.contains('grp')) {
          const list = e.querySelectorAll<HTMLElement>('.b[data-id]');
          if (list.length) return forward ? list[0] : list[list.length - 1];
        }
      }
      cur = forward ? cur.nextSibling : cur.previousSibling;
    }
    return null;
  }

  readSelection(): Sel | null {
    const s = document.getSelection();
    if (!s || !s.anchorNode || !this.doc.contains(s.anchorNode)) return null;
    const a = this.pointToPos(s.anchorNode, s.anchorOffset);
    const f = this.pointToPos(s.focusNode, s.focusOffset);
    if (!a || !f) return null;
    return { anchor: a, focus: f };
  }

  setSelection(sel: Sel, scroll = true): void {
    const c = this.clampSel(sel);
    this.lastSel = c;
    const ea = this.els.get(c.anchor.id), ef = this.els.get(c.focus.id);
    if (!ea || !ef) return;
    const pa = offsetToDom(ea, c.anchor.off), pf = offsetToDom(ef, c.focus.off);
    const s = document.getSelection();
    if (!s) return;
    this.suppressSelection = true;
    try {
      s.setBaseAndExtent(pa.node, pa.offset, pf.node, pf.offset);
    } catch { /* detached */ }
    this.suppressSelection = false;
    if (scroll) this.revealCaret();
  }

  private revealCaret(): void {
    const s = document.getSelection();
    if (!s || !s.rangeCount) return;
    const r = s.getRangeAt(0).cloneRange();
    r.collapse(false);
    let rect: DOMRect | null = r.getClientRects()[0] ?? null;
    if (!rect) {
      const f = this.lastSel && this.els.get(this.lastSel.focus.id);
      rect = f ? f.getBoundingClientRect() : null;
    }
    if (!rect) return;
    const sc = this.scroller();
    const sr = sc.getBoundingClientRect();
    if (this.cfg.typewriter) {
      const target = sc.scrollTop + rect.top - sr.top - sr.height * 0.45;
      sc.scrollTop = Math.max(0, target);
      return;
    }
    const margin = 60;
    if (rect.bottom > sr.bottom - margin) sc.scrollTop += rect.bottom - sr.bottom + margin;
    else if (rect.top < sr.top + margin) sc.scrollTop -= sr.top + margin - rect.top;
  }

  private emitSelection(): void {
    if (!this.hooks.onSelection && this.cfg.focusMode === 'off') return;
    cancelAnimationFrame(this.selTimer);
    this.selTimer = requestAnimationFrame(() => {
      const sel = this.readSelection();
      if (sel) this.lastSel = sel;
      const use = sel ?? this.lastSel;
      const i = use ? this.index.get(use.focus.id) ?? -1 : -1;
      const b = i >= 0 ? this.blocks[i] : null;
      let sceneId = '';
      for (let k = i; k >= 0; k--) if (this.blocks[k].type === 'scene') { sceneId = this.blocks[k].id; break; }
      this.updateFocusClasses(b, sceneId);
      let marks: Mark[] = [];
      if (use && b) {
        const off = use.focus.off;
        marks = this.pendingMarks ?? (b.marks ?? []).filter((m) => m.s < off && m.e >= off || (m.s === 0 && off === 0 && m.e > 0));
      }
      this.hooks.onSelection?.(use, {
        block: b, index: i, sceneId, page: b ? this.pageOf(b.id) : 0, pageCount: this.layout?.pages.length ?? 1,
        collapsed: use ? this.isCollapsed(use) : true, marks,
      });
    });
  }

  private updateFocusClasses(b: Block | null, sceneId: string): void {
    for (const id of this.focusIds) this.els.get(id)?.classList.remove('cur', 'cur-scene');
    this.focusIds = [];
    if (!b) return;
    const el = this.els.get(b.id);
    el?.classList.add('cur');
    this.focusIds.push(b.id);
    if (this.cfg.focusMode === 'scene') {
      const start = sceneId ? this.index.get(sceneId)! : 0;
      for (let k = start; k < this.blocks.length; k++) {
        if (k > start && this.blocks[k].type === 'scene') break;
        const id = this.blocks[k].id;
        this.els.get(id)?.classList.add('cur-scene');
        this.focusIds.push(id);
      }
    }
  }

  // ------------------------------------------------------------------ commit & history

  private commit(next: Block[], opts: { sel?: Sel | null; key: string; structural: boolean; fastText?: string }): void {
    const before = this.readSelection() ?? this.lastSel;
    let final = next;
    if (this.hooks.transformCommit) {
      const r = this.hooks.transformCommit(this.blocks, next, opts.sel ?? null, before);
      if (Array.isArray(r)) final = r;
      else { final = r.blocks; opts = { ...opts, sel: r.sel ?? opts.sel }; }
    }
    const ops = opts.fastText && final === next
      ? [{ t: 'set' as const, before: this.blocks[this.index.get(opts.fastText)!], after: final[this.index.get(opts.fastText)!] }]
      : diffBlocks(this.blocks, final);
    if (!ops.length) { if (opts.sel) this.setSelection(opts.sel); return; }
    const structural = opts.structural || ops.some((o) => o.t !== 'set') || final.length !== this.blocks.length;
    this.pushHistory({ ops, before, after: opts.sel ?? before, key: opts.key, time: Date.now() }, opts.key.startsWith('type:'));
    this.redoStack = [];
    this.pendingMarks = opts.key.startsWith('type:') ? this.pendingMarks : null;
    this.applyCommitted(final, structural, opts.sel ?? null, opts.fastText);
  }

  private pushHistory(e: HistoryEntry, coalesce: boolean): void {
    const last = this.undoStack[this.undoStack.length - 1];
    if (coalesce && last && last.key === e.key && e.time - last.time < 1500 && last.ops.length === 1 && e.ops.length === 1 && last.ops[0].t === 'set' && e.ops[0].t === 'set') {
      last.ops = [{ t: 'set', before: (last.ops[0] as { before: Block }).before, after: (e.ops[0] as { after: Block }).after }];
      last.after = e.after;
      last.time = e.time;
      return;
    }
    this.undoStack.push(e);
    if (this.undoStack.length > MAX_HISTORY) this.undoStack.shift();
  }

  private applyCommitted(next: Block[], structural: boolean, sel: Sel | null, fastText?: string): void {
    const prev = this.blocks;
    this.blocks = next;
    if (structural || next.length !== prev.length) {
      this.reindex();
      this.syncStructure(false, prev);
    } else {
      for (let i = 0; i < next.length; i++) {
        if (next[i] === prev[i]) continue;
        const el = this.els.get(next[i].id);
        if (!el) continue;
        const old = (el as unknown as { _b: Block })._b;
        this.decorateEl(el, next[i]);
        if (!(fastText === next[i].id && this.tryFastText(el, old, next[i])) && (old.text !== next[i].text || !marksEqual(old.marks, next[i].marks) || !isCanonical(el))) {
          this.rerenderContent(el, next[i]);
        }
        (el as unknown as { _b: Block })._b = next[i];
      }
    }
    if (sel) this.setSelection(sel);
    this.scheduleLayout(structural ? 0 : 120);
    this.hooks.onChange?.(this.blocks, { structural, local: true });
    this.emitSelection();
  }

  /** Mirror a pure insertion into the existing text node when formatting is unchanged. */
  private tryFastText(el: HTMLElement, old: Block, b: Block): boolean {
    if (b.text.length <= old.text.length) return false;
    // Find the inserted range.
    let s = 0;
    while (s < old.text.length && old.text[s] === b.text[s]) s++;
    const ins = b.text.length - old.text.length;
    if (old.text.slice(s) !== b.text.slice(s + ins)) return false;
    // Formatting must be "old marks shifted" exactly, and inserted text must share the marks of the node it goes into.
    if (!old.text) return false;
    const nodes = textNodes(el);
    if (!nodes.length) return false;
    const p = offsetToDom(el, s);
    if (p.node.nodeType !== 3) return false;
    const t = p.node as Text;
    // Verify marks of the inserted range equal the marks of the containing segment.
    const segMarks = (b.marks ?? []).filter((m) => m.s <= s && m.e >= s + ins).map((m) => m.k + (m.v ?? '')).sort().join();
    const nodeMarks = (() => {
      const parent = t.parentElement;
      if (!parent || parent === el) return '';
      const out: string[] = [];
      const cl = parent.classList;
      for (const k of ['b', 'i', 'u', 'x']) if (cl.contains('m-' + k)) out.push(k);
      if (cl.contains('m-hl')) out.push('hl' + (parent.dataset.hl ?? 'yellow'));
      for (const id of (parent.dataset.tags ?? '').split(' ').filter(Boolean)) out.push('tag' + id);
      for (const id of (parent.dataset.cmts ?? '').split(' ').filter(Boolean)) out.push('cmt' + id);
      return out.sort().join();
    })();
    if (segMarks !== nodeMarks) return false;
    t.insertData(p.offset, b.text.slice(s, s + ins));
    return true;
  }

  // ------------------------------------------------------------------ editing primitives

  /** Selected [block, start, end] ranges in document order. */
  private rangesOf(sel: Sel): { b: Block; i: number; s: number; e: number }[] {
    const [a, z] = this.ordered(sel);
    const ia = this.index.get(a.id)!, iz = this.index.get(z.id)!;
    const out: { b: Block; i: number; s: number; e: number }[] = [];
    for (let i = ia; i <= iz; i++) {
      const b = this.blocks[i];
      out.push({ b, i, s: i === ia ? a.off : 0, e: i === iz ? z.off : b.text.length });
    }
    return out;
  }

  private updateRanges(ranges: { b: Block; i: number; s: number; e: number }[], fn: (b: Block, s: number, e: number) => Mark[] | undefined, key: string): void {
    const next = this.blocks.slice();
    for (const r of ranges) {
      if (r.e <= r.s) continue;
      const marks = fn(r.b, r.s, r.e);
      const nb = { ...r.b };
      if (marks && marks.length) nb.marks = marks; else delete nb.marks;
      next[r.i] = nb;
    }
    this.commit(next, { sel: this.getSelection(), key, structural: false });
  }

  /** Delete a (possibly multi-block) range; returns new blocks and collapsed selection. */
  private deleteRange(blocks: Block[], sel: Sel): { blocks: Block[]; sel: Sel } {
    const [a, z] = this.ordered(sel);
    const ia = this.indexIn(blocks, a.id), iz = this.indexIn(blocks, z.id);
    const next = blocks.slice();
    const first = next[ia];
    if (ia === iz) {
      next[ia] = replaceText(first, a.off, z.off, '');
    } else {
      const last = next[iz];
      const tail = last.text.slice(z.off);
      const merged: Block = { ...first, text: first.text.slice(0, a.off) + tail };
      const marks = concatMarks(sliceMarks(first.marks, 0, a.off), sliceMarks(last.marks, z.off, last.text.length), a.off, merged.text.length);
      if (marks) merged.marks = marks; else delete merged.marks;
      // Deleting from the very start of a block takes the type of the last block.
      if (a.off === 0 && first.text.length > 0) merged.type = last.type;
      next.splice(ia, iz - ia + 1, merged);
    }
    const pos = { id: first.id, off: a.off };
    return { blocks: next, sel: { anchor: pos, focus: pos } };
  }

  private deleteSelection(): void {
    const sel = this.getSelection();
    if (!sel || this.isCollapsed(sel)) return;
    const r = this.deleteRange(this.blocks, sel);
    this.commit(r.blocks, { sel: r.sel, key: 'del', structural: true });
  }

  private enter(): void {
    let sel = this.getSelection();
    if (!sel) return;
    let blocks = this.blocks;
    if (!this.isCollapsed(sel)) { const r = this.deleteRange(blocks, sel); blocks = r.blocks; sel = r.sel; }
    const i = this.indexIn(blocks, sel.focus.id);
    const b = blocks[i];
    const off = sel.focus.off;
    const st = this.style(b.type);
    // Empty element: offer the element menu instead of stacking empty lines.
    if (!b.text.trim() && blocks === this.blocks) {
      const rect = this.rectAt({ id: b.id, off: 0 });
      if (rect && this.hooks.onElementMenu) { this.hooks.onElementMenu(rect, b.type); return; }
    }
    const next = blocks.slice();
    let nextType: ElementType = st.enter;
    let cur = b;
    // Smart type: an uppercase action line naming a known character becomes a character cue.
    if (b.type === 'action' && off === b.text.length && b.text.length < 50 && /\p{L}/u.test(b.text) && b.text === b.text.toUpperCase() && !b.text.includes('\n')) {
      const name = characterName(b.text);
      if (this.cfg.knownCharacters().includes(name) && !isSceneHeadingText(b.text)) { cur = { ...b, type: 'character' }; nextType = this.style('character').enter; }
    }
    if (b.type === 'action' && isSceneHeadingText(b.text) && off === b.text.length) { cur = { ...b, type: 'scene' }; nextType = this.style('scene').enter; }
    if (!this.template.order.includes(nextType)) nextType = this.template.order.includes('action') ? 'action' : this.template.order[0];
    if (off === 0 && b.text.length > 0) {
      // New empty element above, caret stays with the text.
      const nb: Block = { id: uid(), type: b.type, text: '' };
      if (b.dual) nb.dual = b.dual;
      next.splice(i, 0, nb);
      this.commit(next, { sel: { anchor: { id: b.id, off: 0 }, focus: { id: b.id, off: 0 } }, key: 'enter', structural: true });
      return;
    }
    // Closing punctuation after the caret stays with the element (e.g. "(beat|)").
    let splitAt = off;
    if (/^[)\]"”’»]*\s*$/.test(b.text.slice(off))) splitAt = b.text.length;
    const left: Block = { ...cur, text: b.text.slice(0, splitAt), marks: sliceMarks(b.marks, 0, splitAt) };
    if (!left.marks) delete left.marks;
    const atEnd = splitAt >= b.text.length;
    const right: Block = { id: uid(), type: atEnd ? nextType : cur.type, text: b.text.slice(splitAt) };
    const rm = sliceMarks(b.marks, splitAt, b.text.length);
    if (rm) right.marks = rm;
    if (b.dual && (right.type === 'character' || right.type === 'dialogue' || right.type === 'parenthetical')) right.dual = b.dual;
    if (right.type === 'parenthetical' && !right.text) right.text = '()';
    // Leaving a parenthetical: drop an empty "()".
    if (left.type === 'parenthetical' && left.text === '()') left.text = '';
    next.splice(i, 1, left, right);
    const caret = { id: right.id, off: right.type === 'parenthetical' && right.text === '()' ? 1 : 0 };
    this.commit(next, { sel: { anchor: caret, focus: caret }, key: 'enter', structural: true });
  }

  private joinBackward(): void {
    const sel = this.getSelection();
    if (!sel) return;
    const i = this.index.get(sel.focus.id)!;
    const b = this.blocks[i];
    if (i === 0) {
      if (b.type !== this.template.first && !b.text) this.setType(this.template.first);
      return;
    }
    const prev = this.blocks[i - 1];
    const next = this.blocks.slice();
    if (!prev.text) {
      // Remove the empty previous element.
      next.splice(i - 1, 1);
      this.commit(next, { sel, key: 'join', structural: true });
      return;
    }
    if (!b.text && b.type !== prev.type) {
      next.splice(i, 1);
      const pos = { id: prev.id, off: prev.text.length };
      this.commit(next, { sel: { anchor: pos, focus: pos }, key: 'join', structural: true });
      return;
    }
    const merged: Block = { ...prev, text: prev.text + b.text };
    const marks = concatMarks(prev.marks, b.marks, prev.text.length, merged.text.length);
    if (marks) merged.marks = marks; else delete merged.marks;
    next.splice(i - 1, 2, merged);
    const pos = { id: prev.id, off: prev.text.length };
    this.commit(next, { sel: { anchor: pos, focus: pos }, key: 'join', structural: true });
  }

  private joinForward(): void {
    const sel = this.getSelection();
    if (!sel) return;
    const i = this.index.get(sel.focus.id)!;
    if (i >= this.blocks.length - 1) return;
    const b = this.blocks[i], n = this.blocks[i + 1];
    const next = this.blocks.slice();
    const merged: Block = { ...b, text: b.text + n.text };
    if (!b.text) merged.type = n.type;
    const marks = concatMarks(b.marks, n.marks, b.text.length, merged.text.length);
    if (marks) merged.marks = marks; else delete merged.marks;
    next.splice(i, 2, merged);
    this.commit(next, { sel, key: 'join', structural: true });
  }

  /** Read a block back from the DOM after native editing (IME, deletions, spellcheck). */
  private syncFromDom(): void {
    let sel = this.readSelection();
    const ids = new Set<string>();
    if (sel) { ids.add(sel.anchor.id); ids.add(sel.focus.id); }
    // Detect foreign nodes inserted by the browser at the top level.
    let foreign = false;
    for (let c = this.doc.firstChild; c; c = c.nextSibling) {
      if (isDeco(c)) continue;
      const e = c as HTMLElement;
      if (c.nodeType !== 1 || (!e.dataset?.id && !e.classList?.contains('grp'))) { foreign = true; break; }
    }
    const next = this.blocks.slice();
    let changed = false;
    for (const id of ids) {
      const i = this.index.get(id);
      const el = this.els.get(id);
      if (i === undefined || !el || !el.isConnected) { foreign = true; continue; }
      const { text, marks } = parseContent(el);
      const b = next[i];
      if (text !== b.text || !marksEqual(marks, b.marks)) {
        const nb: Block = { ...b, text };
        if (marks) nb.marks = marks; else delete nb.marks;
        next[i] = nb;
        changed = true;
      }
    }
    if (foreign) {
      // Rebuild the DOM from the model plus what we could parse.
      this.blocks = changed ? next : this.blocks;
      this.reindex();
      this.renderAll();
      if (sel) this.setSelection(sel, false);
      this.relayout();
      this.hooks.onChange?.(this.blocks, { structural: true, local: true });
      return;
    }
    if (!changed) return;
    const key = sel ? 'type:' + sel.focus.id : 'native';
    // Native edits are already in the DOM: commit without re-rendering canonical content.
    let final = next;
    if (this.hooks.transformCommit) {
      const r = this.hooks.transformCommit(this.blocks, next, sel, this.lastSel);
      if (Array.isArray(r)) final = r;
      else { final = r.blocks; if (r.sel) sel = r.sel; }
    }
    const ops = diffBlocks(this.blocks, final);
    this.pushHistory({ ops, before: this.lastSel, after: sel, key, time: Date.now() }, true);
    this.redoStack = [];
    const prev = this.blocks;
    this.blocks = final;
    for (let i = 0; i < final.length; i++) {
      if (final[i] === prev[i]) continue;
      const el = this.els.get(final[i].id);
      if (!el) continue;
      this.decorateEl(el, final[i]);
      if (!isCanonical(el) || final[i] !== next[i]) { this.rerenderContent(el, final[i]); if (sel) this.setSelection(sel, false); }
      (el as unknown as { _b: Block })._b = final[i];
    }
    if (sel) this.lastSel = sel;
    this.scheduleLayout(this.composing ? 300 : 150);
    this.hooks.onChange?.(this.blocks, { structural: false, local: true });
    this.emitSelection();
  }

  // ------------------------------------------------------------------ clipboard

  private fragment(sel: Sel): Block[] {
    return this.rangesOf(sel).map(({ b, s, e }) => {
      const nb: Block = { ...b, text: b.text.slice(s, e) };
      const m = sliceMarks(b.marks, s, e);
      if (m) nb.marks = m.filter((x) => x.k !== 'cmt'); else delete nb.marks;
      if (nb.marks && !nb.marks.length) delete nb.marks;
      delete nb.rev; delete nb.num;
      return nb;
    });
  }

  private onCopy(e: ClipboardEvent, cut: boolean): void {
    const sel = this.getSelection();
    if (!sel || this.isCollapsed(sel) || !e.clipboardData) return;
    e.preventDefault();
    const frag = this.fragment(sel);
    const plain = frag.length === 1 ? frag[0].text : toFountain(frag).trim();
    e.clipboardData.setData('text/plain', plain);
    e.clipboardData.setData('text/x-scriptz', JSON.stringify({ v: 2, blocks: frag }));
    const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));
    e.clipboardData.setData('text/html', frag.map((b) => `<p data-sz="${b.type}">${esc(b.text).replace(/\n/g, '<br>')}</p>`).join(''));
    if (cut && !this.cfg.readOnly) this.deleteSelection();
  }

  private onPaste(e: ClipboardEvent): void {
    e.preventDefault();
    if (this.cfg.readOnly || !e.clipboardData) return;
    const custom = e.clipboardData.getData('text/x-scriptz');
    if (custom) {
      try {
        const data = JSON.parse(custom) as { blocks: Block[] };
        if (data.blocks.length === 1) { this.insertText(data.blocks[0].text, data.blocks[0].marks); return; }
        this.pasteBlocks(data.blocks);
        return;
      } catch { /* fall through */ }
    }
    const text = (e.clipboardData.getData('text/plain') || '').replace(/\r\n?/g, '\n');
    if (!text) return;
    if (!/\n\s*\n/.test(text.trim()) && text.trim().split('\n').length <= 1) { this.insertText(text.replace(/\n$/, '')); return; }
    const parsed = parseFountain(text).blocks;
    this.pasteBlocks(parsed);
  }

  private pasteBlocks(list: Block[]): void {
    const sel = this.getSelection();
    if (!sel) return;
    // Merge the first fragment into the caret block when both are text-like.
    const fresh = list.map((b) => ({ ...b, id: uid() }));
    this.insertBlocks(fresh);
  }

  // ------------------------------------------------------------------ events

  private on<K extends keyof HTMLElementEventMap>(t: EventTarget, ev: K | string, fn: (e: Event) => void, opts?: boolean | AddEventListenerOptions): void {
    t.addEventListener(ev, fn as EventListener, opts);
    this.listeners.push([t, ev, fn as EventListener, opts]);
  }

  private bind(): void {
    const d = this.doc;
    this.on(d, 'beforeinput', (e) => this.onBeforeInput(e as InputEvent));
    this.on(d, 'input', () => { if (!this.cfg.readOnly) this.syncFromDom(); });
    this.on(d, 'compositionstart', () => {
      this.composing = true;
      const sel = this.readSelection();
      if (sel && !this.isCollapsed(sel) && sel.anchor.id !== sel.focus.id) this.deleteSelection();
    });
    this.on(d, 'compositionend', () => { this.composing = false; this.syncFromDom(); this.scheduleLayout(80); });
    this.on(d, 'keydown', (e) => this.onKeyDown(e as KeyboardEvent));
    this.on(d, 'copy', (e) => this.onCopy(e as ClipboardEvent, false));
    this.on(d, 'cut', (e) => this.onCopy(e as ClipboardEvent, true));
    this.on(d, 'paste', (e) => this.onPaste(e as ClipboardEvent));
    this.on(d, 'dragstart', (e) => e.preventDefault());
    this.on(d, 'drop', (e) => { e.preventDefault(); });
    this.on(d, 'focus', () => this.hooks.onFocusChange?.(true));
    this.on(d, 'blur', () => this.hooks.onFocusChange?.(false));
    this.on(d, 'mousedown', (e) => {
      const me = e as MouseEvent;
      const t = me.target as HTMLElement;
      const deco = t.closest?.('[' + DECO_ATTR + ']') as HTMLElement | null;
      if (deco && me.button === 0) {
        me.preventDefault();
        // Caret to the closest editable position.
        const r = deco.getBoundingClientRect();
        const upper = me.clientY < r.top + r.height / 2;
        const parentBlock = deco.parentElement?.closest('.b') as HTMLElement | null;
        let pos: Pos | null = null;
        if (parentBlock) pos = { id: parentBlock.dataset.id!, off: this.decoOffset(parentBlock, deco) };
        else {
          const target = upper ? this.firstBlockFrom(deco.previousSibling, false) : this.firstBlockFrom(deco.nextSibling, true);
          if (target) pos = { id: target.dataset.id!, off: upper ? (this.blocks[this.index.get(target.dataset.id!)!]?.text.length ?? 0) : 0 };
        }
        if (pos) { d.focus({ preventScroll: true }); this.setSelection({ anchor: pos, focus: pos }, false); }
      }
    });
    this.on(d, 'click', (e) => {
      const me = e as MouseEvent;
      const span = (me.target as HTMLElement).closest?.('span[data-cmts],span[data-tags]') as HTMLElement | null;
      if (span && this.hooks.onMarkClick) {
        if (span.dataset.cmts) this.hooks.onMarkClick('cmt', span.dataset.cmts.split(' ')[0], me);
        else if (span.dataset.tags) this.hooks.onMarkClick('tag', span.dataset.tags.split(' ')[0], me);
      }
    });
    this.on(d, 'contextmenu', (e) => {
      if (!this.hooks.onContextMenu) return;
      const me = e as MouseEvent;
      me.preventDefault();
      const sel = this.readSelection();
      this.hooks.onContextMenu(me, sel ? sel.focus : null);
    });
    this.on(document, 'selectionchange', () => {
      if (this.suppressSelection) return;
      const s = document.getSelection();
      if (s && s.anchorNode && this.doc.contains(s.anchorNode)) {
        const sel = this.readSelection();
        if (sel) { if (this.lastSel && (sel.focus.id !== this.lastSel.focus.id)) this.pendingMarks = null; this.lastSel = sel; }
        this.emitSelection();
        if (this.cfg.typewriter) this.revealCaret();
      }
    });
  }

  private onBeforeInput(e: InputEvent): void {
    if (this.cfg.readOnly) { e.preventDefault(); return; }
    const sel = this.readSelection();
    if (!sel) { e.preventDefault(); return; }
    const collapsed = this.isCollapsed(sel);
    const cross = sel.anchor.id !== sel.focus.id;
    const block = this.blocks[this.index.get(sel.focus.id)!];
    switch (e.inputType) {
      case 'insertText':
      case 'insertReplacementText': {
        if (e.isComposing || this.composing) return;
        const data = e.data ?? e.dataTransfer?.getData('text/plain') ?? '';
        if (e.inputType === 'insertReplacementText') {
          // Spell-check correction: replace the target range.
          const tr = e.getTargetRanges?.()[0];
          if (tr) {
            const a = this.pointToPos(tr.startContainer, tr.startOffset), z = this.pointToPos(tr.endContainer, tr.endOffset);
            if (a && z && a.id === z.id) {
              e.preventDefault();
              this.setSelection({ anchor: a, focus: z }, false);
              this.insertText(data);
            }
          }
          return;
        }
        e.preventDefault();
        if (data) this.insertText(data);
        return;
      }
      case 'insertParagraph':
        e.preventDefault();
        this.enter();
        return;
      case 'insertLineBreak':
        e.preventDefault();
        this.insertText('\n');
        return;
      case 'deleteContentBackward':
      case 'deleteWordBackward':
      case 'deleteSoftLineBackward':
      case 'deleteHardLineBackward':
        if (!collapsed) {
          if (cross) { e.preventDefault(); this.deleteSelection(); }
          else { e.preventDefault(); const r = this.deleteRange(this.blocks, sel); this.commit(r.blocks, { sel: r.sel, key: 'del:' + sel.focus.id, structural: false }); }
          return;
        }
        if (sel.focus.off === 0) { e.preventDefault(); this.joinBackward(); return; }
        if (block.type === 'parenthetical' && block.text === '()' && sel.focus.off === 1) {
          e.preventDefault();
          const next = this.blocks.slice();
          next[this.index.get(block.id)!] = { ...block, text: '' };
          this.commit(next, { sel: { anchor: { id: block.id, off: 0 }, focus: { id: block.id, off: 0 } }, key: 'del', structural: false });
          return;
        }
        return; // native deletion inside the block
      case 'deleteContentForward':
      case 'deleteWordForward':
      case 'deleteSoftLineForward':
      case 'deleteHardLineForward':
        if (!collapsed) {
          e.preventDefault();
          if (cross) this.deleteSelection();
          else { const r = this.deleteRange(this.blocks, sel); this.commit(r.blocks, { sel: r.sel, key: 'del:' + sel.focus.id, structural: false }); }
          return;
        }
        if (sel.focus.off >= block.text.length) { e.preventDefault(); this.joinForward(); return; }
        return;
      case 'deleteByCut':
      case 'deleteByDrag':
        e.preventDefault();
        this.deleteSelection();
        return;
      case 'insertFromPaste':
      case 'insertFromDrop':
      case 'insertFromYank':
        e.preventDefault();
        return;
      case 'historyUndo': e.preventDefault(); this.undo(); return;
      case 'historyRedo': e.preventDefault(); this.redo(); return;
      case 'formatBold': e.preventDefault(); this.toggleMark('b'); return;
      case 'formatItalic': e.preventDefault(); this.toggleMark('i'); return;
      case 'formatUnderline': e.preventDefault(); this.toggleMark('u'); return;
      case 'formatStrikeThrough': e.preventDefault(); this.toggleMark('x'); return;
      case 'insertCompositionText':
      case 'deleteCompositionText':
      case 'insertFromComposition':
        return;
      default:
        if (e.inputType.startsWith('format') || e.inputType === 'insertOrderedList' || e.inputType === 'insertUnorderedList' || e.inputType === 'insertHorizontalRule' || e.inputType === 'insertLink') { e.preventDefault(); return; }
        if (cross) { e.preventDefault(); this.deleteSelection(); }
    }
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (this.hooks.keyHook?.(e)) { e.preventDefault(); return; }
    if (e.isComposing) return;
    const mod = isMac ? e.metaKey : e.ctrlKey;
    const combo = comboOf(e);
    if (this.cfg.macros[combo] && !this.cfg.readOnly) {
      e.preventDefault();
      const m = this.cfg.macros[combo];
      if (m.type) {
        const sel = this.getSelection();
        const b = sel ? this.blocks[this.index.get(sel.focus.id)!] : null;
        if (b && !b.text) { this.setType(m.type); this.insertText(m.text); }
        else this.insertBlocks([{ id: uid(), type: m.type, text: m.text }]);
      } else this.insertText(m.text);
      return;
    }
    if (this.cfg.elementKeys[combo] && !this.cfg.readOnly) { e.preventDefault(); this.setType(this.cfg.elementKeys[combo]); return; }
    if (e.key === 'Tab' && !mod && !e.altKey) { e.preventDefault(); if (!this.cfg.readOnly) this.cycleType(e.shiftKey); return; }
    if (mod && !e.altKey) {
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); this.undo(); return; }
      if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); this.redo(); return; }
      if (k === 'b') { e.preventDefault(); this.toggleMark('b'); return; }
      if (k === 'i') { e.preventDefault(); this.toggleMark('i'); return; }
      if (k === 'u') { e.preventDefault(); this.toggleMark('u'); return; }
      if (k === 'a') {
        e.preventDefault();
        const f = this.blocks[0], l = this.blocks[this.blocks.length - 1];
        this.setSelection({ anchor: { id: f.id, off: 0 }, focus: { id: l.id, off: l.text.length } }, false);
        return;
      }
    }
  }
}
