// Load any ScriptlZ document (schema 1 from the 0.x/1.x drafts, or schema 2) into a valid v2 Project.
import {
  ALL_ELEMENT_TYPES, BREAKDOWN_CATEGORIES, CARD_COLORS, defaultPage, defaultTitlePage, emptyProject, uid,
  type Block, type BreakdownCategory, type CardColor, type ElementType, type Mark, type Project, type SeriesBible,
} from './model';
import { SCRIPT_LOCALES } from './format';

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d);
const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const rec = (v: unknown): Json => (isObj(v) ? v : {});

const ID_RE = /^[A-Za-z0-9-]{1,80}$/;
function safeId(v: unknown, seen: Set<string>): string {
  let id = typeof v === 'string' && ID_RE.test(v) ? v : uid();
  while (seen.has(id)) id = uid();
  seen.add(id);
  return id;
}

const MARK_KINDS = new Set(['b', 'i', 'u', 'x', 'hl', 'tag', 'cmt', 'si', 'sd']);

function cleanMarks(v: unknown, len: number): Mark[] | undefined {
  const out: Mark[] = [];
  for (const m of arr(v)) {
    if (!isObj(m) || !MARK_KINDS.has(str(m.k))) continue;
    const s = Math.max(0, Math.min(len, Math.floor(num(m.s))));
    const e = Math.max(s, Math.min(len, Math.floor(num(m.e))));
    if (e <= s) continue;
    const mark: Mark = { s, e, k: m.k as Mark['k'] };
    if (typeof m.v === 'string') mark.v = m.v;
    out.push(mark);
  }
  return out.length ? out : undefined;
}

export function normalizeBlocks(list: unknown): Block[] {
  const seen = new Set<string>();
  const out: Block[] = [];
  for (const raw of arr(list)) {
    if (!isObj(raw)) continue;
    const typeRaw = str(raw.type) || str(raw.kind);
    const type = (ALL_ELEMENT_TYPES as string[]).includes(typeRaw) ? (typeRaw as ElementType) : 'action';
    const text = str(raw.text).replace(/\r\n?/g, '\n').replace(/\u0000/g, '');
    const b: Block = { id: safeId(raw.id, seen), type, text };
    const marks = cleanMarks(raw.marks, text.length);
    if (marks) b.marks = marks;
    if (raw.dual === 'L' || raw.dual === 'R') b.dual = raw.dual;
    if (typeof raw.num === 'string' && raw.num) b.num = raw.num.slice(0, 12);
    if (raw.omitted === true) b.omitted = true;
    if (typeof raw.rev === 'string' && raw.rev) b.rev = raw.rev;
    if (typeof raw.bookmark === 'string' && raw.bookmark) b.bookmark = raw.bookmark.slice(0, 120);
    const alts = arr(raw.alts).filter(isObj).map((a) => { const t = str(a.text).replace(/\r\n?/g, '\n'); const m = cleanMarks(a.marks, t.length); return m ? { text: t, marks: m } : { text: t }; }).slice(0, 20);
    if (alts.length) b.alts = alts;
    if (isObj(raw.sug) && (raw.sug.k === 'ins' || raw.sug.k === 'del') && typeof raw.sug.id === 'string') b.sug = { k: raw.sug.k, id: raw.sug.id };
    out.push(b);
  }
  if (!out.length) out.push({ id: uid(), type: 'scene', text: '' });
  return out;
}

const OLD_COLORS: Record<string, CardColor> = { amber: 'orange', teal: 'teal', blue: 'blue', violet: 'violet', rose: 'pink' };

function color(v: unknown): CardColor {
  const s = str(v);
  if ((CARD_COLORS as string[]).includes(s)) return s as CardColor;
  return OLD_COLORS[s] ?? 'none';
}

