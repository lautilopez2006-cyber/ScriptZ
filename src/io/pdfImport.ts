// Screenplay PDF import: recovers elements from text positions (indentation), page by page.
import { block, type Block, type ElementType, type TitlePage } from '../core/model';
import { isSceneHeadingText } from '../core/scenes';

export interface PdfLine { page: number; x: number; y: number; text: string; size: number }

export async function extractPdfLines(bytes: Uint8Array): Promise<PdfLine[]> {
  const pdfjs = await import('pdfjs-dist');
  // Run the parser on the main thread ("fake worker"): no worker file to configure.
  await import('pdfjs-dist/build/pdf.worker.min.mjs');
  const doc = await pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false, useSystemFonts: false, disableFontFace: true } as unknown as Parameters<typeof pdfjs.getDocument>[0]).promise;
  const lines: PdfLine[] = [];
  for (let pn = 1; pn <= doc.numPages; pn++) {
    const page = await doc.getPage(pn);
    const tc = await page.getTextContent();
    const items = (tc.items as { str: string; transform: number[]; width: number }[]).filter((it) => typeof it.str === 'string');
    const rows = new Map<number, { x: number; str: string; w: number; size: number }[]>();
    for (const it of items) {
      if (!it.str) continue;
      const y = Math.round(it.transform[5] / 2) * 2;
      const size = Math.abs(it.transform[3]) || 12;
      const arr = rows.get(y) ?? [];
      arr.push({ x: it.transform[4], str: it.str, w: it.width, size });
      rows.set(y, arr);
    }
    for (const [y, arr] of [...rows.entries()].sort((a, b) => b[0] - a[0])) {
      arr.sort((a, b) => a.x - b.x);
      let text = '';
      let end = arr[0].x;
      const cw = (arr[0].size || 12) * 0.6;
      for (const it of arr) {
        const gap = it.x - end;
        if (text && gap > cw * 0.5) text += ' '.repeat(Math.max(1, Math.round(gap / cw)));
        text += it.str;
        end = it.x + (it.w || it.str.length * cw);
      }
      if (text.trim()) lines.push({ page: pn, x: arr[0].x, y, text: text.replace(/\s+$/, ''), size: arr[0].size });
    }
  }
  return lines;
}

export function linesToScript(lines: PdfLine[]): { blocks: Block[]; title: Partial<TitlePage> } {
  if (!lines.length) return { blocks: [block('scene', '')], title: {} };
  const cw = (lines[0].size || 12) * 0.6;
  // Left text margin: most common x among lines that look like action/headings.
  const hist = new Map<number, number>();
  for (const l of lines) { const k = Math.round(l.x / 3) * 3; hist.set(k, (hist.get(k) ?? 0) + 1); }
  const base = Math.min(...[...hist.entries()].filter(([, n]) => n >= Math.max(3, lines.length * 0.05)).map(([x]) => x).concat([Math.min(...lines.map((l) => l.x))]));
  const pagesWithScenes = new Set(lines.filter((l) => isSceneHeadingText(l.text.trim())).map((l) => l.page));
  const title: Partial<TitlePage> = {};
  // Title page: page 1 without scene headings.
  let skipPage = 0;
  if (!pagesWithScenes.has(1) && pagesWithScenes.size) {
    skipPage = 1;
    const tl = lines.filter((l) => l.page === 1);
    const maxY = Math.max(...tl.map((l) => l.y));
    const minY = Math.min(...tl.map((l) => l.y));
    const mid = (maxY + minY) / 2;
    const top = tl.filter((l) => l.y >= mid);
    const bottom = tl.filter((l) => l.y < mid);
    if (top[0]) title.title = top[0].text.trim();
    if (top.length > 1) {
      const by = top.findIndex((l) => /^(written by|by|escrit[oa] por|guion de|guión de|roteiro de)$/i.test(l.text.trim()));
      if (by >= 0) { title.credit = top[by].text.trim(); title.authors = top.slice(by + 1).map((l) => l.text.trim()).join('\n'); }
      else title.authors = top.slice(1).map((l) => l.text.trim()).join('\n');
    }
    if (bottom.length) title.contact = bottom.map((l) => l.text.trim()).join('\n');
  }
  const blocks: Block[] = [];
  let prev: { type: ElementType; y: number; page: number } | null = null;
  const lineGap = (lines[0].size || 12) * 1.05;
  for (const l of lines) {
    if (l.page === skipPage) continue;
    const raw = l.text;
    const t = raw.trim();
    const col = Math.round((l.x - base) / cw);
    // Page furniture
    if (/^\d+[A-Z]{0,2}\.?$/.test(t) && (col > 40 || col < -3)) continue;
    if (/^\((MORE|MÁS|SIGUE|CONTINUA)\)$/i.test(t)) continue;
    if (/^(CONTINUED|CONTINÚA|CONTINUA)[:.]?$/i.test(t) || /^\(CONTINUED\)$/i.test(t)) continue;
    // Scene numbers printed in the margins: strip "12 INT. HOUSE - DAY 12".
    let text = t.replace(/^\d+[A-Z]{0,2}\s{2,}/, '').replace(/\s{2,}\d+[A-Z]{0,2}$/, '');
    const upper = text === text.toUpperCase() && /\p{L}/u.test(text);
    let type: ElementType;
    if (isSceneHeadingText(text) && col <= 3) type = 'scene';
    else if (col >= 34 && upper && /(:|\.)$/.test(text)) type = 'transition';
    else if (col >= 18 && col <= 34 && upper && !/[.!?]$/.test(text.replace(/\(.*\)/, '').trim())) type = 'character';
    else if (col >= 12 && col < 22 && /^\(/.test(text)) type = 'parenthetical';
    else if (col >= 7 && col < 20) type = 'dialogue';
    else type = 'action';
    if (type === 'character') text = text.replace(/\s*\((CONT'D|CONT\.|CONT|CONTD|CONTINUING)\)\s*$/i, '');
    const contiguous = prev && prev.page === l.page && Math.abs(prev.y - l.y) <= lineGap * 1.2;
    const last = blocks[blocks.length - 1];
    // Continuation lines of the same paragraph.
    if (contiguous && last && prev && (prev.type === type || (prev.type === 'parenthetical' && type === 'dialogue' && !/\)$/.test(last.text))) && type !== 'character' && type !== 'scene') {
      if (prev.type === 'parenthetical' && !/\)$/.test(last.text)) { last.text += ' ' + text; prev = { type: 'parenthetical', y: l.y, page: l.page }; continue; }
      if (type === prev.type && (type === 'action' || type === 'dialogue' || type === 'transition' || type === 'parenthetical')) { last.text += ' ' + text; prev = { type, y: l.y, page: l.page }; continue; }
    }
    // Dialogue continued on the next page after a (CONT'D) cue: merge into previous speech.
    if (type === 'character' && last && blocks.length >= 2 && prev && prev.page !== l.page) {
      const prevChar = [...blocks].reverse().find((b) => b.type === 'character');
      if (prevChar && prevChar.text === text && last.type === 'dialogue') { prev = { type: 'character-cont' as ElementType, y: l.y, page: l.page }; continue; }
    }
    if ((prev?.type as string) === 'character-cont' && type === 'dialogue' && last?.type === 'dialogue') { last.text += ' ' + text; prev = { type: 'dialogue', y: l.y, page: l.page }; continue; }
    blocks.push(block(type, text));
    prev = { type, y: l.y, page: l.page };
  }
  return { blocks: blocks.length ? blocks : [block('scene', '')], title };
}

export async function parsePdfScript(bytes: Uint8Array) {
  return linesToScript(await extractPdfLines(bytes));
}
