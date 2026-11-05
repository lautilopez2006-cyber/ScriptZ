// Script formats: element styles, templates and locale tokens.
// Geometry is expressed in character columns (10 per inch, 12pt monospace) and lines (6 per inch).
import type { ElementType, Project, ScriptLocale, PaperSize } from './model';

export type Align = 'left' | 'center' | 'right';

export interface ElementStyle {
  /** Columns from the left text margin. */
  indent: number;
  /** Width in columns. */
  width: number;
  align: Align;
  upper: boolean;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  /** Blank lines before the element (suppressed at the top of a page). */
  spaceBefore: number;
  /** 1 = single, 2 = double spaced. */
  lineSpacing: 1 | 2;
  /** Never leave this element as the last thing on a page. */
  keepWithNext: boolean;
  /** May be split across pages (at a sentence boundary). */
  splittable: boolean;
  /** Always starts a new page (acts). */
  newPage: boolean;
  /** Printed before/after the text; not editable. */
  prefix: string;
  suffix: string;
  /** Element created by Enter. */
  enter: ElementType;
  /** Element the current one becomes with Tab. */
  tab: ElementType;
  /** Element the current one becomes with Shift+Tab. */
  shiftTab: ElementType;
  printable: boolean;
}

export interface Template {
  id: string;
  /** i18n key for the name and description. */
  name: string;
  description: string;
  order: ElementType[];
  styles: Partial<Record<ElementType, ElementStyle>>;
  first: ElementType;
  sceneNumberStyle: 'number' | 'letter';
  /** Columns of each A/V column, when the template is two-column. */
  twoColumn?: { leftWidth: number; gap: number };
}

const S = (o: Partial<ElementStyle> & Pick<ElementStyle, 'indent' | 'width' | 'enter' | 'tab'>): ElementStyle => ({
  align: 'left', upper: false, bold: false, italic: false, underline: false, spaceBefore: 1, lineSpacing: 1,
  keepWithNext: false, splittable: false, newPage: false, prefix: '', suffix: '', printable: true,
  shiftTab: o.shiftTab ?? o.tab,
  ...o,
});

// --- Feature film (industry standard, Final Draft compatible metrics) -------------------------
const feature: Template = {
  id: 'feature', name: 'tpl.feature', description: 'tpl.feature.d', first: 'scene', sceneNumberStyle: 'number',
  order: ['scene', 'action', 'character', 'parenthetical', 'dialogue', 'transition', 'shot', 'general', 'lyrics', 'centered', 'note'],
  styles: {
    scene: S({ indent: 0, width: 60, upper: true, spaceBefore: 2, keepWithNext: true, enter: 'action', tab: 'action', shiftTab: 'transition' }),
    action: S({ indent: 0, width: 60, splittable: true, enter: 'action', tab: 'character', shiftTab: 'scene' }),
    character: S({ indent: 22, width: 38, upper: true, keepWithNext: true, enter: 'dialogue', tab: 'transition', shiftTab: 'action' }),
    parenthetical: S({ indent: 15, width: 25, spaceBefore: 0, keepWithNext: true, enter: 'dialogue', tab: 'dialogue', shiftTab: 'dialogue' }),
    dialogue: S({ indent: 10, width: 35, spaceBefore: 0, splittable: true, enter: 'character', tab: 'parenthetical', shiftTab: 'character' }),
    transition: S({ indent: 40, width: 20, align: 'right', upper: true, enter: 'scene', tab: 'scene', shiftTab: 'character' }),
    shot: S({ indent: 0, width: 60, upper: true, keepWithNext: true, enter: 'action', tab: 'action', shiftTab: 'scene' }),
    general: S({ indent: 0, width: 60, spaceBefore: 0, splittable: true, enter: 'general', tab: 'action' }),
    lyrics: S({ indent: 10, width: 35, spaceBefore: 0, italic: true, splittable: true, enter: 'lyrics', tab: 'dialogue' }),
    centered: S({ indent: 0, width: 60, align: 'center', upper: true, enter: 'action', tab: 'action' }),
    act: S({ indent: 0, width: 60, align: 'center', upper: true, underline: true, spaceBefore: 2, keepWithNext: true, newPage: true, enter: 'scene', tab: 'scene' }),
    endact: S({ indent: 0, width: 60, align: 'center', upper: true, underline: true, spaceBefore: 2, enter: 'act', tab: 'act' }),
    note: S({ indent: 0, width: 60, italic: true, printable: false, enter: 'action', tab: 'action' }),
  },
};

