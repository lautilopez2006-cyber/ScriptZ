// Story development helpers: scene moves, beat sheets, timeline ordering.
import { uid, type Beat, type Block, type Project } from './model';
import { buildScenes, type SceneInfo } from './scenes';

/** Move the scene `sceneId` (heading + content) before `beforeId` (null = to the end). */
export function moveScene(blocks: Block[], sceneId: string, beforeId: string | null): Block[] {
  const scenes = buildScenes(blocks);
  const s = scenes.find((x) => x.id === sceneId);
  if (!s || sceneId === beforeId) return blocks;
  const chunk = blocks.slice(s.start, s.end);
  const rest = [...blocks.slice(0, s.start), ...blocks.slice(s.end)];
  let at = rest.length;
  if (beforeId) {
    const i = rest.findIndex((b) => b.id === beforeId);
    if (i >= 0) at = i;
  }
  return [...rest.slice(0, at), ...chunk, ...rest.slice(at)];
}

export interface BeatTemplate { id: string; name: string; beats: { name: string; pct: number; description: string }[] }

const STC = (es: boolean): BeatTemplate => ({
  id: 'stc', name: es ? 'Salva al gato (Blake Snyder)' : 'Save the Cat (Blake Snyder)',
  beats: [
    [es ? 'Imagen de apertura' : 'Opening Image', 0, es ? 'Una foto del mundo y del protagonista antes del viaje.' : 'A snapshot of the hero’s world before the journey.'],
    [es ? 'Tema enunciado' : 'Theme Stated', 5, es ? 'Alguien dice en voz alta la lección que el héroe aprenderá.' : 'Someone states the lesson the hero will learn.'],
    [es ? 'Planteamiento' : 'Set-Up', 1, es ? 'El mundo ordinario, lo que le falta al protagonista.' : 'The ordinary world and what the hero lacks.'],
    [es ? 'Catalizador' : 'Catalyst', 10, es ? 'El suceso que lo cambia todo.' : 'The life-changing event.'],
    [es ? 'Debate' : 'Debate', 12, es ? 'Dudas: ¿debería ir?' : 'Doubt: should I go?'],
    [es ? 'Paso al segundo acto' : 'Break into Two', 20, es ? 'Decide entrar en el mundo nuevo.' : 'The hero chooses to enter a new world.'],
    [es ? 'Historia B' : 'B Story', 22, es ? 'La relación que encarna el tema.' : 'The relationship that carries the theme.'],
    [es ? 'Juegos y diversión' : 'Fun and Games', 25, es ? 'La promesa de la premisa.' : 'The promise of the premise.'],
    [es ? 'Punto medio' : 'Midpoint', 50, es ? 'Falsa victoria o falsa derrota; suben las apuestas.' : 'False victory or defeat; stakes rise.'],
    [es ? 'Los malos se acercan' : 'Bad Guys Close In', 55, es ? 'Presión externa e interna.' : 'External and internal pressure.'],
    [es ? 'Todo está perdido' : 'All Is Lost', 75, es ? 'El momento más bajo.' : 'The lowest point.'],
    [es ? 'Noche oscura del alma' : 'Dark Night of the Soul', 77, es ? 'El héroe procesa la pérdida.' : 'The hero wallows and reflects.'],
    [es ? 'Paso al tercer acto' : 'Break into Three', 80, es ? 'La solución aparece.' : 'The solution appears.'],
    [es ? 'Final' : 'Finale', 82, es ? 'El héroe aplica lo aprendido.' : 'The hero applies the lesson.'],
    [es ? 'Imagen final' : 'Final Image', 99, es ? 'El reflejo opuesto de la imagen de apertura.' : 'The opposite of the opening image.'],
  ].map(([name, pct, description]) => ({ name: name as string, pct: pct as number, description: description as string })),
});

const HERO = (es: boolean): BeatTemplate => ({
  id: 'hero', name: es ? 'Viaje del héroe (Vogler)' : 'Hero’s Journey (Vogler)',
  beats: [
    [es ? 'Mundo ordinario' : 'Ordinary World', 0], [es ? 'Llamada a la aventura' : 'Call to Adventure', 10], [es ? 'Rechazo de la llamada' : 'Refusal of the Call', 14],
    [es ? 'Encuentro con el mentor' : 'Meeting the Mentor', 18], [es ? 'Cruce del umbral' : 'Crossing the Threshold', 25], [es ? 'Pruebas, aliados y enemigos' : 'Tests, Allies, Enemies', 32],
    [es ? 'Acercamiento a la caverna' : 'Approach to the Inmost Cave', 45], [es ? 'Odisea (calvario)' : 'The Ordeal', 55], [es ? 'Recompensa' : 'Reward', 65],
    [es ? 'Camino de regreso' : 'The Road Back', 75], [es ? 'Resurrección' : 'Resurrection', 88], [es ? 'Regreso con el elixir' : 'Return with the Elixir', 97],
  ].map(([name, pct]) => ({ name: name as string, pct: pct as number, description: '' })),
});

