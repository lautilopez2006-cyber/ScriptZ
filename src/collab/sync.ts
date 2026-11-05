// Project ⇄ synchronised document, and local change detection.
import type { Block, Project } from '../core/model';
import { diffBlocks } from '../core/diff';
import { marksEqual } from '../core/marks';
import { mapMarks, stableStringify, textDiff, type Change, type DocOp, type SyncDoc } from './ot';

/** Top-level fields replaced as a whole. */
const SCALARS = ['title', 'author', 'template', 'styleOverrides', 'locale', 'page', 'titlePage', 'logline', 'synopsis', 'theme', 'notes', 'series', 'beats', 'revisions', 'scheduleOrder', 'budgetSettings', 'translationLang', 'bible'] as const;
/** Keyed collections merged per entry. */
const COLLECTIONS = ['scenes', 'characters', 'locations', 'cards', 'comments', 'drafts', 'breakdownElements', 'scheduleDays', 'budgetLines', 'callSheets', 'suggestions', 'translationBlocks', 'research'] as const;

export function projectToDoc(p: Project): SyncDoc {
  return {
    blocks: p.blocks,
    meta: {
      title: p.title, author: p.author, template: p.template, styleOverrides: p.styleOverrides, locale: p.locale, page: p.page, titlePage: p.titlePage,
      logline: p.logline, synopsis: p.synopsis, theme: p.theme, notes: p.notes, series: p.series ?? null, beats: p.beats, revisions: p.revisions,
      scheduleOrder: p.schedule.order, budgetSettings: { currency: p.budget.currency, fringePct: p.budget.fringePct, contingencyPct: p.budget.contingencyPct },
      scenes: p.scenes, characters: p.characters, locations: p.locations, cards: p.cards, comments: p.comments, drafts: p.drafts,
      breakdownElements: p.breakdown.elements, scheduleDays: p.schedule.days, budgetLines: p.budget.lines, callSheets: p.callSheets,
      suggestions: p.suggestions, translationLang: p.translation ? p.translation.lang : null, translationBlocks: p.translation?.blocks ?? {}, research: p.research, bible: p.bible ?? null,
    },
  };
}

export function docToProject(base: Project, d: SyncDoc): Project {
  const m = d.meta as Record<string, unknown>;
  const bs = (m.budgetSettings ?? {}) as { currency?: string; fringePct?: number; contingencyPct?: number };
  return {
    ...base,
    blocks: d.blocks,
    title: (m.title as string) ?? base.title,
    author: (m.author as string) ?? base.author,
    template: (m.template as string) ?? base.template,
    styleOverrides: (m.styleOverrides as Project['styleOverrides']) ?? base.styleOverrides,
    locale: (m.locale as Project['locale']) ?? base.locale,
    page: (m.page as Project['page']) ?? base.page,
    titlePage: (m.titlePage as Project['titlePage']) ?? base.titlePage,
    logline: (m.logline as string) ?? '', synopsis: (m.synopsis as string) ?? '', theme: (m.theme as string) ?? '', notes: (m.notes as string) ?? '',
    series: (m.series as Project['series']) ?? undefined,
    beats: (m.beats as Project['beats']) ?? base.beats,
    revisions: (m.revisions as Project['revisions']) ?? base.revisions,
    scenes: (m.scenes as Project['scenes']) ?? {},
    characters: (m.characters as Project['characters']) ?? {},
    locations: (m.locations as Project['locations']) ?? {},
    cards: (m.cards as Project['cards']) ?? {},
    comments: (m.comments as Project['comments']) ?? {},
    drafts: (m.drafts as Project['drafts']) ?? {},
    breakdown: { elements: (m.breakdownElements as Project['breakdown']['elements']) ?? {} },
    schedule: { order: (m.scheduleOrder as string[]) ?? [], days: (m.scheduleDays as Project['schedule']['days']) ?? {} },
    budget: { currency: bs.currency ?? 'USD', fringePct: bs.fringePct ?? 0, contingencyPct: bs.contingencyPct ?? 10, lines: (m.budgetLines as Project['budget']['lines']) ?? {} },
    callSheets: (m.callSheets as Project['callSheets']) ?? {},
    suggestions: (m.suggestions as Project['suggestions']) ?? {},
    translation: m.translationLang ? { lang: m.translationLang as string, blocks: (m.translationBlocks as NonNullable<Project['translation']>['blocks']) ?? {} } : null,
    research: (m.research as Project['research']) ?? {},
    bible: (m.bible as Project['bible']) ?? undefined,
  };
}

const ATTRS = ['type', 'dual', 'num', 'omitted', 'rev', 'bookmark', 'sug', 'alts'] as const;

function blockOps(before: Block, after: Block): DocOp[] {
  const ops: DocOp[] = [];
  const attrs: Record<string, unknown> = {};
  for (const k of ATTRS) if (stableStringify(before[k] ?? null) !== stableStringify(after[k] ?? null)) attrs[k] = after[k] ?? null;
  if (Object.keys(attrs).length) ops.push({ t: 'attr', id: after.id, attrs });
  let shifted = before.marks;
  if (before.text !== after.text) {
    const op = textDiff(before.text, after.text);
    ops.push({ t: 'text', id: after.id, op });
    shifted = mapMarks(before.marks, op, after.text.length);
  }
  if (!marksEqual(shifted, after.marks)) ops.push({ t: 'marks', id: after.id, marks: after.marks ?? null });
  return ops;
}

/** Change turning `a` into `b`. */
export function diffDocs(a: SyncDoc, b: SyncDoc): Change {
  const ops: Change = [];
  if (a.blocks !== b.blocks) {
    for (const o of diffBlocks(a.blocks, b.blocks)) {
      if (o.t === 'del') ops.push({ t: 'del', id: o.id });
      else if (o.t === 'ins') ops.push({ t: 'ins', block: o.block, after: o.after });
      else ops.push(...blockOps(o.before, o.after));
    }
  }
  if (a.meta !== b.meta) {
    for (const k of SCALARS) {
      const x = a.meta[k], y = b.meta[k];
      if (x !== y && stableStringify(x) !== stableStringify(y)) ops.push({ t: 'meta', path: [k], value: y ?? null });
    }
    for (const k of COLLECTIONS) {
      const x = (a.meta[k] ?? {}) as Record<string, unknown>, y = (b.meta[k] ?? {}) as Record<string, unknown>;
      if (x === y) continue;
      for (const key of new Set([...Object.keys(x), ...Object.keys(y)])) {
        if (x[key] === y[key]) continue;
        if (stableStringify(x[key]) !== stableStringify(y[key])) ops.push({ t: 'meta', path: [k, key], value: y[key] ?? null });
      }
    }
  }
  return ops;
}