const clone = (t: Template, patch: Omit<Partial<Template>, 'styles'> & { styles?: Partial<Record<ElementType, Partial<ElementStyle>>> }): Template => {
  const styles: Partial<Record<ElementType, ElementStyle>> = {};
  for (const [k, v] of Object.entries(t.styles) as [ElementType, ElementStyle][]) styles[k] = { ...v };
  for (const [k, v] of Object.entries(patch.styles ?? {}) as [ElementType, Partial<ElementStyle>][]) {
    styles[k] = { ...(styles[k] ?? styles.action!), ...v };
  }
  return { ...t, ...patch, styles } as Template;
};

// --- TV single camera: acts start on a new page ------------------------------------------------
const tv = clone(feature, {
  id: 'tv', name: 'tpl.tv', description: 'tpl.tv.d',
  order: ['scene', 'action', 'character', 'parenthetical', 'dialogue', 'transition', 'act', 'endact', 'shot', 'general', 'lyrics', 'centered', 'note'],
  styles: {},
});

// --- Multi-camera sitcom ------------------------------------------------------------------------
const multicam = clone(feature, {
  id: 'multicam', name: 'tpl.multicam', description: 'tpl.multicam.d', sceneNumberStyle: 'letter',
  order: ['scene', 'action', 'character', 'parenthetical', 'dialogue', 'transition', 'act', 'endact', 'shot', 'general', 'centered', 'note'],
  styles: {
    scene: { underline: true, spaceBefore: 2 },
    action: { upper: true },
    character: { indent: 25, width: 35 },
    parenthetical: { indent: 20, width: 20 },
    dialogue: { indent: 15, width: 35, lineSpacing: 2 },
    act: { bold: true },
  },
});

// --- Stage play ---------------------------------------------------------------------------------
const stage: Template = {
  id: 'stage', name: 'tpl.stage', description: 'tpl.stage.d', first: 'act', sceneNumberStyle: 'number',
  order: ['act', 'scene', 'action', 'character', 'parenthetical', 'dialogue', 'transition', 'centered', 'note'],
  styles: {
    act: S({ indent: 0, width: 60, align: 'center', upper: true, bold: true, spaceBefore: 2, newPage: true, keepWithNext: true, enter: 'scene', tab: 'scene' }),
    scene: S({ indent: 0, width: 60, align: 'center', upper: true, underline: true, spaceBefore: 2, keepWithNext: true, enter: 'action', tab: 'action' }),
    action: S({ indent: 25, width: 35, italic: true, splittable: true, enter: 'character', tab: 'character', shiftTab: 'scene' }),
    character: S({ indent: 0, width: 60, align: 'center', upper: true, keepWithNext: true, enter: 'dialogue', tab: 'action', shiftTab: 'action' }),
    parenthetical: S({ indent: 15, width: 30, italic: true, spaceBefore: 0, keepWithNext: true, enter: 'dialogue', tab: 'dialogue' }),
    dialogue: S({ indent: 0, width: 60, spaceBefore: 0, splittable: true, enter: 'character', tab: 'parenthetical', shiftTab: 'character' }),
    transition: S({ indent: 40, width: 20, align: 'right', upper: true, enter: 'scene', tab: 'scene' }),
    centered: S({ indent: 0, width: 60, align: 'center', upper: true, enter: 'action', tab: 'action' }),
    note: S({ indent: 0, width: 60, italic: true, printable: false, enter: 'action', tab: 'action' }),
  },
};

