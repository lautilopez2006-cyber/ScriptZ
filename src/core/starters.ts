// Starter skeletons: a structure to fill in for each kind of script, with notes that explain each part.
import { uid, type Block, type ElementType, type ScriptLocale } from './model';
import { localeTokens } from './format';

export interface Starter { id: string; template: string; name: string; desc: string; pages: string }

/** Shown in the "New script" dialog, per format. name/desc are i18n keys. */
export const STARTERS: Starter[] = [
  { id: 'short', template: 'feature', name: 'sx.short', desc: 'sx.short.d', pages: '8–15' },
  { id: 'feature', template: 'feature', name: 'sx.feature', desc: 'sx.feature.d', pages: '90–120' },
  { id: 'pilot', template: 'tv', name: 'sx.pilot', desc: 'sx.pilot.d', pages: '45–60' },
  { id: 'sitcom', template: 'multicam', name: 'sx.sitcom', desc: 'sx.sitcom.d', pages: '40–50' },
  { id: 'play', template: 'stage', name: 'sx.play', desc: 'sx.play.d', pages: '—' },
  { id: 'doc', template: 'av', name: 'sx.doc', desc: 'sx.doc.d', pages: '—' },
  { id: 'radio', template: 'audio', name: 'sx.radio', desc: 'sx.radio.d', pages: '—' },
  { id: 'comic', template: 'comic', name: 'sx.comic', desc: 'sx.comic.d', pages: '22' },
];

type L = 'es' | 'en' | 'pt';
const lang = (l: ScriptLocale): L => (l.startsWith('en') ? 'en' : l.startsWith('pt') ? 'pt' : 'es');
const b = (type: ElementType, text: string): Block => ({ id: uid(), type, text });

/** Notes in three languages: [es, en, pt]. */
type T3 = [string, string, string];
const pick = (l: L, s: T3) => s[l === 'es' ? 0 : l === 'en' ? 1 : 2];

function heading(l: ScriptLocale, ie: 0 | 1, place: T3, time: number): string {
  const tk = localeTokens(l);
  return `${tk.scenePrefixes[ie]} ${pick(lang(l), place).toUpperCase()} - ${tk.times[time]}`;
}

