// Series helpers shared by Home and the series workspace.
import type { ProjectSummary } from './model';

export const BIBLE_TEMPLATE = 'bible';
export const isBible = (p: { template?: string }) => p.template === BIBLE_TEMPLATE;
export const epCode = (s?: { season: number; episode: number }) => (s ? `T${s.season}·E${String(s.episode).padStart(2, '0')}` : '');

export interface ShowEntry { show: string; episodes: ProjectSummary[]; bible?: ProjectSummary }

/** Shows in the library, with their episodes in order. */
export function seriesShelf(library: ProjectSummary[]): ShowEntry[] {
  const map = new Map<string, ShowEntry>();
  for (const p of library) {
    const show = p.series?.show?.trim();
    if (!show) continue;
    const k = show.toLocaleUpperCase();
    const e = map.get(k) ?? { show, episodes: [] };
    if (isBible(p)) e.bible = p; else e.episodes.push(p);
    map.set(k, e);
  }
  for (const e of map.values()) e.episodes.sort((a, b) => (a.series!.season - b.series!.season) || (a.series!.episode - b.series!.episode));
  return [...map.values()].sort((a, b) => a.show.localeCompare(b.show));
}
