// Series workspace: every episode of a show, the characters and places they share, and the show bible.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp, setState, openModal, toast } from '../../app/store';
import { createProject, openProject, refreshLibrary, setView } from '../../app/actions';
import { projectStore } from '../../platform';
import { BIBLE_TEMPLATE, epCode, seriesShelf, type ShowEntry } from '../../core/series';
import { emptyProject, type Project, type ProjectSummary, type SeriesBible } from '../../core/model';
import { buildScenes, characterStats, locationsOf } from '../../core/scenes';
import { t, tn, fmtNum, relTime } from '../../i18n';
import { Button, Empty, Field, LazyInput, Spinner, Tabs, cx } from '../../ui/kit';
import { Icon } from '../../ui/icons';

const emptyBible = (show: string): SeriesBible => ({ show, logline: '', premise: '', tone: '', world: '', arcs: '', notes: '', characters: {}, locations: {} });

interface EpisodeData { id: string; chars: { name: string; speeches: number; words: number }[]; locs: { name: string; count: number }[] }

export default function SeriesView() {
  const library = useApp((s) => s.library);
  const current = useApp((s) => s.series);
  const shelf = useMemo(() => seriesShelf(library), [library]);
  const entry = shelf.find((s) => s.show.toLocaleUpperCase() === (current ?? '').toLocaleUpperCase()) ?? shelf[0];
  const [tab, setTab] = useState<'episodes' | 'cast' | 'places' | 'bible'>('episodes');
  if (!entry) {
    return (
      <div className="view series">
        <Empty icon="layers" title={t('se.empty')} action={<Button kind="primary" icon="plus" onClick={() => openModal('newProject')}>{t('home.new')}</Button>}>{t('se.empty.h')}</Empty>
      </div>
    );
  }
  return (
    <div className="view series">
      <header className="se-head">
        <button type="button" className="se-back" onClick={() => setView('home')}><Icon name="arrowLeft" size={16} />{t('nav.home')}</button>
        <div className="se-title">
          <small>{t('se.kicker')}</small>
          <h1>{entry.show}</h1>
          <p className="muted">{tn('se.episodes', entry.episodes.length)} · {fmtNum(entry.episodes.reduce((n, e) => n + e.words, 0))} {t('w.words').toLowerCase()}</p>
        </div>
        {shelf.length > 1 ? (
          <select className="select sm" value={entry.show} onChange={(e) => setState({ series: e.target.value })} aria-label={t('se.switch')}>
            {shelf.map((s) => <option key={s.show} value={s.show}>{s.show}</option>)}
          </select>
        ) : null}
        <Button kind="primary" icon="plus" onClick={() => newEpisode(entry.show, entry.episodes)}>{t('se.newEp')}</Button>
      </header>
      <Tabs value={tab} onChange={setTab} tabs={[
        { value: 'episodes', label: t('se.tab.episodes'), icon: 'layers' },
        { value: 'cast', label: t('se.tab.cast'), icon: 'users' },
        { value: 'places', label: t('se.tab.places'), icon: 'pin' },
        { value: 'bible', label: t('se.tab.bible'), icon: 'book' },
      ]} />
      <Body key={entry.show} entry={entry} tab={tab} />
    </div>
  );
}

async function newEpisode(show: string, eps: ProjectSummary[]) {
  const last = eps[eps.length - 1]?.series;
  const season = last?.season ?? 1;
  const episode = (last?.episode ?? 0) + 1;
  const st = (await import('../../app/store')).getState();
  // Same format as the previous episode.
  let base: Project | null = null;
  try { if (eps.length) base = await projectStore().load(eps[eps.length - 1].id); } catch { base = null; }
  await createProject({
    title: `${show} ${epCode({ season, episode })}`, author: base?.author ?? st.settings.author, template: base?.template ?? 'tv',
    locale: base?.locale ?? 'es-LA', paper: base?.page.paper ?? 'letter', series: { show, season, episode, episodeTitle: '' },
  });
}