// --- Radio / podcast / audio drama ---------------------------------------------------------------
const audio: Template = {
  id: 'audio', name: 'tpl.audio', description: 'tpl.audio.d', first: 'scene', sceneNumberStyle: 'number',
  order: ['scene', 'action', 'character', 'parenthetical', 'dialogue', 'sound', 'music', 'transition', 'note'],
  styles: {
    scene: S({ indent: 0, width: 60, upper: true, bold: true, spaceBefore: 2, keepWithNext: true, enter: 'sound', tab: 'action' }),
    action: S({ indent: 10, width: 50, italic: true, splittable: true, enter: 'character', tab: 'character' }),
    character: S({ indent: 0, width: 60, upper: true, keepWithNext: true, suffix: ':', enter: 'dialogue', tab: 'sound' }),
    parenthetical: S({ indent: 10, width: 40, spaceBefore: 0, keepWithNext: true, enter: 'dialogue', tab: 'dialogue' }),
    dialogue: S({ indent: 10, width: 50, spaceBefore: 0, splittable: true, enter: 'character', tab: 'parenthetical' }),
    sound: S({ indent: 10, width: 50, upper: true, underline: true, prefix: 'SFX: ', enter: 'character', tab: 'music' }),
    music: S({ indent: 10, width: 50, upper: true, underline: true, prefix: 'MUSIC: ', enter: 'character', tab: 'sound' }),
    transition: S({ indent: 40, width: 20, align: 'right', upper: true, enter: 'scene', tab: 'scene' }),
    note: S({ indent: 0, width: 60, italic: true, printable: false, enter: 'action', tab: 'action' }),
  },
};

// --- Comic book ---------------------------------------------------------------------------------
const comic: Template = {
  id: 'comic', name: 'tpl.comic', description: 'tpl.comic.d', first: 'page', sceneNumberStyle: 'number',
  order: ['page', 'panel', 'action', 'character', 'dialogue', 'caption', 'sfx', 'note'],
  styles: {
    page: S({ indent: 0, width: 60, upper: true, bold: true, underline: true, spaceBefore: 2, keepWithNext: true, enter: 'panel', tab: 'panel' }),
    panel: S({ indent: 0, width: 60, bold: true, spaceBefore: 1, keepWithNext: true, enter: 'action', tab: 'action' }),
    action: S({ indent: 0, width: 60, splittable: true, enter: 'character', tab: 'character' }),
    character: S({ indent: 20, width: 40, upper: true, keepWithNext: true, enter: 'dialogue', tab: 'caption' }),
    dialogue: S({ indent: 10, width: 40, spaceBefore: 0, splittable: true, enter: 'character', tab: 'caption' }),
    caption: S({ indent: 10, width: 40, prefix: 'CAPTION: ', enter: 'character', tab: 'sfx' }),
    sfx: S({ indent: 10, width: 40, upper: true, bold: true, prefix: 'SFX: ', enter: 'panel', tab: 'character' }),
    note: S({ indent: 0, width: 60, italic: true, printable: false, enter: 'action', tab: 'action' }),
  },
};

// --- Documentary / commercial A/V two-column ------------------------------------------------------
const av: Template = {
  id: 'av', name: 'tpl.av', description: 'tpl.av.d', first: 'scene', sceneNumberStyle: 'number',
  twoColumn: { leftWidth: 28, gap: 3 },
  order: ['scene', 'video', 'audio', 'general', 'note'],
  styles: {
    scene: S({ indent: 0, width: 60, upper: true, bold: true, spaceBefore: 2, keepWithNext: true, enter: 'video', tab: 'video' }),
    video: S({ indent: 0, width: 28, upper: false, enter: 'audio', tab: 'audio', shiftTab: 'scene' }),
    audio: S({ indent: 31, width: 29, enter: 'video', tab: 'video', shiftTab: 'video' }),
    general: S({ indent: 0, width: 60, splittable: true, enter: 'video', tab: 'video' }),
    note: S({ indent: 0, width: 60, italic: true, printable: false, enter: 'video', tab: 'video' }),
  },
};

export const TEMPLATES: Template[] = [feature, tv, multicam, stage, audio, comic, av];

export function getTemplate(id: string): Template {
  return TEMPLATES.find((t) => t.id === id) ?? feature;
}

