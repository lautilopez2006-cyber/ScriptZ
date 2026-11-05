// Script review ("doctor"): consistency and formatting problems a reader or a producer would notice.
// Pure: returns issues with an i18n key, values for the message and, when safe, an automatic fix.
import type { Block, Project } from './model';
import { characterName, parseHeading } from './scenes';
import { upperSameLength } from './text';

export type Severity = 'error' | 'warn' | 'info';
export interface Issue {
  id: string;
  kind: string;
  severity: Severity;
  blockId: string;
  /** i18n key (dr.*) and its values. */
  msg: string;
  vars?: Record<string, string | number>;
  fix?: { msg: string; vars?: Record<string, string | number>; apply: (blocks: Block[]) => Block[] };
}

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toUpperCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const STOP = new Set(['DE', 'DEL', 'LA', 'EL', 'LOS', 'LAS', 'THE', 'OF', 'DO', 'DA', 'DOS', 'DAS', 'A', 'O']);
const locKey = (s: string) => fold(s).split(' ').filter((w) => w && !STOP.has(w)).join(' ');

function lev(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, cur[j]);
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** Rename a character in cues (keeping extensions) and in action text (whole words). */
export function renameCharacterIn(blocks: Block[], from: string, to: string): Block[] {
  const re = new RegExp(`(^|[^\\p{L}\\p{N}])${from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^\\p{L}\\p{N}])`, 'gu');
  return blocks.map((b) => {
    if (b.type === 'character' && characterName(b.text) === from) {
      const rest = b.text.trim().slice(from.length);
      return { ...b, text: to + rest, marks: undefined };
    }
    if ((b.type === 'action' || b.type === 'general') && re.test(b.text)) {
      re.lastIndex = 0;
      const text = b.text.replace(re, (_m, pre: string) => pre + to);
      return text === b.text ? b : { ...b, text, marks: text.length === b.text.length ? b.marks : undefined };
    }
    return b;
  });
}

function renameLocationIn(blocks: Block[], from: string, to: string): Block[] {
  return blocks.map((b) => {
    if (b.type !== 'scene') return b;
    const h = parseHeading(b.text);
    if (h.location.toUpperCase() !== from) return b;
    const i = b.text.toUpperCase().indexOf(from);
    if (i < 0) return b;
    const text = b.text.slice(0, i) + to + b.text.slice(i + from.length);
    return { ...b, text, marks: text.length === b.text.length ? b.marks : undefined };
  });
}

const SPEECH = new Set(['dialogue', 'parenthetical', 'lyrics']);
const SCREEN = new Set(['feature', 'tv', 'multicam']);

