import { test, eq, ok } from './harness';
import { emptyProject, type Block } from '../src/core/model';
import { addAlternate, cycleAlternate, useAlternate } from '../src/core/alts';
import { translatedProject, translationProgress, bilingualHtml } from '../src/core/translation';
import { seriesShelf, epCode } from '../src/core/series';
import { sidesPlan } from '../src/io/sides';
import { loadProject, serializeProject } from '../src/core/migrate';
import { buildScenes } from '../src/core/scenes';

let n = 0;
const B = (type: Block['type'], text: string): Block => ({ id: 'x' + n++, type, text });

test('alternate lines cycle without losing any version', () => {
  let b = B('dialogue', 'Primera.');
  b = addAlternate(b);
  b = { ...b, text: 'Segunda.' };
  b = cycleAlternate(b, 1);
  eq(b.text, 'Primera.');
  b = cycleAlternate(b, 1);
  eq(b.text, 'Segunda.');
  eq(b.alts!.length, 1);
  const u = useAlternate(b, 0);
  eq(u.text, 'Primera.');
  eq(u.alts![0].text, 'Segunda.');
});

test('translation: progress, stale detection and translated export', () => {
  const p = emptyProject({ title: 'Faro' });
  p.blocks = [B('scene', 'INT. FARO - NOCHE'), B('action', 'Mara enciende la lámpara.'), B('character', 'MARA'), B('dialogue', 'Ya sé.')];
  p.translation = { lang: 'en', blocks: { [p.blocks[0].id]: { text: 'INT. LIGHTHOUSE - NIGHT', src: 'INT. FARO - NOCHE', at: '' }, [p.blocks[3].id]: { text: 'I know.', src: 'Ya lo sé.', at: '' } } };
  eq(translationProgress(p), { total: 3, done: 2, stale: 1 });
  const tp = translatedProject(p);
  eq(tp.blocks.map((b) => b.text), ['INT. LIGHTHOUSE - NIGHT', 'Mara enciende la lámpara.', 'MARA', 'I know.']);
  eq(tp.locale, 'en');
  const html = bilingualHtml(p, { original: 'Original', translation: 'Translation' });
  ok(html.includes('LIGHTHOUSE') && html.includes('FARO'), 'both columns');
  const back = loadProject(JSON.parse(serializeProject(p)));
  eq(back.translation!.blocks[p.blocks[3].id].src, 'Ya lo sé.');
});

test('series shelf groups episodes in order and keeps the bible apart', () => {
  const s = (id: string, show: string, season: number, episode: number, template = 'tv') => ({ id, title: id, updatedAt: '', scenes: 0, words: 0, template, series: { show, season, episode, episodeTitle: '' } });
  const shelf = seriesShelf([s('e2', 'Faro', 1, 2), s('b', 'faro', 0, 0, 'bible'), s('e1', 'Faro', 1, 1), s('o', 'Otra', 2, 1), { id: 'f', title: 'Peli', updatedAt: '', scenes: 0, words: 0 }]);
  eq(shelf.map((x) => x.show), ['Faro', 'Otra']);
  eq(shelf[0].episodes.map((e) => e.id), ['e1', 'e2']);
  eq(shelf[0].bible?.id, 'b');
  eq(epCode({ season: 1, episode: 3 }), 'T1·E03');
});

test('sides keep only the pages of the chosen scenes', () => {
  const p = emptyProject({ title: 'Sides' });
  const long = 'Algo pasa en la sala y nadie dice nada durante mucho tiempo. '.repeat(14);
  p.blocks = [];
  for (let i = 0; i < 6; i++) p.blocks.push(B('scene', `INT. LUGAR ${i} - DÍA`), B('action', long), B('action', long));
  const scenes = buildScenes(p.blocks);
  const plan = sidesPlan(p, [scenes[3].id]);
  ok(plan.pages.length >= 1 && plan.pages.length <= 2, 'pages ' + plan.pages.join(','));
  ok(plan.keep.has(scenes[3].id) && !plan.keep.has(scenes[0].id), 'keep set');
  ok(plan.pages[0] > 0, 'not the first page');
});
