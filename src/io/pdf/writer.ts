// Low-level PDF writer: Unicode text with embedded TrueType subsets (Type0/Identity-H), images, outlines.
import { deflateRaw } from '../zip';
import { parseTtf, subsetTtf, glyphFor, type TtfFont } from './ttf';

function adler32(d: Uint8Array): number {
  let a = 1, b = 0;
  for (let i = 0; i < d.length; i++) { a = (a + d[i]) % 65521; b = (b + a) % 65521; }
  return ((b << 16) | a) >>> 0;
}

async function zlib(data: Uint8Array): Promise<Uint8Array | null> {
  const raw = await deflateRaw(data);
  if (!raw) return null;
  const out = new Uint8Array(raw.length + 6);
  out[0] = 0x78; out[1] = 0x9c;
  out.set(raw, 2);
  const ad = adler32(data);
  out[out.length - 4] = ad >>> 24; out[out.length - 3] = (ad >>> 16) & 255; out[out.length - 2] = (ad >>> 8) & 255; out[out.length - 1] = ad & 255;
  return out;
}

const enc = new TextEncoder();

export function pdfString(s: string): string {
  // UTF-16BE with BOM, hex encoded: safe for any metadata text.
  let hex = 'FEFF';
  for (let i = 0; i < s.length; i++) hex += s.charCodeAt(i).toString(16).padStart(4, '0');
  return `<${hex}>`;
}

export interface FontHandle { key: string; font: TtfFont; used: Map<number, string> }

export interface ImageHandle { key: string; width: number; height: number; rgb: Uint8Array; alpha?: Uint8Array }

interface OutlineItem { title: string; page: number; y: number }

export class PdfPage {
  ops: string[] = [];
  fonts = new Set<string>();
  images = new Set<string>();
  gstates = new Set<string>();
  constructor(public width: number, public height: number) {}
  /** Text using glyph ids of an embedded font. */
  glyphs(f: FontHandle, size: number, x: number, y: number, gids: number[]): void {
    if (!gids.length) return;
    this.fonts.add(f.key);
    let hex = '';
    for (const g of gids) hex += g.toString(16).padStart(4, '0');
    this.ops.push(`BT /${f.key} ${size} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td <${hex}> Tj ET`);
  }
  line(x1: number, y1: number, x2: number, y2: number, w = 0.6, gray = 0): void {
    this.ops.push(`${gray} G ${w} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`);
  }
  rect(x: number, y: number, w: number, h: number, rgb: [number, number, number]): void {
    this.ops.push(`${rgb.map((v) => v.toFixed(3)).join(' ')} rg ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f 0 g`);
  }
  image(img: ImageHandle, x: number, y: number, w: number, h: number): void {
    this.images.add(img.key);
    this.ops.push(`q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /${img.key} Do Q`);
  }
  raw(op: string): void { this.ops.push(op); }
  opacity(alpha: number): string {
    const key = 'GS' + Math.round(alpha * 100);
    this.gstates.add(key);
    return key;
  }
}

export class PdfDoc {
  pages: PdfPage[] = [];
  private fonts = new Map<string, FontHandle>();
  private images = new Map<string, ImageHandle>();
  private outline: OutlineItem[] = [];
  constructor(private info: { title: string; author: string; subject?: string; creator?: string }) {}

  addFont(key: string, bytes: Uint8Array): FontHandle {
    const h: FontHandle = { key, font: parseTtf(bytes), used: new Map() };
    this.fonts.set(key, h);
    return h;
  }

  /** Map a grapheme to glyph ids in `f`, or null if any code point is missing. */
  shape(f: FontHandle, grapheme: string): number[] | null {
    const out: number[] = [];
    for (const ch of grapheme) {
      const cp = ch.codePointAt(0)!;
      if (cp === 0xfe0f || cp === 0xfe0e || cp === 0x200d) continue;
      const g = glyphFor(f.font, cp);
      if (!g) return null;
      out.push(g);
      if (!f.used.has(g)) f.used.set(g, ch);
    }
    if (out.length > 1) {
      // Attribute the whole cluster to the first glyph for text extraction.
      f.used.set(out[0], grapheme);
    }
    return out;
  }

  advance(f: FontHandle, gid: number, size: number): number { return (f.font.advances[gid] / f.font.unitsPerEm) * size; }

