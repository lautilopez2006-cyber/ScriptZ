// Text-based exports: paginated HTML reading copy, EPUB, Markdown, plain text.
import type { Block, Project } from '../core/model';
import { layoutProject, type Layout } from '../core/layout';
import { localeTokens, pageGeometry, resolveStyles } from '../core/format';
import { buildScenes } from '../core/scenes';
import { upperSameLength } from '../core/text';
import { esc } from './xml';
import { writeZip } from './zip';

function spanMarks(b: Block | undefined, dStart: number, dEnd: number, textStart: number, text: string): string {
  if (!b?.marks?.length) return esc(text);
  const s0 = dStart - textStart;
  const cuts = new Set<number>([0, text.length]);
  const fmt = b.marks.filter((m) => m.k === 'b' || m.k === 'i' || m.k === 'u' || m.k === 'x');
  for (const m of fmt) { const a = m.s - s0, z = m.e - s0; if (a > 0 && a < text.length) cuts.add(a); if (z > 0 && z < text.length) cuts.add(z); }
  const pts = [...cuts].sort((a, z) => a - z);
  let out = '';
  for (let i = 0; i < pts.length - 1; i++) {
    const s = pts[i], e = pts[i + 1];
    const on = fmt.filter((m) => m.s - s0 <= s && m.e - s0 >= e).map((m) => m.k);
    let seg = esc(text.slice(s, e));
    if (on.includes('b')) seg = `<b>${seg}</b>`;
    if (on.includes('i')) seg = `<i>${seg}</i>`;
    if (on.includes('u')) seg = `<u>${seg}</u>`;
    if (on.includes('x')) seg = `<s>${seg}</s>`;
    out += seg;
  }
  void dEnd;
  return out;
}

/** Self-contained, paginated HTML. Also used for printing. */
export function toHtml(p: Project, opts: { forPrint?: boolean; header?: (i: number, label: string) => { left: string; center: string; right: string } } = {}): string {
  const layout: Layout = layoutProject(p);
  const styles = resolveStyles(p);
  const g = pageGeometry(p.page.paper);
  const byId = new Map(p.blocks.map((b) => [b.id, b]));
  const tp = p.titlePage;
  const pages: string[] = [];
  const pageHtml = (inner: string, head = '') => `<section class="pg">${head}<div class="txt">${inner}</div></section>`;
  if (tp.enabled && (tp.title || p.title)) {
    const lines: string[] = [];
    const center = (s: string, row: number, bold = false) => s.split('\n').forEach((ln, k) => lines.push(`<div class="ln c" style="top:${(row + k) * 12}pt">${bold ? `<b>${esc(upperSameLength(ln))}</b>` : esc(ln)}</div>`));
    center(tp.title || p.title, 19, true);
    let r = 22;
    if (tp.credit) { center(tp.credit, r); r += 2; }
    if (tp.authors || p.author) center(tp.authors || p.author, r);
    if (tp.contact) tp.contact.split('\n').forEach((ln, k, all) => lines.push(`<div class="ln" style="top:${(g.lines - all.length + k) * 12}pt">${esc(ln)}</div>`));
    const right = [tp.draft, tp.date].filter(Boolean).join('\n');
    if (right) right.split('\n').forEach((ln, k, all) => lines.push(`<div class="ln r" style="top:${(g.lines - all.length + k) * 12}pt">${esc(ln)}</div>`));
    pages.push(pageHtml(lines.join('')));
  }
  layout.pages.forEach((lp, pi) => {
    const hf = opts.header?.(pi, lp.label) ?? (pi === 0 && !p.page.firstPageHeader ? { left: '', center: '', right: '' } : { left: '', center: '', right: lp.label + '.' });
    const head = `<div class="hd"><span>${esc(hf.left)}</span><span class="c">${esc(hf.center)}</span><span class="r">${esc(hf.right)}</span></div>`;
    const lines = lp.lines.map((l) => {
      const st = styles[l.type];
      const b = byId.get(l.blockId);
      const cls = [st?.bold && 'b', st?.italic && 'i', st?.underline && 'u'].filter(Boolean).join(' ');
      const body = l.kind === 'text' ? spanMarks(b, l.dStart, l.dEnd, l.textStart, l.text) : esc(l.text);
      const num = l.first && l.type === 'scene' && p.page.sceneNumbers !== 'none' ? `<span class="sn l">${esc(layout.sceneLabels.get(l.blockId) ?? '')}</span>${p.page.sceneNumbers === 'both' ? `<span class="sn r">${esc(layout.sceneLabels.get(l.blockId) ?? '')}</span>` : ''}` : '';
      const rev = b?.rev ? '<span class="rv">*</span>' : '';
      const id = l.first && l.type === 'scene' ? ` id="s-${l.blockId}"` : '';
      return `<div${id} class="ln ${cls}" style="top:${l.row * 12}pt;left:${l.col}ch">${num}${body}${rev}</div>`;
    }).join('');
    pages.push(pageHtml(lines, head));
  });
  const W = g.widthIn, H = g.heightIn;
  const css = `
@page{size:${W}in ${H}in;margin:0}
*{box-sizing:border-box}
body{margin:0;background:#e9e7e2;font:12pt/12pt 'Courier Prime','Courier New',Courier,monospace;color:#111}
.pg{width:${W}in;height:${H}in;background:#fff;margin:24px auto;position:relative;box-shadow:0 2px 12px rgba(0,0,0,.15);overflow:hidden;page-break-after:always;break-after:page}
.txt{position:absolute;left:${g.marginLeft}in;top:${g.marginTop}in;width:60ch;height:${g.lines * 12}pt}
.ln{position:absolute;white-space:pre;left:0}
.ln.c{width:60ch;text-align:center}.ln.r{width:60ch;text-align:right}
.ln.b{font-weight:bold}.ln.i{font-style:italic}.ln.u{text-decoration:underline}
.hd{position:absolute;left:${g.marginLeft}in;top:${g.headerAt}in;width:60ch;display:flex}.hd span{flex:1;white-space:pre}.hd .c{text-align:center}.hd .r{text-align:right}
.sn{position:absolute;white-space:pre}.sn.l{right:calc(100% + 3ch)}.sn.r{left:63ch}
.rv{position:absolute;left:64ch;font-weight:bold}
@media print{body{background:none}.pg{margin:0;box-shadow:none}}
${opts.forPrint ? '' : 'nav{position:fixed;left:0;top:0;bottom:0;width:260px;overflow:auto;background:#fff;border-right:1px solid #ddd;font:13px/1.4 system-ui,sans-serif;padding:12px}nav a{display:block;color:#333;text-decoration:none;padding:3px 6px;border-radius:5px}nav a:hover{background:#f1efe9}main{margin-left:260px}@media(max-width:900px){nav{display:none}main{margin:0}.pg{transform-origin:top left}}@media print{nav{display:none}main{margin:0}}'}`;
  const scenes = buildScenes(p.blocks);
  const nav = opts.forPrint ? '' : `<nav><b>${esc(p.title || 'ScriptlZ')}</b><br><br>${scenes.map((s) => `<a href="#s-${s.id}">${esc(s.label)}. ${esc(upperSameLength(s.heading))}</a>`).join('')}</nav>`;
  return `<!doctype html><html lang="${localeTokens(p.locale).lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(p.title || 'ScriptlZ')}</title><meta name="generator" content="ScriptlZ"><style>${css}</style></head><body>${nav}<main>${pages.join('')}</main></body></html>`;
}