export type StyleMap = Record<ElementType, ElementStyle>;

/** Template styles merged with project overrides. Unknown element types fall back to action. */
export function resolveStyles(project: Pick<Project, 'template' | 'styleOverrides' | 'locale'>): StyleMap {
  const t = getTemplate(project.template);
  const fallback = t.styles.action ?? t.styles.general ?? feature.styles.action!;
  const tokens = localeTokens(project.locale);
  const out = {} as StyleMap;
  const all: ElementType[] = ['scene', 'action', 'character', 'dialogue', 'parenthetical', 'transition', 'shot', 'general', 'lyrics', 'centered', 'act', 'endact', 'note', 'page', 'panel', 'caption', 'sfx', 'sound', 'music', 'video', 'audio'];
  for (const type of all) {
    const base = t.styles[type] ?? feature.styles[type] ?? fallback;
    const style: ElementStyle = { ...base, ...(project.styleOverrides?.[type] ?? {}) };
    // Localise built-in prefixes.
    if (base.prefix === 'SFX: ') style.prefix = project.styleOverrides?.[type]?.prefix ?? tokens.sfx;
    if (base.prefix === 'MUSIC: ') style.prefix = project.styleOverrides?.[type]?.prefix ?? tokens.music;
    if (base.prefix === 'CAPTION: ') style.prefix = project.styleOverrides?.[type]?.prefix ?? tokens.caption;
    out[type] = style;
  }
  return out;
}

export function templateOrder(project: Pick<Project, 'template'>): ElementType[] {
  return getTemplate(project.template).order;
}

// --- Page geometry --------------------------------------------------------------------------------
export interface PageGeometry {
  paper: PaperSize;
  widthIn: number;
  heightIn: number;
  /** Inches. */
  marginTop: number;
  marginBottom: number;
  marginLeft: number;
  /** Header baseline distance from top (inches). */
  headerAt: number;
  footerAt: number;
  /** Text area width in columns. */
  cols: number;
  /** Text lines per page. */
  lines: number;
}

export function pageGeometry(paper: PaperSize): PageGeometry {
  if (paper === 'a4') {
    // 11.69in - 1in top - 10in (60 lines) = 0.69in bottom
    return { paper, widthIn: 8.27, heightIn: 11.69, marginTop: 1, marginBottom: 0.69, marginLeft: 1.5, headerAt: 0.5, footerAt: 0.5, cols: 60, lines: 60 };
  }
  // 11in - 1in top - 0.8333in bottom = 9.1667in = 55 lines
  return { paper, widthIn: 8.5, heightIn: 11, marginTop: 1, marginBottom: 1 - 1 / 6, marginLeft: 1.5, headerAt: 0.5, footerAt: 0.5, cols: 60, lines: 55 };
}

// --- Locale tokens --------------------------------------------------------------------------------
export interface LocaleTokens {
  more: string;
  contd: string;
  continued: string;
  omitted: string;
  theEnd: string;
  sfx: string;
  music: string;
  caption: string;
  scenePrefixes: string[];
  times: string[];
  transitions: string[];
  extensions: string[];
  acts: string[];
  /** BCP-47 tag for spell checking. */
  lang: string;
  defaultPaper: PaperSize;
}

const EN: LocaleTokens = {
  more: '(MORE)', contd: "(CONT'D)", continued: 'CONTINUED:', omitted: 'OMITTED', theEnd: 'THE END',
  sfx: 'SFX: ', music: 'MUSIC: ', caption: 'CAPTION: ',
  scenePrefixes: ['INT.', 'EXT.', 'INT./EXT.', 'EXT./INT.', 'I/E.'],
  times: ['DAY', 'NIGHT', 'MORNING', 'AFTERNOON', 'EVENING', 'DAWN', 'DUSK', 'CONTINUOUS', 'LATER', 'MOMENTS LATER', 'SAME TIME'],
  transitions: ['CUT TO:', 'FADE IN:', 'FADE OUT.', 'FADE TO BLACK.', 'DISSOLVE TO:', 'SMASH CUT TO:', 'MATCH CUT TO:', 'JUMP CUT TO:', 'BACK TO:', 'INTERCUT WITH:'],
  extensions: ['V.O.', 'O.S.', 'O.C.', "CONT'D", 'PRE-LAP', 'FILTERED', 'INTO PHONE'],
  acts: ['TEASER', 'ACT ONE', 'ACT TWO', 'ACT THREE', 'ACT FOUR', 'ACT FIVE', 'TAG'],
  lang: 'en-US', defaultPaper: 'letter',
};

