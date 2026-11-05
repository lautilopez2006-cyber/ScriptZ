// Minimal ZIP reader/writer (stored + deflate) using the platform's (De)CompressionStream.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

async function pipe(data: Uint8Array, stream: { readable: ReadableStream<Uint8Array>; writable: WritableStream<Uint8Array> }): Promise<Uint8Array> {
  const writer = stream.writable.getWriter();
  void writer.write(data as unknown as Uint8Array).then(() => writer.close());
  const chunks: Uint8Array[] = [];
  const reader = stream.readable.getReader();
  let total = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return out;
}

type StreamCtor = new (format: string) => { readable: ReadableStream<Uint8Array>; writable: WritableStream<Uint8Array> };
const G = globalThis as unknown as { CompressionStream?: StreamCtor; DecompressionStream?: StreamCtor };

export async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  if (!G.DecompressionStream) throw new Error('deflate-unsupported');
  return pipe(data, new G.DecompressionStream('deflate-raw'));
}

export async function deflateRaw(data: Uint8Array): Promise<Uint8Array | null> {
  if (!G.CompressionStream) return null;
  return pipe(data, new G.CompressionStream('deflate-raw'));
}

export function isZip(b: Uint8Array): boolean { return b.length > 4 && b[0] === 0x50 && b[1] === 0x4b && (b[2] === 3 || b[2] === 5); }

/** Read every entry of a zip archive. Names are UTF-8. */
export async function readZip(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // End of central directory record.
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 66000); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('not-a-zip');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const out = new Map<string, Uint8Array>();
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    const lNameLen = dv.getUint16(local + 26, true);
    const lExtraLen = dv.getUint16(local + 28, true);
    const start = local + 30 + lNameLen + lExtraLen;
    const raw = bytes.subarray(start, start + csize);
    if (name.endsWith('/')) continue;
    if (method === 0) out.set(name, raw.slice());
    else if (method === 8) out.set(name, await inflateRaw(raw));
  }
  return out;
}

export interface ZipEntry { name: string; data: Uint8Array | string; store?: boolean }

/** Build a zip archive. Entries flagged `store` (e.g. EPUB mimetype) are never compressed. */
export async function writeZip(entries: ZipEntry[]): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  for (const e of entries) {
    const data = typeof e.data === 'string' ? enc.encode(e.data) : e.data;
    const name = enc.encode(e.name);
    const crc = crc32(data);
    let method = 0;
    let body = data;
    if (!e.store && data.length > 64) {
      const d = await deflateRaw(data);
      if (d && d.length < data.length) { method = 8; body = d; }
    }
    const lh = new Uint8Array(30 + name.length);
    const lv = new DataView(lh.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0x0800, true); lv.setUint16(8, method, true);
    lv.setUint16(10, dosTime, true); lv.setUint16(12, dosDate, true); lv.setUint32(14, crc, true);
    lv.setUint32(18, body.length, true); lv.setUint32(22, data.length, true); lv.setUint16(26, name.length, true); lv.setUint16(28, 0, true);
    lh.set(name, 30);
    const ch = new Uint8Array(46 + name.length);
    const cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x0800, true); cv.setUint16(10, method, true);
    cv.setUint16(12, dosTime, true); cv.setUint16(14, dosDate, true); cv.setUint32(16, crc, true); cv.setUint32(20, body.length, true); cv.setUint32(24, data.length, true);
    cv.setUint16(28, name.length, true); cv.setUint32(42, offset, true);
    ch.set(name, 46);
    parts.push(lh, body);
    central.push(ch);
    offset += lh.length + body.length;
  }
  const cdSize = central.reduce((a, c) => a + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, entries.length, true); ev.setUint16(10, entries.length, true);
  ev.setUint32(12, cdSize, true); ev.setUint32(16, offset, true);
  const total = offset + cdSize + 22;
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of [...parts, ...central, end]) { out.set(p, o); o += p.length; }
  return out;
}