/** Migrate from schema 1 (ScriptlZ drafts up to 1.3.6). */
function fromV1(raw: Json): Project {
  const p = emptyProject();
  p.id = typeof raw.id === 'string' && ID_RE.test(raw.id) ? raw.id : p.id;
  p.title = str(raw.title);
  p.author = str(raw.author);
  p.createdAt = str(raw.createdAt, p.createdAt);
  p.updatedAt = str(raw.updatedAt, p.updatedAt);
  p.revision = Math.max(1, Math.floor(num(raw.revision, 1)));
  p.notes = str(raw.description);
  const tpl = str(raw.template);
  p.template = tpl === 'pilot' || tpl === 'series' ? 'tv' : 'feature';
  const doc = rec(raw.documentSettings);
  p.page = defaultPage(doc.paperSize === 'a4' ? 'a4' : 'letter');
  const cover = rec(raw.cover);
  p.titlePage = { ...defaultTitlePage(p.title, p.author), enabled: doc.includeCover !== false, contact: str(cover.contact), copyright: str(cover.copyright), draft: str(cover.draftLabel) };
  const blocks = normalizeBlocks(raw.blocks);
  const prof = rec(raw.professional);
  if (prof.language === 'en') p.locale = 'en';

  // Dual dialogues lived in a side table; insert them as dual blocks after their anchor.
  const duals = arr(prof.dualDialogues).filter(isObj);
  for (const d of duals) {
    const pair: Block[] = [
      { id: uid(), type: 'character', text: str(d.leftName), dual: 'L' },
      { id: uid(), type: 'dialogue', text: str(d.leftText), dual: 'L' },
      { id: uid(), type: 'character', text: str(d.rightName), dual: 'R' },
      { id: uid(), type: 'dialogue', text: str(d.rightText), dual: 'R' },
    ];
    let at = blocks.findIndex((b) => b.id === str(d.anchorBlockId));
    if (at < 0) {
      const s = blocks.findIndex((b) => b.id === str(d.sceneId));
      if (s >= 0) { at = s; while (at + 1 < blocks.length && blocks[at + 1].type !== 'scene') at++; }
    }
    if (at < 0) at = blocks.length - 1;
    blocks.splice(at + 1, 0, ...pair);
  }
  p.blocks = blocks;

  const story = rec(raw.story);
  p.logline = str(story.logline);
  p.synopsis = str(story.synopsis);
  p.theme = str(story.theme);
  for (const e of arr(story.entries).filter(isObj)) {
    const id = typeof e.id === 'string' && ID_RE.test(e.id) ? e.id : uid();
    if (e.kind === 'character') {
      p.characters[id] = { id, name: str(e.name).toUpperCase(), color: 'none', role: str(e.subtitle), bio: str(e.description), goal: str(e.objective), need: str(e.contradictions), arc: str(e.arc), actor: '' };
    } else if (e.kind === 'location') {
      p.locations[id] = { id, name: str(e.name).toUpperCase(), description: str(e.description), address: '', notes: str(e.subtitle) };
    } else {
      p.cards[id] = { id, title: str(e.name), text: str(e.description), color: 'yellow', x: 40 + Object.keys(p.cards).length * 30, y: 40 };
    }
  }
  const STATUS: Record<string, 'idea' | 'draft' | 'revised' | 'final'> = { idea: 'idea', draft: 'draft', revised: 'revised', ready: 'final' };
  for (const [sid, sc] of Object.entries(rec(story.scenes))) {
    if (!isObj(sc)) continue;
    p.scenes[sid] = { summary: str(sc.synopsis) || str(sc.beat), color: color(sc.color), status: STATUS[str(sc.status)] ?? undefined };
  }

  const editorial = rec(raw.editorial);
  for (const c of arr(editorial.comments).filter(isObj)) {
    const id = typeof c.id === 'string' && ID_RE.test(c.id) ? c.id : uid();
    p.comments[id] = {
      id, author: str(c.author, ''), body: str(c.body), createdAt: str(c.createdAt), resolved: c.status === 'resolved',
      replies: arr(c.replies).filter(isObj).map((r) => ({ id: str(r.id) || uid(), author: str(r.author), body: str(r.body), createdAt: str(r.createdAt) })),
      blockId: str(c.blockId), excerpt: str(c.excerpt),
    };
  }
  for (const d of arr(editorial.drafts).filter(isObj)) {
    const id = typeof d.id === 'string' && ID_RE.test(d.id) ? d.id : uid();
    p.drafts[id] = { id, name: str(d.name, 'Versión'), createdAt: str(d.createdAt), blocks: normalizeBlocks(d.blocks) };
  }

  // Breakdown text fields → breakdown elements assigned to scenes.
  const production = rec(prof.production);
  const FIELD: Record<string, BreakdownCategory> = { props: 'props', wardrobe: 'wardrobe', extras: 'extras', cast: 'cast', sound: 'sound', effects: 'sfx', notes: 'notes', locations: 'set' };
  for (const [sid, bd] of Object.entries(rec(production.breakdown))) {
    if (!isObj(bd)) continue;
    const ids: string[] = [];
    for (const [field, cat] of Object.entries(FIELD)) {
      for (const name of str(bd[field]).split(/[,;\n]/).map((x) => x.trim()).filter(Boolean)) {
        const existing = Object.values(p.breakdown.elements).find((e) => e.category === cat && e.name.toLowerCase() === name.toLowerCase());
        const id = existing?.id ?? uid();
        if (!existing) p.breakdown.elements[id] = { id, category: cat, name, notes: '' };
        ids.push(id);
      }
    }
    if (ids.length) p.scenes[sid] = { ...(p.scenes[sid] ?? {}), elements: ids };
  }
  const nums = rec(production.sceneNumbers);
  if (Object.keys(nums).length) {
    for (const b of p.blocks) if (b.type === 'scene' && typeof nums[b.id] === 'string') b.num = nums[b.id] as string;
  }
  return p;
}

