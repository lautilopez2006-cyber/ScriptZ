// TrueType reader + glyph subsetter (keeps glyph ids; unused glyphs become empty).

export interface TtfFont {
  bytes: Uint8Array;
  tables: Map<string, { off: number; len: number }>;
  unitsPerEm: number;
  ascent: number;
  descent: number;
  capHeight: number;
  numGlyphs: number;
  bbox: [number, number, number, number];
  italicAngle: number;
  flags: number;
  postScriptName: string;
  advances: Uint16Array;
  /** Unicode code point → glyph id. */
  cmap: Map<number, number>;
  locaLong: boolean;
}

const u16 = (d: DataView, o: number) => d.getUint16(o);
const i16 = (d: DataView, o: number) => d.getInt16(o);
const u32 = (d: DataView, o: number) => d.getUint32(o);

export function parseTtf(bytes: Uint8Array): TtfFont {
  const d = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const numTables = u16(d, 4);
  const tables = new Map<string, { off: number; len: number }>();
  for (let i = 0; i < numTables; i++) {
    const p = 12 + i * 16;
    const tag = String.fromCharCode(bytes[p], bytes[p + 1], bytes[p + 2], bytes[p + 3]);
    tables.set(tag, { off: u32(d, p + 8), len: u32(d, p + 12) });
  }
  const t = (tag: string) => { const x = tables.get(tag); if (!x) throw new Error('ttf: missing ' + tag); return x.off; };
  const head = t('head');
  const unitsPerEm = u16(d, head + 18);
  const bbox: [number, number, number, number] = [i16(d, head + 36), i16(d, head + 38), i16(d, head + 40), i16(d, head + 42)];
  const locaLong = i16(d, head + 50) === 1;
  const hhea = t('hhea');
  const ascent = i16(d, hhea + 4);
  const descent = i16(d, hhea + 6);
  const numHMetrics = u16(d, hhea + 34);
  const numGlyphs = u16(d, t('maxp') + 4);
  const hmtx = t('hmtx');
  const advances = new Uint16Array(numGlyphs);
  let last = 0;
  for (let g = 0; g < numGlyphs; g++) {
    if (g < numHMetrics) last = u16(d, hmtx + g * 4);
    advances[g] = last;
  }
  let capHeight = Math.round(ascent * 0.7);
  let flags = 32;
  const os2 = tables.get('OS/2');
  if (os2 && os2.len >= 90) {
    const v = u16(d, os2.off);
    if (v >= 2) capHeight = i16(d, os2.off + 88);
  }
  let italicAngle = 0;
  const post = tables.get('post');
  if (post) {
    italicAngle = d.getInt32(post.off + 4) / 65536;
    if (u32(d, post.off + 12)) flags |= 1; // fixed pitch
  }
  if (italicAngle) flags |= 64;
  // cmap: prefer format 12 (full Unicode), then format 4.
  const cmap = new Map<number, number>();
  const c = t('cmap');
  const n = u16(d, c + 2);
  let best = -1, bestFmt = 0;
  for (let i = 0; i < n; i++) {
    const pid = u16(d, c + 4 + i * 8), eid = u16(d, c + 6 + i * 8), off = u32(d, c + 8 + i * 8);
    const fmt = u16(d, c + off);
    const ok = (pid === 3 && (eid === 1 || eid === 10)) || pid === 0;
    if (!ok) continue;
    if (fmt === 12 && bestFmt !== 12) { best = c + off; bestFmt = 12; }
    else if (fmt === 4 && !bestFmt) { best = c + off; bestFmt = 4; }
  }
  if (best >= 0 && bestFmt === 4) {
    const segX2 = u16(d, best + 6);
    const segs = segX2 / 2;
    const ends = best + 14, starts = ends + segX2 + 2, deltas = starts + segX2, ranges = deltas + segX2;
    for (let s = 0; s < segs; s++) {
      const end = u16(d, ends + s * 2), start = u16(d, starts + s * 2), delta = i16(d, deltas + s * 2), ro = u16(d, ranges + s * 2);
      for (let cp = start; cp <= end && cp !== 0xffff; cp++) {
        let g: number;
        if (!ro) g = (cp + delta) & 0xffff;
        else {
          const gi = ranges + s * 2 + ro + (cp - start) * 2;
          g = u16(d, gi);
          if (g) g = (g + delta) & 0xffff;
        }
        if (g) cmap.set(cp, g);
      }
    }
  } else if (best >= 0 && bestFmt === 12) {
    const groups = u32(d, best + 12);
    for (let i = 0; i < groups; i++) {
      const p = best + 16 + i * 12;
      const s = u32(d, p), e = u32(d, p + 4), g0 = u32(d, p + 8);
      for (let cp = s; cp <= e && cp - s < 70000; cp++) cmap.set(cp, g0 + (cp - s));
    }
  }
  // PostScript name (name id 6).
  let postScriptName = 'ScriptZFont';
  const name = tables.get('name');
  if (name) {
    const count = u16(d, name.off + 2), strOff = name.off + u16(d, name.off + 4);
    for (let i = 0; i < count; i++) {
      const r = name.off + 6 + i * 12;
      if (u16(d, r + 6) !== 6) continue;
      const pid = u16(d, r), len = u16(d, r + 8), off = u16(d, r + 10);
      const raw = bytes.subarray(strOff + off, strOff + off + len);
      postScriptName = pid === 3 || pid === 0 ? String.fromCharCode(...Array.from({ length: len / 2 }, (_, k) => (raw[k * 2] << 8) | raw[k * 2 + 1])) : String.fromCharCode(...raw);
      break;
    }
  }
  return { bytes, tables, unitsPerEm, ascent, descent, capHeight, numGlyphs, bbox, italicAngle, flags, postScriptName: postScriptName.replace(/[^A-Za-z0-9-]/g, ''), advances, cmap, locaLong };
}

