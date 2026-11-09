// Screenplay → PDF using the shared pagination engine and embedded Unicode fonts.
import type { Block, Project } from '../../core/model';
import { layoutProject, type LayoutLine } from '../../core/layout';
import { pageGeometry, resolveStyles, localeTokens, type ElementStyle } from '../../core/format';
import { graphemes, upperSameLength } from '../../core/text';
import { REV_HEX } from '../../core/revisions';
import { PdfDoc, type FontHandle, type PdfPage } from './writer';

export interface PdfFonts { regular: Uint8Array; bold: Uint8Array; italic: Uint8Array; boldItalic: Uint8Array; fallback: Uint8Array; fallbackBold: Uint8Array }

export interface RasterGlyph { rgb: Uint8Array; alpha: Uint8Array; width: number; height: number }

export interface PdfOptions {
  titlePage?: boolean;
  header?: (pageIndex: number, label: string) => { left: string; center: string; right: string };
  footer?: (pageIndex: number, label: string) => { left: string; center: string; right: string };
  /** Draw glyphs no embedded font covers (emoji, CJK…) as small images. Browser only. */
  raster?: (grapheme: string) => RasterGlyph | null;
  /** Only these page indexes (for "print selected pages"). */
  pages?: number[];
  /** Watermark override (e.g. per-recipient copies). */
  watermark?: string;
  /** Sides: lines that do not belong to the selected scenes are crossed out. */
  strike?: (line: LayoutLine) => boolean;
  /** Extra line under the header (e.g. "Copia para Ana Díaz"). */
  stamp?: string;
}

const PT = 72;
const CH = 7.2;
const LINE = 12;
const BASE = 9.6;

export interface PdfResult { bytes: Uint8Array; pages: number; missing: string[] }

