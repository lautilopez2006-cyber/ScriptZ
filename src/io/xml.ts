// Tiny, forgiving XML parser (enough for FDX, Fade In OSF and Celtx). No DOM required.

export interface XNode { name: string; attrs: Record<string, string>; children: (XNode | string)[] }

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const cp = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : m;
    }
    return ENT[e.toLowerCase()] ?? m;
  });
}

export function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!)).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
}

export function parseXml(src: string): XNode {
  const root: XNode = { name: '#root', attrs: {}, children: [] };
  const stack: XNode[] = [root];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const lt = src.indexOf('<', i);
    if (lt < 0) { const text = src.slice(i); if (text) stack[stack.length - 1].children.push(decodeEntities(text)); break; }
    if (lt > i) stack[stack.length - 1].children.push(decodeEntities(src.slice(i, lt)));
    if (src.startsWith('<!--', lt)) { const e = src.indexOf('-->', lt + 4); i = e < 0 ? n : e + 3; continue; }
    if (src.startsWith('<![CDATA[', lt)) { const e = src.indexOf(']]>', lt + 9); stack[stack.length - 1].children.push(src.slice(lt + 9, e < 0 ? n : e)); i = e < 0 ? n : e + 3; continue; }
    if (src[lt + 1] === '?' || src[lt + 1] === '!') { const e = src.indexOf('>', lt); i = e < 0 ? n : e + 1; continue; }
    const gt = findTagEnd(src, lt);
    const raw = src.slice(lt + 1, gt);
    i = gt + 1;
    if (raw.startsWith('/')) {
      const name = raw.slice(1).trim();
      // Pop to the matching element (tolerates bad nesting).
      for (let k = stack.length - 1; k > 0; k--) if (stack[k].name === name) { stack.length = k; break; }
      continue;
    }
    const selfClose = raw.endsWith('/');
    const body = selfClose ? raw.slice(0, -1) : raw;
    const m = /^([^\s/>]+)/.exec(body);
    if (!m) continue;
    const node: XNode = { name: m[1], attrs: {}, children: [] };
    const re = /([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
    let a: RegExpExecArray | null;
    const attrSrc = body.slice(m[1].length);
    while ((a = re.exec(attrSrc))) node.attrs[a[1]] = decodeEntities(a[3] ?? a[4] ?? a[5] ?? '');
    stack[stack.length - 1].children.push(node);
    if (!selfClose && !/^(br|hr|img|meta|link|input)$/i.test(node.name)) stack.push(node);
  }
  return root;
}

function findTagEnd(src: string, from: number): number {
  let q: string | null = null;
  for (let i = from + 1; i < src.length; i++) {
    const c = src[i];
    if (q) { if (c === q) q = null; continue; }
    if (c === '"' || c === "'") { q = c; continue; }
    if (c === '>') return i;
  }
  return src.length - 1;
}

export const kids = (n: XNode, name?: string): XNode[] => n.children.filter((c): c is XNode => typeof c !== 'string' && (!name || c.name.toLowerCase() === name.toLowerCase()));
export const first = (n: XNode, name: string): XNode | undefined => kids(n, name)[0];

export function findAll(n: XNode, name: string, out: XNode[] = []): XNode[] {
  for (const c of n.children) {
    if (typeof c === 'string') continue;
    if (c.name.toLowerCase() === name.toLowerCase()) out.push(c);
    findAll(c, name, out);
  }
  return out;
}

export function textOf(n: XNode): string {
  let s = '';
  for (const c of n.children) s += typeof c === 'string' ? c : textOf(c);
  return s;
}