export function glyphFor(f: TtfFont, cp: number): number { return f.cmap.get(cp) ?? 0; }

function glyphRange(f: TtfFont, g: number): [number, number] {
  const d = new DataView(f.bytes.buffer, f.bytes.byteOffset, f.bytes.byteLength);
  const loca = f.tables.get('loca')!.off;
  const glyf = f.tables.get('glyf')!.off;
  if (f.locaLong) return [glyf + d.getUint32(loca + g * 4), glyf + d.getUint32(loca + (g + 1) * 4)];
  return [glyf + d.getUint16(loca + g * 2) * 2, glyf + d.getUint16(loca + (g + 1) * 2) * 2];
}

/** Glyph ids referenced by composite glyphs, recursively. */
function withComponents(f: TtfFont, used: Set<number>): Set<number> {
  const d = new DataView(f.bytes.buffer, f.bytes.byteOffset, f.bytes.byteLength);
  const out = new Set(used);
  const queue = [...used];
  while (queue.length) {
    const g = queue.pop()!;
    const [s, e] = glyphRange(f, g);
    if (e - s < 10) continue;
    if (d.getInt16(s) >= 0) continue; // simple glyph
    let p = s + 10;
    for (let guard = 0; guard < 64; guard++) {
      const flags = d.getUint16(p);
      const comp = d.getUint16(p + 2);
      if (!out.has(comp)) { out.add(comp); queue.push(comp); }
      p += 4 + (flags & 1 ? 4 : 2);
      if (flags & 8) p += 2; else if (flags & 0x40) p += 4; else if (flags & 0x80) p += 8;
      if (!(flags & 0x20)) break;
    }
  }
  return out;
}

function checksum(b: Uint8Array): number {
  let sum = 0;
  const padded = b.length % 4 ? new Uint8Array(b.length + 4 - (b.length % 4)) : b;
  if (padded !== b) padded.set(b);
  const d = new DataView(padded.buffer, padded.byteOffset, padded.byteLength);
  for (let i = 0; i < padded.length; i += 4) sum = (sum + d.getUint32(i)) >>> 0;
  return sum;
}

const KEEP = ['cmap', 'cvt ', 'fpgm', 'glyf', 'head', 'hhea', 'hmtx', 'loca', 'maxp', 'name', 'OS/2', 'post', 'prep'];

/** Build a font file containing only `used` glyphs (ids preserved). */
export function subsetTtf(f: TtfFont, usedGlyphs: Iterable<number>): Uint8Array {
  const used = withComponents(f, new Set([0, ...usedGlyphs]));
  const parts: Uint8Array[] = [];
  const offsets = new Uint32Array(f.numGlyphs + 1);
  let size = 0;
  for (let g = 0; g < f.numGlyphs; g++) {
    offsets[g] = size;
    if (!used.has(g)) continue;
    const [s, e] = glyphRange(f, g);
    if (e <= s) continue;
    const data = f.bytes.subarray(s, e);
    const pad = (4 - (data.length % 4)) % 4;
    const chunk = new Uint8Array(data.length + pad);
    chunk.set(data);
    parts.push(chunk);
    size += chunk.length;
  }
  offsets[f.numGlyphs] = size;
  const glyf = new Uint8Array(size);
  let o = 0;
  for (const p of parts) { glyf.set(p, o); o += p.length; }
  const loca = new Uint8Array((f.numGlyphs + 1) * 4);
  const lv = new DataView(loca.buffer);
  for (let g = 0; g <= f.numGlyphs; g++) lv.setUint32(g * 4, offsets[g]);
  const tables = new Map<string, Uint8Array>();
  for (const tag of KEEP) {
    const t = f.tables.get(tag);
    if (!t) continue;
    if (tag === 'glyf') tables.set(tag, glyf);
    else if (tag === 'loca') tables.set(tag, loca);
    else tables.set(tag, f.bytes.slice(t.off, t.off + t.len));
  }
  // head: long loca, zero checkSumAdjustment for now.
  const head = tables.get('head')!;
  const hv = new DataView(head.buffer, head.byteOffset, head.byteLength);
  hv.setInt16(50, 1);
  hv.setUint32(8, 0);
  // post: drop glyph names (format 3) to save space.
  const post = tables.get('post');
  if (post && post.length >= 32) {
    const np = post.slice(0, 32);
    new DataView(np.buffer).setUint32(0, 0x00030000);
    tables.set('post', np);
  }
  const tags = [...tables.keys()].sort();
  const numTables = tags.length;
  let headerSize = 12 + numTables * 16;
  let total = headerSize;
  for (const tag of tags) total += Math.ceil(tables.get(tag)!.length / 4) * 4;
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x00010000);
  dv.setUint16(4, numTables);
  let es = 1, log = 0;
  while (es * 2 <= numTables) { es *= 2; log++; }
  dv.setUint16(6, es * 16);
  dv.setUint16(8, log);
  dv.setUint16(10, numTables * 16 - es * 16);
  let off = headerSize;
  let headOff = 0;
  tags.forEach((tag, i) => {
    const data = tables.get(tag)!;
    const p = 12 + i * 16;
    for (let k = 0; k < 4; k++) out[p + k] = tag.charCodeAt(k);
    dv.setUint32(p + 4, checksum(data));
    dv.setUint32(p + 8, off);
    dv.setUint32(p + 12, data.length);
    out.set(data, off);
    if (tag === 'head') headOff = off;
    off += Math.ceil(data.length / 4) * 4;
  });
  const adj = (0xb1b0afba - checksum(out)) >>> 0;
  dv.setUint32(headOff + 8, adj);
  headerSize = 0;
  return out;
}
