// Fountain (https://fountain.io) import/export with emphasis, dual dialogue, notes and title page.
import { block, uid, type Block, type ElementType, type Mark, type TitlePage } from '../core/model';
import { isSceneHeadingText } from '../core/scenes';

export interface FountainDoc { title: Record<string, string>; blocks: Block[] }

const TITLE_KEYS: Record<string, keyof TitlePage> = {
  title: 'title', credit: 'credit', author: 'authors', authors: 'authors', source: 'source',
  'draft date': 'date', date: 'date', contact: 'contact', copyright: 'copyright', notes: 'notes', revision: 'draft', draft: 'draft',
};

/** Parse Fountain emphasis (***bold italic***, **bold**, *italic*, _underline_) into plain text + marks. */
export function parseEmphasis(input: string): { text: string; marks: Mark[] } {
  const marks: Mark[] = [];
  let text = '';
  const MARKERS: [string, ('b' | 'i' | 'u')[]][] = [['***', ['b', 'i']], ['**', ['b']], ['*', ['i']], ['_', ['u']]];
  const open = new Map<string, number>();
  const closesLater = (from: number, m: string) => {
    for (let j = from; j <= input.length - m.length; j++) {
      if (input[j] === '\\') { j++; continue; }
      if (input.startsWith(m, j) && (m !== '*' || (input[j + 1] !== '*' && input[j - 1] !== '*'))) return j > from;
    }
    return false;
  };
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (c === '\\' && i + 1 < input.length && '*_\\'.includes(input[i + 1])) { text += input[++i]; continue; }
    let handled = false;
    for (const [m, kinds] of MARKERS) {
      if (!input.startsWith(m, i)) continue;
      if (open.has(m)) {
        const s0 = open.get(m)!;
        open.delete(m);
        if (text.length > s0) for (const k of kinds) marks.push({ s: s0, e: text.length, k });
        i += m.length - 1; handled = true;
      } else if (input[i + m.length] && input[i + m.length] !== ' ' && closesLater(i + m.length, m)) {
        open.set(m, text.length);
        i += m.length - 1; handled = true;
      }
      break;
    }
    if (!handled) text += c;
  }
  return { text, marks };
}

export function emphasize(text: string, marks: Mark[] | undefined): string {
  const fmt = (marks ?? []).filter((m) => m.k === 'b' || m.k === 'i' || m.k === 'u');
  const esc = (s: string) => s.replace(/([*_\\])/g, '\\$1');
  if (!fmt.length) return esc(text);
  // Boundaries
  const cuts = new Set<number>([0, text.length]);
  for (const m of fmt) { cuts.add(m.s); cuts.add(m.e); }
  const points = [...cuts].sort((a, b) => a - b);
  let out = '';
  for (let i = 0; i < points.length - 1; i++) {
    const s = points[i], e = points[i + 1];
    const seg = text.slice(s, e);
    const on = (k: string) => fmt.some((m) => m.k === k && m.s <= s && m.e >= e);
    let open = '', close = '';
    if (on('u')) { open += '_'; close = '_' + close; }
    if (on('b') && on('i')) { open += '***'; close = '***' + close; }
    else if (on('b')) { open += '**'; close = '**' + close; }
    else if (on('i')) { open += '*'; close = '*' + close; }
    // Keep surrounding spaces outside markers.
    const m = /^(\s*)(.*?)(\s*)$/s.exec(seg)!;
    out += m[2] ? m[1] + open + esc(m[2]) + close + m[3] : esc(seg);
  }
  return out;
}

const TRANSITION_RE = /^[\p{Lu}\s.'’\-]+(TO:|A:|PARA:)$|^(FADE (IN|OUT)[.:]?|FUNDIDO.*[.:]|CORTE A:|FADE TO BLACK\.)$/u;

function isUpperLine(line: string): boolean {
  const letters = line.replace(/\([^)]*\)/g, '').replace(/[^\p{L}]/gu, '');
  return letters.length > 0 && letters === letters.toUpperCase() && /\p{Lu}/u.test(letters);
}

