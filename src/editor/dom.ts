// DOM ⇄ model mapping for blocks: rendering marks into spans, parsing them back, offsets.
import type { Block, Mark } from '../core/model';
import { normalizeMarks } from '../core/marks';

export const DECO_ATTR = 'data-deco';

export function isDeco(node: Node | null): boolean {
  return !!node && node.nodeType === 1 && (node as Element).hasAttribute(DECO_ATTR);
}

/** Closest block element (with data-id) containing the node. */
export function blockElOf(node: Node | null, root: HTMLElement): HTMLElement | null {
  let n: Node | null = node;
  while (n && n !== root) {
    if (n.nodeType === 1) {
      const el = n as HTMLElement;
      if (el.hasAttribute(DECO_ATTR)) return null;
      if (el.dataset.id && el.classList.contains('b')) return el;
    }
    n = n.parentNode;
  }
  return null;
}

/** Iterate the editable text nodes of a block, skipping decorations. */
export function textNodes(el: HTMLElement): Text[] {
  const out: Text[] = [];
  const walk = (n: Node) => {
    for (let c = n.firstChild; c; c = c.nextSibling) {
      if (c.nodeType === 3) out.push(c as Text);
      else if (c.nodeType === 1 && !(c as Element).hasAttribute(DECO_ATTR)) walk(c);
    }
  };
  walk(el);
  return out;
}

const HL_COLORS = ['yellow', 'green', 'pink', 'blue', 'orange'];

interface Segment { s: number; e: number; marks: Mark[] }

function segments(text: string, marks: Mark[] | undefined): Segment[] {
  if (!marks || !marks.length) return [{ s: 0, e: text.length, marks: [] }];
  const cuts = new Set<number>([0, text.length]);
  for (const m of marks) { cuts.add(Math.min(text.length, m.s)); cuts.add(Math.min(text.length, m.e)); }
  const pts = [...cuts].sort((a, b) => a - b);
  const out: Segment[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const s = pts[i], e = pts[i + 1];
    if (e <= s) continue;
    out.push({ s, e, marks: marks.filter((m) => m.s <= s && m.e >= e) });
  }
  return out;
}

export interface RenderContext {
  tagCategory?: (id: string) => string | undefined;
}

/** Replace a block element's content with text + mark spans. Decorations are not rendered here. */
export function renderContent(el: HTMLElement, b: Block, ctx: RenderContext = {}): void {
  while (el.firstChild) el.removeChild(el.firstChild);
  const text = b.text;
  if (!text) { el.appendChild(document.createElement('br')); return; }
  for (const seg of segments(text, b.marks)) {
    const t = text.slice(seg.s, seg.e);
    if (!seg.marks.length) { el.appendChild(document.createTextNode(t)); continue; }
    const span = document.createElement('span');
    const cls: string[] = [];
    const tags: string[] = [];
    const cmts: string[] = [];
    for (const m of seg.marks) {
      if (m.k === 'b' || m.k === 'i' || m.k === 'u' || m.k === 'x') cls.push('m-' + m.k);
      else if (m.k === 'hl') cls.push('m-hl', 'hl-' + (HL_COLORS.includes(m.v ?? '') ? m.v : 'yellow'));
      else if (m.k === 'tag' && m.v) { tags.push(m.v); const cat = ctx.tagCategory?.(m.v); cls.push('m-tag'); if (cat) cls.push('cat-' + cat); }
      else if (m.k === 'cmt' && m.v) { cmts.push(m.v); cls.push('m-cmt'); }
    }
    if (cls.length) span.className = [...new Set(cls)].join(' ');
    if (tags.length) span.dataset.tags = tags.join(' ');
    if (cmts.length) span.dataset.cmts = cmts.join(' ');
    if (seg.marks.some((m) => m.k === 'hl')) span.dataset.hl = seg.marks.find((m) => m.k === 'hl')!.v ?? 'yellow';
    span.textContent = t;
    el.appendChild(span);
  }
}

