// Word (.docx) export with real paragraph styles. Two modes:
//  - flow: Word paginates (best for editing);
//  - exact: page breaks, (MORE) and (CONT'D) exactly as ScriptZ/PDF.
import { type Block, type ElementType, type Project, type TitlePage } from '../core/model';
import { classifyParagraphs, splitTitlePage, type Para } from './detect';
import { getTemplate, localeTokens, pageGeometry, resolveStyles, type ElementStyle } from '../core/format';
import { layoutProject } from '../core/layout';
import { upperSameLength } from '../core/text';
import { esc } from './xml';
import { writeZip } from './zip';

const TW = 144; // twips per column (0.1in)
const STYLE_NAMES: Partial<Record<ElementType, string>> = {
  scene: 'Scene Heading', action: 'Action', character: 'Character', dialogue: 'Dialogue', parenthetical: 'Parenthetical', transition: 'Transition',
  shot: 'Shot', general: 'General', lyrics: 'Lyrics', centered: 'Centered', act: 'New Act', endact: 'End of Act', note: 'Script Note',
  page: 'Comic Page', panel: 'Panel', caption: 'Caption', sfx: 'SFX', sound: 'Sound', music: 'Music', video: 'Video', audio: 'Audio',
};
const sid = (t: ElementType) => 'SZ' + (STYLE_NAMES[t] ?? 'Action').replace(/\s+/g, '');