function Body({ entry, tab }: { entry: ShowEntry; tab: string }) {
  const [data, setData] = useState<Map<string, EpisodeData> | null>(null);
  const key = entry.episodes.map((e) => e.id + e.updatedAt).join('|');
  useEffect(() => {
    let alive = true;
    (async () => {
      const m = new Map<string, EpisodeData>();
      for (const e of entry.episodes) {
        try {
          const p = await projectStore().load(e.id);
          const scenes = buildScenes(p.blocks);
          m.set(e.id, { id: e.id, chars: characterStats(p.blocks), locs: locationsOf(scenes) });
        } catch { /* unreadable episode: skipped */ }
      }
      if (alive) setData(m);
    })();
    return () => { alive = false; };
  }, [key]);
  if (tab === 'bible') return <BibleEditor entry={entry} chars={data} />;
  if (!data) return <div className="center pad"><Spinner /></div>;
  if (tab === 'cast') return <Shared entry={entry} data={data} kind="chars" />;
  if (tab === 'places') return <Shared entry={entry} data={data} kind="locs" />;
  return <Episodes entry={entry} data={data} />;
}

function Episodes({ entry, data }: { entry: ShowEntry; data: Map<string, EpisodeData> }) {
  const seasons = new Map<number, ProjectSummary[]>();
  for (const e of entry.episodes) { const s = e.series!.season; seasons.set(s, [...(seasons.get(s) ?? []), e]); }
  if (!entry.episodes.length) return <Empty icon="layers" title={t('se.noEps')}>{t('se.noEps.h')}</Empty>;
  return (
    <div className="se-seasons">
      {[...seasons].map(([s, eps]) => (
        <section key={s}>
          <h3 className="se-season">{t('se.season', { n: s })}</h3>
          <div className="se-eps">
            {eps.map((e, i) => {
              const d = data.get(e.id);
              return (
                <button key={e.id} type="button" className="se-ep" style={{ ['--i' as string]: Math.min(i, 12) }} onClick={() => openProject(e.id)}>
                  <span className="se-code">{epCode(e.series)}</span>
                  <b>{e.series?.episodeTitle || e.title || t('w.untitled')}</b>
                  <small className="muted">{t('home.scenesWords', { s: e.scenes, w: fmtNum(e.words) })}</small>
                  {d?.chars.length ? <small className="se-who">{d.chars.slice(0, 4).map((c) => c.name).join(' · ')}</small> : null}
                  <small className="muted">{e.updatedAt ? relTime(Date.parse(e.updatedAt)) : ''}</small>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

/** Characters or locations across episodes: a presence grid (rows × episodes). */
function Shared({ entry, data, kind }: { entry: ShowEntry; data: Map<string, EpisodeData>; kind: 'chars' | 'locs' }) {
  const rows = useMemo(() => {
    const m = new Map<string, { name: string; total: number; eps: Map<string, number> }>();
    for (const e of entry.episodes) {
      const d = data.get(e.id);
      if (!d) continue;
      const list = kind === 'chars' ? d.chars.map((c) => ({ name: c.name, n: c.speeches })) : d.locs.map((l) => ({ name: l.name, n: l.count }));
      for (const x of list) {
        if (!x.name) continue;
        const r = m.get(x.name) ?? { name: x.name, total: 0, eps: new Map() };
        r.total += x.n; r.eps.set(e.id, x.n);
        m.set(x.name, r);
      }
    }
    return [...m.values()].sort((a, b) => b.eps.size - a.eps.size || b.total - a.total);
  }, [entry, data, kind]);
  if (!rows.length) return <Empty icon={kind === 'chars' ? 'users' : 'pin'} title={t('se.nothing')} />;
  const max = Math.max(...rows.flatMap((r) => [...r.eps.values()]), 1);
  return (
    <div className="se-matrix" style={{ ['--cols' as string]: entry.episodes.length }}>
      <div className="se-row se-hrow">
        <span>{kind === 'chars' ? t('se.character') : t('st.location')}</span>
        {entry.episodes.map((e) => <span key={e.id} className="se-col" title={e.title}>{epCode(e.series)}</span>)}
        <span className="se-tot">{kind === 'chars' ? t('se.speeches') : t('w.scenes')}</span>
      </div>
      {rows.slice(0, 200).map((r) => (
        <div key={r.name} className={cx('se-row', r.eps.size === entry.episodes.length && entry.episodes.length > 1 && 'all')}>
          <b>{r.name}</b>
          {entry.episodes.map((e) => {
            const n = r.eps.get(e.id) ?? 0;
            return <span key={e.id} className="se-cell" title={n ? `${epCode(e.series)} · ${n}` : ''}>{n ? <i style={{ ['--v' as string]: 0.25 + 0.75 * (n / max) }} /> : null}</span>;
          })}
          <span className="se-tot">{r.total}</span>
        </div>
      ))}
    </div>
  );
}

function BibleEditor({ entry, chars }: { entry: ShowEntry; chars: Map<string, EpisodeData> | null }) {
  const [bible, setBible] = useState<SeriesBible | null>(null);
  const proj = useRef<Project | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    (async () => {
      let p: Project | null = null;
      if (entry.bible) { try { p = await projectStore().load(entry.bible.id); } catch { p = null; } }
      if (!alive) return;
      proj.current = p;
      setBible(p?.bible ?? emptyBible(entry.show));
    })();
    return () => { alive = false; };
  }, [entry.bible?.id, entry.show]);
  const flush = async (b: SeriesBible) => {
    let p = proj.current;
    if (!p) {
      p = emptyProject({ title: `${entry.show} — ${t('se.tab.bible')}`, template: BIBLE_TEMPLATE });
      p.series = { show: entry.show, season: 0, episode: 0, episodeTitle: '' };
    }
    p = { ...p, bible: b, updatedAt: new Date().toISOString() };
    proj.current = p;
    try { await projectStore().save(p); await refreshLibrary(); } catch (e) { toast(t('err.generic', { msg: String((e as Error)?.message ?? e) }), 'error'); }
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);
  if (!bible) return <div className="center pad"><Spinner /></div>;
  const set = (patch: Partial<SeriesBible>) => {
    const b = { ...bible, ...patch };
    setBible(b);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flush(b), 500);
  };
  // Characters: everyone who speaks in the show, plus those added by hand.
  const speaking = new Map<string, number>();
  for (const d of chars?.values() ?? []) for (const c of d.chars) if (c.name) speaking.set(c.name, (speaking.get(c.name) ?? 0) + c.speeches);
  const names = [...new Set([...Object.keys(bible.characters), ...[...speaking.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n)])];
  const ch = (name: string) => bible.characters[name] ?? { name, description: '', actor: '' };
  const setCh = (name: string, patch: Partial<{ description: string; actor: string }>) => set({ characters: { ...bible.characters, [name]: { ...ch(name), ...patch } } });
  const FIELDS: (keyof SeriesBible)[] = ['logline', 'premise', 'tone', 'world', 'arcs', 'notes'];
  return (
    <div className="se-bible">
      <p className="muted small">{t('se.bible.h')}</p>
      <div className="se-bible-grid">
        {FIELDS.map((f) => (
          <Field key={f} label={t('se.b.' + f)}>
            <LazyInput multiline rows={f === 'logline' ? 2 : 5} value={String(bible[f] ?? '')} placeholder={t('se.b.' + f + '.ph')} onCommit={(v) => set({ [f]: v } as Partial<SeriesBible>)} />
          </Field>
        ))}
      </div>
      <h3 className="mt">{t('se.b.characters')}</h3>
      {!names.length ? <p className="muted">{t('se.b.noChars')}</p> : (
        <div className="se-chars">
          {names.map((n) => (
            <article key={n} className="se-char">
              <header><b>{n}</b>{speaking.get(n) ? <small className="muted">{tn('se.lines', speaking.get(n)!)}</small> : null}</header>
              <LazyInput multiline rows={3} value={ch(n).description} placeholder={t('se.b.charDesc')} onCommit={(v) => setCh(n, { description: v })} />
              <LazyInput value={ch(n).actor} placeholder={t('se.b.actor')} onCommit={(v) => setCh(n, { actor: v })} />
            </article>
          ))}
        </div>
      )}
      <Button small icon="plus" className="mt" onClick={() => openModal('prompt', { title: t('se.b.addChar'), label: t('se.character'), onSubmit: (v: string) => { const n = v.trim().toLocaleUpperCase(); if (n) setCh(n, {}); } })}>{t('se.b.addChar')}</Button>
    </div>
  );
}