/** Read text and marks back from a block element (after native editing). */
export function parseContent(el: HTMLElement): { text: string; marks: Mark[] | undefined } {
  let text = '';
  const marks: Mark[] = [];
  const visit = (n: Node, inherited: Mark[]) => {
    for (let c = n.firstChild; c; c = c.nextSibling) {
      if (c.nodeType === 3) {
        const t = (c as Text).data.replace(/​/g, '').replace(/ /g, ' ');
        if (t) {
          const s = text.length;
          text += t;
          for (const m of inherited) marks.push({ ...m, s, e: text.length });
        }
      } else if (c.nodeType === 1) {
        const e = c as HTMLElement;
        if (e.hasAttribute(DECO_ATTR)) continue;
        if (e.tagName === 'BR') {
          // A trailing <br> is the empty-block placeholder; an inner one is a soft break.
          if (e.nextSibling || (e.parentNode !== el)) { if (text.length && c.nextSibling) text += '\n'; }
          continue;
        }
        const own: Mark[] = [];
        const cl = e.classList;
        if (cl.contains('m-b') || e.tagName === 'B' || e.tagName === 'STRONG') own.push({ s: 0, e: 0, k: 'b' });
        if (cl.contains('m-i') || e.tagName === 'I' || e.tagName === 'EM') own.push({ s: 0, e: 0, k: 'i' });
        if (cl.contains('m-u') || e.tagName === 'U') own.push({ s: 0, e: 0, k: 'u' });
        if (cl.contains('m-x') || e.tagName === 'S' || e.tagName === 'STRIKE') own.push({ s: 0, e: 0, k: 'x' });
        if (cl.contains('m-hl')) own.push({ s: 0, e: 0, k: 'hl', v: e.dataset.hl || 'yellow' });
        for (const id of (e.dataset.tags ?? '').split(' ').filter(Boolean)) own.push({ s: 0, e: 0, k: 'tag', v: id });
        for (const id of (e.dataset.cmts ?? '').split(' ').filter(Boolean)) own.push({ s: 0, e: 0, k: 'cmt', v: id });
        const isBlockish = e.tagName === 'DIV' || e.tagName === 'P';
        if (isBlockish && text.length && !text.endsWith('\n')) text += '\n';
        visit(e, [...inherited, ...own]);
      }
    }
  };
  visit(el, []);
  return { text, marks: normalizeMarks(marks, text.length) };
}

/** True when the element only contains what renderContent produces (text, mark spans, decorations, placeholder br). */
export function isCanonical(el: HTMLElement): boolean {
  for (let c = el.firstChild; c; c = c.nextSibling) {
    if (c.nodeType === 3) continue;
    if (c.nodeType !== 1) return false;
    const e = c as HTMLElement;
    if (e.hasAttribute(DECO_ATTR)) continue;
    if (e.tagName === 'BR') { if (c !== el.lastChild || el.childNodes.length > 1 && textNodes(el).some((t) => t.data.length)) return false; continue; }
    if (e.tagName !== 'SPAN') return false;
    for (let g = e.firstChild; g; g = g.nextSibling) if (g.nodeType !== 3) return false;
    if (e.getAttribute('style')) return false;
  }
  return true;
}

/** Model offset of a DOM point inside a block element. */
export function domToOffset(el: HTMLElement, node: Node, offset: number): number {
  if (!el.contains(node) && node !== el) return 0;
  const r = document.createRange();
  try { r.setStart(node, offset); } catch { return 0; }
  r.collapse(true);
  let acc = 0;
  for (const t of textNodes(el)) {
    if (t === node) return acc + Math.min(offset, t.data.length);
    if (r.comparePoint(t, 0) >= 0) return acc;
    acc += t.data.length;
  }
  return acc;
}

/** DOM point for a model offset. Prefers the position after a decoration at a boundary. */
export function offsetToDom(el: HTMLElement, offset: number): { node: Node; offset: number } {
  const nodes = textNodes(el);
  if (!nodes.length) return { node: el, offset: 0 };
  let acc = 0;
  for (let i = 0; i < nodes.length; i++) {
    const t = nodes[i];
    const len = t.data.length;
    if (offset < acc + len || (offset === acc + len && i === nodes.length - 1)) return { node: t, offset: Math.max(0, offset - acc) };
    if (offset === acc + len) {
      // Boundary: if a decoration sits between this node and the next, place after it.
      const next = nodes[i + 1];
      if (next && hasDecoBetween(t, next)) return { node: next, offset: 0 };
      return { node: t, offset: len };
    }
    acc += len;
  }
  const last = nodes[nodes.length - 1];
  return { node: last, offset: last.data.length };
}

function hasDecoBetween(a: Node, b: Node): boolean {
  const root = (a.parentNode && (a.parentNode as Element).closest?.('.b')) || a.parentNode;
  if (!root) return false;
  for (const d of Array.from((root as Element).querySelectorAll('[' + DECO_ATTR + ']'))) {
    if ((a.compareDocumentPosition(d) & Node.DOCUMENT_POSITION_FOLLOWING) && (d.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)) return true;
  }
  return false;
}