const ES_LA: LocaleTokens = {
  more: '(SIGUE)', contd: '(CONT.)', continued: 'CONTINÚA:', omitted: 'OMITIDA', theEnd: 'FIN',
  sfx: 'EFECTO: ', music: 'MÚSICA: ', caption: 'CARTUCHO: ',
  scenePrefixes: ['INT.', 'EXT.', 'INT./EXT.', 'EXT./INT.'],
  times: ['DÍA', 'NOCHE', 'AMANECER', 'ATARDECER', 'MAÑANA', 'TARDE', 'CONTINUO', 'MÁS TARDE', 'MOMENTOS DESPUÉS', 'MISMO MOMENTO'],
  transitions: ['CORTE A:', 'FADE IN:', 'FADE OUT.', 'FUNDIDO A NEGRO.', 'DISOLVENCIA A:', 'CORTE DIRECTO A:', 'CORTE POR CORRESPONDENCIA A:', 'REGRESO A:', 'INTERCALAR CON:'],
  extensions: ['V.O.', 'O.S.', 'OFF', 'CONT.', 'AL TELÉFONO'],
  acts: ['TEASER', 'ACTO UNO', 'ACTO DOS', 'ACTO TRES', 'ACTO CUATRO', 'ACTO CINCO', 'TAG'],
  lang: 'es', defaultPaper: 'letter',
};

const ES_ES: LocaleTokens = {
  ...ES_LA,
  sfx: 'EFECTO: ', caption: 'CARTUCHO: ',
  transitions: ['CORTE A:', 'FUNDIDO DE ENTRADA:', 'FUNDIDO A NEGRO.', 'ENCADENADO A:', 'CORTE BRUSCO A:', 'CORTE EN CONTINUIDAD A:', 'VUELTA A:', 'MONTAJE PARALELO CON:'],
  extensions: ['OFF', 'V.O.', 'CONT.', 'AL TELÉFONO', 'EN PANTALLA'],
  lang: 'es-ES', defaultPaper: 'a4',
};

const PT_BR: LocaleTokens = {
  more: '(CONTINUA)', contd: '(CONT.)', continued: 'CONTINUA:', omitted: 'OMITIDA', theEnd: 'FIM',
  sfx: 'SOM: ', music: 'MÚSICA: ', caption: 'LEGENDA: ',
  scenePrefixes: ['INT.', 'EXT.', 'INT./EXT.'],
  times: ['DIA', 'NOITE', 'AMANHECER', 'ENTARDECER', 'MANHÃ', 'TARDE', 'CONTÍNUO', 'MAIS TARDE', 'MOMENTOS DEPOIS'],
  transitions: ['CORTA PARA:', 'FADE IN:', 'FADE OUT.', 'FUSÃO:', 'CORTE SECO PARA:', 'VOLTA PARA:'],
  extensions: ['V.O.', 'O.S.', 'OFF', 'CONT.', 'AO TELEFONE'],
  acts: ['TEASER', 'ATO UM', 'ATO DOIS', 'ATO TRÊS', 'ATO QUATRO', 'ATO CINCO', 'TAG'],
  lang: 'pt-BR', defaultPaper: 'a4',
};

export function localeTokens(locale: ScriptLocale | string | undefined): LocaleTokens {
  switch (locale) {
    case 'en': return EN;
    case 'es-ES': return ES_ES;
    case 'pt-BR': return PT_BR;
    default: return ES_LA;
  }
}

export const SCRIPT_LOCALES: ScriptLocale[] = ['es-LA', 'es-ES', 'en', 'pt-BR'];
