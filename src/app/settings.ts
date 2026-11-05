// User preferences (per device). Stored in localStorage; every read is defensive.
import type { ElementType } from '../core/model';

export type UiLang = 'es' | 'en' | 'pt';
export type ThemeName = 'system' | 'light' | 'dark' | 'sepia' | 'night';

export interface AiSettings { enabled: boolean; provider: 'anthropic' | 'openai'; apiKey: string; baseUrl: string; model: string }
export interface ReadAloudSettings { narrator: string; rate: number; readActions: boolean; readHeadings: boolean; readParentheticals: boolean; voices: Record<string, string> }

export interface AppSettings {
  uiLang: UiLang;
  theme: ThemeName;
  scriptFont: string;
  zoom: number;
  pageView: boolean;
  focusMode: 'off' | 'scene' | 'paragraph';
  typewriter: boolean;
  showSceneNumbers: boolean;
  showTags: boolean;
  navigatorOpen: boolean;
  elementKeys: Record<string, ElementType>;
  shortcuts: Record<string, string>;
  macros: Record<string, { text: string; type?: ElementType }>;
  author: string;
  goals: { dailyWords: number; dailyPages: number };
  sprintMinutes: number;
  ai: AiSettings;
  collab: { server: string; name: string; color: string };
  update: { repo: string; auto: boolean; lastCheck: number };
  readAloud: ReadAloudSettings;
  tourDone: boolean;
  defaultLocale: 'es-LA' | 'es-ES' | 'en' | 'pt-BR';
  defaultPaper: 'letter' | 'a4';
}

export const DEFAULT_ELEMENT_KEYS: Record<string, ElementType> = {
  'Mod+1': 'scene', 'Mod+2': 'action', 'Mod+3': 'character', 'Mod+4': 'parenthetical',
  'Mod+5': 'dialogue', 'Mod+6': 'transition', 'Mod+7': 'shot', 'Mod+8': 'general', 'Mod+9': 'note',
};

export const DEFAULT_SHORTCUTS: Record<string, string> = {
  save: 'Mod+S', find: 'Mod+F', replace: 'Mod+H', open: 'Mod+O', newProject: 'Mod+Alt+N', export: 'Mod+E', print: 'Mod+P',
  palette: 'Mod+K', focus: 'Mod+Shift+F', typewriter: 'Mod+Shift+T', fullscreen: 'F11', zoomIn: 'Mod+=', zoomOut: 'Mod+-', zoomReset: 'Mod+0',
  comment: 'Mod+Alt+M', highlight: 'Mod+Shift+H', tag: 'Mod+Alt+T', dual: 'Mod+D', bookmark: 'Mod+Shift+B', readAloud: 'Mod+Shift+R',
  nextScene: 'Alt+ArrowDown', prevScene: 'Alt+ArrowUp', navigator: 'Mod+\\', sprint: 'Mod+Alt+S', titlePage: 'Mod+Alt+P', revisionMode: 'Mod+Alt+R',
};

export const DEFAULT_SETTINGS: AppSettings = {
  uiLang: 'es',
  theme: 'system',
  scriptFont: 'SZ Mono',
  zoom: 1,
  pageView: true,
  focusMode: 'off',
  typewriter: false,
  showSceneNumbers: false,
  showTags: true,
  navigatorOpen: true,
  elementKeys: DEFAULT_ELEMENT_KEYS,
  shortcuts: DEFAULT_SHORTCUTS,
  macros: {},
  author: '',
  goals: { dailyWords: 500, dailyPages: 0 },
  sprintMinutes: 25,
  ai: { enabled: false, provider: 'anthropic', apiKey: '', baseUrl: 'http://localhost:11434/v1', model: 'claude-haiku-5-5' },
  collab: { server: 'ws://127.0.0.1:4735', name: '', color: '#e8590c' },
  update: { repo: '', auto: true, lastCheck: 0 },
  readAloud: { narrator: '', rate: 1, readActions: true, readHeadings: true, readParentheticals: false, voices: {} },
  tourDone: false,
  defaultLocale: 'es-LA',
  defaultPaper: 'letter',
};

const KEY = 'sz.settings.v2';

export function loadSettings(): AppSettings {
  let raw: Partial<AppSettings> = {};
  try { raw = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { raw = {}; }
  const s: AppSettings = { ...DEFAULT_SETTINGS, ...raw };
  s.elementKeys = { ...(raw.elementKeys ?? DEFAULT_ELEMENT_KEYS) };
  s.shortcuts = { ...DEFAULT_SHORTCUTS, ...(raw.shortcuts ?? {}) };
  s.macros = { ...(raw.macros ?? {}) };
  s.goals = { ...DEFAULT_SETTINGS.goals, ...(raw.goals ?? {}) };
  s.ai = { ...DEFAULT_SETTINGS.ai, ...(raw.ai ?? {}) };
  s.collab = { ...DEFAULT_SETTINGS.collab, ...(raw.collab ?? {}) };
  s.update = { ...DEFAULT_SETTINGS.update, ...(raw.update ?? {}) };
  s.readAloud = { ...DEFAULT_SETTINGS.readAloud, ...(raw.readAloud ?? {}), voices: { ...(raw.readAloud?.voices ?? {}) } };
  if (!['es', 'en', 'pt'].includes(s.uiLang)) {
    const nav = (typeof navigator !== 'undefined' ? navigator.language : 'es').toLowerCase();
    s.uiLang = nav.startsWith('pt') ? 'pt' : nav.startsWith('en') ? 'en' : 'es';
  }
  if (!raw.uiLang && typeof navigator !== 'undefined') {
    const nav = navigator.language.toLowerCase();
    s.uiLang = nav.startsWith('pt') ? 'pt' : nav.startsWith('en') ? 'en' : 'es';
    s.defaultLocale = nav.startsWith('pt') ? 'pt-BR' : nav.startsWith('en') ? 'en' : nav === 'es-es' ? 'es-ES' : 'es-LA';
    s.defaultPaper = /^(en-us|en-ca|es-mx|es-us|es-co|es-ve|es-cl|es-pe)/.test(nav) ? 'letter' : nav.startsWith('en') ? 'letter' : 'a4';
  }
  s.zoom = Math.min(2.5, Math.max(0.5, Number(s.zoom) || 1));
  return s;
}

export function saveSettings(s: AppSettings): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode */ }
}

// Global writing log across projects (for goals and streaks).
const LOG_KEY = 'sz.writinglog.v1';
export type WritingLog = Record<string, { words: number; seconds: number }>;
export function loadLog(): WritingLog {
  try { return JSON.parse(localStorage.getItem(LOG_KEY) || '{}'); } catch { return {}; }
}
export function saveLog(log: WritingLog): void {
  try { localStorage.setItem(LOG_KEY, JSON.stringify(log)); } catch { /* ignore */ }
}
