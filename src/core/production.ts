// Pre-production: breakdown per scene, stripboard, call sheets and budget math.
import type { BreakdownCategory, BreakdownElement, Project } from './model';
import { buildScenes, type SceneInfo } from './scenes';
import { layoutProject, sceneLengths } from './layout';

export const CATEGORY_HEX: Record<BreakdownCategory, string> = {
  cast: '#e53935', extras: '#43a047', stunts: '#fb8c00', props: '#8e24aa', wardrobe: '#1e88e5', makeup: '#d81b60', vehicles: '#f9a825', animals: '#6d4c41',
  sfx: '#00acc1', vfx: '#5e35b1', sound: '#546e7a', music: '#7cb342', set: '#00897b', weapons: '#c62828', equipment: '#757575', notes: '#9e9e9e',
};

export interface SceneBreakdown {
  scene: SceneInfo;
  pages: number;
  /** Element ids by category, including inline tags and manual assignments. */
  elements: Map<BreakdownCategory, BreakdownElement[]>;
  cast: string[];
}

/** Element ids tagged in each scene. */
export function taggedByScene(p: Project): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  let scene = '';
  for (const b of p.blocks) {
    if (b.type === 'scene') scene = b.id;
    if (!scene) continue;
    for (const m of b.marks ?? []) {
      if (m.k !== 'tag' || !m.v) continue;
      let set = out.get(scene);
      if (!set) { set = new Set(); out.set(scene, set); }
      set.add(m.v);
    }
  }
  return out;
}

export function breakdown(p: Project): SceneBreakdown[] {
  const scenes = buildScenes(p.blocks);
  const lengths = sceneLengths(layoutProject(p), p.blocks);
  const tagged = taggedByScene(p);
  return scenes.map((s) => {
    const ids = new Set([...(tagged.get(s.id) ?? []), ...(p.scenes[s.id]?.elements ?? [])]);
    const elements = new Map<BreakdownCategory, BreakdownElement[]>();
    for (const id of ids) {
      const e = p.breakdown.elements[id];
      if (!e) continue;
      const list = elements.get(e.category) ?? [];
      list.push(e);
      elements.set(e.category, list);
    }
    return { scene: s, pages: lengths.get(s.id) ?? 0, elements, cast: s.speakers };
  });
}

/** Movie Magic strip colors. */
export function stripColor(s: SceneInfo): { bg: string; ink: string; key: string } {
  const night = s.parsed.dayNight === 'night';
  const ext = s.parsed.intExt === 'ext';
  if (ext && night) return { bg: '#2e7d32', ink: '#fff', key: 'EXT/N' };
  if (!ext && night) return { bg: '#1e56b4', ink: '#fff', key: 'INT/N' };
  if (ext) return { bg: '#ffe066', ink: '#222', key: 'EXT/D' };
  return { bg: '#ffffff', ink: '#222', key: 'INT/D' };
}

export interface DayPlan { dayId: string | null; scenes: string[]; pages: number }

/** Split schedule order into days (scenes before the first day marker belong to "unscheduled day 0"). */
export function plannedDays(p: Project, lengths: Map<string, number>): { days: DayPlan[]; unscheduled: string[] } {
  const sceneIds = new Set(buildScenes(p.blocks).filter((s) => !s.omitted).map((s) => s.id));
  const days: DayPlan[] = [];
  let cur: DayPlan | null = null;
  const placed = new Set<string>();
  for (const item of p.schedule.order) {
    if (item.startsWith('day:')) {
      const id = item.slice(4);
      if (!p.schedule.days[id]) continue;
      cur = { dayId: id, scenes: [], pages: 0 };
      days.push(cur);
    } else if (sceneIds.has(item) && cur) {
      cur.scenes.push(item);
      cur.pages += lengths.get(item) ?? 0;
      placed.add(item);
    }
  }
  const unscheduled = [...sceneIds].filter((id) => !placed.has(id));
  return { days, unscheduled };
}

export interface BudgetTotals { sections: Record<string, number>; subtotal: number; fringe: number; contingency: number; total: number }

export function budgetTotals(p: Project): BudgetTotals {
  const sections: Record<string, number> = { atl: 0, production: 0, post: 0, other: 0 };
  for (const l of Object.values(p.budget.lines)) sections[l.section] = (sections[l.section] ?? 0) + (l.qty || 0) * (l.units || 0) * (l.rate || 0);
  const subtotal = Object.values(sections).reduce((a, b) => a + b, 0);
  const fringe = ((sections.atl + sections.production) * (p.budget.fringePct || 0)) / 100;
  const contingency = ((subtotal + fringe) * (p.budget.contingencyPct || 0)) / 100;
  return { sections, subtotal, fringe, contingency, total: subtotal + fringe + contingency };
}
