// Export pipeline: format → bytes → save dialog.
import { officialProject } from '../core/suggest';
import { translatedProject, bilingualHtml } from '../core/translation';
import type { Project } from '../core/model';
import { saveFile, type FileFilter } from '../platform';
import { toast } from '../app/store';
import { serializeProject } from '../core/migrate';
import { toFountain } from './fountain';
import { toFdx } from './fdx';
import { toDocx } from './docx';
import { toEpub, toHtml, toMarkdown, toPlainText } from './text';
import { headerFooterFor } from '../views/write/EditorHost';
import { t } from '../i18n';
import type { PdfFonts, RasterGlyph } from './pdf/script';
import regularUrl from '../assets/fonts/CourierPrime-Regular.ttf';
import boldUrl from '../assets/fonts/CourierPrime-Bold.ttf';
import italicUrl from '../assets/fonts/CourierPrime-Italic.ttf';
import boldItalicUrl from '../assets/fonts/CourierPrime-BoldItalic.ttf';
import fallbackUrl from '../assets/fonts/DejaVuSansMono.ttf';
import fallbackBoldUrl from '../assets/fonts/DejaVuSansMono-Bold.ttf';

export type ExportFormat = 'pdf' | 'fdx' | 'fountain' | 'docx' | 'html' | 'epub' | 'md' | 'txt' | 'scriptz' | 'bilingual';

export const FORMAT_EXT: Record<ExportFormat, string> = { pdf: 'pdf', fdx: 'fdx', fountain: 'fountain', docx: 'docx', html: 'html', epub: 'epub', md: 'md', txt: 'txt', scriptz: 'scriptz', bilingual: 'html' };

export interface ExportOptions {
  titlePage?: boolean;
  watermark?: string;
  pages?: number[];
  docxMode?: 'flow' | 'exact';
  includeNotes?: boolean;
  /** Export the translation instead of the original. */
  version?: 'original' | 'translation';
  /** One personalized PDF per name (watermark + stamp), delivered as a zip. */
  recipients?: string[];
  /** Internal: recipient for this copy. */
  stamp?: string;
}

let fontCache: Promise<PdfFonts> | null = null;
export function loadPdfFonts(): Promise<PdfFonts> {
  const get = async (u: string) => new Uint8Array(await (await fetch(u)).arrayBuffer());
  return (fontCache ??= (async () => {
    const [regular, bold, italic, boldItalic, fallback, fallbackBold] = await Promise.all([regularUrl, boldUrl, italicUrl, boldItalicUrl, fallbackUrl, fallbackBoldUrl].map(get));
    return { regular, bold, italic, boldItalic, fallback, fallbackBold };
  })());
}

/** Draw a grapheme (emoji, CJK, Arabic…) with the system's fonts into a small RGBA bitmap. */
export function rasterGlyph(g: string): RasterGlyph | null {
  try {
    const size = 64;
    const c = document.createElement('canvas');
    c.width = size * 2; c.height = size;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.font = `${Math.round(size * 0.78)}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji","Segoe UI Symbol","Noto Sans CJK JP","Microsoft YaHei","Arial Unicode MS",sans-serif`;
    ctx.textBaseline = 'alphabetic';
    const w = Math.min(c.width, Math.max(8, Math.ceil(ctx.measureText(g).width)));
    ctx.fillStyle = '#000';
    ctx.fillText(g, 0, Math.round(size * 0.8));
    const img = ctx.getImageData(0, 0, w, size);
    const rgb = new Uint8Array(w * size * 3), alpha = new Uint8Array(w * size);
    let any = false;
    for (let i = 0; i < w * size; i++) {
      rgb[i * 3] = img.data[i * 4]; rgb[i * 3 + 1] = img.data[i * 4 + 1]; rgb[i * 3 + 2] = img.data[i * 4 + 2];
      alpha[i] = img.data[i * 4 + 3];
      if (alpha[i]) any = true;
    }
    return any ? { rgb, alpha, width: w, height: size } : null;
  } catch { return null; }
}

export async function buildExport(p0: Project, format: ExportFormat, o: ExportOptions = {}): Promise<{ data: Uint8Array | string; missing?: string[] }> {
  // Pending suggestions are proposals, not part of the script yet.
  const p = o.version === 'translation' ? translatedProject(p0) : officialProject(p0);
  const proj = o.titlePage === undefined ? p : { ...p, titlePage: { ...p.titlePage, enabled: o.titlePage } };
  switch (format) {
    case 'pdf': {
      const { scriptToPdf } = await import('./pdf/script');
      const r = await scriptToPdf(proj, await loadPdfFonts(), {
        titlePage: proj.titlePage.enabled,
        header: (i, l) => headerFooterFor(proj, 'header', i, l),
        footer: (i, l) => headerFooterFor(proj, 'footer', i, l),
        raster: typeof document !== 'undefined' ? rasterGlyph : undefined,
        pages: o.pages,
        watermark: o.watermark,
        stamp: o.stamp,
      });
      return { data: r.bytes, missing: r.missing };
    }
    case 'fdx': return { data: toFdx(proj, { includeNotes: o.includeNotes }) };
    case 'fountain': return { data: toFountain(o.includeNotes ? proj.blocks : proj.blocks.filter((b) => b.type !== 'note'), proj.titlePage.enabled ? { ...proj.titlePage, title: proj.titlePage.title || proj.title, authors: proj.titlePage.authors || proj.author } : undefined) };
    case 'docx': return { data: await toDocx(proj, o.docxMode ?? 'flow') };
    case 'html': return { data: toHtml(proj, { header: (i, l) => headerFooterFor(proj, 'header', i, l) }) };
    case 'epub': return { data: await toEpub(proj) };
    case 'md': return { data: toMarkdown(proj) };
    case 'txt': return { data: toPlainText(proj) };
    case 'scriptz': return { data: serializeProject(p) };
    case 'bilingual': return { data: bilingualHtml(p0, { original: t('tr.original'), translation: t('tr.translation') }) };
  }
}

