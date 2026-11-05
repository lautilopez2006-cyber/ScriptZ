// Tiny i18n: every string is [es, en, pt]. Missing translations fall back to Spanish, then the key.
import type { UiLang } from '../app/settings';
import { COMMON } from './common';
import { EDITOR } from './editor';
import { VIEWS } from './views';
import { PRODUCTION } from './production';
import { SETTINGS } from './settings';
import { IO } from './io';
import { STORY } from './story';

export type Dict = Record<string, [string, string, string]>;

const ALL: Dict = { ...COMMON, ...EDITOR, ...VIEWS, ...PRODUCTION, ...SETTINGS, ...IO, ...STORY };
let lang: UiLang = 'es';
const IDX: Record<UiLang, 0 | 1 | 2> = { es: 0, en: 1, pt: 2 };

export function setLang(l: UiLang): void { lang = l; if (typeof document !== 'undefined') document.documentElement.lang = l; }
export function getLang(): UiLang { return lang; }

export function t(key: string, vars?: Record<string, string | number>): string {
  const e = ALL[key];
  let s = e ? (e[IDX[lang]] || e[0]) : key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

/** Plural helper: key.one / key.other */
export function tn(key: string, n: number, vars?: Record<string, string | number>): string {
  return t(n === 1 ? key + '.one' : key + '.other', { n, ...(vars ?? {}) });
}

export function hasKey(key: string): boolean { return key in ALL; }

export function fmtDate(iso: string | number, opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' }): string {
  try { return new Intl.DateTimeFormat(lang === 'pt' ? 'pt-BR' : lang, opts).format(new Date(iso)); } catch { return String(iso); }
}

export function fmtNum(n: number, digits = 0): string {
  try { return new Intl.NumberFormat(lang === 'pt' ? 'pt-BR' : lang, { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(n); } catch { return n.toFixed(digits); }
}

export function relTime(ms: number): string {
  const diff = (Date.now() - ms) / 1000;
  try {
    const rtf = new Intl.RelativeTimeFormat(lang === 'pt' ? 'pt-BR' : lang, { numeric: 'auto' });
    if (diff < 60) return rtf.format(-Math.round(diff), 'second');
    if (diff < 3600) return rtf.format(-Math.round(diff / 60), 'minute');
    if (diff < 86400) return rtf.format(-Math.round(diff / 3600), 'hour');
    if (diff < 86400 * 30) return rtf.format(-Math.round(diff / 86400), 'day');
  } catch { /* ignore */ }
  return fmtDate(ms, { dateStyle: 'medium' });
}
