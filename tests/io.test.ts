import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, ok, eq } from './harness';
import { loadProject } from '../src/core/migrate';
import { parseFountain, toFountain } from '../src/io/fountain';
import { toFdx, parseFdx } from '../src/io/fdx';
import { toHtml, toMarkdown, toPlainText } from '../src/io/text';
import { scriptToPdf } from '../src/io/pdf/script';
import { layoutProject } from '../src/core/layout';

const fx = (n: string) => readFileSync(join(process.cwd(), 'tests/fixtures', n), 'utf8');
const big = loadProject(JSON.parse(fx('Prueba_Rendimiento_217_paginas.scriptz')));
const demo = loadProject(JSON.parse(fx('La_ultima_luz.scriptz')));
// Fountain/FDX do not preserve trailing whitespace inside a paragraph.
const strip = (bs: { type: string; text: string; dual?: unknown }[]) => bs.map((b) => [b.type, b.text.trimEnd(), b.dual ?? null]);

test('Fountain roundtrip is exact (217 pages)', () => {
  const src = toFountain(big.blocks, big.titlePage);
  const back = parseFountain(src);
  eq(strip(back.blocks), strip(big.blocks.filter((b) => !b.omitted)));
});

test('Fountain keeps emphasis and dual dialogue', () => {
  const doc = parseFountain('INT. CASA - DÍA\n\nMara *mira* **fijo** _al_ mar.\n\nMARA\nHola.\n\nTOMÁS ^\nChau.\n');
  const act = doc.blocks.find((b) => b.type === 'action')!;
  eq(act.text, 'Mara mira fijo al mar.');
  eq((act.marks ?? []).map((m) => m.k).sort(), ['b', 'i', 'u']);
  ok(doc.blocks.some((b) => b.dual), 'dual');
  const again = parseFountain(toFountain(doc.blocks));
  eq(strip(again.blocks), strip(doc.blocks));
});

test('Final Draft roundtrip is exact (217 pages)', () => {
  const xml = toFdx(big);
  const back = parseFdx(xml);
  eq(strip(back.blocks), strip(big.blocks.filter((b) => b.type !== 'note')));
});

test('Final Draft keeps title page and marks', () => {
  const xml = toFdx(demo);
  const back = parseFdx(xml);
  eq(back.title.title ?? '', demo.titlePage.title || demo.title);
  const withMarks = demo.blocks.filter((b) => b.marks?.some((m) => 'biu'.includes(m.k)));
  for (const b of withMarks) {
    const got = back.blocks.find((x) => x.text === b.text);
    ok(got, 'block present');
    eq((got!.marks ?? []).filter((m) => 'biu'.includes(m.k)).map((m) => [m.s, m.e, m.k]), b.marks!.filter((m) => 'biu'.includes(m.k)).map((m) => [m.s, m.e, m.k]));
  }
});

test('HTML, Markdown and plain text exports contain the script', () => {
  const html = toHtml(demo);
  ok(html.includes('<html') && html.includes(demo.blocks.find((b) => b.type === 'scene')!.text.toUpperCase().slice(0, 10)), 'html');
  ok(toMarkdown(demo).includes('#'), 'md');
  const txt = toPlainText(demo);
  ok(txt.split('\n').every((l) => [...l].length <= 80), 'txt widths');
});

test('PDF export: valid file with one page per layout page', async () => {
  const font = (f: string) => new Uint8Array(readFileSync(join(process.cwd(), 'src/assets/fonts', f)));
  const fonts = { regular: font('LiberationMono-Regular.ttf'), bold: font('LiberationMono-Bold.ttf'), italic: font('LiberationMono-Italic.ttf'), boldItalic: font('LiberationMono-BoldItalic.ttf'), fallback: font('DejaVuSansMono.ttf'), fallbackBold: font('DejaVuSansMono-Bold.ttf') };
  const t0 = performance.now();
  const r = await scriptToPdf(big, fonts as never, { titlePage: false });
  const ms = performance.now() - t0;
  const bytes: Uint8Array = (r as { bytes: Uint8Array }).bytes ?? (r as unknown as Uint8Array);
  const head = new TextDecoder().decode(bytes.slice(0, 8));
  ok(head.startsWith('%PDF-'), 'header ' + head);
  const pages = (new TextDecoder('latin1').decode(bytes).match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  eq(pages, layoutProject(big).pages.length, 'page count');
  ok(ms < 4000, 'pdf too slow ' + ms);
});