  addImage(rgb: Uint8Array, width: number, height: number, alpha?: Uint8Array): ImageHandle {
    const key = 'Im' + (this.images.size + 1);
    const h: ImageHandle = { key, width, height, rgb, alpha };
    this.images.set(key, h);
    return h;
  }

  page(width: number, height: number): PdfPage {
    const p = new PdfPage(width, height);
    this.pages.push(p);
    return p;
  }

  bookmark(title: string, pageIndex: number, y: number): void { this.outline.push({ title, page: pageIndex, y }); }

  async save(): Promise<Uint8Array> {
    const objs: (Uint8Array | string)[] = [];
    const alloc = () => { objs.push(''); return objs.length; };
    const set = (n: number, v: Uint8Array | string) => { objs[n - 1] = v; };
    const stream = async (dict: string, data: Uint8Array, compress = true): Promise<Uint8Array> => {
      let body = data;
      let filter = '';
      if (compress) { const z = await zlib(data); if (z && z.length < data.length) { body = z; filter = ' /Filter /FlateDecode'; } }
      const head = enc.encode(`<< ${dict} /Length ${body.length}${filter} >>\nstream\n`);
      const tail = enc.encode('\nendstream');
      const out = new Uint8Array(head.length + body.length + tail.length);
      out.set(head); out.set(body, head.length); out.set(tail, head.length + body.length);
      return out;
    };
    const catalog = alloc();
    const pagesObj = alloc();
    const infoObj = alloc();
    // Fonts
    const fontRefs = new Map<string, number>();
    for (const f of this.fonts.values()) {
      if (!f.used.size) continue;
      const type0 = alloc(), cid = alloc(), desc = alloc(), file = alloc(), tounicode = alloc();
      fontRefs.set(f.key, type0);
      const tag = 'SZ' + String.fromCharCode(65 + (fontRefs.size % 26)) + 'AAAA+';
      const name = tag.slice(0, 7) + f.font.postScriptName;
      const scale = 1000 / f.font.unitsPerEm;
      const gids = [...f.used.keys()].sort((a, b) => a - b);
      const w = gids.map((g) => `${g} [${Math.round(f.font.advances[g] * scale)}]`).join(' ');
      set(type0, `<< /Type /Font /Subtype /Type0 /BaseFont /${name} /Encoding /Identity-H /DescendantFonts [${cid} 0 R] /ToUnicode ${tounicode} 0 R >>`);
      set(cid, `<< /Type /Font /Subtype /CIDFontType2 /BaseFont /${name} /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ${desc} 0 R /CIDToGIDMap /Identity /DW ${Math.round(f.font.advances[gids[0] ?? 0] * scale)} /W [${w}] >>`);
      const b = f.font.bbox.map((v) => Math.round(v * scale));
      set(desc, `<< /Type /FontDescriptor /FontName /${name} /Flags ${f.font.flags} /FontBBox [${b.join(' ')}] /ItalicAngle ${f.font.italicAngle} /Ascent ${Math.round(f.font.ascent * scale)} /Descent ${Math.round(f.font.descent * scale)} /CapHeight ${Math.round(f.font.capHeight * scale)} /StemV 80 /FontFile2 ${file} 0 R >>`);
      const sub = subsetTtf(f.font, gids);
      set(file, await stream(`/Length1 ${sub.length}`, sub));
      // ToUnicode CMap
      const lines: string[] = [];
      const entries = gids.map((g) => {
        const s = f.used.get(g) ?? '';
        let hex = '';
        for (let i = 0; i < s.length; i++) hex += s.charCodeAt(i).toString(16).padStart(4, '0');
        return `<${g.toString(16).padStart(4, '0')}> <${hex || '0020'}>`;
      });
      for (let i = 0; i < entries.length; i += 100) lines.push(`${Math.min(100, entries.length - i)} beginbfchar\n${entries.slice(i, i + 100).join('\n')}\nendbfchar`);
      const cmap = `/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n${lines.join('\n')}\nendcmap\nCMapName currentdict /CMap defineresource pop\nend\nend`;
      set(tounicode, await stream('', enc.encode(cmap)));
    }
    // Images
    const imageRefs = new Map<string, number>();
    for (const im of this.images.values()) {
      const n = alloc();
      imageRefs.set(im.key, n);
      let smask = '';
      if (im.alpha) {
        const m = alloc();
        set(m, await stream(`/Type /XObject /Subtype /Image /Width ${im.width} /Height ${im.height} /ColorSpace /DeviceGray /BitsPerComponent 8`, im.alpha));
        smask = ` /SMask ${m} 0 R`;
      }
      set(n, await stream(`/Type /XObject /Subtype /Image /Width ${im.width} /Height ${im.height} /ColorSpace /DeviceRGB /BitsPerComponent 8${smask}`, im.rgb));
    }
    // Pages
    const pageRefs: number[] = [];
    for (const p of this.pages) {
      const po = alloc(), co = alloc();
      pageRefs.push(po);
      const fontsDict = [...p.fonts].filter((k) => fontRefs.has(k)).map((k) => `/${k} ${fontRefs.get(k)} 0 R`).join(' ');
      const imgDict = [...p.images].map((k) => `/${k} ${imageRefs.get(k)} 0 R`).join(' ');
      const gsDict = [...p.gstates].map((k) => `/${k} << /Type /ExtGState /ca ${(Number(k.slice(2)) / 100).toFixed(2)} /CA ${(Number(k.slice(2)) / 100).toFixed(2)} >>`).join(' ');
      set(po, `<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${p.width.toFixed(2)} ${p.height.toFixed(2)}] /Resources << /Font << ${fontsDict} >> /XObject << ${imgDict} >> /ExtGState << ${gsDict} >> >> /Contents ${co} 0 R >>`);
      set(co, await stream('', enc.encode(p.ops.join('\n'))));
    }
    set(pagesObj, `<< /Type /Pages /Kids [${pageRefs.map((r) => `${r} 0 R`).join(' ')}] /Count ${pageRefs.length} >>`);
    // Outline (scene bookmarks)
    let outlineRef = 0;
    if (this.outline.length) {
      outlineRef = alloc();
      const items = this.outline.map(() => alloc());
      this.outline.forEach((o, i) => {
        const dest = `[${pageRefs[o.page]} 0 R /XYZ 0 ${o.y.toFixed(1)} 0]`;
        set(items[i], `<< /Title ${pdfString(o.title)} /Parent ${outlineRef} 0 R${i > 0 ? ` /Prev ${items[i - 1]} 0 R` : ''}${i < items.length - 1 ? ` /Next ${items[i + 1]} 0 R` : ''} /Dest ${dest} >>`);
      });
      set(outlineRef, `<< /Type /Outlines /First ${items[0]} 0 R /Last ${items[items.length - 1]} 0 R /Count ${items.length} >>`);
    }
    set(catalog, `<< /Type /Catalog /Pages ${pagesObj} 0 R${outlineRef ? ` /Outlines ${outlineRef} 0 R /PageMode /UseOutlines` : ''} /ViewerPreferences << /DisplayDocTitle true >> >>`);
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const date = `D:${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
    set(infoObj, `<< /Title ${pdfString(this.info.title)} /Author ${pdfString(this.info.author)} /Subject ${pdfString(this.info.subject ?? '')} /Creator ${pdfString(this.info.creator ?? 'ScriptZ')} /Producer ${pdfString('ScriptZ')} /CreationDate (${date}) >>`);
    // Serialise
    const chunks: Uint8Array[] = [enc.encode('%PDF-1.7\n%âãÏÓ\n')];
    const offsets: number[] = [];
    let pos = chunks[0].length;
    objs.forEach((o, i) => {
      offsets.push(pos);
      const head = enc.encode(`${i + 1} 0 obj\n`);
      const body = typeof o === 'string' ? enc.encode(o) : o;
      const tail = enc.encode('\nendobj\n');
      chunks.push(head, body, tail);
      pos += head.length + body.length + tail.length;
    });
    const xref = [`xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`, ...offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`)].join('');
    chunks.push(enc.encode(xref + `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R /Info ${infoObj} 0 R >>\nstartxref\n${pos}\n%%EOF\n`));
    const total = chunks.reduce((a, c) => a + c.length, 0);
    const out = new Uint8Array(total);
    let o = 0;
    for (const c of chunks) { out.set(c, o); o += c.length; }
    return out;
  }
}
