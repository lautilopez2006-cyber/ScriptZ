// Tiny i18n: every string is [es, en, pt]; French and Italian live in ./xl as [fr, it].
// Missing translations fall back to English (fr/it) or Spanish, then the key.
import type { UiLang } from '../app/settings';
import { COMMON } from './common';
import { EDITOR } from './editor';
import { VIEWS } from './views';
import { PRODUCTION } from './production';
import { SETTINGS } from './settings';
import { IO } from './io';
import { STORY } from './story';
import { REVIEW } from './review';
import { V03 } from './v03';
import { XL_COMMON } from './xl/common';
import { XL_EDITOR } from './xl/editor';
import { XL_VIEWS, XL_PRODUCTION } from './xl/views';
import { XL_SETTINGS } from './xl/settings';
import { XL_IO } from './xl/io';
import { XL_STORY } from './xl/story';
import { XL_REVIEW } from './xl/review';
import { XL_V03 } from './xl/v03';

export type Dict = Record<string, [string, string, string]>;

const ALL: Dict = { ...COMMON, ...EDITOR, ...VIEWS, ...PRODUCTION, ...SETTINGS, ...IO, ...STORY, ...REVIEW, ...V03 };
let lang: UiLang = 'es';
const XL: Record<string, [string, string]> = { ...XL_COMMON, ...XL_EDITOR, ...XL_VIEWS, ...XL_PRODUCTION, ...XL_SETTINGS, ...XL_IO, ...XL_STORY, ...XL_REVIEW, ...XL_V03 };
const IDX: Record<'es' | 'en' | 'pt', 0 | 1 | 2> = { es: 0, en: 1, pt: 2 };
/** Locale for Intl formatting. */
const intl = () => (lang === 'pt' ? 'pt-BR' : lang);

export function setLang(l: UiLang): void { lang = l; if (typeof document !== 'undefined') document.documentElement.lang = l; }
export function getLang(): UiLang { return lang; }

export function t(key: string, vars?: Record<string, string | number>): string {
  const e = ALL[key];
  let s: string;
  if (lang === 'fr' || lang === 'it') s = XL[key]?.[lang === 'fr' ? 0 : 1] || (e ? e[1] || e[0] : key);
  else s = e ? (e[IDX[lang]] || e[0]) : key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

/** Plural helper: key.one / key.other */
export function tn(key: string, n: number, vars?: Record<string, string | number>): string {
  return t(n === 1 ? key + '.one' : key + '.other', { n, ...(vars ?? {}) });
}

export function hasKey(key: string): boolean { return key in ALL; }

export function fmtDate(iso: string | number, opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' }): string {
  try { return new Intl.DateTimeFormat(intl(), opts).format(new Date(iso)); } catch { return String(iso); }
}

export function fmtNum(n: number, digits = 0): string {
  try { return new Intl.NumberFormat(intl(), { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(n); } catch { return n.toFixed(digits); }
}

export function relTime(ms: number): string {
  const diff = (Date.now() - ms) / 1000;
  try {
    const rtf = new Intl.RelativeTimeFormat(intl(), { numeric: 'auto' });
    if (diff < 60) return rtf.format(-Math.round(diff), 'second');
    if (diff < 3600) return rtf.format(-Math.round(diff / 60), 'minute');
    if (diff < 86400) return rtf.format(-Math.round(diff / 3600), 'hour');
    if (diff < 86400 * 30) return rtf.format(-Math.round(diff / 86400), 'day');
  } catch { /* ignore */ }
  return fmtDate(ms, { dateStyle: 'medium' });
}
