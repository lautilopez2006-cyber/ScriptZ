// ScriptlZ document model (schema v2). Pure data: no DOM, no platform code.

export type ElementType =
  | 'scene' | 'action' | 'character' | 'dialogue' | 'parenthetical' | 'transition'
  | 'shot' | 'general' | 'lyrics' | 'centered' | 'act' | 'endact' | 'note'
  | 'page' | 'panel' | 'caption' | 'sfx'          // comic
  | 'sound' | 'music'                              // radio / podcast
  | 'video' | 'audio';                             // A/V two-column

export const ALL_ELEMENT_TYPES: ElementType[] = [
  'scene', 'action', 'character', 'dialogue', 'parenthetical', 'transition', 'shot', 'general',
  'lyrics', 'centered', 'act', 'endact', 'note', 'page', 'panel', 'caption', 'sfx', 'sound', 'music', 'video', 'audio',
];

/** b bold · i italic · u underline · x strike · hl highlight (v=color) · tag breakdown (v=element id) · cmt comment (v=comment id) */
/** si/sd: suggested insertion / deletion (v = suggestion id). */
export type MarkKind = 'b' | 'i' | 'u' | 'x' | 'hl' | 'tag' | 'cmt' | 'si' | 'sd';
export interface Mark { s: number; e: number; k: MarkKind; v?: string }

export interface Alternate { text: string; marks?: Mark[] }

export interface Block {
  id: string;
  type: ElementType;
  text: string;
  marks?: Mark[];
  /** Dual dialogue column. Consecutive L blocks followed by R blocks form a pair. */
  dual?: 'L' | 'R';
  /** Locked scene number (production). */
  num?: string;
  /** Omitted scene placeholder (production, keeps its number). */
  omitted?: boolean;
  /** Revision set id that last changed this block. */
  rev?: string;
  /** Bookmark label. */
  bookmark?: string;
  /** Alternate versions of this paragraph (the current one is `text`). */
  alts?: Alternate[];
  /** Whole-paragraph suggestion: proposed new paragraph or proposed removal. */
  sug?: { k: 'ins' | 'del'; id: string };
}

export type PaperSize = 'letter' | 'a4';
export type SceneNumberMode = 'none' | 'left' | 'right' | 'both';

export interface HeaderFooter { left: string; center: string; right: string }

export interface Watermark { enabled: boolean; text: string; opacity: number }

export interface PageSettings {
  paper: PaperSize;
  sceneNumbers: SceneNumberMode;
  /** Print (MORE) / (CONT'D) when dialogue breaks across pages. */
  moreContd: boolean;
  /** Automatically add (CONT'D) to a character who speaks again in the same scene after action. */
  autoContd: boolean;
  header: HeaderFooter;
  footer: HeaderFooter;
  /** Show the header/page number on page one. */
  firstPageHeader: boolean;
  watermark: Watermark;
  /** Tint pages of the current revision in exported PDFs. */
  revisionColorPages: boolean;
  /** Minutes per page used for duration estimates. */
  minutesPerPage: number;
}

export interface TitlePage {
  enabled: boolean;
  title: string;
  credit: string;      // "Escrito por"
  authors: string;
  source: string;      // "Basado en..."
  draft: string;       // "Primer borrador"
  date: string;
  contact: string;
  copyright: string;
  notes: string;
}

export type CardColor = 'none' | 'red' | 'orange' | 'yellow' | 'green' | 'teal' | 'blue' | 'violet' | 'pink' | 'gray';
export const CARD_COLORS: CardColor[] = ['none', 'red', 'orange', 'yellow', 'green', 'teal', 'blue', 'violet', 'pink', 'gray'];

export type SceneStatus = 'idea' | 'draft' | 'revised' | 'final';

export interface SceneMeta {
  color?: CardColor;
  summary?: string;
  status?: SceneStatus;
  /** Story-world day number (timeline). */
  storyDay?: number;
  /** Story-world time "HH:MM" (timeline). */
  storyTime?: string;
  /** Free cork-board position. */
  card?: { x: number; y: number };
  /** Emotional value per character id, -5..5 (character arcs). */
  arcs?: Record<string, number>;
  /** Manually assigned breakdown element ids (in addition to inline tags). */
  elements?: string[];
  /** Production notes for the breakdown sheet. */
  prodNotes?: string;
  /** Estimated shooting hours (stripboard). */
  shootHours?: number;
}

