// Scene index, headings, scene numbers and character detection.
import type { Block, Project } from './model';
import { localeTokens } from './format';

export interface ParsedHeading {
  prefix: string;
  intExt: 'int' | 'ext' | 'both' | '';
  location: string;
  time: string;
  dayNight: 'day' | 'night' | 'other' | '';
}

const PREFIX_RE = /^\s*((?:INT|EXT|I)\.?\s*\/\s*(?:EXT|INT|E)\.?|INT\.?|EXT\.?|INTERIOR|EXTERIOR|I\/E\.?|EST\.?)(?=[\s.\-–—]|$)[\s.\-–—]*/i;
const NIGHT = /\b(NIGHT|NOCHE|NOITE|ANOCHECER|DUSK|EVENING)\b/i;
const DAY = /\b(DAY|D[IÍ]A|MORNING|MAÑANA|MANHÃ|AFTERNOON|TARDE|DAWN|AMANECER|AMANHECER|ATARDECER|ENTARDECER|NOON|MEDIOD[IÍ]A)\b/i;

export function parseHeading(text: string): ParsedHeading {
  const raw = text.trim();
  const m = PREFIX_RE.exec(raw);
  let prefix = '';
  let rest = raw;
  let intExt: ParsedHeading['intExt'] = '';
  if (m) {
    prefix = m[1].toUpperCase().replace(/\s+/g, '');
    rest = raw.slice(m[0].length);
    const p = prefix.replace(/\./g, '');
    if (/^(INT\/EXT|EXT\/INT|I\/E)$/.test(p)) intExt = 'both';
    else if (/^(INT|INTERIOR)$/.test(p)) intExt = 'int';
    else if (/^(EXT|EXTERIOR|EST)$/.test(p)) intExt = 'ext';
  }
  let location = rest.trim();
  let time = '';
  const sep = /\s+[-–—]\s+/g;
  let last = -1; let lastLen = 0; let mm: RegExpExecArray | null;
  while ((mm = sep.exec(rest))) { last = mm.index; lastLen = mm[0].length; }
  if (last >= 0) {
    location = rest.slice(0, last).trim();
    time = rest.slice(last + lastLen).trim();
  }
  let dayNight: ParsedHeading['dayNight'] = '';
  if (time) dayNight = NIGHT.test(time) ? 'night' : DAY.test(time) ? 'day' : 'other';
  return { prefix, intExt, location: location.replace(/\s+/g, ' ').toUpperCase(), time: time.toUpperCase(), dayNight };
}

export function isSceneHeadingText(text: string): boolean {
  return PREFIX_RE.test(text.trim()) && text.trim().length > 3;
}

/** "MARA (V.O.) (CONT'D)" → "MARA". Also strips the Fountain dual-dialogue caret. */
export function characterName(text: string): string {
  return text
    .replace(/\^\s*$/, '')
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

export function characterExtensions(text: string): string[] {
  const out: string[] = [];
  const re = /\(([^)]*)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push(m[1].trim().toUpperCase());
  return out;
}

export interface SceneInfo {
  id: string;
  /** 0-based order among scene headings. */
  index: number;
  label: string;
  heading: string;
  start: number;
  /** Exclusive. */
  end: number;
  omitted: boolean;
  parsed: ParsedHeading;
  speakers: string[];
  words: number;
}

/** Letters for multicam scene numbering: A..Z, AA, BB... */
function letterLabel(n: number): string {
  const L = String.fromCharCode(65 + (n % 26));
  return L.repeat(Math.floor(n / 26) + 1);
}

/** Next production suffix after a locked number: "5" → "5A", "5A" → "5B", "5Z" → "5AA". */
export function nextSuffix(label: string, used: Set<string>): string {
  const m = /^(.*?)([A-Z]*)$/.exec(label)!;
  const base = m[1] || label;
  const suffix = m[2];
  const seq = (s: string): string => {
    if (!s) return 'A';
    const last = s[s.length - 1];
    if (last === 'Z') return seq(s.slice(0, -1)) + 'A';
    return s.slice(0, -1) + String.fromCharCode(last.charCodeAt(0) + 1);
  };
  let s = seq(suffix);
  let guard = 0;
  while (used.has(base + s) && guard++ < 200) s = seq(s);
  return base + s;
}

export function buildScenes(blocks: Block[], opts: { letters?: boolean; locked?: boolean } = {}): SceneInfo[] {
  const scenes: SceneInfo[] = [];
  const used = new Set<string>();
  if (opts.locked) for (const b of blocks) if (b.type === 'scene' && b.num) used.add(b.num);
  let counter = 0;
  let prevLabel = '';
  let current: SceneInfo | null = null;
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.type === 'scene') {
      if (current) current.end = i;
      let label: string;
      if (opts.locked) {
        if (b.num) label = b.num;
        else if (!prevLabel) {
          // Inserted before the first locked scene: A1, B1, C1...
          const firstLocked = blocks.find((x) => x.type === 'scene' && x.num)?.num ?? '1';
          let c = 0;
          label = String.fromCharCode(65 + c) + firstLocked;
          while (used.has(label) && c < 25) label = String.fromCharCode(65 + ++c) + firstLocked;
        } else label = nextSuffix(prevLabel, used);
        used.add(label);
      } else {
        label = opts.letters ? letterLabel(counter) : String(counter + 1);
      }
      counter++;
      prevLabel = label;
      current = { id: b.id, index: scenes.length, label, heading: b.text, start: i, end: blocks.length, omitted: !!b.omitted, parsed: parseHeading(b.text), speakers: [], words: 0 };
      scenes.push(current);
    } else if (current) {
      if (b.type === 'character') {
        const n = characterName(b.text);
        if (n && !current.speakers.includes(n)) current.speakers.push(n);
      }
      if (b.type !== 'note') current.words += (b.text.match(/\S+/g) || []).length;
    }
  }
  if (current) current.end = blocks.length;
  return scenes;
}