function styleXml(styles: Record<ElementType, ElementStyle>, font: string): string {
  const out: string[] = [];
  out.push(`<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:cs="${font}" w:eastAsia="${font}"/><w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="es-AR"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="exact"/></w:pPr></w:pPrDefault></w:docDefaults>`);
  out.push(`<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>`);
  for (const [type, name] of Object.entries(STYLE_NAMES) as [ElementType, string][]) {
    const st = styles[type];
    if (!st) continue;
    const left = st.indent * TW;
    const right = Math.max(0, (60 - st.indent - st.width) * TW);
    const jc = st.align === 'center' ? '<w:jc w:val="center"/>' : st.align === 'right' ? '<w:jc w:val="right"/>' : '';
    const rpr = `${st.bold ? '<w:b/>' : ''}${st.italic ? '<w:i/>' : ''}${st.underline ? '<w:u w:val="single"/>' : ''}${st.upper ? '<w:caps/>' : ''}${type === 'note' ? '<w:vanish/><w:color w:val="806000"/>' : ''}`;
    out.push(`<w:style w:type="paragraph" w:customStyle="1" w:styleId="${sid(type)}"><w:name w:val="${name}"/><w:basedOn w:val="Normal"/><w:next w:val="${sid(st.enter)}"/><w:qFormat/><w:pPr>${st.keepWithNext ? '<w:keepNext/>' : ''}${st.splittable ? '' : '<w:keepLines/>'}<w:spacing w:before="${st.spaceBefore * 240}" w:after="0" w:line="${240 * st.lineSpacing}" w:lineRule="exact"/><w:ind w:left="${left}" w:right="${right}"/>${jc}</w:pPr><w:rPr>${rpr}</w:rPr></w:style>`);
  }
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${out.join('')}</w:styles>`;
}

function runsXml(b: Block, extra = ''): string {
  const text = b.text;
  const fmt = (b.marks ?? []).filter((m) => m.k === 'b' || m.k === 'i' || m.k === 'u' || m.k === 'x' || m.k === 'hl');
  const cuts = new Set<number>([0, text.length]);
  for (const m of fmt) { cuts.add(m.s); cuts.add(m.e); }
  const pts = [...cuts].sort((a, z) => a - z);
  let out = '';
  for (let i = 0; i < pts.length - 1; i++) {
    const s = pts[i], e = pts[i + 1];
    const seg = text.slice(s, e);
    if (!seg) continue;
    const on = fmt.filter((m) => m.s <= s && m.e >= e);
    const rpr = on.map((m) => (m.k === 'b' ? '<w:b/>' : m.k === 'i' ? '<w:i/>' : m.k === 'u' ? '<w:u w:val="single"/>' : m.k === 'x' ? '<w:strike/>' : '<w:highlight w:val="yellow"/>')).join('');
    out += seg.split('\n').map((part, k) => `${k ? '<w:r><w:br/></w:r>' : ''}<w:r>${rpr ? `<w:rPr>${rpr}</w:rPr>` : ''}<w:t xml:space="preserve">${esc(part)}</w:t></w:r>`).join('');
  }
  return out + extra;
}

const P = (style: string, body: string, ppr = '') => `<w:p><w:pPr><w:pStyle w:val="${style}"/>${ppr}</w:pPr>${body}</w:p>`;
const plainRun = (s: string) => `<w:r><w:t xml:space="preserve">${esc(s)}</w:t></w:r>`;

function titlePageXml(p: Project): string {
  const tp = p.titlePage;
  if (!tp.enabled || !(tp.title || p.title)) return '';
  const C = (s: string, before = 0, bold = false) => s.split('\n').map((ln, k) => `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="${k ? 0 : before}"/></w:pPr><w:r>${bold ? '<w:rPr><w:b/><w:caps/></w:rPr>' : ''}<w:t xml:space="preserve">${esc(ln)}</w:t></w:r></w:p>`).join('');
  const L = (s: string, before = 0, right = false) => s.split('\n').map((ln, k) => `<w:p><w:pPr>${right ? '<w:jc w:val="right"/>' : ''}<w:spacing w:before="${k ? 0 : before}"/></w:pPr>${plainRun(ln)}</w:p>`).join('');
  let x = C(tp.title || p.title, 240 * 19, true);
  if (tp.credit) x += C(tp.credit, 480);
  if (tp.authors || p.author) x += C(tp.authors || p.author, tp.credit ? 240 : 480);
  if (tp.source) x += C(tp.source, 480);
  if (tp.contact) x += L(tp.contact, 240 * 18);
  const rightText = [tp.draft, tp.date].filter(Boolean).join('\n');
  if (rightText) x += L(rightText, tp.contact ? 240 : 240 * 18, true);
  if (tp.copyright) x += L(tp.copyright, 240);
  return x;
}

export async function toDocx(p: Project, mode: 'flow' | 'exact' = 'flow'): Promise<Uint8Array> {
  const styles = resolveStyles(p);
  const tokens = localeTokens(p.locale);
  const g = pageGeometry(p.page.paper);
  const font = 'Courier New';
  const body: string[] = [];
  const twoCol = !!getTemplate(p.template).twoColumn;
  const titleXml = titlePageXml(p);
  const pgW = Math.round(g.widthIn * 1440), pgH = Math.round(g.heightIn * 1440);
  const mL = Math.round(g.marginLeft * 1440), mR = Math.max(360, pgW - mL - 60 * TW), mT = Math.round(g.marginTop * 1440), mB = Math.round(g.marginBottom * 1440);
  const sect = (withHeader: boolean, titlePg: boolean) => `<w:sectPr>${withHeader ? '<w:headerReference w:type="default" r:id="rIdHdr"/>' : ''}<w:pgSz w:w="${pgW}" w:h="${pgH}"/><w:pgMar w:top="${mT}" w:right="${mR}" w:bottom="${mB}" w:left="${mL}" w:header="720" w:footer="720" w:gutter="0"/>${withHeader ? '<w:pgNumType w:start="1"/>' : ''}${titlePg ? '<w:titlePg/>' : ''}</w:sectPr>`;
  if (titleXml) body.push(titleXml, `<w:p><w:pPr>${sect(false, false)}</w:pPr></w:p>`);

  const text = (b: Block): Block => (b.omitted ? { ...b, text: tokens.omitted, marks: undefined } : b);
  const dualTable = (left: Block[], right: Block[]) => {
    const cell = (list: Block[]) => `<w:tc><w:tcPr><w:tcW w:w="${30 * TW}" w:type="dxa"/></w:tcPr>${list.map((b) => {
      const ind = b.type === 'character' ? 8 * TW : b.type === 'parenthetical' ? 3 * TW : 0;
      return `<w:p><w:pPr><w:pStyle w:val="${sid(b.type)}"/><w:spacing w:before="0"/><w:ind w:left="${ind}" w:right="0"/></w:pPr>${runsXml(text(b))}</w:p>`;
    }).join('') || '<w:p/>'}</w:tc>`;
    return `<w:tbl><w:tblPr><w:tblW w:w="${60 * TW}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tblCellMar><w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders></w:tblPr><w:tblGrid><w:gridCol w:w="${30 * TW}"/><w:gridCol w:w="${30 * TW}"/></w:tblGrid><w:tr><w:trPr><w:cantSplit/></w:trPr>${cell(left)}${cell(right)}</w:tr></w:tbl><w:p><w:pPr><w:spacing w:before="0" w:line="20" w:lineRule="exact"/></w:pPr></w:p>`;
  };

  if (mode === 'flow') {
    const bl = p.blocks;
    for (let i = 0; i < bl.length; i++) {
      const b = bl[i];
      if (b.type === 'note') continue;
      if (b.dual === 'L') {
        const left: Block[] = []; let j = i;
        while (j < bl.length && bl[j].dual === 'L') left.push(bl[j++]);
        const right: Block[] = [];
        while (j < bl.length && bl[j].dual === 'R') right.push(bl[j++]);
        if (right.length) { body.push(dualTable(left, right)); i = j - 1; continue; }
      }
      if (twoCol && b.type === 'video') {
        const a = bl[i + 1]?.type === 'audio' ? bl[++i] : null;
        body.push(`<w:tbl><w:tblPr><w:tblW w:w="${60 * TW}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders><w:insideV w:val="single" w:sz="4" w:color="BBBBBB"/></w:tblBorders></w:tblPr><w:tblGrid><w:gridCol w:w="${30 * TW}"/><w:gridCol w:w="${30 * TW}"/></w:tblGrid><w:tr><w:tc><w:tcPr><w:tcW w:w="${30 * TW}" w:type="dxa"/></w:tcPr><w:p>${runsXml(b)}</w:p></w:tc><w:tc><w:tcPr><w:tcW w:w="${30 * TW}" w:type="dxa"/></w:tcPr><w:p>${a ? runsXml(a) : ''}</w:p></w:tc></w:tr></w:tbl>`);
        continue;
      }
      const st = styles[b.type];
      const pageBreak = st.newPage && i > 0 ? '<w:pageBreakBefore/>' : '';
      const prefix = st.prefix ? plainRun(st.prefix) : '';
      const suffix = st.suffix ? plainRun(st.suffix) : '';
      body.push(P(sid(b.type), prefix + runsXml(text(b), suffix), pageBreak));
    }
  } else {
    // Exact pages: one paragraph per printed line, explicit page breaks.
    const layout = layoutProject(p);
    const byId = new Map(p.blocks.map((b) => [b.id, b]));
    layout.pages.forEach((pg, pi) => {
      let lastRow = -1;
      pg.lines.filter((l) => !l.column || l.column === 'L').concat(pg.lines.filter((l) => l.column === 'R')).sort((a, z) => a.row - z.row || a.col - z.col).forEach((ln, k) => {
        const gap = Math.max(0, ln.row - lastRow - 1);
        if (ln.row === lastRow) {
          // Same row (dual dialogue right column): append with a tab-like spacer.
          const prev = body.pop()!;
          body.push(prev.replace('</w:p>', `${plainRun(' '.repeat(Math.max(1, ln.col - 30)))}${plainRun(ln.text)}</w:p>`));
          return;
        }
        lastRow = ln.row;
        const b = byId.get(ln.blockId);
        const st = styles[ln.type];
        const brk = pi > 0 && k === 0 ? '<w:pageBreakBefore/>' : '';
        const rpr = `${st?.bold ? '<w:b/>' : ''}${st?.italic ? '<w:i/>' : ''}${st?.underline ? '<w:u w:val="single"/>' : ''}`;
        const run = ln.kind === 'text' && b && !b.omitted && b.marks?.length
          ? runsXml({ ...b, text: b.text.slice(Math.max(0, ln.dStart - ln.textStart), Math.max(0, ln.dEnd - ln.textStart)), marks: (b.marks ?? []).map((m) => ({ ...m, s: m.s - (ln.dStart - ln.textStart), e: m.e - (ln.dStart - ln.textStart) })).filter((m) => m.e > 0) })
          : `<w:r>${rpr ? `<w:rPr>${rpr}</w:rPr>` : ''}<w:t xml:space="preserve">${esc(st?.upper ? upperSameLength(ln.text) : ln.text)}</w:t></w:r>`;
        body.push(`<w:p><w:pPr>${brk}<w:spacing w:before="${gap * 240}" w:after="0" w:line="${240 * (st?.lineSpacing ?? 1)}" w:lineRule="exact"/><w:ind w:left="${ln.col * TW}" w:right="0"/></w:pPr>${run}</w:p>`);
      });
    });
  }
  body.push(sect(true, !p.page.firstPageHeader));
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${body.join('')}</w:body></w:document>`;
  const header = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r><w:r><w:t>.</w:t></w:r></w:p></w:hdr>`;
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  return writeZip([
    { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>` },
    { name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>` },
    { name: 'word/_rels/document.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdSettings" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/><Relationship Id="rIdHdr" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/></Relationships>` },
    { name: 'word/document.xml', data: doc },
    { name: 'word/styles.xml', data: styleXml(styles, font) },
    { name: 'word/settings.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:defaultTabStop w:val="720"/><w:characterSpacingControl w:val="doNotCompress"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>` },
    { name: 'word/header1.xml', data: header },
    { name: 'docProps/core.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(p.title)}</dc:title><dc:creator>${esc(p.titlePage.authors || p.author)}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created></cp:coreProperties>` },
    { name: 'docProps/app.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>ScriptlZ</Application></Properties>` },
  ]);
}

/** Word import: our own styles by name, otherwise indentation and reading order (see detect.ts). */
export function parseDocxXml(xml: string, stylesXml: string): Block[] {
  return parseDocxParas(xml, stylesXml).blocks;
}

export function parseDocxParas(xml: string, stylesXml: string): { blocks: Block[]; title: Partial<TitlePage> } {
  const styleName = new Map<string, string>();
  for (const m of stylesXml.matchAll(/<w:style\b[^>]*w:styleId="([^"]+)"[^>]*>[\s\S]*?<w:name w:val="([^"]+)"/g)) styleName.set(m[1], m[2].toLowerCase());
  // Indentation inherited from paragraph styles.
  const styleInd = new Map<string, number>();
  for (const m of stylesXml.matchAll(/<w:style\b[^>]*w:styleId="([^"]+)"[^>]*>([\s\S]*?)<\/w:style>/g)) { const l = /<w:ind[^>]*w:(?:left|start)="(-?\d+)"/.exec(m[2]); if (l) styleInd.set(m[1], Number(l[1])); }
  const byName: Record<string, ElementType> = {};
  for (const [type, name] of Object.entries(STYLE_NAMES)) byName[name.toLowerCase()] = type as ElementType;
  Object.assign(byName, { 'scene heading': 'scene', 'encabezado de escena': 'scene', escena: 'scene', 'acción': 'action', accion: 'action', action: 'action', character: 'character', personaje: 'character', dialogue: 'dialogue', 'diálogo': 'dialogue', dialogo: 'dialogue', parenthetical: 'parenthetical', 'acotación': 'parenthetical', transition: 'transition', 'transición': 'transition' });
  const paras: Para[] = [];
  let blank = false;
  for (const pm of xml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)) {
    const p = pm[0];
    const sidm = /<w:pStyle w:val="([^"]+)"/.exec(p);
    const name = sidm ? styleName.get(sidm[1]) ?? sidm[1].toLowerCase() : '';
    const own = /<w:ind[^>]*w:(?:left|start)="(-?\d+)"/.exec(p)?.[1];
    const first = Number(/<w:ind[^>]*w:firstLine="(-?\d+)"/.exec(p)?.[1] ?? 0);
    const left = (own !== undefined ? Number(own) : sidm ? styleInd.get(sidm[1]) ?? 0 : 0) + Math.max(0, first);
    const center = /<w:jc w:val="center"/.test(p);
    const rightAl = /<w:jc w:val="(right|end)"/.test(p);
    let text = '';
    for (const r of p.matchAll(/<w:(t|br|tab)\b[^>]*?(?:\/>|>([\s\S]*?)<\/w:t>)/g)) text += r[1] === 't' ? (r[2] ?? '') : r[1] === 'br' ? '\n' : ' ';
    text = text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
    if (!text.trim()) { blank = true; continue; }
    const style = byName[name];
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      paras.push({ text: line, indent: left / TW, center, right: rightAl, style, blankBefore: blank });
      blank = false;
    }
  }
  const { title, body } = splitTitlePage(paras);
  return { blocks: classifyParagraphs(body), title };
}