export interface CharacterProfile {
  id: string;
  name: string;           // uppercase screen name
  color: CardColor;
  role: string;
  bio: string;
  goal: string;
  need: string;
  arc: string;
  actor: string;
  castNumber?: number;
  voice?: { name: string; rate: number; pitch: number };
}

export interface LocationProfile { id: string; name: string; description: string; address: string; notes: string }

export interface IdeaCard { id: string; title: string; text: string; color: CardColor; x: number; y: number }

export interface Beat { id: string; name: string; description: string; pct: number; sceneIds: string[] }
export interface BeatBoard { sheet: string; beats: Beat[] }

export interface CommentReply { id: string; author: string; body: string; createdAt: string }
export interface Comment {
  id: string;
  author: string;
  body: string;
  createdAt: string;
  resolved: boolean;
  replies: CommentReply[];
  /** Anchor block; '' for a general note. */
  blockId: string;
  excerpt: string;
}

export type RevColor =
  | 'white' | 'blue' | 'pink' | 'yellow' | 'green' | 'goldenrod' | 'buff' | 'salmon' | 'cherry'
  | 'blue2' | 'pink2' | 'yellow2' | 'green2' | 'goldenrod2';
export const REVISION_SEQUENCE: RevColor[] = ['white', 'blue', 'pink', 'yellow', 'green', 'goldenrod', 'buff', 'salmon', 'cherry', 'blue2', 'pink2', 'yellow2', 'green2', 'goldenrod2'];

export interface RevisionSet { id: string; name: string; color: RevColor; date: string; mark: string }
export interface PageLock { label: string; blockId: string; offset: number }
export interface RevisionState {
  /** Revision mode: edits are stamped with the current set. */
  active: boolean;
  current: string;
  sets: RevisionSet[];
  /** Locked page starts (page 2 onwards) captured when pages were locked. */
  pageLocks: PageLock[] | null;
  scenesLocked: boolean;
}

export interface Draft { id: string; name: string; createdAt: string; blocks: Block[] }

export type BreakdownCategory =
  | 'cast' | 'extras' | 'stunts' | 'props' | 'wardrobe' | 'makeup' | 'vehicles' | 'animals'
  | 'sfx' | 'vfx' | 'sound' | 'music' | 'set' | 'weapons' | 'equipment' | 'notes';
export const BREAKDOWN_CATEGORIES: BreakdownCategory[] = ['cast', 'extras', 'stunts', 'props', 'wardrobe', 'makeup', 'vehicles', 'animals', 'sfx', 'vfx', 'sound', 'music', 'set', 'weapons', 'equipment', 'notes'];
export interface BreakdownElement { id: string; category: BreakdownCategory; name: string; notes: string }

export interface ShootDay { id: string; date: string; label: string; callTime: string; notes: string }
export interface Schedule {
  /** Ordered strips: scene block ids and 'day:<id>' separators. Scenes not listed are unscheduled. */
  order: string[];
  days: Record<string, ShootDay>;
}

export interface BudgetLine { id: string; section: 'atl' | 'production' | 'post' | 'other'; account: string; description: string; qty: number; units: number; unitLabel: string; rate: number }
export interface Budget { currency: string; fringePct: number; contingencyPct: number; lines: Record<string, BudgetLine> }

export interface CastCall { pickup: string; makeup: string; onSet: string; notes: string }
export interface CallSheet {
  id: string;
  dayId: string;
  generalCall: string;
  crewCall: string;
  location: string;
  parking: string;
  hospital: string;
  weather: string;
  notes: string;
  contacts: string;
  cast: Record<string, CastCall>;
}

export interface SeriesInfo { show: string; season: number; episode: number; episodeTitle: string }

export type ScriptLocale = 'en' | 'es-ES' | 'es-LA' | 'pt-BR';

export interface Project {
  schemaVersion: 2;
  id: string;
  title: string;
  author: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
  template: string;
  styleOverrides: Partial<Record<ElementType, Partial<import('./format').ElementStyle>>>;
  locale: ScriptLocale;
  page: PageSettings;
  titlePage: TitlePage;
  blocks: Block[];
  logline: string;
  synopsis: string;
  theme: string;
  notes: string;
  series?: SeriesInfo;
  scenes: Record<string, SceneMeta>;
  characters: Record<string, CharacterProfile>;
  locations: Record<string, LocationProfile>;
  cards: Record<string, IdeaCard>;
  beats: BeatBoard;
  comments: Record<string, Comment>;
  revisions: RevisionState;
  drafts: Record<string, Draft>;
  breakdown: { elements: Record<string, BreakdownElement> };
  schedule: Schedule;
  budget: Budget;
  callSheets: Record<string, CallSheet>;
  /** Words written per local day ("YYYY-MM-DD"). */
  writingLog: Record<string, { words: number; seconds: number }>;
  /** Pending suggestions (track changes), by id. */
  suggestions: Record<string, Suggestion>;
  /** Side-by-side translation, per paragraph id. */
  translation: Translation | null;
  /** Research board: images, links and notes linked to scenes, characters and locations. */
  research: Record<string, ResearchItem>;
  /** Only in a series bible (template "bible"). */
  bible?: SeriesBible;
}