/** Reflowable screenplay XHTML body (EPUB). */
function reflowBody(p: Project): string {
  const tokens = localeTokens(p.locale);
  const out: string[] = [];
  const scenes = new Map(buildScenes(p.blocks).map((s) => [s.id, s]));
  for (let i = 0; i < p.blocks.length; i++) {
    const b = p.blocks[i];
    if (b.type === 'note') continue;
    const text = b.omitted ? tokens.omitted : b.text;
    const html = esc(text).replace(/\n/g, '<br/>');
    if (b.type === 'scene') out.push(`<h2 class="scene" id="s${i}">${scenes.get(b.id)?.label ?? ''}. ${esc(upperSameLength(text))}</h2>`);
    else if (b.type === 'character') out.push(`<p class="character">${esc(upperSameLength(text))}</p>`);
    else out.push(`<p class="${b.type}">${html}</p>`);
  }
  return out.join('\n');
}

export async function toEpub(p: Project): Promise<Uint8Array> {
  const title = esc(p.title || 'ScriptlZ');
  const author = esc(p.titlePage.authors || p.author || '');
  const lang = localeTokens(p.locale).lang;
  const id = 'urn:uuid:' + p.id;
  const css = `body{font-family:'Courier New',monospace;line-height:1.35;margin:0 4%}h1{text-align:center;margin:30% 0 1em;font-size:1.4em}.byline{text-align:center}h2.scene{font-size:1em;font-weight:bold;margin:2em 0 .6em;text-transform:uppercase}p{margin:0 0 .8em}.character{margin:1em 0 0 38%;text-transform:uppercase}.dialogue{margin:0 15% .8em 17%}.parenthetical{margin:0 25% 0 27%}.transition{text-align:right;text-transform:uppercase}.centered{text-align:center}.lyrics{margin-left:17%;font-style:italic}.act,.endact{text-align:center;text-transform:uppercase;text-decoration:underline;margin:2em 0}`;
  const scenes = buildScenes(p.blocks);
  const idxOf = new Map(p.blocks.map((b, i) => [b.id, i]));
  const xhtml = (body: string) => `<?xml version="1.0" encoding="utf-8"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${lang}"><head><title>${title}</title><link rel="stylesheet" type="text/css" href="style.css"/></head><body>${body}</body></html>`;
  const nav = `<?xml version="1.0" encoding="utf-8"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>${title}</title></head><body><nav epub:type="toc" id="toc"><h1>${title}</h1><ol><li><a href="script.xhtml">${title}</a><ol>${scenes.map((s) => `<li><a href="script.xhtml#s${idxOf.get(s.id)}">${esc(s.label)}. ${esc(upperSameLength(s.heading))}</a></li>`).join('')}</ol></li></ol></nav></body></html>`;
  const opf = `<?xml version="1.0" encoding="utf-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="bookid">${id}</dc:identifier><dc:title>${title}</dc:title><dc:creator>${author}</dc:creator><dc:language>${lang}</dc:language><meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="css" href="style.css" media-type="text/css"/><item id="title" href="title.xhtml" media-type="application/xhtml+xml"/><item id="script" href="script.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="title"/><itemref idref="script"/></spine></package>`;
  return writeZip([
    { name: 'mimetype', data: 'application/epub+zip', store: true },
    { name: 'META-INF/container.xml', data: '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>' },
    { name: 'OEBPS/content.opf', data: opf },
    { name: 'OEBPS/nav.xhtml', data: nav },
    { name: 'OEBPS/style.css', data: css },
    { name: 'OEBPS/title.xhtml', data: xhtml(`<h1>${esc(upperSameLength(p.titlePage.title || p.title || ''))}</h1>${p.titlePage.credit ? `<p class="byline">${esc(p.titlePage.credit)}</p>` : ''}<p class="byline">${author}</p>`) },
    { name: 'OEBPS/script.xhtml', data: xhtml(reflowBody(p)) },
  ]);
}

