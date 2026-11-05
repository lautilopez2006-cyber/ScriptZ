// Spelling for the script: underlines unknown words in the visible pages (CSS Custom Highlight API,
// no DOM changes) and offers suggestions. The dictionary runs in a worker.
import type { Block } from '../core/model';
import { characterName, parseHeading } from '../core/scenes';

export type SpellVariant = 'auto' | 'es-AR' | 'es-MX' | 'es' | 'en' | 'pt' | 'fr' | 'it';
export const SPELL_VARIANTS: SpellVariant[] = ['auto', 'es-AR', 'es-MX', 'es', 'en', 'pt', 'fr', 'it'];

export interface Pos { id: string; off: number }
export interface SpellEditor {
  highlight(name: string, ranges: { a: Pos; b: Pos }[]): void;
  scroller(): HTMLElement;
  getSelection(): { anchor: Pos; focus: Pos } | null;
}

const WORD = /[\p{L}\p{M}]+(?:['’][\p{L}\p{M}]+)*/gu;
const SKIP_TYPES = new Set(['page']);

/** Which dictionary to use for a script locale when the setting is "auto". */
export function resolveVariant(v: SpellVariant, locale: string): Exclude<SpellVariant, 'auto'> {
  if (v !== 'auto') return v;
  const nav = (typeof navigator !== 'undefined' ? navigator.language : '').toLowerCase();
  if (locale.startsWith('en')) return 'en';
  if (locale.startsWith('pt')) return 'pt';
  if (locale.startsWith('fr')) return 'fr';
  if (locale.startsWith('it')) return 'it';
  if (locale === 'es-ES' || nav === 'es-es') return 'es';
  if (/^es-(ar|uy|py)/.test(nav)) return 'es-AR';
  return nav.startsWith('es-') ? 'es-MX' : 'es-AR';
}

let worker: Worker | null = null;
let seq = 0;
const waiters = new Map<number, (v: unknown) => void>();
function getWorker(): Worker | null {
  if (worker) return worker;
  if (typeof Worker === 'undefined') return null;
  try {
    worker = new Worker(new URL('./spell.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const d = e.data as { type: string; id?: number; key?: string };
      if (d.type === 'ready' || d.type === 'error') { for (const l of readyListeners) l(d.key ?? '', d.type === 'ready'); return; }
      const w = d.id !== undefined ? waiters.get(d.id) : undefined;
      if (w) { waiters.delete(d.id!); w(d); }
    };
  } catch { worker = null; }
  return worker;
}
const readyListeners = new Set<(key: string, ok: boolean) => void>();

function ask<T>(msg: Record<string, unknown>): Promise<T> {
  const w = getWorker();
  if (!w) return Promise.reject(new Error('no-worker'));
  const id = ++seq;
  return new Promise<T>((res) => { waiters.set(id, res as (v: unknown) => void); w.postMessage({ ...msg, id }); });
}

export async function suggestionsFor(word: string): Promise<string[]> {
  try { return (await ask<{ list: string[] }>({ type: 'suggest', word })).list; } catch { return []; }
}

/** Words that belong to this script: character names and places are never misspelled. */
export function scriptWords(blocks: Block[]): Set<string> {
  const out = new Set<string>();
  const addAll = (s: string) => { for (const m of s.matchAll(WORD)) { out.add(m[0].toLowerCase()); } };
  for (const b of blocks) {
    if (b.type === 'character') addAll(characterName(b.text));
    else if (b.type === 'scene') addAll(parseHeading(b.text).location);
  }
  return out;
}

export class SpellController {
  private ed: SpellEditor;
  private getBlocks: () => Block[];
  private host: HTMLElement;
  private key = '';
  private ready = false;
  private known = new Map<string, boolean>();
  private pendingCheck = new Set<string>();
  private timer = 0;
  private lastType = 0;
  private personal = new Set<string>();
  private ignored = new Set<string>();
  private names = new Set<string>();
  private namesFor: Block[] | null = null;
  /** Current misspellings, for the context menu. */
  ranges: { a: Pos; b: Pos; word: string }[] = [];
  enabled = false;
  private onScroll = () => this.schedule(120);
  private readyL = (key: string, ok: boolean) => { if (key === this.key) { this.ready = ok; this.known.clear(); this.schedule(0); } };

  constructor(ed: SpellEditor, host: HTMLElement, getBlocks: () => Block[]) {
    this.ed = ed; this.host = host; this.getBlocks = getBlocks;
    readyListeners.add(this.readyL);
    ed.scroller().addEventListener('scroll', this.onScroll, { passive: true });
  }

  configure(opts: { enabled: boolean; variant: Exclude<SpellVariant, 'auto'>; personal: string[] }): void {
    this.enabled = opts.enabled;
    this.personal = new Set(opts.personal.map((w) => w.toLowerCase()));
    if (!opts.enabled) { this.clear(); return; }
    if (this.key !== opts.variant) {
      this.key = opts.variant;
      this.ready = false;
      this.known.clear();
      const base = typeof document !== 'undefined' ? document.baseURI : '';
      getWorker()?.postMessage({ type: 'load', key: opts.variant, aff: new URL(`dict/${opts.variant}.aff`, base).href, dic: new URL(`dict/${opts.variant}.dic`, base).href, personal: opts.personal });
    }
    this.schedule(0);
  }

  /** Call on every edit. */
  typed(): void { this.lastType = Date.now(); this.schedule(700); }

  schedule(ms = 400): void {
    if (!this.enabled) return;
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => void this.run(), ms);
  }

  ignore(word: string): void { this.ignored.add(word.toLowerCase()); this.schedule(0); }

  private clear(): void { this.ranges = []; this.ed.highlight('sz-spell', []); }

  private visibleBlocks(): Block[] {
    const sc = this.ed.scroller();
    const top = sc === document.scrollingElement ? 0 : sc.getBoundingClientRect().top;
    const h = sc.clientHeight || window.innerHeight;
    const byId = new Map(this.getBlocks().map((b) => [b.id, b]));
    const out: Block[] = [];
    for (const el of this.host.querySelectorAll<HTMLElement>('.b[data-id]')) {
      const r = el.getBoundingClientRect();
      if (r.bottom < top - h || r.top > top + 2 * h) continue;
      const b = byId.get(el.dataset.id!);
      if (b && !SKIP_TYPES.has(b.type)) out.push(b);
    }
    return out;
  }

  private ok(word: string): boolean | undefined {
    const lw = word.toLowerCase();
    if (word.length < 2 || this.personal.has(lw) || this.ignored.has(lw) || this.names.has(lw)) return true;
    if (word.length <= 4 && word === word.toUpperCase() && /^[A-ZÑ]+$/u.test(word)) return true; // INT, EXT, ONU…
    return this.known.get(word);
  }

  private async run(): Promise<void> {
    if (!this.enabled || !this.ready) { if (!this.enabled) this.clear(); return; }
    const all = this.getBlocks();
    if (this.namesFor !== all) { this.names = scriptWords(all); this.namesFor = all; }
    const blocks = this.visibleBlocks();
    const sel = this.ed.getSelection();
    const typing = Date.now() - this.lastType < 1500;
    const found: { a: Pos; b: Pos; word: string }[] = [];
    const unknown = new Set<string>();
    for (const b of blocks) {
      for (const m of b.text.matchAll(WORD)) {
        const s = m.index!, e = s + m[0].length;
        if (typing && sel && sel.focus.id === b.id && sel.focus.off >= s && sel.focus.off <= e) continue; // still being typed
        const v = this.ok(m[0]);
        if (v === undefined) { unknown.add(m[0]); continue; }
        if (!v) found.push({ a: { id: b.id, off: s }, b: { id: b.id, off: e }, word: m[0] });
      }
    }
    const ask1 = [...unknown].filter((w) => !this.pendingCheck.has(w));
    if (ask1.length) {
      for (const w of ask1) this.pendingCheck.add(w);
      try {
        const r = await ask<{ words: string[]; bad: string[] }>({ type: 'check', words: ask1 });
        const bad = new Set(r.bad);
        for (const w of r.words) { this.known.set(w, !bad.has(w)); this.pendingCheck.delete(w); }
      } catch { return; }
      this.schedule(0);
      return;
    }
    this.ranges = found;
    this.ed.highlight('sz-spell', found);
  }

  /** Misspelling at a model position, if any. */
  at(pos: Pos | null): { a: Pos; b: Pos; word: string } | null {
    if (!pos) return null;
    return this.ranges.find((r) => r.a.id === pos.id && r.a.off <= pos.off && pos.off <= r.b.off) ?? null;
  }

  addWord(word: string): void { this.personal.add(word.toLowerCase()); getWorker()?.postMessage({ type: 'add', words: [word] }); this.known.set(word, true); this.schedule(0); }

  destroy(): void {
    window.clearTimeout(this.timer);
    readyListeners.delete(this.readyL);
    this.ed.scroller().removeEventListener('scroll', this.onScroll);
    this.clear();
  }
}
