// Contest and fund formats: the presentation rules a script must meet, and a checker against them.
// Each preset cites its source. Rules change every year: the UI always asks to confirm with the official call.
import type { Project } from './model';
import { buildScenes, parseHeading } from './scenes';

export interface ContestRules {
  id: string;
  name: string;
  /** Country or scope, shown next to the name. */
  where: string;
  kind: 'feature' | 'short' | 'pilot' | 'any';
  pages?: { min?: number; max?: number; softMax?: number };
  /** Name, contact or any identifying data must not appear in the script. */
  anonymous: boolean;
  sceneNumbers?: boolean;
  headings?: boolean;
  upperCues?: boolean;
  language?: 'en' | 'es';
  logline?: boolean;
  courier12: boolean;
  pdf: boolean;
  /** Free-text reminders (i18n keys). */
  notes: string[];
  source: string;
  /** Which call the rules come from. */
  edition: string;
}

export const CONTESTS: ContestRules[] = [
  {
    id: 'incaa-largo', name: 'INCAA · Concurso de Largometrajes de Ficción', where: 'Argentina', kind: 'feature',
    pages: { min: 60, max: 120 }, anonymous: true, sceneNumbers: true, headings: true, upperCues: true, courier12: true, pdf: true,
    notes: ['ct.n.incaaMargins', 'ct.n.incaaZip'], source: 'https://www.incaa.gob.ar/wp-content/uploads/2026/03/Anexo-I-Bases-y-Condiciones-Rs-69-26.pdf', edition: '1.º llamado 2026',
  },
  {
    id: 'sgae', name: 'Premio SGAE de Guion Julio Alejandro', where: 'España', kind: 'feature',
    anonymous: true, courier12: true, pdf: true, headings: true,
    notes: ['ct.n.sgaeLema', 'ct.n.sgaePlica', 'ct.n.finished'], source: 'https://www.escritores.org/recursos-para-escritores/33283-xviii-premio-sgae-de-guion-para-largometraje-julio-alejandro-2021-espana', edition: 'XVIII edición (2021)',
  },
  {
    id: 'nicholl', name: 'Academy Nicholl Fellowships', where: 'EE. UU.', kind: 'feature',
    pages: { min: 70, max: 160, softMax: 125 }, anonymous: true, courier12: true, pdf: true, language: 'en', logline: true,
    notes: ['ct.n.nichollAi', 'ct.n.nichollOriginal'], source: 'https://www.oscars.org/sites/oscars/files/2024_nicholl_rules.pdf', edition: '2024',
  },
  {
    id: 'bluecat-feature', name: 'BlueCat · Largometraje', where: 'EE. UU.', kind: 'feature',
    pages: { min: 65, max: 125 }, anonymous: false, courier12: true, pdf: true, language: 'en',
    notes: [], source: 'https://bluecatscreenplay.com/2027-rules-guidelines', edition: '2027',
  },
  {
    id: 'bluecat-short', name: 'BlueCat · Cortometraje', where: 'EE. UU.', kind: 'short',
    pages: { min: 1, max: 29 }, anonymous: false, courier12: true, pdf: true, language: 'en',
    notes: [], source: 'https://bluecatscreenplay.com/2027-rules-guidelines', edition: '2027',
  },
];

export interface ContestCheck { id: string; ok: boolean; severity: 'error' | 'warn' | 'info'; msg: string; vars?: Record<string, string | number>; fix?: 'anon' | 'numbers' | 'logline' }