export function toMarkdown(p: Project): string {
  const tokens = localeTokens(p.locale);
  const scenes = new Map(buildScenes(p.blocks).map((s) => [s.id, s.label]));
  const md = (b: Block) => {
    let s = b.text;
    const fmt = (b.marks ?? []).filter((m) => m.k === 'b' || m.k === 'i').sort((a, z) => z.s - a.s);
    for (const m of fmt) { const w = m.k === 'b' ? '**' : '_'; s = s.slice(0, m.s) + w + s.slice(m.s, m.e) + w + s.slice(m.e); }
    return s;
  };
  const out: string[] = [`# ${p.title || 'ScriptlZ'}`, ''];
  if (p.titlePage.authors || p.author) out.push(`*${p.titlePage.credit || ''} ${p.titlePage.authors || p.author}*`.replace('* ', '*'), '');
  if (p.logline) out.push(`> ${p.logline}`, '');
  for (const b of p.blocks) {
    if (b.type === 'note') { out.push(`<!-- ${b.text.replace(/--/g, '—')} -->`, ''); continue; }
    if (b.type === 'scene') { out.push(`## ${scenes.get(b.id) ?? ''}. ${upperSameLength(b.omitted ? tokens.omitted : b.text)}`, ''); continue; }
    if (b.type === 'character') { out.push(`**${upperSameLength(b.text)}**  `); continue; }
    if (b.type === 'parenthetical') { out.push(`*${b.text}*  `); continue; }
    if (b.type === 'dialogue') { out.push(md(b).split('\n').map((l) => `> ${l}`).join('\n'), ''); continue; }
    if (b.type === 'transition') { out.push(`<p align="right">${upperSameLength(b.text)}</p>`, ''); continue; }
    if (b.type === 'act' || b.type === 'endact') { out.push(`### ${upperSameLength(b.text)}`, ''); continue; }
    out.push(md(b), '');
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n');
}

/** Monospaced plain text, exactly paginated (form feed between pages). */
export function toPlainText(p: Project): string {
  const layout = layoutProject(p);
  const g = pageGeometry(p.page.paper);
  const pages = layout.pages.map((lp, pi) => {
    const rows: string[] = Array.from({ length: g.lines }, () => '');
    for (const l of lp.lines) {
      const row = rows[l.row] ?? '';
      rows[l.row] = row.padEnd(l.col, ' ') + l.text;
    }
    const head = pi === 0 && !p.page.firstPageHeader ? '' : `${lp.label}.`.padStart(60, ' ');
    return [head, '', ...rows.map((r) => r.trimEnd())].join('\n').replace(/\s+$/, '');
  });
  return pages.join('\n\f\n') + '\n';
}
