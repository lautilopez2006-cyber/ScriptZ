// Shareable presentation pages. The whole script travels compressed inside the link's #fragment, which
// browsers never send to a server: no account, no upload, the link itself is the document.
import { projectWords, type Project } from '../core/model';
import { officialProject } from '../core/suggest';
import { characterStats, buildScenes } from '../core/scenes';
import { esc } from '../io/xml';
import { t } from '../i18n';

export const PUBLIC_APP = 'https://lautilopez2006-cyber.github.io/ScriptZ/app/';
export const HASH = '#leer=';

export interface Pitch {
  logline: string;
  synopsis: string;
  genre: string;
  contact: string;
  /** Include the full script (otherwise only the presentation and the first pages). */
  full: boolean;
  /** Pages to include when not full. */
  sample: number;
  allowDownload: boolean;
  allowCopy: boolean;
}

export interface SharePayload { v: 1; project: Project; pitch: Pitch; at: string }

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64url(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pipe(data: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const res = new Response(new Blob([data as BlobPart]).stream().pipeThrough(stream as unknown as ReadableWritablePair<Uint8Array, Uint8Array>));
  return new Uint8Array(await res.arrayBuffer());
}

/** Only what a reader needs: no comments, notes, research, history or production data. */
export function shareableProject(p0: Project, pitch: Pitch, pages?: Set<string>): Project {
  const p = officialProject(p0);
  const blocks = p.blocks.filter((b) => b.type !== 'note' && !b.sug && (!pages || pages.has(b.id))).map((b) => ({ id: b.id, type: b.type, text: b.text, ...(b.marks?.length ? { marks: b.marks.filter((m) => ['b', 'i', 'u', 'x'].includes(m.k)) } : {}), ...(b.dual ? { dual: b.dual } : {}), ...(b.num ? { num: b.num } : {}) }));
  const chars = Object.fromEntries(Object.entries(p.characters).map(([k, c]) => [k, { ...c, actor: '', castNumber: undefined }]));
  return {
    ...p, blocks, comments: {}, research: {}, suggestions: {}, drafts: {}, translation: null, characters: chars,
    logline: pitch.logline, synopsis: pitch.synopsis,
    breakdown: { elements: {} }, schedule: { order: [], days: {} }, callSheets: {},
  } as Project;
}

export async function encodeShare(payload: SharePayload): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(payload));
  return b64url(await pipe(json, new CompressionStream('deflate-raw')));
}

export async function decodeShare(token: string): Promise<SharePayload> {
  const raw = await pipe(unb64url(token), new DecompressionStream('deflate-raw'));
  const data = JSON.parse(new TextDecoder().decode(raw)) as SharePayload;
  if (data.v !== 1 || !data.project?.blocks) throw new Error('bad-share');
  return data;
}

/** Base URL of the web app that opens share links. */
export function appBase(): string {
  if (typeof location !== 'undefined' && /^https?:$/.test(location.protocol) && !/localhost|127\.0\.0\.1/.test(location.host)) return location.origin + location.pathname;
  return PUBLIC_APP;
}

export function shareStats(p: Project, pages: number) {
  const scenes = buildScenes(p.blocks).length;
  const chars = characterStats(p.blocks);
  return { pages, scenes, characters: chars.length, words: projectWords(p), cast: chars.slice(0, 8) };
}

/** Self-contained presentation page (HTML file): pitch on top, the reading copy below. */
export function standaloneHtml(p: Project, pitch: Pitch, scriptHtml: string, stats: ReturnType<typeof shareStats>): string {
  const body = /<body[^>]*>([\s\S]*)<\/body>/i.exec(scriptHtml)?.[1] ?? '';
  const style = /<style[^>]*>([\s\S]*?)<\/style>/i.exec(scriptHtml)?.[1] ?? '';
  const author = p.titlePage.authors || p.author;
  const cast = stats.cast.map((c) => `<li><b>${esc(c.name)}</b>${p.characters[c.name]?.bio ? `<span>${esc(p.characters[c.name].bio)}</span>` : ''}</li>`).join('');
  return `<!doctype html><html lang="${p.locale.slice(0, 2)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(p.title)}</title>
<style>
:root{--ink:#151b2b;--muted:#6a7389;--accent:#3247c9;--bg:#eceef3}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 system-ui,-apple-system,'Segoe UI',sans-serif}
.pitch{max-width:860px;margin:0 auto;padding:64px 24px 24px}
.k{font:700 12px system-ui;letter-spacing:.14em;text-transform:uppercase;color:var(--accent)}
h1{font:700 clamp(36px,7vw,64px)/1.02 'Courier Prime','Courier New',monospace;letter-spacing:-.03em;margin:10px 0 6px;text-transform:uppercase}
.by{color:var(--muted);margin:0 0 26px}
.logline{font:400 clamp(19px,2.6vw,24px)/1.45 'Courier Prime','Courier New',monospace;border-left:4px solid var(--accent);padding:4px 0 4px 18px;margin:0 0 28px}
.stats{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:28px}.stats span{background:#fff;border-radius:12px;padding:10px 14px;font-size:13px;color:var(--muted)}.stats b{display:block;font:700 22px 'Courier Prime',monospace;color:var(--ink)}
h2{font:700 13px system-ui;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin:30px 0 10px}
.syn{white-space:pre-wrap}.cast{list-style:none;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px}.cast li{background:#fff;border-radius:12px;padding:12px 14px}.cast b{display:block;font-family:'Courier Prime',monospace}.cast span{font-size:14px;color:var(--muted)}
.contact{white-space:pre-wrap;background:#fff;border-radius:12px;padding:14px 16px}
.script{padding:24px 0 80px}
.made{text-align:center;color:var(--muted);font-size:13px;padding:24px}
${style}
</style></head><body>
<header class="pitch"><span class="k">${esc(pitch.genre || '')}</span><h1>${esc(p.title)}</h1>${author ? `<p class="by">${esc(author)}</p>` : ''}
${pitch.logline ? `<p class="logline">${esc(pitch.logline)}</p>` : ''}
<div class="stats"><span><b>${stats.pages}</b>${esc(t('sh.st.pages'))}</span><span><b>${stats.scenes}</b>${esc(t('sh.st.scenes'))}</span><span><b>${stats.characters}</b>${esc(t('sh.st.chars'))}</span></div>
${pitch.synopsis ? `<h2>${esc(t('sh.synopsis'))}</h2><div class="syn">${esc(pitch.synopsis)}</div>` : ''}
${cast ? `<h2>${esc(t('sh.cast'))}</h2><ul class="cast">${cast}</ul>` : ''}
${pitch.contact ? `<h2>${esc(t('sh.contact'))}</h2><div class="contact">${esc(pitch.contact)}</div>` : ''}
</header>
<main class="script">${body}</main>
<p class="made">${esc(t('sh.madeWith'))}</p>
</body></html>`;
}
