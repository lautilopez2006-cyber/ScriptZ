// Sides: the actors' pages for a shooting day. Pages that hold the day's scenes, everything else crossed out.
import type { Project } from '../core/model';
import { buildScenes } from '../core/scenes';
import { layoutProject } from '../core/layout';
import { officialProject } from '../core/suggest';

export interface SidesRequest { sceneIds: string[]; title: string }

export function sidesPlan(p0: Project, sceneIds: string[]): { pages: number[]; keep: Set<string> } {
  const p = officialProject(p0);
  const scenes = buildScenes(p.blocks);
  const keep = new Set<string>();
  for (const s of scenes) if (sceneIds.includes(s.id)) for (let i = s.start; i < s.end; i++) keep.add(p.blocks[i].id);
  const layout = layoutProject(p);
  const pages: number[] = [];
  layout.pages.forEach((pg, i) => { if (pg.lines.some((l) => keep.has(l.blockId))) pages.push(i); });
  return { pages, keep };
}

export async function buildSides(p0: Project, req: SidesRequest): Promise<Uint8Array> {
  const p = officialProject(p0);
  const { pages, keep } = sidesPlan(p, req.sceneIds);
  const { scriptToPdf } = await import('./pdf/script');
  const { loadPdfFonts, rasterGlyph } = await import('./exporters');
  const r = await scriptToPdf({ ...p, titlePage: { ...p.titlePage, enabled: false } }, await loadPdfFonts(), {
    titlePage: false,
    pages,
    header: (_i, label) => ({ left: req.title, center: '', right: `${label}.` }),
    strike: (l) => !keep.has(l.blockId),
    raster: typeof document !== 'undefined' ? rasterGlyph : undefined,
  });
  return r.bytes;
}