/** Checks a script against a contest's rules. `pages` = script pages without the title page. */
export function checkContest(p: Project, rules: ContestRules, pages: number, author: string): ContestCheck[] {
  const out: ContestCheck[] = [];
  const add = (c: ContestCheck) => out.push(c);
  if (rules.pages) {
    const { min, max, softMax } = rules.pages;
    const ok = (min === undefined || pages >= min) && (max === undefined || pages <= max);
    add({ id: 'pages', ok, severity: ok ? 'info' : 'error', msg: ok ? 'ct.c.pagesOk' : pages < (min ?? 0) ? 'ct.c.pagesShort' : 'ct.c.pagesLong', vars: { n: pages, min: min ?? 1, max: max ?? '∞' } });
    if (ok && softMax && pages > softMax) add({ id: 'soft', ok: false, severity: 'warn', msg: 'ct.c.pagesSoft', vars: { n: pages, max: softMax } });
  }
  if (rules.anonymous) {
    const tp = p.titlePage;
    const named = !!(tp.enabled && (tp.authors.trim() || tp.contact.trim()));
    add({ id: 'anon', ok: !named, severity: named ? 'error' : 'info', msg: named ? 'ct.c.named' : 'ct.c.anonOk', fix: named ? 'anon' : undefined });
    const who = [author, p.author, tp.authors].map((s) => s.trim()).filter((s) => s.length > 3);
    const inText = who.length ? p.blocks.some((b) => who.some((w) => b.text.includes(w))) : false;
    if (inText) add({ id: 'anonText', ok: false, severity: 'warn', msg: 'ct.c.nameInText' });
    const hf = [p.page.header.left, p.page.header.center, p.page.header.right, p.page.footer.left, p.page.footer.center, p.page.footer.right].join(' ');
    if (who.some((w) => hf.includes(w)) || /\{author\}/i.test(hf)) add({ id: 'anonHf', ok: false, severity: 'error', msg: 'ct.c.nameInHeader', fix: 'anon' });
  }
  if (rules.sceneNumbers) {
    const ok = p.page.sceneNumbers !== 'none';
    add({ id: 'nums', ok, severity: ok ? 'info' : 'error', msg: ok ? 'ct.c.numsOk' : 'ct.c.nums', fix: ok ? undefined : 'numbers' });
  }
  const scenes = buildScenes(p.blocks);
  if (rules.headings) {
    const bad = p.blocks.filter((b) => b.type === 'scene' && b.text.trim()).filter((b) => { const h = parseHeading(b.text); return !h.intExt || !h.time; });
    add({ id: 'heads', ok: !bad.length, severity: bad.length ? 'warn' : 'info', msg: bad.length ? 'ct.c.heads' : 'ct.c.headsOk', vars: { n: bad.length, total: scenes.length } });
  }
  if (rules.upperCues) {
    const bad = p.blocks.filter((b) => { if (b.type !== 'character') return false; const n = b.text.replace(/\(.*$/s, '').trim(); return !!n && n !== n.toLocaleUpperCase(); });
    add({ id: 'cues', ok: !bad.length, severity: bad.length ? 'warn' : 'info', msg: bad.length ? 'ct.c.cues' : 'ct.c.cuesOk', vars: { n: bad.length } });
  }
  if (rules.language === 'en') {
    const ok = p.locale === 'en';
    add({ id: 'lang', ok, severity: ok ? 'info' : 'error', msg: ok ? 'ct.c.langOk' : 'ct.c.langEn' });
  }
  if (rules.logline) {
    const ok = !!p.logline.trim();
    add({ id: 'logline', ok, severity: ok ? 'info' : 'warn', msg: ok ? 'ct.c.loglineOk' : 'ct.c.logline', fix: ok ? undefined : 'logline' });
  }
  if (rules.courier12) add({ id: 'font', ok: true, severity: 'info', msg: 'ct.c.font' });
  if (p.page.watermark.enabled) add({ id: 'wm', ok: false, severity: 'warn', msg: 'ct.c.watermark' });
  const pending = p.blocks.some((b) => b.sug || b.marks?.some((m) => m.k === 'si' || m.k === 'sd'));
  if (pending) add({ id: 'sug', ok: false, severity: 'warn', msg: 'ct.c.suggestions' });
  return out;
}

/** The script as it should be submitted: anonymous title page, scene numbers, no watermark. */
export function contestProject(p: Project, rules: ContestRules): Project {
  const titlePage = rules.anonymous
    ? { ...p.titlePage, enabled: true, authors: '', contact: '', credit: '', copyright: '', notes: '' }
    : p.titlePage;
  const hf = (x: Project['page']['header']) => (rules.anonymous ? { left: x.left.replace(/\{author\}/gi, ''), center: x.center.replace(/\{author\}/gi, ''), right: x.right.replace(/\{author\}/gi, '') } : x);
  return {
    ...p,
    author: rules.anonymous ? '' : p.author,
    titlePage,
    page: { ...p.page, sceneNumbers: rules.sceneNumbers && p.page.sceneNumbers === 'none' ? 'both' : p.page.sceneNumbers, watermark: { ...p.page.watermark, enabled: false }, header: hf(p.page.header), footer: hf(p.page.footer) },
  };
}