export function starterBlocks(id: string, locale: ScriptLocale): Block[] {
  const l = lang(locale);
  const tk = localeTokens(locale);
  const n = (s: T3) => b('note', pick(l, s));
  const fadeIn = b('transition', tk.transitions.find((x) => /FADE IN|FUNDIDO DE ENTRADA/.test(x)) ?? 'FADE IN:');
  const fadeOut = b('transition', tk.transitions.find((x) => /FADE OUT|FUNDIDO A NEGRO/.test(x)) ?? 'FADE OUT.');
  const PLACE: T3 = ['lugar', 'location', 'local'];
  const sc = (time = 0, ie: 0 | 1 = 0, place: T3 = PLACE) => b('scene', heading(locale, ie, place, time));
  const act = (i: number) => b('act', tk.acts[i]);
  const end = (i: number) => b('endact', pick(l, ['FIN DEL ', 'END OF ', 'FIM DO ']) + tk.acts[i]);
  switch (id) {
    case 'short': return [
      fadeIn,
      n(['PLANTEO (pág. 1–3). Presentá al protagonista en su mundo y mostrá qué quiere. En un corto no hay tiempo: entrá tarde a la escena.', 'SETUP (pp. 1–3). Show the lead in their world and what they want. Shorts have no time: enter late.', 'APRESENTAÇÃO (p. 1–3). Mostre o protagonista no seu mundo e o que ele quer. Em curta não há tempo: entre tarde na cena.']),
      sc(0), b('action', ''),
      n(['GIRO (pág. 4–8). Algo cambia y obliga al personaje a actuar. Una sola complicación bien elegida alcanza.', 'TURN (pp. 4–8). Something changes and forces a choice. One well-chosen complication is enough.', 'VIRADA (p. 4–8). Algo muda e obriga o personagem a agir. Uma única complicação bem escolhida basta.']),
      sc(1, 1), b('action', ''),
      n(['FINAL (últimas 2 páginas). La decisión del personaje y su consecuencia. Una imagen final que quede.', 'ENDING (last 2 pages). The character\'s choice and its consequence. A final image that lingers.', 'FINAL (últimas 2 páginas). A decisão do personagem e sua consequência. Uma imagem final que fique.']),
      sc(0), b('action', ''),
      fadeOut,
    ];
    case 'feature': {
      const beat = (s: T3, time = 0, ie: 0 | 1 = 0) => [n(s), sc(time, ie), b('action', '')];
      return [
        fadeIn,
        b('act', pick(l, ['PRIMER ACTO', 'ACT ONE', 'PRIMEIRO ATO'])),
        ...beat(['IMAGEN DE APERTURA (pág. 1). El tono y el mundo de la película en una imagen.', 'OPENING IMAGE (p. 1). The film\'s tone and world in one image.', 'IMAGEM DE ABERTURA (p. 1). O tom e o mundo do filme numa imagem.']),
        ...beat(['PLANTEO (pág. 1–10). Quién es el protagonista, qué le falta, qué está en juego.', 'SETUP (pp. 1–10). Who the lead is, what they lack, what\'s at stake.', 'APRESENTAÇÃO (p. 1–10). Quem é o protagonista, o que lhe falta, o que está em jogo.'], 1),
        ...beat(['INCIDENTE INCITADOR (pág. 10–15). El hecho que rompe la rutina.', 'INCITING INCIDENT (pp. 10–15). The event that breaks the routine.', 'INCIDENTE INCITANTE (p. 10–15). O fato que quebra a rotina.'], 0, 1),
        ...beat(['PRIMER PUNTO DE GIRO (pág. 25–30). El protagonista decide y entra en el mundo nuevo. No hay vuelta atrás.', 'FIRST TURNING POINT (pp. 25–30). The lead commits and enters the new world. No way back.', 'PRIMEIRO PONTO DE VIRADA (p. 25–30). O protagonista decide e entra no mundo novo. Não há volta.']),
        b('act', pick(l, ['SEGUNDO ACTO', 'ACT TWO', 'SEGUNDO ATO'])),
        ...beat(['JUEGOS Y DIVERSIÓN (pág. 30–55). La promesa de la premisa: lo que el público vino a ver.', 'FUN AND GAMES (pp. 30–55). The promise of the premise: what the audience came to see.', 'DIVERSÃO E JOGOS (p. 30–55). A promessa da premissa: o que o público veio ver.'], 0, 1),
        ...beat(['PUNTO MEDIO (pág. 55–60). Falsa victoria o falsa derrota. Suben las apuestas.', 'MIDPOINT (pp. 55–60). False victory or false defeat. Stakes rise.', 'PONTO MÉDIO (p. 55–60). Falsa vitória ou falsa derrota. As apostas sobem.'], 1),
        ...beat(['LOS MALOS SE ACERCAN (pág. 60–75). Presión externa y conflicto interno.', 'BAD GUYS CLOSE IN (pp. 60–75). External pressure and inner conflict.', 'OS VILÕES SE APROXIMAM (p. 60–75). Pressão externa e conflito interno.']),
        ...beat(['TODO ESTÁ PERDIDO (pág. 75–85). El punto más bajo. Algo o alguien muere, literal o simbólicamente.', 'ALL IS LOST (pp. 75–85). The lowest point. Something or someone dies, literally or not.', 'TUDO ESTÁ PERDIDO (p. 75–85). O ponto mais baixo. Algo ou alguém morre, literal ou simbolicamente.'], 1),
        b('act', pick(l, ['TERCER ACTO', 'ACT THREE', 'TERCEIRO ATO'])),
        ...beat(['CLÍMAX (pág. 85–110). El protagonista usa lo que aprendió para enfrentar el conflicto final.', 'CLIMAX (pp. 85–110). The lead uses what they learned to face the final conflict.', 'CLÍMAX (p. 85–110). O protagonista usa o que aprendeu para enfrentar o conflito final.'], 1, 1),
        ...beat(['IMAGEN FINAL. El espejo de la imagen de apertura: cuánto cambió todo.', 'FINAL IMAGE. The mirror of the opening image: how much has changed.', 'IMAGEM FINAL. O espelho da imagem de abertura: quanto tudo mudou.']),
        fadeOut,
      ];
    }
    case 'pilot': return [
      act(0),
      n(['TEASER (2–5 pág.). Un gancho fuerte antes de los títulos: el tono y la pregunta de la serie.', 'TEASER (2–5 pp.). A strong hook before the titles: the show\'s tone and question.', 'TEASER (2–5 p.). Um gancho forte antes dos créditos: o tom e a pergunta da série.']),
      sc(1, 1), b('action', ''), end(0),
      act(1), n(['ACTO UNO. Presentá el mundo, el protagonista y el motor que va a generar episodios.', 'ACT ONE. Introduce the world, the lead and the engine that will generate episodes.', 'ATO UM. Apresente o mundo, o protagonista e o motor que vai gerar episódios.']), sc(0), b('action', ''), end(1),
      act(2), n(['ACTO DOS. Complicá. Cada acto termina con una pregunta que obliga a volver después de la pausa.', 'ACT TWO. Complicate. Every act ends with a question that brings viewers back after the break.', 'ATO DOIS. Complique. Cada ato termina com uma pergunta que traz o público de volta.']), sc(1), b('action', ''), end(2),
      act(3), n(['ACTO TRES. El conflicto del episodio llega a su punto máximo.', 'ACT THREE. The episode\'s conflict peaks.', 'ATO TRÊS. O conflito do episódio chega ao máximo.']), sc(0, 1), b('action', ''), end(3),
      act(4), n(['ACTO CUATRO. Resolvé el episodio y abrí la temporada.', 'ACT FOUR. Resolve the episode and open up the season.', 'ATO QUATRO. Resolva o episódio e abra a temporada.']), sc(1), b('action', ''), end(4),
      act(6), n(['TAG (opcional). Una escena corta final: un remate o un anzuelo.', 'TAG (optional). A short last scene: a button or a hook.', 'TAG (opcional). Uma cena curta final: um arremate ou um gancho.']), sc(0), b('action', ''),
    ];
    case 'sitcom': return [
      b('act', pick(l, ['COLD OPEN', 'COLD OPEN', 'COLD OPEN'])),
      n(['COLD OPEN (2–3 pág.). Un chiste corto y autónomo antes de los títulos.', 'COLD OPEN (2–3 pp.). A short, self-contained bit before the titles.', 'COLD OPEN (2–3 p.). Uma piada curta e autônoma antes dos créditos.']),
      sc(0), b('action', ''),
      act(1), n(['ESCENA A. Planteo de la trama A. En multicámara las acciones van en mayúsculas y todo a doble espacio.', 'SCENE A. Set up the A story. In multi-camera, action is in capitals and double-spaced.', 'CENA A. Apresente a trama A. Em multicâmera, as ações vão em maiúsculas e espaço duplo.']), sc(0), b('action', ''),
      n(['ESCENA B. Trama B, en paralelo.', 'SCENE B. B story, in parallel.', 'CENA B. Trama B, em paralelo.']), sc(1), b('action', ''), end(1),
      act(2), n(['ESCENA C. Las tramas chocan. El malentendido llega al máximo.', 'SCENE C. The stories collide. The misunderstanding peaks.', 'CENA C. As tramas colidem. O mal-entendido chega ao máximo.']), sc(0), b('action', ''),
      n(['ESCENA D. Resolución y abrazo (o no).', 'SCENE D. Resolution and hug (or not).', 'CENA D. Resolução e abraço (ou não).']), sc(1), b('action', ''), end(2),
      act(6), sc(0), b('action', ''),
    ];
    case 'play': return [
      n(['PERSONAJES: listá aquí a los personajes con una línea que los describa.', 'CHARACTERS: list the characters here with a one-line description.', 'PERSONAGENS: liste aqui os personagens com uma linha de descrição.']),
      act(1),
      b('scene', pick(l, ['ESCENA 1', 'SCENE 1', 'CENA 1'])),
      b('action', pick(l, ['(Descripción del espacio escénico. Dónde está cada cosa, qué ve el público al subir el telón.)', '(Description of the set. Where everything is, what the audience sees as the curtain rises.)', '(Descrição do cenário. Onde está cada coisa, o que o público vê quando a cortina sobe.)'])),
      b('character', pick(l, ['PERSONAJE', 'CHARACTER', 'PERSONAGEM'])), b('dialogue', ''),
      b('scene', pick(l, ['ESCENA 2', 'SCENE 2', 'CENA 2'])), b('action', ''),
      b('act', tk.acts[2]), b('scene', pick(l, ['ESCENA 1', 'SCENE 1', 'CENA 1'])), b('action', ''),
    ];
    case 'doc': return [
      b('scene', pick(l, ['APERTURA', 'OPENING', 'ABERTURA'])),
      b('video', pick(l, ['Imágenes de archivo / plano general del lugar.', 'Archive footage / wide shot of the place.', 'Imagens de arquivo / plano geral do local.'])),
      b('audio', pick(l, ['MÚSICA: tema principal. LOCUCIÓN: la pregunta que guía el documental.', 'MUSIC: main theme. NARRATION: the question that drives the film.', 'MÚSICA: tema principal. LOCUÇÃO: a pergunta que guia o documentário.'])),
      b('scene', pick(l, ['ENTREVISTA 1', 'INTERVIEW 1', 'ENTREVISTA 1'])),
      b('video', pick(l, ['Entrevistado/a en su lugar de trabajo. Planos de apoyo.', 'Interviewee at their workplace. Cutaways.', 'Entrevistado/a no local de trabalho. Planos de apoio.'])),
      b('audio', pick(l, ['Testimonio (resumen de lo que debería decir).', 'Testimony (summary of what it should say).', 'Depoimento (resumo do que deveria dizer).'])),
      b('scene', pick(l, ['DESARROLLO', 'DEVELOPMENT', 'DESENVOLVIMENTO'])), b('video', ''), b('audio', ''),
      b('scene', pick(l, ['CIERRE', 'CLOSING', 'ENCERRAMENTO'])), b('video', ''), b('audio', pick(l, ['MÚSICA sube. Créditos.', 'MUSIC up. Credits.', 'MÚSICA sobe. Créditos.'])),
    ];
    case 'radio': return [
      b('scene', pick(l, ['ESCENA 1', 'SCENE 1', 'CENA 1'])),
      b('music', pick(l, ['CORTINA DE ENTRADA. Sube, se mantiene y baja a fondo.', 'OPENING THEME. Up, hold, under.', 'VINHETA DE ABERTURA. Sobe, mantém e desce a fundo.'])),
      b('sound', pick(l, ['Ambiente: lluvia sobre un techo de chapa.', 'Ambience: rain on a tin roof.', 'Ambiente: chuva num telhado de zinco.'])),
      b('character', pick(l, ['NARRADOR', 'NARRATOR', 'NARRADOR'])), b('dialogue', ''),
      n(['En radio todo se cuenta con sonido: describí lo que se oye, no lo que se ve.', 'In audio drama everything is told with sound: describe what is heard, not seen.', 'No rádio tudo é contado com som: descreva o que se ouve, não o que se vê.']),
      b('scene', pick(l, ['ESCENA 2', 'SCENE 2', 'CENA 2'])), b('sound', ''), b('character', ''), b('dialogue', ''),
    ];
    case 'comic': {
      const out: Block[] = [];
      const P = pick(l, ['PÁGINA', 'PAGE', 'PÁGINA']);
      const V = pick(l, ['Viñeta', 'Panel', 'Quadro']);
      const nums = pick(l, ['UNO DOS TRES', 'ONE TWO THREE', 'UM DOIS TRÊS']).split(' ');
      nums.forEach((num, i) => {
        out.push(b('page', `${P} ${num}`));
        if (i === 0) out.push(n(['Una página suele tener entre 4 y 6 viñetas. La última viñeta de una página impar es un buen lugar para un giro: el lector da vuelta la hoja.', 'A page usually has 4–6 panels. The last panel of an odd page is a good place for a reveal: the reader turns the page.', 'Uma página costuma ter de 4 a 6 quadros. O último quadro de uma página ímpar é um bom lugar para uma revelação.']));
        for (let k = 1; k <= 4; k++) { out.push(b('panel', `${V} ${k}`)); out.push(b('action', '')); }
      });
      return out;
    }
    default: return [];
  }
}