export async function scriptToPdf(p: Project, fonts: PdfFonts, opts: PdfOptions = {}): Promise<PdfResult> {
  const g = pageGeometry(p.page.paper);
  const W = g.widthIn * PT, H = g.heightIn * PT;
  const styles = resolveStyles(p);
  const tokens = localeTokens(p.locale);
  const layout = layoutProject(p);
  const doc = new PdfDoc({ title: p.title || 'ScriptlZ', author: p.titlePage.authors || p.author, subject: p.logline, creator: 'ScriptlZ' });
  const F = {
    r: doc.addFont('F1', fonts.regular), b: doc.addFont('F2', fonts.bold), i: doc.addFont('F3', fonts.italic), bi: doc.addFont('F4', fonts.boldItalic),
    fr: doc.addFont('F5', fonts.fallback), fb: doc.addFont('F6', fonts.fallbackBold),
  };
  const missing = new Set<string>();
  const rasterCache = new Map<string, ReturnType<PdfDoc['addImage']> | null>();
  const blockById = new Map<string, Block>(p.blocks.map((b) => [b.id, b]));
  const revSet = p.revisions.sets.find((s) => s.id === p.revisions.current);
  const knownSets = new Set(p.revisions.sets.map((s) => s.id));
  const x0 = g.marginLeft * PT;
  const rowTop = (row: number) => H - g.marginTop * PT - row * LINE;

  /** Draw a string at column `col` of the text area (or absolute x when `absX` is set). */
  const drawText = (page: PdfPage, text: string, col: number, row: number, style: { b: boolean; i: boolean; u: boolean; x?: boolean }, marksAt?: (idx: number) => { b: boolean; i: boolean; u: boolean; x: boolean }, absX?: number, baseY?: number) => {
    const y = baseY ?? rowTop(row) - BASE;
    let c = 0;
    const gs = graphemes(text);
    interface Run { font: FontHandle; gids: number[]; x: number; mono: boolean }
    let run: Run | null = null;
    const flush = () => { if (run && run.gids.length) page.glyphs(run.font, 12, run.x, y, run.gids); run = null; };
    const decos: { x1: number; x2: number; kind: 'u' | 'x' }[] = [];
    for (const gr of gs) {
      const st = marksAt ? marksAt(gr.s) : { b: false, i: false, u: false, x: false };
      const bold = style.b || st.b, ital = style.i || st.i, und = style.u || st.u, strike = !!style.x || st.x;
      const x = (absX ?? x0 + col * CH) + c * CH;
      const w = Math.max(1, gr.w) * CH;
      if (gr.t === ' ' || gr.t === '\t') {
        if (und || strike) decos.push({ x1: x, x2: x + w, kind: und ? 'u' : 'x' });
        flush(); c += gr.w; continue;
      }
      const primary = bold && ital ? F.bi : bold ? F.b : ital ? F.i : F.r;
      let font: FontHandle = primary;
      let gids = doc.shape(primary, gr.t);
      let mono = true;
      if (!gids) { font = bold ? F.fb : F.fr; gids = doc.shape(font, gr.t); mono = false; }
      if (!gids) {
        flush();
        let img = rasterCache.get(gr.t);
        if (img === undefined) {
          const r = opts.raster?.(gr.t) ?? null;
          img = r ? doc.addImage(r.rgb, r.width, r.height, r.alpha) : null;
          rasterCache.set(gr.t, img);
        }
        if (img) {
          const ih = 11.5, iw = Math.min(w, (img.width / img.height) * ih);
          page.image(img, x + (w - iw) / 2, y - 2.4, iw, ih);
        } else {
          missing.add(gr.t);
          const q = doc.shape(F.r, '?');
          if (q) page.glyphs(F.r, 12, x, y, q);
        }
        c += gr.w; continue;
      }
      if (und || strike) decos.push({ x1: x, x2: x + w, kind: und ? 'u' : 'x' });
      if (strike && und) decos.push({ x1: x, x2: x + w, kind: 'x' });
      if (!mono || gr.w !== 1 || gids.length !== 1) {
        // Fallback or wide glyphs: position individually so columns stay exact.
        flush();
        const adv = doc.advance(font, gids[0], 12);
        page.glyphs(font, 12, x + Math.max(0, (w - adv) / 2), y, gids);
      } else {
        if (!run || run.font !== font) { flush(); run = { font, gids: [], x, mono }; }
        run.gids.push(gids[0]);
      }
      c += gr.w;
    }
    flush();
    // Merge decoration spans.
    for (const kind of ['u', 'x'] as const) {
      const list = decos.filter((d) => d.kind === kind).sort((a, b) => a.x1 - b.x1);
      let cur: { x1: number; x2: number } | null = null;
      const draw = (d: { x1: number; x2: number }) => page.line(d.x1, kind === 'u' ? y - 1.6 : y + 3.6, d.x2, kind === 'u' ? y - 1.6 : y + 3.6, 0.6);
      for (const d of list) {
        if (cur && d.x1 <= cur.x2 + 0.5) cur.x2 = Math.max(cur.x2, d.x2);
        else { if (cur) draw(cur); cur = { ...d }; }
      }
      if (cur) draw(cur);
    }
  };

  const plainWidth = (s: string) => graphemes(s).reduce((a, x) => a + x.w, 0);

  const drawHF = (page: PdfPage, data: { left: string; center: string; right: string }, y: number) => {
    if (data.left) drawText(page, data.left, 0, 0, { b: false, i: false, u: false }, undefined, x0, y);
    if (data.center) drawText(page, data.center, 0, 0, { b: false, i: false, u: false }, undefined, x0 + (60 - plainWidth(data.center)) / 2 * CH, y);
    if (data.right) drawText(page, data.right, 0, 0, { b: false, i: false, u: false }, undefined, x0 + (60 - plainWidth(data.right)) * CH, y);
  };

  const watermark = opts.watermark ?? (p.page.watermark.enabled ? p.page.watermark.text : '');
  const drawWatermark = (page: PdfPage) => {
    if (!watermark) return;
    const gsKey = page.opacity(Math.max(0.03, Math.min(0.6, p.page.watermark.opacity || 0.12)));
    const size = Math.min(84, Math.max(28, 900 / Math.max(6, plainWidth(watermark))));
    const width = plainWidth(watermark) * size * 0.6;
    const gids: number[] = [];
    for (const gr of graphemes(upperSameLength(watermark))) { const x = doc.shape(F.b, gr.t) ?? doc.shape(F.fb, gr.t); if (x) gids.push(...x); }
    page.raw(`q /${gsKey} gs 0.35 g 1 0 0 1 ${(W / 2).toFixed(1)} ${(H / 2).toFixed(1)} cm 0.7071 0.7071 -0.7071 0.7071 0 0 cm`);
    page.glyphs(F.b, size, -width / 2, -size / 3, gids);
    page.raw('Q 0 g');
  };

  // ---- title page
  const tp = p.titlePage;
  let offset = 0;
  if ((opts.titlePage ?? tp.enabled) && (tp.title || p.title)) {
    const page = doc.page(W, H);
    offset = 1;
    drawWatermark(page);
    let row = 19;
    const center = (s: string, bold = false, underline = false) => {
      for (const ln of s.split('\n')) { drawText(page, ln, Math.max(0, Math.floor((60 - plainWidth(ln)) / 2)), row, { b: bold, i: false, u: underline }); row++; }
    };
    center(upperSameLength(tp.title || p.title), true);
    row += 2;
    if (tp.credit) { center(tp.credit); row += 1; }
    if (tp.authors || p.author) center(tp.authors || p.author);
    if (tp.source) { row += 2; center(tp.source); }
    const bottom = (lines: string[], right: boolean) => {
      let r = g.lines - lines.length;
      for (const ln of lines) { drawText(page, ln, right ? Math.max(0, 60 - plainWidth(ln)) : 0, r, { b: false, i: false, u: false }); r++; }
    };
    const left = [...(tp.contact ? tp.contact.split('\n') : []), ...(tp.copyright ? ['', ...tp.copyright.split('\n')] : [])];
    if (left.length) bottom(left, false);
    const right = [tp.draft, tp.date].filter(Boolean).join('\n');
    if (right) bottom(right.split('\n'), true);
    if (tp.notes) { row += 3; center(tp.notes); }
  }

  // ---- script pages
  const only = opts.pages ? new Set(opts.pages) : null;
  layout.pages.forEach((lp, pi) => {
    if (only && !only.has(pi)) return;
    const page = doc.page(W, H);
    const revisedHere = lp.lines.some((l) => { const b = blockById.get(l.blockId); return !!b?.rev && knownSets.has(b.rev); });
    if (p.page.revisionColorPages && revisedHere && revSet) {
      const hex = REV_HEX[revSet.color] ?? '#ffffff';
      const rgb: [number, number, number] = [parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255];
      page.rect(0, 0, W, H, rgb);
    }
    drawWatermark(page);
    const head = opts.header?.(pi, lp.label) ?? (pi === 0 && !p.page.firstPageHeader ? { left: '', center: '', right: '' } : { left: '', center: '', right: `${lp.label}.` });
    if (revisedHere && revSet && !head.left) head.left = `${revSet.name} ${revSet.date}`;
    drawHF(page, head, H - g.headerAt * PT - 4);
    const foot = opts.footer?.(pi, lp.label);
    if (foot) drawHF(page, foot, g.footerAt * PT);
    for (const line of lp.lines) drawLine(page, line, pi + offset);
    if (opts.stamp) drawText(page, opts.stamp, 0, 0, { b: false, i: true, u: false }, undefined, x0, g.footerAt * PT - 12);
    if (opts.strike) {
      // Cross out each run of foreign lines with a big X, the way sides are marked by hand.
      const rows = [...new Set(lp.lines.filter((l) => opts.strike!(l)).map((l) => l.row))].sort((a, b) => a - b);
      const runs: [number, number][] = [];
      for (const r of rows) { const last = runs[runs.length - 1]; if (last && r <= last[1] + 2) last[1] = r; else runs.push([r, r]); }
      for (const [a, b] of runs) {
        const top = rowTop(a) + 2, bot = rowTop(b) - LINE + 2, left = x0 - 6, right = x0 + 60 * CH + 6;
        page.line(left, top, right, bot, 0.9);
        page.line(left, bot, right, top, 0.9);
      }
    }
  });

  function drawLine(page: PdfPage, line: LayoutLine, pageNo: number) {
    const st: ElementStyle = styles[line.type] ?? styles.action;
    const b = blockById.get(line.blockId);
    if (line.kind !== 'text') {
      drawText(page, line.text, line.col, line.row, { b: false, i: false, u: false });
      return;
    }
    const marks = b?.marks;
    const textStart = line.textStart;
    const textLen = b ? (b.omitted ? tokens.omitted.length : b.text.length) : 0;
    const marksAt = (idx: number) => {
      const off = line.dStart + idx - textStart;
      const r = { b: false, i: false, u: false, x: false };
      if (!marks || off < 0 || off >= textLen) return r;
      for (const m of marks) if (m.s <= off && m.e > off) { if (m.k === 'b') r.b = true; else if (m.k === 'i') r.i = true; else if (m.k === 'u') r.u = true; else if (m.k === 'x') r.x = true; }
      return r;
    };
    drawText(page, line.text, line.col, line.row, { b: st.bold, i: st.italic, u: st.underline }, marksAt);
    const y = rowTop(line.row) - BASE;
    if (line.first && line.type === 'scene' && b) {
      const label = layout.sceneLabels.get(b.id) ?? '';
      const mode = p.page.sceneNumbers;
      if (label && (mode === 'left' || mode === 'both')) drawText(page, label, 0, line.row, { b: false, i: false, u: false }, undefined, x0 - (plainWidth(label) + 3) * CH);
      if (label && (mode === 'right' || mode === 'both')) drawText(page, label, 0, line.row, { b: false, i: false, u: false }, undefined, x0 + 63 * CH);
      doc.bookmark(`${label ? label + '. ' : ''}${upperSameLength(b.omitted ? tokens.omitted : b.text)}`.slice(0, 120), pageNo, rowTop(line.row) + 6);
    }
    if (b?.rev && knownSets.has(b.rev)) {
      const set = p.revisions.sets.find((s) => s.id === b.rev);
      const mark = set?.mark || '*';
      drawText(page, mark, 0, line.row, { b: true, i: false, u: false }, undefined, x0 + (line.type === 'scene' ? 67 : 64) * CH, y);
    }
  }

  const bytes = await doc.save();
  return { bytes, pages: doc.pages.length, missing: [...missing] };
}
