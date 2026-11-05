// Element detection for scripts written in word processors (Google Docs, Word, plain text).
// Uses explicit styles when present, indentation when the document has it, and reading order otherwise.
import { uid, type Block, type ElementType, type TitlePage } from '../core/model';

export interface Para {
  text: string;
  /** Left indent in characters of 12-pt Courier (1 inch = 10). */
  indent?: number;
  center?: boolean;
  right?: boolean;
  /** Element from a named style (ScriptZ/Final Draft styles exported to Word). */
  style?: ElementType;
  /** An empty paragraph came before this one. */
  blankBefore?: boolean;
}

const UP = (s: string) => s === s.toLocaleUpperCase() && /\p{L}/u.test(s);
const HEADING = /^(?:(\d+[A-Z]?)[.)]?\s+)?((?:INT|EXT|INT\.?\s*\/\s*EXT|EXT\.?\s*\/\s*INT|I\/E|E\/I)[.\s]|(?:INTERIOR|EXTERIOR)\b)/i;
const HEADING_ES = /^(?:ESCENA|ESC\.|SECUENCIA|SEC\.|SCENE|CENA)\s*\d+/i;
const TIME = /\b(DÍA|DIA|NOCHE|AMANECER|ATARDECER|TARDE|MAÑANA|DAY|NIGHT|DAWN|DUSK|MORNING|EVENING|NOITE|CONTINUO|CONTINUOUS)\b/i;
const TRANS = /^(?:FADE (?:IN|OUT|TO BLACK)|FUNDIDO|CORTE|CORTA|CUT|DISOLVENCIA|DISSOLVE|SMASH CUT|MATCH CUT|JUMP CUT|ENCADENADO|FUSÃO|REGRESO|BACK TO|INTERCUT|INTERCALAR)\b.*[:.]$/i;
const INLINE_CUE = /^([\p{Lu}][\p{Lu}\p{M} .'’-]{0,32}?)(\s*\([^)]{1,30}\))?\s*:\s+(.+)$/u;
const EXT = /\((?:V\.O\.|O\.S\.|O\.C\.|CONT'?D|CONT\.|CONT|OFF|EN OFF|V\.O|O\.S|MÁS|MORE|CONTINUA|CONTINÚA|FILTRADO|POR TELÉFONO)\)/i;

function looksLikeCue(text: string): boolean {
  const s = text.trim();
  if (!UP(s) || s.length > 40) return false;
  const name = s.replace(/\s*\(.*\)\s*$/, '');
  if (!name || /[.!?;,]$/.test(name) || /:$/.test(s)) return false;
  if (HEADING.test(s) || HEADING_ES.test(s) || TRANS.test(s)) return false;
  const words = name.split(/\s+/).filter(Boolean);
  return words.length >= 1 && words.length <= 4 && /^[\p{Lu}\p{M}0-9 .'’#-]+$/u.test(name);
}

/** Paragraphs → script blocks. */
export function classifyParagraphs(paras: Para[]): Block[] {
  const list = paras.filter((p) => p.text.trim());
  // Indentation is only trusted when the document really uses it.
  const indents = list.map((p) => Math.round(p.indent ?? 0));
  const distinct = new Set(indents.filter((n) => n > 0));
  const base = indents.length ? Math.min(...indents) : 0;
  const useIndent = distinct.size >= 2;
  const out: Block[] = [];
  const push = (type: ElementType, text: string, extra: Partial<Block> = {}) => out.push({ id: uid(), type, text, ...extra });
  let inSpeech = false; // last block belongs to a speech (character/parenthetical/dialogue)
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    const text = p.text.replace(/\s+$/g, '').replace(/^\s+/, '');
    const next = list[i + 1];
    const cols = (p.indent ?? 0) - base;
    const prev = out[out.length - 1];
    if (p.style) { push(p.style, text); inSpeech = ['character', 'parenthetical', 'dialogue'].includes(p.style); continue; }
    // Scene headings (with optional scene number).
    const hm = HEADING.exec(text);
    if ((hm && (UP(text) || TIME.test(text))) || (HEADING_ES.test(text) && (UP(text) || TIME.test(text)))) {
      const num = hm?.[1];
      push('scene', (num ? text.slice(hm![0].indexOf(hm![2])) : text).replace(/^[.)\s]+/, ''), num ? { num } : {});
      inSpeech = false; continue;
    }
    if (UP(text) && (TRANS.test(text) || (p.right && /[:.]$/.test(text)))) { push('transition', text); inSpeech = false; continue; }
    // Theatre style: "MARA: Ya llego." / "MARA (en voz baja): Ya llego."
    const im = INLINE_CUE.exec(text);
    if (im && UP(im[1]) && im[1].trim().split(/\s+/).length <= 4 && !TIME.test(im[1])) {
      push('character', (im[1].trim() + (im[2] ?? '')).trim());
      let rest = im[3].trim();
      const par = /^(\([^)]+\))\s*(.*)$/.exec(rest);
      if (par) { push('parenthetical', par[1]); rest = par[2]; }
      if (rest) push('dialogue', rest);
      inSpeech = false; continue;
    }
    if (useIndent) {
      if (p.center && UP(text) && !looksLikeCue(text)) { push('centered', text); inSpeech = false; continue; }
      if (cols >= 15 && UP(text)) { push('character', text); inSpeech = true; continue; }
      if (cols >= 10 && /^\(/.test(text) && inSpeech) { push('parenthetical', text); continue; }
      if (cols >= 7 && inSpeech) { push('dialogue', text); continue; }
      if (cols >= 7 && prev?.type === 'character') { push('dialogue', text); inSpeech = true; continue; }
      push('action', text); inSpeech = false; continue;
    }
    // Reading order: a capitalized short line followed by text is a character cue.
    if (looksLikeCue(text) && next && !HEADING.test(next.text.trim()) && (!UP(next.text.trim()) || /^\(/.test(next.text.trim()) || EXT.test(text))) {
      push('character', text); inSpeech = true; continue;
    }
    if (inSpeech && prev && (prev.type === 'character' || prev.type === 'parenthetical' || prev.type === 'dialogue')) {
      if (/^\(.*\)$/s.test(text) && text.length < 80) { push('parenthetical', text); continue; }
      // A speech continues until a blank line (when the document marks them) or for one paragraph after the cue.
      if (prev.type !== 'dialogue' || (!p.blankBefore && list.some((x) => x.blankBefore))) { push('dialogue', text); continue; }
    }
    if (p.center && UP(text)) { push('centered', text); inSpeech = false; continue; }
    push('action', text); inSpeech = false;
  }
  return out;
}

/** A title page at the top of a document: title, "written by", authors, contact. */
export function splitTitlePage(paras: Para[]): { title: Partial<TitlePage>; body: Para[] } {
  const firstScene = paras.findIndex((p) => HEADING.test(p.text.trim()) || HEADING_ES.test(p.text.trim()) || /^(FADE IN|FUNDIDO)/i.test(p.text.trim()));
  if (firstScene <= 0 || firstScene > 14) return { title: {}, body: paras };
  const head = paras.slice(0, firstScene).filter((p) => p.text.trim());
  if (!head.length || head.some((p) => p.text.length > 120)) return { title: {}, body: paras };
  const credit = head.findIndex((p) => /^(escrito por|guion de|guión de|written by|screenplay by|story by|roteiro de|escrito por:|de)$/i.test(p.text.trim()));
  if (credit < 0 && !head.every((p) => p.center)) return { title: {}, body: paras };
  const title: Partial<TitlePage> = { title: head[0].text.trim() };
  if (credit > 0) {
    title.credit = head[credit].text.trim();
    title.authors = head.slice(credit + 1, credit + 3).map((p) => p.text.trim()).join('\n');
    const rest = head.slice(credit + 3).map((p) => p.text.trim());
    if (rest.length) title.contact = rest.join('\n');
  }
  return { title, body: paras.slice(firstScene) };
}

/** Plain text: leading spaces are indentation (Final Draft / Courier exports), blank lines separate speeches. */
export function parasFromText(src: string): Para[] {
  const out: Para[] = [];
  let blank = false;
  for (const raw of src.replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n')) {
    if (!raw.trim()) { blank = true; continue; }
    const indent = raw.length - raw.trimStart().length;
    out.push({ text: raw.trim(), indent, blankBefore: blank });
    blank = false;
  }
  return out;
}

/** Does a text look like Fountain (blank lines around cues and headings) rather than word-processor text? */
export function looksLikeFountain(src: string): boolean {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const nonEmpty = lines.filter((l) => l.trim()).length;
  const blanks = lines.length - nonEmpty;
  return /^(Title|Credit|Author)\s*:/im.test(src.slice(0, 500)) || blanks >= nonEmpty * 0.35;
}

const toCols = (v: string | undefined): number => {
  if (!v) return 0;
  const m = /(-?[\d.]+)\s*(pt|px|in|cm|mm|em)?/.exec(v);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  const inches = m[2] === 'in' ? n : m[2] === 'cm' ? n / 2.54 : m[2] === 'mm' ? n / 25.4 : m[2] === 'px' ? n / 96 : m[2] === 'em' ? (n * 12) / 72 : n / 72;
  return inches * 10;
};

/** Clipboard HTML from Google Docs or Word → paragraphs with indentation and alignment. */
export function parasFromHtml(html: string): Para[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const out: Para[] = [];
  let blank = false;
  for (const br of doc.body.querySelectorAll('br')) br.replaceWith('\n');
  let els: Element[] = [...doc.body.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li')];
  if (!els.length) els = [doc.body];
  for (const el of els) {
    const text = (el.textContent ?? '').replace(/ /g, ' ');
    if (!text.trim()) { blank = true; continue; }
    const st = (el as HTMLElement).style;
    const cs = (el.getAttribute('style') ?? '').toLowerCase();
    const indent = toCols(st.marginLeft || /margin-left:\s*([^;]+)/.exec(cs)?.[1]) + Math.max(0, toCols(st.textIndent || /text-indent:\s*([^;]+)/.exec(cs)?.[1])) + toCols(st.paddingLeft);
    const align = (st.textAlign || (el.getAttribute('align') ?? '')).toLowerCase();
    // Word puts each script element in a named class (MsoNormal, ScriptZ-Dialogo…).
    const cls = (el.getAttribute('class') ?? '').toLowerCase();
    let style: ElementType | undefined;
    if (/scene|escena/.test(cls)) style = 'scene';
    else if (/character|personaje/.test(cls)) style = 'character';
    else if (/dialog/.test(cls)) style = 'dialogue';
    else if (/parenthetical|acotaci/.test(cls)) style = 'parenthetical';
    else if (/transition|transici/.test(cls)) style = 'transition';
    for (const line of text.split('\n')) {
      if (!line.trim()) { blank = true; continue; }
      out.push({ text: line, indent, center: align === 'center', right: align === 'right', style, blankBefore: blank });
      blank = false;
    }
  }
  return out;
}
