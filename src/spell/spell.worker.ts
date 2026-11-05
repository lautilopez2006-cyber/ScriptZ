// Spell checking off the main thread: loads a Hunspell dictionary with nspell and answers word queries.
import NSpell from '../vendor/nspell.js';

type Checker = ReturnType<typeof NSpell>;
let checker: Checker | null = null;
let loading = '';
const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

function lev(a: string, b: string): number {
  const d = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0]; d[0] = i;
    for (let j = 1; j <= b.length; j++) { const t = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = t; }
  }
  return d[b.length];
}

/** Spanish diminutives and enclitics that dictionaries miss ("hojita", "decíselo"). */
function lenient(w: string): boolean {
  if (!checker) return false;
  const m = /^(.+?)(it|cit|ecit)(o|a|os|as)$/i.exec(w);
  if (m && (checker.correct(m[1] + m[3]) || checker.correct(m[1] + (m[3].startsWith('a') ? 'a' : 'o')) || checker.correct(m[1] + 'e'))) return true;
  return false;
}

self.onmessage = async (e: MessageEvent) => {
  const msg = e.data as { type: string; id?: number; aff?: string; dic?: string; key?: string; words?: string[]; word?: string; personal?: string[] };
  if (msg.type === 'load') {
    if (loading === msg.key && checker) { (self as unknown as Worker).postMessage({ type: 'ready', key: msg.key }); return; }
    loading = msg.key!;
    checker = null;
    try {
      const [aff, dic] = await Promise.all([fetch(msg.aff!).then((r) => r.text()), fetch(msg.dic!).then((r) => r.text())]);
      if (loading !== msg.key) return;
      checker = NSpell(aff, dic);
      for (const w of msg.personal ?? []) checker.add(w);
      (self as unknown as Worker).postMessage({ type: 'ready', key: msg.key });
    } catch (err) {
      (self as unknown as Worker).postMessage({ type: 'error', key: msg.key, message: String(err) });
    }
    return;
  }
  if (msg.type === 'add' && checker) { for (const w of msg.words ?? []) checker.add(w); return; }
  if (msg.type === 'check') {
    const bad = checker ? (msg.words ?? []).filter((w) => !checker!.correct(w) && !lenient(w)) : [];
    (self as unknown as Worker).postMessage({ type: 'checked', id: msg.id, words: msg.words, bad });
    return;
  }
  if (msg.type === 'suggest') {
    const w = msg.word ?? '';
    let list = checker ? checker.suggest(w) : [];
    // Rank: same letters without accents first, then by edit distance; keep the writer's capitalization.
    const f = fold(w);
    list = [...new Set(list)].sort((a, b) => (Number(fold(b) === f) - Number(fold(a) === f)) || lev(fold(a), f) - lev(fold(b), f)).slice(0, 7);
    const cap = w[0] === w[0]?.toUpperCase() && w.slice(1) === w.slice(1).toLowerCase();
    const upper = w.length > 1 && w === w.toUpperCase();
    list = list.map((s) => (upper ? s.toUpperCase() : cap ? s[0].toUpperCase() + s.slice(1) : s));
    (self as unknown as Worker).postMessage({ type: 'suggested', id: msg.id, list });
  }
};