export interface Suggestion { id: string; author: string; color: string; at: string }
export interface Translation { lang: string; blocks: Record<string, { text: string; src: string; at: string }> }
export type ResearchKind = 'image' | 'link' | 'note';
export interface ResearchItem {
  id: string; kind: ResearchKind; title: string; note: string; url: string;
  /** Downscaled image as a data URL (images only). */
  image: string;
  scenes: string[]; characters: string[]; locations: string[];
  color: CardColor; createdAt: string;
}
export interface SeriesBible {
  show: string; logline: string; premise: string; tone: string; world: string; arcs: string; notes: string;
  characters: Record<string, { name: string; description: string; actor: string }>;
  locations: Record<string, { name: string; description: string }>;
}

export interface ProjectSummary { id: string; title: string; updatedAt: string; scenes: number; words: number; template?: string; pages?: number; series?: SeriesInfo }

// ---------------------------------------------------------------------------------------------

export function uid(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  let s = '';
  for (let i = 0; i < 32; i++) s += Math.floor(Math.random() * 16).toString(16);
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-4${s.slice(13, 16)}-a${s.slice(17, 20)}-${s.slice(20, 32)}`;
}

export function nowIso(): string { return new Date().toISOString(); }

export function localDay(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function block(type: ElementType, text = '', extra: Partial<Block> = {}): Block {
  return { id: uid(), type, text, ...extra };
}

export function defaultPage(paper: PaperSize = 'letter'): PageSettings {
  return {
    paper,
    sceneNumbers: 'none',
    moreContd: true,
    autoContd: true,
    header: { left: '', center: '', right: '{page}.' },
    footer: { left: '', center: '', right: '' },
    firstPageHeader: false,
    watermark: { enabled: false, text: '', opacity: 0.12 },
    revisionColorPages: false,
    minutesPerPage: 1,
  };
}

export function defaultTitlePage(title = '', author = ''): TitlePage {
  return { enabled: true, title, credit: '', authors: author, source: '', draft: '', date: '', contact: '', copyright: '', notes: '' };
}

export function emptyProject(opts: { title?: string; author?: string; template?: string; locale?: ScriptLocale; paper?: PaperSize } = {}): Project {
  const now = nowIso();
  return {
    schemaVersion: 2,
    id: uid(),
    title: opts.title ?? '',
    author: opts.author ?? '',
    createdAt: now,
    updatedAt: now,
    revision: 1,
    template: opts.template ?? 'feature',
    styleOverrides: {},
    locale: opts.locale ?? 'es-LA',
    page: defaultPage(opts.paper ?? 'letter'),
    titlePage: defaultTitlePage(opts.title ?? '', opts.author ?? ''),
    blocks: [block('scene', '')],
    logline: '',
    synopsis: '',
    theme: '',
    notes: '',
    scenes: {},
    characters: {},
    locations: {},
    cards: {},
    beats: { sheet: '', beats: [] },
    comments: {},
    revisions: { active: false, current: '', sets: [], pageLocks: null, scenesLocked: false },
    drafts: {},
    breakdown: { elements: {} },
    schedule: { order: [], days: {} },
    budget: { currency: 'USD', fringePct: 0, contingencyPct: 10, lines: {} },
    callSheets: {},
    writingLog: {},
    suggestions: {},
    translation: null,
    research: {},
  };
}

export function clone<T>(value: T): T {
  return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

/** Words in a string (Unicode aware). */
export function countWords(text: string): number {
  const m = text.match(/[\p{L}\p{N}][\p{L}\p{N}'’\-]*/gu);
  return m ? m.length : 0;
}

export function projectWords(p: { blocks: Block[] }): number {
  let n = 0;
  for (const b of p.blocks) if (b.type !== 'note') n += countWords(b.text);
  return n;
}