export function sceneOptions(project: Pick<Project, 'template' | 'revisions'>): { letters: boolean; locked: boolean } {
  return { letters: project.template === 'multicam', locked: !!project.revisions?.scenesLocked };
}

/** Block index → scene index (−1 before the first heading). */
export function sceneOfBlock(scenes: SceneInfo[], blockIndex: number): number {
  let lo = 0, hi = scenes.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (scenes[mid].start <= blockIndex) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}

/** Character blocks that get an automatic (CONT'D): same speaker again in the scene, interrupted only by non-dialogue. */
export function autoContdIds(blocks: Block[], locale: string): Set<string> {
  const tokens = localeTokens(locale);
  const contdWord = tokens.contd.replace(/[()]/g, '').toUpperCase();
  const out = new Set<string>();
  let lastSpeaker = '';
  let interrupted = false;
  for (const b of blocks) {
    if (b.type === 'scene' || b.type === 'act' || b.type === 'page') { lastSpeaker = ''; interrupted = false; continue; }
    if (b.type === 'character') {
      const name = characterName(b.text);
      const already = /\(CONT|\(CONT'D|\(CONTD|CONT\.\)/i.test(b.text) || b.text.toUpperCase().includes(contdWord);
      if (name && name === lastSpeaker && interrupted && !already && !b.dual) out.add(b.id);
      lastSpeaker = name;
      interrupted = false;
      continue;
    }
    if (b.type === 'action' || b.type === 'shot' || b.type === 'general') interrupted = true;
    if (b.type === 'transition') { lastSpeaker = ''; }
  }
  return out;
}

/** All character names with number of speeches, in order of frequency. */
export function characterStats(blocks: Block[]): { name: string; speeches: number; words: number; firstBlock: string }[] {
  const map = new Map<string, { name: string; speeches: number; words: number; firstBlock: string }>();
  let speaker = '';
  for (const b of blocks) {
    if (b.type === 'character') {
      speaker = characterName(b.text);
      if (!speaker) continue;
      const e = map.get(speaker) ?? { name: speaker, speeches: 0, words: 0, firstBlock: b.id };
      e.speeches++;
      map.set(speaker, e);
    } else if (b.type === 'dialogue' && speaker) {
      const e = map.get(speaker);
      if (e) e.words += (b.text.match(/\S+/g) || []).length;
    } else if (b.type !== 'parenthetical') speaker = '';
  }
  return [...map.values()].sort((a, b) => b.speeches - a.speeches || a.name.localeCompare(b.name));
}

export function locationsOf(scenes: SceneInfo[]): { name: string; count: number; intExt: string }[] {
  const map = new Map<string, { name: string; count: number; intExt: string }>();
  for (const s of scenes) {
    const n = s.parsed.location;
    if (!n) continue;
    const e = map.get(n) ?? { name: n, count: 0, intExt: s.parsed.intExt };
    e.count++;
    map.set(n, e);
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