/** Fill defaults and repair a v2 document. */
function fromV2(raw: Json): Project {
  const base = emptyProject();
  const p: Project = { ...base };
  p.id = typeof raw.id === 'string' && ID_RE.test(raw.id) ? raw.id : base.id;
  p.title = str(raw.title);
  p.author = str(raw.author);
  p.createdAt = str(raw.createdAt, base.createdAt);
  p.updatedAt = str(raw.updatedAt, base.updatedAt);
  p.revision = Math.max(1, Math.floor(num(raw.revision, 1)));
  p.template = str(raw.template, 'feature');
  p.styleOverrides = isObj(raw.styleOverrides) ? (raw.styleOverrides as Project['styleOverrides']) : {};
  p.locale = (SCRIPT_LOCALES as string[]).includes(str(raw.locale)) ? (raw.locale as Project['locale']) : 'es-LA';
  const page = rec(raw.page);
  const dp = defaultPage(page.paper === 'a4' ? 'a4' : 'letter');
  p.page = {
    ...dp, ...page,
    paper: page.paper === 'a4' ? 'a4' : 'letter',
    header: { ...dp.header, ...rec(page.header) } as Project['page']['header'],
    footer: { ...dp.footer, ...rec(page.footer) } as Project['page']['footer'],
    watermark: { ...dp.watermark, ...rec(page.watermark) } as Project['page']['watermark'],
  } as Project['page'];
  p.titlePage = { ...defaultTitlePage(p.title, p.author), ...rec(raw.titlePage) } as Project['titlePage'];
  p.blocks = normalizeBlocks(raw.blocks);
  p.logline = str(raw.logline); p.synopsis = str(raw.synopsis); p.theme = str(raw.theme); p.notes = str(raw.notes);
  if (isObj(raw.series)) p.series = { show: str(raw.series.show), season: num(raw.series.season, 1), episode: num(raw.series.episode, 1), episodeTitle: str(raw.series.episodeTitle) };
  p.scenes = rec(raw.scenes) as Project['scenes'];
  p.characters = rec(raw.characters) as Project['characters'];
  p.locations = rec(raw.locations) as Project['locations'];
  p.cards = rec(raw.cards) as Project['cards'];
  const beats = rec(raw.beats);
  p.beats = { sheet: str(beats.sheet), beats: arr(beats.beats).filter(isObj) as unknown as Project['beats']['beats'] };
  p.comments = rec(raw.comments) as Project['comments'];
  for (const c of Object.values(p.comments)) if (!Array.isArray(c.replies)) c.replies = [];
  const rv = rec(raw.revisions);
  p.revisions = { active: rv.active === true, current: str(rv.current), sets: arr(rv.sets).filter(isObj) as unknown as Project['revisions']['sets'], pageLocks: Array.isArray(rv.pageLocks) ? (rv.pageLocks as Project['revisions']['pageLocks']) : null, scenesLocked: rv.scenesLocked === true };
  p.drafts = {};
  for (const [k, d] of Object.entries(rec(raw.drafts))) if (isObj(d)) p.drafts[k] = { id: str(d.id, k), name: str(d.name), createdAt: str(d.createdAt), blocks: normalizeBlocks(d.blocks) };
  const bd = rec(raw.breakdown);
  p.breakdown = { elements: {} };
  for (const [k, e] of Object.entries(rec(bd.elements))) {
    if (!isObj(e)) continue;
    const cat = (BREAKDOWN_CATEGORIES as string[]).includes(str(e.category)) ? (e.category as BreakdownCategory) : 'notes';
    p.breakdown.elements[k] = { id: k, category: cat, name: str(e.name), notes: str(e.notes) };
  }
  const sc = rec(raw.schedule);
  p.schedule = { order: arr(sc.order).filter((x): x is string => typeof x === 'string'), days: rec(sc.days) as Project['schedule']['days'] };
  const bu = rec(raw.budget);
  p.budget = { currency: str(bu.currency, 'USD'), fringePct: num(bu.fringePct), contingencyPct: num(bu.contingencyPct, 10), lines: rec(bu.lines) as Project['budget']['lines'] };
  p.callSheets = rec(raw.callSheets) as Project['callSheets'];
  p.writingLog = rec(raw.writingLog) as Project['writingLog'];
  p.suggestions = {};
  for (const [k, v] of Object.entries(rec(raw.suggestions))) if (isObj(v)) p.suggestions[k] = { id: k, author: str(v.author), color: str(v.color, '#3247c9'), at: str(v.at) };
  const tr = rec(raw.translation);
  p.translation = isObj(raw.translation) ? { lang: str(tr.lang, 'en'), blocks: {} } : null;
  if (p.translation) for (const [k, v] of Object.entries(rec(tr.blocks))) if (isObj(v)) p.translation.blocks[k] = { text: str(v.text), src: str(v.src), at: str(v.at) };
  p.research = {};
  for (const [k, v] of Object.entries(rec(raw.research))) {
    if (!isObj(v)) continue;
    const ids = (x: unknown) => arr(x).filter((y): y is string => typeof y === 'string');
    const kind = v.kind === 'image' || v.kind === 'link' ? v.kind : 'note';
    const image = str(v.image);
    p.research[k] = { id: k, kind, title: str(v.title), note: str(v.note), url: str(v.url), image: /^data:image\/(png|jpeg|webp|gif);base64,/.test(image) ? image : '', scenes: ids(v.scenes), characters: ids(v.characters), locations: ids(v.locations), color: color(v.color), createdAt: str(v.createdAt) };
  }
  if (isObj(raw.bible)) {
    const b = raw.bible;
    const chars: SeriesBible['characters'] = {};
    for (const [k, v] of Object.entries(rec(b.characters))) if (isObj(v)) chars[k] = { name: str(v.name, k), description: str(v.description), actor: str(v.actor) };
    const locs: SeriesBible['locations'] = {};
    for (const [k, v] of Object.entries(rec(b.locations))) if (isObj(v)) locs[k] = { name: str(v.name, k), description: str(v.description) };
    p.bible = { show: str(b.show), logline: str(b.logline), premise: str(b.premise), tone: str(b.tone), world: str(b.world), arcs: str(b.arcs), notes: str(b.notes), characters: chars, locations: locs };
  }
  return p;
}

export class ProjectFormatError extends Error {}

export function loadProject(input: unknown): Project {
  let raw = input;
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw); } catch { throw new ProjectFormatError('invalid-json'); }
  }
  if (!isObj(raw)) throw new ProjectFormatError('not-a-project');
  if (!Array.isArray(raw.blocks)) throw new ProjectFormatError('no-blocks');
  const v = num(raw.schemaVersion, 1);
  if (v > 2) throw new ProjectFormatError('newer-version');
  return v === 2 ? fromV2(raw) : fromV1(raw);
}

export function serializeProject(p: Project): string {
  return JSON.stringify(p, null, 1);
}
