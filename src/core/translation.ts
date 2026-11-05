// Side-by-side translation: one translated text per paragraph, with the source it was made from.
import type { Block, Project, ScriptLocale } from './model';
import { officialProject } from './suggest';

/** Paragraph types worth translating (character names are kept unless translated explicitly). */
export const isTranslatable = (b: Block) => !!b.text.trim() && b.type !== 'page' && !b.sug;
const KEEP_BY_DEFAULT = new Set(['character']);

export function translationProgress(p: Project): { total: number; done: number; stale: number } {
  const tr = p.translation;
  let total = 0, done = 0, stale = 0;
  for (const b of p.blocks) {
    if (!isTranslatable(b) || KEEP_BY_DEFAULT.has(b.type)) continue;
    total++;
    const x = tr?.blocks[b.id];
    if (x?.text.trim()) { done++; if (x.src !== b.text) stale++; }
  }
  return { total, done, stale };
}

const LOCALE_FOR: Record<string, ScriptLocale> = { en: 'en', es: 'es-LA', 'es-ES': 'es-ES', pt: 'pt-BR' };

/** The translated script, ready for any exporter. Untranslated paragraphs keep the original text. */
export function translatedProject(p0: Project): Project {
  const p = officialProject(p0);
  const tr = p.translation;
  if (!tr) return p;
  const blocks = p.blocks.map((b) => {
    const x = tr.blocks[b.id];
    return x && x.text.trim() ? { ...b, text: x.text, marks: undefined, alts: undefined } : b;
  });
  return { ...p, blocks, locale: LOCALE_FOR[tr.lang] ?? p.locale, title: p.title ? `${p.title} (${tr.lang.toUpperCase()})` : p.title };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** A printable two-column document: original on the left, translation on the right. */
export function bilingualHtml(p0: Project, labels: { original: string; translation: string }): string {
  const p = officialProject(p0);
  const tr = p.translation;
  const rows = p.blocks.filter((b) => b.text.trim() && b.type !== 'page').map((b) => {
    const x = tr?.blocks[b.id]?.text ?? '';
    const cls = 't-' + b.type;
    return `<tr class="${cls}"><td>${esc(b.text)}</td><td>${esc(x || (KEEP_BY_DEFAULT.has(b.type) ? b.text : ''))}</td></tr>`;
  }).join('\n');
  return `<!doctype html><html lang="${tr?.lang ?? 'en'}"><head><meta charset="utf-8"><title>${esc(p.title)}</title><style>
@page { size: ${p.page.paper === 'a4' ? 'A4' : 'letter'} landscape; margin: 0.7in; }
body { font: 11pt/1.35 'Courier Prime', 'Courier New', monospace; color: #111; margin: 0 auto; max-width: 11in; }
h1 { font-size: 13pt; text-align: center; text-decoration: underline; }
table { width: 100%; border-collapse: collapse; table-layout: fixed; }
th { text-align: left; font-size: 9pt; border-bottom: 1px solid #999; padding: 4px 8px; }
td { vertical-align: top; padding: 3px 8px; white-space: pre-wrap; }
td + td { border-left: 1px solid #ddd; }
tr.t-scene td { font-weight: bold; text-transform: uppercase; padding-top: 14px; }
tr.t-character td { padding-left: 30%; text-transform: uppercase; }
tr.t-parenthetical td { padding-left: 22%; }
tr.t-dialogue td { padding-left: 12%; padding-right: 8%; }
tr.t-transition td { text-align: right; text-transform: uppercase; }
tr { break-inside: avoid; }
</style></head><body><h1>${esc(p.title)}</h1><table><thead><tr><th>${esc(labels.original)}</th><th>${esc(labels.translation)} (${esc((tr?.lang ?? '').toUpperCase())})</th></tr></thead><tbody>
${rows}
</tbody></table></body></html>`;
}
