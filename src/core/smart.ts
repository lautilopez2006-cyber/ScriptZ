// SmartType suggestions and advanced find/replace.
import type { Block, ElementType, Project } from './model';
import { localeTokens } from './format';
import { buildScenes, characterName, characterStats, locationsOf, parseHeading } from './scenes';

export interface Suggestions { items: string[]; from: number; to: number; kind: ElementType }

export interface SmartContext { characters: string[]; locations: string[]; times: string[]; prefixes: string[]; transitions: string[]; extensions: string[] }

export function smartContext(project: Project): SmartContext {
  const tokens = localeTokens(project.locale);
  const stats = characterStats(project.blocks).map((c) => c.name);
  const profiles = Object.values(project.characters).map((c) => c.name.toUpperCase()).filter(Boolean);
  const characters = [...new Set([...stats, ...profiles])];
  const scenes = buildScenes(project.blocks);
  const locs = [...new Set([...locationsOf(scenes).map((l) => l.name), ...Object.values(project.locations).map((l) => l.name.toUpperCase())])].filter(Boolean);
  const usedTimes = scenes.map((s) => s.parsed.time).filter(Boolean);
  const times = [...new Set([...tokens.times, ...usedTimes])];
  return { characters, locations: locs, times, prefixes: tokens.scenePrefixes, transitions: tokens.transitions, extensions: tokens.extensions };
}

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toUpperCase();

function filterStart(list: string[], typed: string, max = 8): string[] {
  const f = fold(typed.trim());
  const others = list.filter((x) => fold(x).startsWith(f) && fold(x) !== f);
  // When the typed text already is a known value, keep it first so Enter never changes it.
  const exact = list.find((x) => fold(x) === f);
  const out = others.length && exact ? [exact, ...others] : others;
  if (out.length < max && f.length >= 2) for (const x of list) if (!out.includes(x) && fold(x).includes(f) && fold(x) !== f) out.push(x);
  return out.slice(0, max);
}

/** Suggestions for the element at the caret (only when the caret is at the end). */
export function suggest(b: Block, offset: number, ctx: SmartContext): Suggestions | null {
  if (offset !== b.text.length) return null;
  const text = b.text;
  if (b.type === 'scene') {
    const m = /^(\S*)(\s*)/.exec(text)!;
    const hasPrefix = ctx.prefixes.some((p) => fold(text).startsWith(fold(p) + ' ') || fold(text) === fold(p) + ' ');
    if (!hasPrefix) {
      if (text.includes(' ')) return null;
      const items = filterStart(ctx.prefixes, m[1]).map((p) => p + ' ');
      return items.length ? { items, from: 0, to: text.length, kind: 'scene' } : null;
    }
    const prefix = ctx.prefixes.slice().sort((a, b2) => b2.length - a.length).find((p) => fold(text).startsWith(fold(p) + ' '))!;
    const rest = text.slice(prefix.length + 1);
    const dash = /\s[-–—]\s?/.exec(rest);
    if (!dash) {
      const items = filterStart(ctx.locations, rest).map((l) => l + ' - ');
      return items.length ? { items, from: prefix.length + 1, to: text.length, kind: 'scene' } : null;
    }
    const timeStart = prefix.length + 1 + dash.index + dash[0].length;
    const typed = text.slice(timeStart);
    const items = filterStart(ctx.times, typed);
    return items.length ? { items, from: timeStart, to: text.length, kind: 'scene' } : null;
  }
  if (b.type === 'character') {
    const paren = text.lastIndexOf('(');
    if (paren >= 0 && !text.slice(paren).includes(')')) {
      const typed = text.slice(paren + 1);
      const items = filterStart(ctx.extensions, typed, 8).map((e) => e + ')');
      if (!typed) items.splice(0, items.length, ...ctx.extensions.map((e) => e + ')'));
      return items.length ? { items, from: paren + 1, to: text.length, kind: 'character' } : null;
    }
    if (text.includes('(')) return null;
    const items = text ? filterStart(ctx.characters, text) : ctx.characters.slice(0, 8);
    return items.length ? { items, from: 0, to: text.length, kind: 'character' } : null;
  }
  if (b.type === 'transition') {
    const items = text ? filterStart(ctx.transitions, text) : ctx.transitions.slice(0, 8);
    return items.length ? { items, from: 0, to: text.length, kind: 'transition' } : null;
  }
  return null;
}

// ---------------------------------------------------------------- find & replace

export interface FindOptions {
  query: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  regex: boolean;
  /** Restrict to element types (empty = all). */
  types: ElementType[];
  /** Restrict to dialogue spoken by this character. */
  character: string;
}

export interface Match { id: string; s: number; e: number }

export function buildRegex(o: FindOptions): RegExp | null {
  if (!o.query) return null;
  let src = o.regex ? o.query : o.query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (o.wholeWord) src = `(?<![\\p{L}\\p{N}_])(?:${src})(?![\\p{L}\\p{N}_])`;
  try { return new RegExp(src, (o.caseSensitive ? 'g' : 'gi') + 'u'); } catch { return null; }
}

export function findAll(blocks: Block[], o: FindOptions, limit = 5000): Match[] {
  const re = buildRegex(o);
  if (!re) return [];
  const out: Match[] = [];
  const speaker = o.character ? o.character.toUpperCase() : '';
  let current = '';
  for (const b of blocks) {
    if (b.type === 'character') current = characterName(b.text);
    else if (b.type !== 'dialogue' && b.type !== 'parenthetical') current = '';
    if (o.types.length && !o.types.includes(b.type)) continue;
    if (speaker && !((b.type === 'dialogue' || b.type === 'parenthetical') && current === speaker) && !(b.type === 'character' && characterName(b.text) === speaker)) continue;
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(b.text))) {
      if (m[0].length === 0) { re.lastIndex++; continue; }
      out.push({ id: b.id, s: m.index, e: m.index + m[0].length });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

/** Replacement text for one match (supports $1 groups in regex mode). */
export function replacementFor(b: Block, m: Match, o: FindOptions, replace: string): string {
  if (!o.regex) return preserveCase(b.text.slice(m.s, m.e), replace, o.caseSensitive);
  const re = buildRegex({ ...o, wholeWord: false });
  if (!re) return replace;
  const src = b.text.slice(m.s, m.e);
  return src.replace(new RegExp(re.source, re.flags.replace('g', '')), replace);
}

function preserveCase(found: string, rep: string, caseSensitive: boolean): string {
  if (caseSensitive || !rep) return rep;
  if (found === found.toUpperCase() && /\p{L}/u.test(found)) return rep.toUpperCase();
  if (found[0] && found[0] === found[0].toUpperCase() && found.slice(1) === found.slice(1).toLowerCase()) return rep[0].toUpperCase() + rep.slice(1);
  return rep;
}

export function sceneHeadingParts(text: string) { return parseHeading(text); }
