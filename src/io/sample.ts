// Guided sample: an original short screenplay that exercises every ScriptZ feature.
import { block, emptyProject, uid, type Block, type ElementType, type Project } from '../core/model';
import { adoptProject } from '../app/actions';
import { getState } from '../app/store';
import { t } from '../i18n';

type Line = [ElementType, string, Partial<Block>?];

const ES: Line[] = [
  ['transition', 'FADE IN:'],
  ['scene', 'EXT. FARO DE PUNTA MÉDANOS - AMANECER'],
  ['action', 'El mar golpea los escalones de piedra. Un faro blanco, descascarado, se recorta contra un cielo color ceniza. Hace años que nadie lo enciende.'],
  ['action', 'MARA (17), campera inflable y mochila gastada, sube el último tramo de la escalera exterior. Se detiene. Arriba, en la linterna, algo parpadea.'],
  ['character', 'MARA'],
  ['parenthetical', '(sin aliento)'],
  ['dialogue', 'No puede ser.'],
  ['note', 'Nota del guion: este primer destello tiene que sentirse como un llamado, no como una amenaza.'],
  ['scene', 'INT. FARO - SALA DE RADIO - CONTINUO'],
  ['action', 'Polvo, mapas náuticos clavados con chinches oxidadas, una radio de válvulas que zumba sola. TOMÁS (18), auriculares al cuello, gira una perilla con cuidado de cirujano.'],
  ['character', 'TOMÁS'],
  ['dialogue', 'Llegó otra vez. Siempre a la misma hora: seis y doce.'],
  ['character', 'MARA'],
  ['dialogue', '¿Y de dónde viene?'],
  ['character', 'TOMÁS'],
  ['parenthetical', '(señala el mapa)'],
  ['dialogue', 'De acá. De la costa vieja. La que se tragó el mar en el noventa y ocho.'],
  ['action', 'Mara se acerca al mapa. Con el dedo recorre una línea de costa tachada en rojo.'],
  ['character', 'MARA', { dual: 'L' }],
  ['dialogue', 'Ahí no queda nadie.', { dual: 'L' }],
  ['character', 'TOMÁS', { dual: 'R' }],
  ['dialogue', 'Ahí no queda nada.', { dual: 'R' }],
  ['action', 'La radio CHISPORROTEA. Una voz, muy lejos, cuenta números en un idioma que ninguno de los dos reconoce.'],
  ['transition', 'CORTE A:'],
  ['scene', 'EXT. ACANTILADO - ATARDECER'],
  ['action', 'Mara y Tomás bajan por un sendero de arena. Llevan una antena improvisada hecha con una percha y cinta aislante. El viento les tironea la ropa.'],
  ['character', 'TOMÁS'],
  ['dialogue', 'Mi abuelo decía que el faro tenía un gemelo del otro lado. Que se hablaban con luces.'],
  ['character', 'MARA'],
  ['dialogue', 'Tu abuelo también decía que había ballenas que cantaban tangos.'],
  ['character', 'TOMÁS'],
  ['dialogue', 'Y nunca le probaste lo contrario.'],
  ['action', 'Mara sonríe a pesar suyo. Levanta la antena. A lo lejos, sobre el horizonte, una SEGUNDA LUZ responde: tres destellos cortos, uno largo.'],
  ['scene', 'INT. CASA DE MARA - COCINA - NOCHE'],
  ['action', 'Una cocina chica, ordenada con esmero. Sobre la heladera, una foto: un hombre con gorra de capitán abraza a una Mara de siete años. ELENA (45), la madre, lava una taza que ya está limpia.'],
  ['character', 'ELENA'],
  ['dialogue', '¿Otra vez en el faro?'],
  ['character', 'MARA'],
  ['dialogue', 'Alguien está mandando señales, ma. Desde donde estaba el puerto.'],
  ['action', 'Elena cierra la canilla. Se queda quieta, de espaldas.'],
  ['character', 'ELENA'],
  ['parenthetical', '(muy bajo)'],
  ['dialogue', 'Tu papá también las vio.'],
  ['transition', 'FUNDIDO A NEGRO.'],
  ['centered', 'FIN'],
];