export function reviewScript(p: Pick<Project, 'blocks' | 'template' | 'comments' | 'suggestions'>): Issue[] {
  const blocks = p.blocks.filter((b) => b.sug?.k !== 'del');
  const out: Issue[] = [];
  const add = (i: Omit<Issue, 'id'>) => out.push({ ...i, id: `${i.kind}:${i.blockId}:${out.length}` });
  const screenplay = SCREEN.has(p.template);

  // --- Character names: same person spelled two ways.
  const cues = new Map<string, { count: number; first: string }>();
  for (const b of blocks) if (b.type === 'character') {
    const n = characterName(b.text);
    if (!n) continue;
    const c = cues.get(n);
    if (c) c.count++; else cues.set(n, { count: 1, first: b.id });
  }
  const names = [...cues.keys()];
  const flagged = new Set<string>();
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
    const a = names[i], b = names[j];
    const fa = fold(a), fb = fold(b);
    const similar = fa === fb || (Math.min(fa.length, fb.length) >= 4 && lev(fa, fb, 1) <= 1 && fa.split(' ').length === fb.split(' ').length);
    if (!similar) continue;
    const [keep, drop] = cues.get(a)!.count >= cues.get(b)!.count ? [a, b] : [b, a];
    if (flagged.has(drop)) continue;
    flagged.add(drop);
    add({
      kind: 'char-variant', severity: fa === fb ? 'warn' : 'info', blockId: cues.get(drop)!.first,
      msg: fa === fb ? 'dr.charVariant' : 'dr.charSimilar', vars: { a: drop, b: keep, n: cues.get(drop)!.count },
      fix: { msg: 'dr.fix.unify', vars: { a: drop, b: keep }, apply: (bs) => renameCharacterIn(bs, drop, keep) },
    });
  }

  // --- Locations: "CASA DE MARA" vs "CASA MARA".
  const locs = new Map<string, { raw: string; count: number; first: string }[]>();
  for (const b of blocks) if (b.type === 'scene') {
    const loc = parseHeading(b.text).location.toUpperCase();
    if (!loc) continue;
    const k = locKey(loc);
    const list = locs.get(k) ?? [];
    const hit = list.find((x) => x.raw === loc);
    if (hit) hit.count++; else list.push({ raw: loc, count: 1, first: b.id });
    locs.set(k, list);
  }
  for (const list of locs.values()) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => b.count - a.count);
    for (const v of sorted.slice(1)) add({
      kind: 'loc-variant', severity: 'warn', blockId: v.first, msg: 'dr.locVariant', vars: { a: v.raw, b: sorted[0].raw, n: v.count },
      fix: { msg: 'dr.fix.unify', vars: { a: v.raw, b: sorted[0].raw }, apply: (bs) => renameLocationIn(bs, v.raw, sorted[0].raw) },
    });
  }

  // --- Structure: cues without lines, lines without cues, headings.
  const firstSpeech = new Map<string, string>();
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const next = blocks[i + 1];
    if (b.type === 'character') {
      const n = characterName(b.text);
      if (!firstSpeech.has(n)) firstSpeech.set(n, b.id);
      if (!next || !SPEECH.has(next.type)) add({ kind: 'silent-cue', severity: 'error', blockId: b.id, msg: 'dr.silentCue', vars: { a: n || '—' } });
      if (b.text.trim() && b.text !== upperSameLength(b.text) && !/\(/.test(b.text)) add({
        kind: 'cue-case', severity: 'info', blockId: b.id, msg: 'dr.cueCase', vars: { a: b.text.trim() },
        fix: { msg: 'dr.fix.upper', apply: (bs) => bs.map((x) => (x.id === b.id ? { ...x, text: upperSameLength(x.text) } : x)) },
      });
    }
    if (b.type === 'dialogue' || b.type === 'parenthetical') {
      let j = i - 1;
      while (j >= 0 && (blocks[j].type === 'parenthetical' || blocks[j].type === 'dialogue' || blocks[j].type === 'lyrics')) j--;
      if (j < 0 || blocks[j].type !== 'character') add({ kind: 'orphan-line', severity: 'error', blockId: b.id, msg: 'dr.orphanLine' });
    }
    if (b.type === 'parenthetical' && b.text.trim() && !/^\s*\(.*\)\s*$/s.test(b.text)) add({
      kind: 'paren', severity: 'info', blockId: b.id, msg: 'dr.paren',
      fix: { msg: 'dr.fix.paren', apply: (bs) => bs.map((x) => (x.id === b.id ? { ...x, text: `(${x.text.trim().replace(/^\(|\)$/g, '')})`, marks: undefined } : x)) },
    });
    if (b.type === 'scene') {
      if (!b.text.trim()) add({ kind: 'empty-heading', severity: 'error', blockId: b.id, msg: 'dr.emptyHeading' });
      else if (screenplay) {
        const h = parseHeading(b.text);
        if (!h.intExt) add({ kind: 'heading-prefix', severity: 'warn', blockId: b.id, msg: 'dr.headingPrefix', vars: { a: b.text.trim() } });
        else if (!h.time) add({ kind: 'heading-time', severity: 'info', blockId: b.id, msg: 'dr.headingTime', vars: { a: b.text.trim() } });
      }
      if (next && next.type === 'scene') add({ kind: 'empty-scene', severity: 'info', blockId: b.id, msg: 'dr.emptyScene', vars: { a: b.text.trim() || '—' } });
    }
    if (b.type === 'transition' && b.text.trim() && b.text.trim() !== upperSameLength(b.text.trim())) add({
      kind: 'transition-case', severity: 'info', blockId: b.id, msg: 'dr.transitionCase', vars: { a: b.text.trim() },
      fix: { msg: 'dr.fix.upper', apply: (bs) => bs.map((x) => (x.id === b.id ? { ...x, text: upperSameLength(x.text) } : x)) },
    });
    if ((b.type === 'action' || b.type === 'general') && !b.text.trim() && i > 0 && i < blocks.length - 1) add({
      kind: 'empty', severity: 'info', blockId: b.id, msg: 'dr.empty',
      fix: { msg: 'dr.fix.remove', apply: (bs) => (bs.length > 1 ? bs.filter((x) => x.id !== b.id) : bs) },
    });
    if (b.type === 'action' && b.text.length > 360) add({ kind: 'long-action', severity: 'info', blockId: b.id, msg: 'dr.longAction', vars: { n: Math.round(b.text.length / 60) } });
    if (b.type === 'dialogue' && b.text.length > 420) add({ kind: 'long-speech', severity: 'info', blockId: b.id, msg: 'dr.longSpeech', vars: { n: Math.round(b.text.length / 35) } });
  }

  // --- Introductions: a speaking character should appear in capitals in the action before speaking.
  if (screenplay) {
    for (const [name, cueId] of firstSpeech) {
      if (!name || name.length < 2) continue;
      const until = blocks.findIndex((b) => b.id === cueId);
      const re = new RegExp(`(^|[^\\p{L}])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^\\p{L}])`, 'u');
      const introduced = blocks.slice(0, until).some((b) => b.type === 'action' && re.test(b.text));
      if (!introduced) add({ kind: 'intro', severity: 'info', blockId: cueId, msg: 'dr.intro', vars: { a: name } });
    }
  }

  // --- Pending review work.
  const openComments = Object.values(p.comments).filter((c) => !c.resolved).length;
  if (openComments) add({ kind: 'comments', severity: 'info', blockId: '', msg: 'dr.comments', vars: { n: openComments } });
  const pending = new Set<string>();
  for (const b of p.blocks) { if (b.sug) pending.add(b.sug.id); for (const m of b.marks ?? []) if ((m.k === 'si' || m.k === 'sd') && m.v) pending.add(m.v); }
  if (pending.size) add({ kind: 'suggestions', severity: 'warn', blockId: '', msg: 'dr.suggestions', vars: { n: pending.size } });

  const rank: Record<Severity, number> = { error: 0, warn: 1, info: 2 };
  const order = new Map(p.blocks.map((b, i) => [b.id, i]));
  return out.sort((a, b) => rank[a.severity] - rank[b.severity] || (order.get(a.blockId) ?? 1e9) - (order.get(b.blockId) ?? 1e9));
}