export function parseFountain(source: string): FountainDoc {
  let src = source.replace(/\r\n?/g, '\n').replace(/^﻿/, '');
  // Boneyard
  src = src.replace(/\/\*[\s\S]*?\*\//g, '');
  const lines = src.split('\n');
  const title: FountainDoc['title'] = {};
  let i = 0;
  // Title page: key: value lines at the top, until the first blank line.
  if (/^\s*[A-Za-z][A-Za-z ]*:/.test(lines[0] ?? '') && /^(title|credit|author|authors|source|draft date|date|contact|copyright|notes|revision|draft)\s*:/i.test(lines[0].trim())) {
    let key = '';
    for (; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) { i++; break; }
      const m = /^([A-Za-z][A-Za-z ]*):\s*(.*)$/.exec(line);
      if (m && !/^\s/.test(line)) {
        key = m[1].toLowerCase();
        const field = TITLE_KEYS[key];
        if (field) title[field] = m[2].trim();
        else title[key] = m[2].trim();
      } else if (key) {
        const field = TITLE_KEYS[key] ?? key;
        const prev = (title[field] as string) || '';
        title[field] = (prev ? prev + '\n' : '') + line.trim();
      }
    }
  }
  const blocks: Block[] = [];
  const push = (type: ElementType, raw: string, extra: Partial<Block> = {}) => {
    const { text, marks } = parseEmphasis(raw);
    const b = block(type, text, extra);
    if (marks.length) b.marks = marks;
    blocks.push(b);
    return b;
  };
  const blankBefore = (k: number) => k === 0 || !lines[k - 1].trim();
  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.trim();
    if (!line) { i++; continue; }
    // Notes [[ ]] as a standalone paragraph.
    if (/^\[\[[\s\S]*\]\]$/.test(line)) { push('note', line.slice(2, -2).trim()); i++; continue; }
    // Page break
    if (/^={3,}$/.test(line)) { i++; continue; }
    // Sections → acts (top level) or notes
    if (/^#+\s*/.test(line)) {
      const depth = /^#+/.exec(line)![0].length;
      push(depth === 1 ? 'act' : 'note', line.replace(/^#+\s*/, ''));
      i++; continue;
    }
    // Synopsis
    if (/^=(?!=)/.test(line)) { push('note', line.slice(1).trim()); i++; continue; }
    // Centered
    if (/^>.*<$/.test(line)) { push('centered', line.slice(1, -1).trim()); i++; continue; }
    // Forced transition
    if (/^>/.test(line)) { push('transition', line.slice(1).trim()); i++; continue; }
    // Lyrics
    if (/^~/.test(line)) { push('lyrics', line.slice(1).trim()); i++; continue; }
    // Scene heading
    const forcedScene = /^\.(?!\.)/.test(line);
    if (blankBefore(i) && (forcedScene || isSceneHeadingText(line))) {
      let text = forcedScene ? line.slice(1).trim() : line;
      let num: string | undefined;
      const nm = /\s*#([^#]+)#\s*$/.exec(text);
      if (nm) { num = nm[1].trim(); text = text.slice(0, nm.index).trim(); }
      const b = push('scene', text);
      if (num) b.num = num;
      i++; continue;
    }
    // Transition (uppercase ending in TO:) surrounded by blank lines
    if (blankBefore(i) && TRANSITION_RE.test(line) && (i + 1 >= lines.length || !lines[i + 1].trim())) {
      push('transition', line); i++; continue;
    }
    // Character + dialogue
    const forcedChar = /^@/.test(line);
    const next = lines[i + 1];
    if (blankBefore(i) && next !== undefined && next.trim() && (forcedChar || (isUpperLine(line) && !/^!/.test(line)))) {
      let name = forcedChar ? line.slice(1).trim() : line;
      let dual: 'R' | undefined;
      if (/\^\s*$/.test(name)) { dual = 'R'; name = name.replace(/\s*\^\s*$/, ''); }
      const startIndex = blocks.length;
      push('character', name, dual ? { dual } : {});
      i++;
      let dialogue: string[] = [];
      const flush = () => { if (dialogue.length) { push('dialogue', dialogue.join('\n'), dual ? { dual } : {}); dialogue = []; } };
      while (i < lines.length && lines[i].trim()) {
        const l = lines[i].trim();
        if (/^\(.*\)$/.test(l)) { flush(); push('parenthetical', l, dual ? { dual } : {}); }
        else if (/^~/.test(l)) { flush(); push('lyrics', l.slice(1).trim()); }
        else dialogue.push(lines[i] === '  ' ? '' : l);
        i++;
      }
      flush();
      if (dual === 'R') {
        // Mark the preceding speech as the left column.
        let k = startIndex - 1;
        const left: number[] = [];
        while (k >= 0 && (blocks[k].type === 'dialogue' || blocks[k].type === 'parenthetical' || blocks[k].type === 'character')) {
          left.unshift(k);
          if (blocks[k].type === 'character') break;
          k--;
        }
        if (left.length && blocks[left[0]].type === 'character') for (const x of left) blocks[x].dual = 'L';
        else for (let x = startIndex; x < blocks.length; x++) delete blocks[x].dual;
      }
      continue;
    }
    // Action paragraph (until a blank line); forced with "!"
    const para: string[] = [];
    while (i < lines.length && lines[i].trim()) {
      let l = lines[i];
      if (para.length === 0 && /^\s*!/.test(l)) l = l.replace(/^\s*!/, '');
      para.push(l.replace(/\t/g, '    ').trimEnd());
      i++;
    }
    push('action', para.join('\n').replace(/^\s+/, ''));
  }
  // Inline notes [[...]] inside text become note marks? Keep them as text but strip for cleanliness.
  for (const b of blocks) {
    if (b.type !== 'note' && b.text.includes('[[')) {
      const m = /\[\[([\s\S]*?)\]\]/.exec(b.text);
      if (m) {
        b.text = b.text.replace(/\s*\[\[[\s\S]*?\]\]\s*/g, ' ').trim();
        delete b.marks;
      }
    }
  }
  return { title, blocks: blocks.length ? blocks : [block('scene', '')] };
}

function looksLikeScene(t: string) { return isSceneHeadingText(t); }

export function toFountain(blocks: Block[], title?: Partial<TitlePage>): string {
  const out: string[] = [];
  if (title && (title.title || title.authors)) {
    const field = (k: string, v?: string) => {
      if (!v) return;
      const parts = v.split('\n');
      if (parts.length === 1) out.push(`${k}: ${v}`);
      else { out.push(`${k}:`); for (const p of parts) out.push(`    ${p}`); }
    };
    field('Title', title.title);
    field('Credit', title.credit);
    field('Author', title.authors);
    field('Source', title.source);
    field('Draft date', title.date || title.draft);
    field('Contact', title.contact);
    field('Copyright', title.copyright);
    out.push('');
  }
  let prev: Block | null = null;
  for (const b of blocks) {
    const text = emphasize(b.text, b.marks);
    const inSpeech = prev && (prev.type === 'character' || prev.type === 'parenthetical' || prev.type === 'dialogue') && (b.type === 'parenthetical' || b.type === 'dialogue');
    if (!inSpeech && out.length && out[out.length - 1] !== '') out.push('');
    switch (b.type) {
      case 'scene': {
        const t = b.omitted ? 'OMITTED' : b.text.toUpperCase();
        out.push((looksLikeScene(t) ? '' : '.') + t + (b.num ? ` #${b.num}#` : ''));
        break;
      }
      case 'character': {
        const name = b.text.toUpperCase();
        const forced = !/\p{Lu}/u.test(name) || name !== name.toUpperCase() || looksLikeScene(name);
        out.push((forced ? '@' : '') + name + (b.dual === 'R' && prev?.dual !== 'R' ? ' ^' : ''));
        break;
      }
      case 'parenthetical': out.push(b.text.startsWith('(') ? b.text : `(${b.text})`); break;
      case 'dialogue': out.push(text.split('\n').map((l) => l || '  ').join('\n')); break;
      case 'transition': out.push(/TO:$/.test(b.text.toUpperCase()) ? b.text.toUpperCase() : `> ${b.text.toUpperCase()}`); break;
      case 'centered': out.push(`> ${text} <`); break;
      case 'lyrics': out.push(`~${text}`); break;
      case 'note': out.push(`[[${b.text}]]`); break;
      case 'act': case 'endact': out.push(`# ${b.text}`); out.push(''); out.push(`> ${b.text.toUpperCase()} <`); break;
      default: {
        // Force action when it would be misread as something else.
        const firstLine = text.split('\n')[0];
        const risky = looksLikeScene(firstLine) || (isUpperLine(firstLine) && text.includes('\n')) || /^[.>~@#=!\[]/.test(firstLine) || TRANSITION_RE.test(firstLine.trim());
        out.push((risky ? '!' : '') + text);
      }
    }
    prev = b;
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n') + '\n';
}

export { uid };
