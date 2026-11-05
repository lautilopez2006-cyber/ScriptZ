// Imports from other screenwriting apps: Fade In (.fadein / OSF), Celtx (.celtx), Highland (.highland), WriterDuet (.wdz).
import { upperSameLength } from '../core/text';
import { block, type Block, type ElementType, type Mark, type TitlePage } from '../core/model';
import { normalizeMarks } from '../core/marks';
import { decodeEntities, findAll, first, kids, parseXml, textOf } from './xml';
import { readZip } from './zip';
import { parseFountain } from './fountain';
import { parseFdx } from './fdx';
import { parseDocxXml } from './docx';

export interface Imported { title: Partial<TitlePage>; blocks: Block[] }

const OSF: Record<string, ElementType> = {
  'scene heading': 'scene', action: 'action', character: 'character', dialogue: 'dialogue', parenthetical: 'parenthetical', transition: 'transition',
  shot: 'shot', general: 'general', lyrics: 'lyrics', 'new act': 'act', 'end of act': 'endact', 'cast list': 'general', centered: 'centered',
};

/** Open Screenplay Format XML (Fade In's document.xml). */
export function parseOsf(xml: string): Imported {
  const root = parseXml(xml);
  const docNode = kids(root).find((n) => n.name.toLowerCase() === 'document') ?? root;
  const paragraphs = first(docNode, 'paragraphs') ?? docNode;
  const styleMap = new Map<string, string>();
  for (const s of findAll(docNode, 'style')) if (s.attrs.name && s.attrs.basestyle) styleMap.set(s.attrs.name.toLowerCase(), s.attrs.basestyle.toLowerCase());
  const blocks: Block[] = [];
  for (const para of kids(paragraphs, 'para')) {
    const st = first(para, 'style');
    let base = (st?.attrs.basestyle ?? st?.attrs.basestylename ?? st?.attrs.name ?? para.attrs.style ?? 'action').toLowerCase();
    base = styleMap.get(base) ?? base;
    let type: ElementType = OSF[base] ?? 'action';
    if (type === 'action' && (st?.attrs.align ?? '').toLowerCase() === 'center') type = 'centered';
    let text = '';
    const marks: Mark[] = [];
    for (const t of kids(para, 'text')) {
      const s = text.length;
      text += textOf(t);
      const e = text.length;
      if (e > s) {
        if (t.attrs.bold === '1') marks.push({ s, e, k: 'b' });
        if (t.attrs.italic === '1') marks.push({ s, e, k: 'i' });
        if (t.attrs.underline === '1') marks.push({ s, e, k: 'u' });
        if (t.attrs.strikeout === '1') marks.push({ s, e, k: 'x' });
      }
    }
    text = text.replace(/\r\n?/g, '\n');
    if (!text.trim()) continue; // Fade In stores blank lines as empty paragraphs
    // Fade In keeps the typed case and adds parentheses through the style; store what is printed.
    if (type === 'scene' || type === 'character' || type === 'transition') text = upperSameLength(text);
    if (type === 'parenthetical' && !/^\s*\(/.test(text)) { text = '(' + text.trim() + ')'; marks.length = 0; }
    const b = block(type, text);
    const m = normalizeMarks(marks, b.text.length);
    if (m) b.marks = m;
    if (type === 'scene' && para.attrs.number) b.num = para.attrs.number;
    blocks.push(b);
  }
  const title: Partial<TitlePage> = {};
  const tp = first(docNode, 'titlepage');
  if (tp) {
    const lines = kids(tp, 'para').map((p) => kids(p, 'text').map(textOf).join('').trim()).filter(Boolean);
    if (lines[0]) title.title = lines[0];
    if (lines[1]) title.credit = lines[1];
    if (lines[2]) title.authors = lines[2];
    if (lines.length > 3) title.contact = lines.slice(3).join('\n');
  }
  const info = first(docNode, 'info');
  if (info?.attrs.title && !title.title) title.title = info.attrs.title;
  if (info?.attrs.written_by && !title.credit) title.credit = info.attrs.written_by; // the credit label ("Written by")
  if (info?.attrs.author && !title.authors) title.authors = info.attrs.author;
  if (info?.attrs.contact && !title.contact) title.contact = info.attrs.contact;
  if (info?.attrs.copyright && !title.copyright && !/^copyright \(c\)$/i.test(info.attrs.copyright)) title.copyright = info.attrs.copyright;
  if (info?.attrs.drafts && !title.draft) title.draft = info.attrs.drafts;
  return { title, blocks: blocks.length ? blocks : [block('scene', '')] };
}

const CELTX: Record<string, ElementType> = {
  sceneheading: 'scene', action: 'action', character: 'character', dialog: 'dialogue', dialogue: 'dialogue', parenthetical: 'parenthetical',
  transition: 'transition', shot: 'shot', act: 'act', text: 'general', more: 'general',
};

/** Celtx script HTML: <p class="sceneheading">…</p>. */
export function parseCeltxHtml(html: string): Imported {
  const blocks: Block[] = [];
  for (const m of html.matchAll(/<p\b[^>]*class="([^"]+)"[^>]*>([\s\S]*?)<\/p>/gi)) {
    const cls = m[1].toLowerCase().split(/\s+/).find((c) => c in CELTX) ?? 'action';
    const text = decodeEntities(m[2].replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')).replace(/ /g, ' ').trim();
    if (!text) continue;
    const type = CELTX[cls] ?? 'action';
    // Celtx keeps the typed case and capitalizes these elements through CSS.
    blocks.push(block(type, type === 'scene' || type === 'character' || type === 'transition' || type === 'act' ? upperSameLength(text) : text));
  }
  const meta = (n: string) => decodeEntities(new RegExp(`<meta[^>]*content="([^"]*)"[^>]*name="${n}"`, 'i').exec(html)?.[1] ?? new RegExp(`<meta[^>]*name="${n}"[^>]*content="([^"]*)"`, 'i').exec(html)?.[1] ?? '');
  const title: Partial<TitlePage> = {};
  const tt = decodeEntities(/<title>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '').trim();
  if (tt) title.title = tt;
  if (meta('Author')) title.authors = meta('Author');
  if (meta('CX.byline')) title.credit = meta('CX.byline');
  if (meta('CX.contact')) title.contact = meta('CX.contact');
  if (meta('DC.source')) title.source = meta('DC.source');
  if (meta('DC.rights')) title.copyright = meta('DC.rights');
  return { title, blocks: blocks.length ? blocks : [block('scene', '')] };
}

export async function importZipApp(name: string, bytes: Uint8Array): Promise<Imported> {
  const files = await readZip(bytes);
  const dec = new TextDecoder();
  const find = (re: RegExp) => [...files.keys()].find((k) => re.test(k));
  const lower = name.toLowerCase();
  // Fade In
  const osf = find(/(^|\/)document\.xml$/i);
  if (lower.endsWith('.fadein') || osf) {
    if (!osf) throw new Error('fadein-no-document');
    return parseOsf(dec.decode(files.get(osf)!));
  }
  // Word
  const docx = find(/^word\/document\.xml$/);
  if (docx) {
    const styles = files.get('word/styles.xml');
    return { title: {}, blocks: parseDocxXml(dec.decode(files.get(docx)!), styles ? dec.decode(styles) : '') };
  }
  // Celtx
  const celtx = find(/script[^/]*\.html?$/i) ?? find(/\.html?$/i);
  if (lower.endsWith('.celtx') && celtx) return parseCeltxHtml(dec.decode(files.get(celtx)!));
  // Embedded Final Draft or Fountain (Highland, WriterDuet packages, generic zips).
  const fdx = find(/\.fdx$/i);
  if (fdx) { const r = parseFdx(dec.decode(files.get(fdx)!)); return { title: r.title, blocks: r.blocks }; }
  const fountain = find(/\.(fountain|spmd|markdown|md|txt|highland-text)$/i) ?? find(/text\.\w+$/i);
  if (fountain) { const r = parseFountain(dec.decode(files.get(fountain)!)); return { title: r.title as Partial<TitlePage>, blocks: r.blocks }; }
  if (celtx) return parseCeltxHtml(dec.decode(files.get(celtx)!));
  throw new Error('unsupported-package');
}