export function fileName(p: Project, ext: string): string {
  return `${(p.title || 'guion').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'guion'}.${ext}`;
}

export async function exportProject(p: Project, format: ExportFormat, o: ExportOptions = {}): Promise<boolean> {
  try {
    const names = (o.recipients ?? []).map((n) => n.trim()).filter(Boolean);
    if (format === 'pdf' && names.length) return await exportCopies(p, names, o);
    const { data, missing } = await buildExport(p, format, o);
    const ext = FORMAT_EXT[format];
    const filters: FileFilter[] = [{ name: format.toUpperCase(), extensions: [ext] }];
    const saved = await saveFile(fileName(p, ext), data, filters);
    if (!saved) return false;
    toast(t('ex.saved', { name: saved.split(/[\\/]/).pop() ?? saved }), 'success');
    if (missing?.length) toast(t('ex.missingGlyphs', { chars: missing.slice(0, 12).join(' ') }), 'info', undefined, 8000);
    return true;
  } catch (e) {
    toast(t('err.generic', { msg: String((e as Error)?.message ?? e) }), 'error');
    return false;
  }
}

/** Personalized copies: each PDF carries its recipient in the watermark and on every page. */
async function exportCopies(p: Project, names: string[], o: ExportOptions): Promise<boolean> {
  const { writeZip } = await import('./zip');
  const files: { name: string; data: Uint8Array }[] = [];
  const base = fileName(p, 'pdf').replace(/\.pdf$/, '');
  const used = new Set<string>();
  for (const name of names) {
    const label = t('ex.copyFor', { name });
    const { data } = await buildExport(p, 'pdf', { ...o, recipients: undefined, watermark: (o.watermark ? o.watermark + ' · ' : '') + name, stamp: label });
    let fn = `${base} - ${name.replace(/[\\/:*?"<>|]+/g, '_')}.pdf`;
    for (let k = 2; used.has(fn); k++) fn = `${base} - ${name} (${k}).pdf`;
    used.add(fn);
    files.push({ name: fn, data: data as Uint8Array });
  }
  const zip = await writeZip(files);
  const saved = await saveFile(`${base} - ${t('ex.copies')}.zip`, zip, [{ name: 'ZIP', extensions: ['zip'] }]);
  if (!saved) return false;
  toast(t('ex.copiesSaved', { n: names.length }), 'success');
  return true;
}

export async function exportSides(p: Project, sceneIds: string[], title: string): Promise<boolean> {
  try {
    const { buildSides } = await import('./sides');
    const data = await buildSides(p, { sceneIds, title });
    const base = fileName(p, 'pdf').replace(/\.pdf$/, '');
    const extra = title.replace(/[\\/:*?"<>|]+/g, '_').replace(p.title, '').replace(/^[\s·-]+/, '').trim();
    const saved = await saveFile(`${base} - Sides${extra ? ' - ' + extra : ''}.pdf`, data, [{ name: 'PDF', extensions: ['pdf'] }]);
    if (!saved) return false;
    toast(t('ex.saved', { name: saved.split(/[\\/]/).pop() ?? saved }), 'success');
    return true;
  } catch (e) {
    toast(t('err.generic', { msg: String((e as Error)?.message ?? e) }), 'error');
    return false;
  }
}

export async function exportScriptz(p: Project): Promise<void> { await exportProject(p, 'scriptz'); }

/** Print through the browser's print dialog (exact pages, same layout as the PDF). */
export async function printProject(p0: Project): Promise<void> {
  const p = officialProject(p0);
  const html = toHtml(p, { forPrint: true, header: (i, l) => headerFooterFor(p, 'header', i, l) });
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0';
  document.body.appendChild(frame);
  const doc = frame.contentDocument!;
  doc.open(); doc.write(html); doc.close();
  await new Promise((r) => setTimeout(r, 350));
  try { frame.contentWindow!.focus(); frame.contentWindow!.print(); }
  catch { toast(t('ex.printFallback'), 'info'); await exportProject(p, 'pdf'); }
  setTimeout(() => frame.remove(), 60000);
}

export function csvEscape(v: string | number): string {
  const s = String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function saveCsv(name: string, rows: (string | number)[][]): Promise<void> {
  const csv = '﻿' + rows.map((r) => r.map(csvEscape).join(',')).join('\r\n');
  const saved = await saveFile(name, csv, [{ name: 'CSV', extensions: ['csv'] }]);
  if (saved) toast(t('ex.saved', { name: saved.split(/[\\/]/).pop() ?? saved }), 'success');
}

export { toFountain };