export function buildSample(): Project {
  const p = emptyProject({ title: 'La última luz', author: 'Equipo ScriptZ', template: 'feature', locale: 'es-LA', paper: 'letter' });
  p.blocks = ES.map(([type, text, extra]) => block(type, text, extra ?? {}));
  p.titlePage = { ...p.titlePage, title: 'La última luz', credit: 'Guion de', authors: 'Equipo ScriptZ', draft: 'Borrador de ejemplo', date: new Date().toLocaleDateString('es-AR'), contact: 'ejemplo@scriptz.app', copyright: 'Obra de ejemplo · Uso libre' };
  p.logline = 'Dos adolescentes descubren que un faro abandonado recibe señales de una costa que desapareció hace veinte años, y que esas señales podrían explicar qué le pasó al padre de una de ellas.';
  p.synopsis = 'En un pueblo costero, Mara y Tomás siguen una frecuencia imposible que llega todas las mañanas a las 6:12. La búsqueda los lleva al pasado de la familia de Mara.';
  p.theme = 'La memoria sobrevive a la distancia.';
  const scenes = p.blocks.filter((b) => b.type === 'scene');
  const meta: [string, Project['scenes'][string]][] = [
    [scenes[0].id, { summary: 'Mara descubre que el faro abandonado vuelve a destellar.', color: 'blue', status: 'final', storyDay: 1, storyTime: '06:10', arcs: {} }],
    [scenes[1].id, { summary: 'Tomás le muestra la señal: llega desde la costa sumergida.', color: 'teal', status: 'revised', storyDay: 1, storyTime: '06:15' }],
    [scenes[2].id, { summary: 'Prueban una antena casera y una segunda luz les responde.', color: 'orange', status: 'draft', storyDay: 1, storyTime: '19:30' }],
    [scenes[3].id, { summary: 'Elena revela que el padre de Mara también vio las señales.', color: 'pink', status: 'draft', storyDay: 1, storyTime: '22:00' }],
  ];
  for (const [id, m] of meta) p.scenes[id] = m;
  const mara = uid(), tomas = uid(), elena = uid();
  p.characters = {
    [mara]: { id: mara, name: 'MARA', color: 'blue', role: 'Protagonista', bio: '17 años. Obstinada, observadora. Busca respuestas sobre su padre desaparecido.', goal: 'Descubrir quién manda las señales.', need: 'Aceptar la ausencia de su padre.', arc: 'De la negación a la verdad.', actor: '' },
    [tomas]: { id: tomas, name: 'TOMÁS', color: 'teal', role: 'Aliado', bio: '18 años. Radioaficionado, nieto del último farero.', goal: 'Probar que su abuelo tenía razón.', need: 'Confiar en alguien más que en las máquinas.', arc: 'Del aislamiento a la amistad.', actor: '' },
    [elena]: { id: elena, name: 'ELENA', color: 'pink', role: 'Madre de Mara', bio: '45 años. Guarda un secreto desde hace diez años.', goal: 'Proteger a Mara.', need: 'Contar la verdad.', arc: 'Del silencio a la confesión.', actor: '' },
  };
  p.scenes[scenes[0].id].arcs = { [mara]: 1 };
  p.scenes[scenes[1].id].arcs = { [mara]: 2, [tomas]: 2 };
  p.scenes[scenes[2].id].arcs = { [mara]: 3, [tomas]: 4 };
  p.scenes[scenes[3].id].arcs = { [mara]: -3, [elena]: -2 };
  // A comment and production tags so the panels have something to show.
  const action = p.blocks[2];
  const cid = uid();
  action.marks = [{ s: 0, e: 37, k: 'cmt', v: cid }];
  p.comments[cid] = { id: cid, author: 'Equipo ScriptZ', body: 'Probá responder este comentario o resolverlo. Seleccioná cualquier texto y pulsá Ctrl+Alt+M para crear otro.', createdAt: new Date().toISOString(), resolved: false, replies: [], blockId: action.id, excerpt: action.text.slice(0, 37) };
  const radioBlock = p.blocks[9];
  const radio = uid(), antenna = uid();
  p.breakdown.elements[radio] = { id: radio, category: 'props', name: 'Radio de válvulas', notes: 'Tiene que funcionar en cámara.' };
  p.breakdown.elements[antenna] = { id: antenna, category: 'props', name: 'Antena casera', notes: '' };
  const ri = radioBlock.text.indexOf('una radio de válvulas');
  if (ri >= 0) radioBlock.marks = [{ s: ri + 4, e: ri + 21, k: 'tag', v: radio }];
  const ab = p.blocks.find((b) => b.text.startsWith('Mara y Tomás bajan'))!;
  const ai = ab.text.indexOf('antena improvisada');
  if (ai >= 0) ab.marks = [{ s: ai, e: ai + 18, k: 'tag', v: antenna }];
  const mapLine = p.blocks.find((b) => b.text.startsWith('Mara se acerca'))!;
  mapLine.marks = [{ s: 0, e: mapLine.text.length, k: 'hl', v: 'yellow' }];
  p.blocks.find((b) => b.text.startsWith('La radio CHISPORROTEA'))!.bookmark = 'La voz';
  p.notes = 'Este es un proyecto de ejemplo. Explorá las Tarjetas, la Estructura, la Línea de tiempo, los Personajes y la Producción: todo está conectado con el guion.';
  return p;
}

export async function openSample(): Promise<void> {
  const p = buildSample();
  if (getState().library.some((x) => x.title === p.title)) p.title = `${p.title} (${new Date().toLocaleDateString()})`;
  await adoptProject(p, { message: t('home.sampleOpened') });
}