const THREE = (es: boolean): BeatTemplate => ({
  id: 'three', name: es ? 'Tres actos (Syd Field)' : 'Three-Act Structure (Syd Field)',
  beats: [
    [es ? 'Planteamiento' : 'Setup', 0], [es ? 'Incidente detonante' : 'Inciting Incident', 10], [es ? 'Primer punto de giro' : 'Plot Point 1', 25],
    [es ? 'Pinza 1' : 'Pinch 1', 37], [es ? 'Punto medio' : 'Midpoint', 50], [es ? 'Pinza 2' : 'Pinch 2', 62], [es ? 'Segundo punto de giro' : 'Plot Point 2', 75],
    [es ? 'Clímax' : 'Climax', 90], [es ? 'Resolución' : 'Resolution', 97],
  ].map(([name, pct]) => ({ name: name as string, pct: pct as number, description: '' })),
});

const SEVEN = (es: boolean): BeatTemplate => ({
  id: 'seven', name: es ? 'Estructura de siete puntos' : 'Seven-Point Structure',
  beats: [
    [es ? 'Gancho' : 'Hook', 0], [es ? 'Giro 1' : 'Plot Turn 1', 15], [es ? 'Pinza 1' : 'Pinch 1', 35], [es ? 'Punto medio' : 'Midpoint', 50],
    [es ? 'Pinza 2' : 'Pinch 2', 65], [es ? 'Giro 2' : 'Plot Turn 2', 85], [es ? 'Resolución' : 'Resolution', 97],
  ].map(([name, pct]) => ({ name: name as string, pct: pct as number, description: '' })),
});

const CIRCLE = (es: boolean): BeatTemplate => ({
  id: 'circle', name: es ? 'Círculo de la historia (Dan Harmon)' : 'Story Circle (Dan Harmon)',
  beats: [
    [es ? '1. Un personaje en su zona de confort' : '1. You (comfort zone)', 0], [es ? '2. Quiere algo' : '2. Need', 12], [es ? '3. Entra en una situación desconocida' : '3. Go', 25],
    [es ? '4. Se adapta' : '4. Search', 37], [es ? '5. Consigue lo que quería' : '5. Find', 50], [es ? '6. Paga un precio alto' : '6. Take', 62],
    [es ? '7. Vuelve a su situación familiar' : '7. Return', 75], [es ? '8. Habiendo cambiado' : '8. Change', 90],
  ].map(([name, pct]) => ({ name: name as string, pct: pct as number, description: '' })),
});

const KISHO = (es: boolean): BeatTemplate => ({
  id: 'kisho', name: es ? 'Kishōtenketsu (cuatro actos)' : 'Kishōtenketsu (four acts)',
  beats: [[es ? 'Ki: introducción' : 'Ki: introduction', 0], [es ? 'Shō: desarrollo' : 'Shō: development', 25], [es ? 'Ten: giro' : 'Ten: twist', 50], [es ? 'Ketsu: conclusión' : 'Ketsu: reconciliation', 75]]
    .map(([name, pct]) => ({ name: name as string, pct: pct as number, description: '' })),
});

export function beatTemplates(lang: string): BeatTemplate[] {
  const es = lang !== 'en';
  return [STC(es), HERO(es), THREE(es), SEVEN(es), CIRCLE(es), KISHO(es)];
}

export function beatsFromTemplate(tpl: BeatTemplate): Beat[] {
  return tpl.beats.map((b) => ({ id: uid(), name: b.name, description: b.description, pct: b.pct, sceneIds: [] }));
}

/** Story-chronological order of scenes (by day/time; scenes without data keep script order). */
export function chronological(p: Project, scenes: SceneInfo[]): SceneInfo[] {
  const key = (s: SceneInfo, i: number) => {
    const m = p.scenes[s.id];
    const day = m?.storyDay ?? NaN;
    const [hh, mm] = (m?.storyTime ?? '').split(':').map(Number);
    return { s, i, day, time: Number.isFinite(hh) ? hh * 60 + (mm || 0) : NaN };
  };
  const list = scenes.map(key);
  // Fill missing days with the previous known day (keeps continuity).
  let lastDay = 1, lastTime = -1;
  for (const x of list) {
    if (Number.isFinite(x.day)) lastDay = x.day; else x.day = lastDay;
    if (Number.isFinite(x.time)) lastTime = x.time; else x.time = lastTime;
  }
  return list.sort((a, b) => a.day - b.day || a.time - b.time || a.i - b.i).map((x) => x.s);
}
