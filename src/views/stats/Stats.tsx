// Statistics dashboard + writing goals history.
import { useMemo } from 'react';
import { useApp } from '../../app/store';
import { getEditor, setView } from '../../app/actions';
import { buildScenes, characterStats, locationsOf } from '../../core/scenes';
import { layoutProject, sceneLengths, eighths } from '../../core/layout';
import { projectWords, localDay } from '../../core/model';
import { loadLog } from '../../app/settings';
import { saveCsv } from '../../io/exporters';
import { t, fmtNum, fmtDate } from '../../i18n';
import { Button, COLOR_HEX, CountUp } from '../../ui/kit';

function Bars({ rows, max, unit, onClick }: { rows: { label: string; value: number; color?: string; id?: string }[]; max?: number; unit?: (v: number) => string; onClick?: (id: string) => void }) {
  const m = max ?? Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="hbars">
      {rows.map((r, i) => (
        <button key={i} type="button" className="hbar" onClick={() => r.id && onClick?.(r.id)} disabled={!onClick || !r.id}>
          <span className="hb-l" title={r.label}>{r.label}</span>
          <span className="hb-t"><i style={{ width: `${(r.value / m) * 100}%`, background: r.color }} /></span>
          <span className="hb-v">{unit ? unit(r.value) : fmtNum(r.value)}</span>
        </button>
      ))}
    </div>
  );
}

function Split({ parts }: { parts: { label: string; value: number; color: string }[] }) {
  const total = parts.reduce((a, p) => a + p.value, 0) || 1;
  return (
    <div className="split">
      <div className="split-bar">{parts.map((p) => <i key={p.label} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} title={`${p.label}: ${p.value}`} />)}</div>
      <div className="split-leg">{parts.map((p) => <span key={p.label}><i style={{ background: p.color }} />{p.label} <b>{Math.round((p.value / total) * 100)}%</b></span>)}</div>
    </div>
  );
}

export function streakOf(log: Record<string, { words: number }>): number {
  let n = 0;
  const d = new Date();
  if (!(log[localDay(d)]?.words > 0)) d.setDate(d.getDate() - 1);
  for (;;) {
    if ((log[localDay(d)]?.words ?? 0) > 0) { n++; d.setDate(d.getDate() - 1); } else break;
  }
  return n;
}

function Heatmap({ log, goal }: { log: Record<string, { words: number }>; goal: number }) {
  const weeks = 20;
  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - (weeks * 7 - 1) - ((today.getDay() + 6) % 7 === 6 ? 0 : 0));
  const cells: { day: string; words: number }[] = [];
  for (let i = 0; i < weeks * 7; i++) { const d = new Date(start); d.setDate(start.getDate() + i); cells.push({ day: localDay(d), words: log[localDay(d)]?.words ?? 0 }); }
  const level = (w: number) => (w <= 0 ? 0 : w < goal * 0.25 ? 1 : w < goal * 0.6 ? 2 : w < goal ? 3 : 4);
  return (
    <div className="heat" style={{ gridTemplateRows: 'repeat(7, 12px)' }}>
      {cells.map((c) => <i key={c.day} className={'l' + level(c.words)} title={`${fmtDate(c.day + 'T12:00:00', { dateStyle: 'medium' })}: ${c.words}`} />)}
    </div>
  );
}

export default function StatsView() {
  const p = useApp((s) => s.project)!;
  const goals = useApp((s) => s.settings.goals);
  const layout = useMemo(() => layoutProject(p), [p.blocks, p.template, p.page.paper, p.locale]);
  const scenes = useMemo(() => buildScenes(p.blocks), [p.blocks]);
  const lengths = useMemo(() => sceneLengths(layout, p.blocks), [layout, p.blocks]);
  const chars = useMemo(() => characterStats(p.blocks), [p.blocks]);
  const locs = useMemo(() => locationsOf(scenes), [scenes]);
  const words = projectWords(p);
  const pages = layout.pages.length;
  const minutes = pages * p.page.minutesPerPage;
  const lineCount = (types: string[]) => layout.pages.reduce((a, pg) => a + pg.lines.filter((l) => types.includes(l.type) && l.kind === 'text').length, 0);
  const dlg = lineCount(['dialogue', 'parenthetical', 'character']);
  const act = lineCount(['action', 'general', 'shot']);
  const ie = { int: 0, ext: 0, both: 0 }, dn = { day: 0, night: 0, other: 0 };
  for (const s of scenes) {
    const pg = lengths.get(s.id) ?? 0;
    if (s.parsed.intExt === 'int') ie.int += pg; else if (s.parsed.intExt === 'ext') ie.ext += pg; else if (s.parsed.intExt === 'both') ie.both += pg;
    if (s.parsed.dayNight === 'day') dn.day += pg; else if (s.parsed.dayNight === 'night') dn.night += pg; else dn.other += pg;
  }
  const globalLog = loadLog();
  const today = globalLog[localDay()]?.words ?? 0;
  const streak = streakOf(globalLog);
  const jump = (id: string) => { setView('write'); setTimeout(() => getEditor()?.scrollToBlock(id, { select: true }), 80); };
  const exportScenes = () => saveCsv(`${p.title || 'guion'}-escenas.csv`, [
    [t('w.scene'), t('st.heading'), 'INT/EXT', t('st.location'), t('st.time'), t('w.pages'), t('st.eighths'), t('w.words'), t('w.characters'), t('w.summary')],
    ...scenes.map((s) => [s.label, s.heading.toUpperCase(), s.parsed.intExt.toUpperCase(), s.parsed.location, s.parsed.time, (lengths.get(s.id) ?? 0).toFixed(2), eighths(lengths.get(s.id) ?? 0), s.words, s.speakers.join(' / '), p.scenes[s.id]?.summary ?? '']),
  ]);
  const exportChars = () => saveCsv(`${p.title || 'guion'}-personajes.csv`, [
    [t('w.name'), t('ch.speeches'), t('ch.words'), t('ch.scenes')],
    ...chars.map((c) => [c.name, c.speeches, c.words, scenes.filter((s) => s.speakers.includes(c.name)).length]),
  ]);
  const longest = [...scenes].sort((a, b) => (lengths.get(b.id) ?? 0) - (lengths.get(a.id) ?? 0)).slice(0, 10);
  return (
    <div className="view stats-view">
      <header className="view-h"><h2>{t('nav.stats')}</h2><span className="grow" /><Button small icon="download" onClick={exportScenes}>{t('stats.csvScenes')}</Button><Button small icon="download" onClick={exportChars}>{t('stats.csvChars')}</Button></header>
      <div className="view-b">
        <div className="cards-row">
          <div className="card stat"><b><CountUp value={pages} /></b><span>{t('w.pages')}</span></div>
          <div className="card stat"><b><CountUp value={Math.round(minutes)} format={(m) => (Math.floor(m / 60) ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`)} /></b><span>{t('stats.duration')}</span></div>
          <div className="card stat"><b><CountUp value={scenes.length} /></b><span>{t('w.scenes')}</span></div>
          <div className="card stat"><b><CountUp value={words} /></b><span>{t('w.words')}</span></div>
          <div className="card stat"><b><CountUp value={chars.length} /></b><span>{t('w.characters')}</span></div>
          <div className="card stat"><b><CountUp value={locs.length} /></b><span>{t('w.locations')}</span></div>
        </div>
        <div className="grid2 mt">
          <div className="card"><h3>{t('stats.balance')}</h3>
            <Split parts={[{ label: t('stats.dialogue'), value: dlg, color: 'var(--accent)' }, { label: t('stats.action'), value: act, color: 'var(--rv-gold)' }]} />
            <Split parts={[{ label: 'INT.', value: ie.int, color: '#6b5bd2' }, { label: 'EXT.', value: ie.ext, color: '#4c9a6a' }, { label: 'INT./EXT.', value: ie.both, color: 'var(--line-2)' }]} />
            <Split parts={[{ label: t('w.day'), value: dn.day, color: '#f5b800' }, { label: t('w.night'), value: dn.night, color: '#1f2a5c' }, { label: t('w.other'), value: dn.other, color: '#b9bbc6' }]} />
          </div>
          <div className="card"><h3>{t('stats.writing')}</h3>
            <div className="cards-row tight">
              <div className="stat"><b><CountUp value={today} /></b><span>{t('stats.today', { goal: fmtNum(goals.dailyWords) })}</span></div>
              <div className="stat"><b><CountUp value={streak} /></b><span>{t('stats.streak')}</span></div>
              <div className="stat"><b>{fmtNum(Object.values(p.writingLog).reduce((a, x) => a + x.words, 0))}</b><span>{t('stats.projectWords')}</span></div>
            </div>
            <div className="bar mt"><i style={{ width: `${Math.min(100, (today / Math.max(1, goals.dailyWords)) * 100)}%` }} /></div>
            <h4 className="mt">{t('stats.calendar')}</h4>
            <Heatmap log={globalLog} goal={Math.max(1, goals.dailyWords)} />
          </div>
        </div>
        <div className="grid2 mt">
          <div className="card"><h3>{t('stats.topChars')}</h3><Bars rows={chars.slice(0, 15).map((c) => ({ label: c.name, value: c.speeches }))} /><h4 className="mt">{t('stats.wordsByChar')}</h4><Bars rows={[...chars].sort((a, b) => b.words - a.words).slice(0, 15).map((c) => ({ label: c.name, value: c.words }))} /></div>
          <div className="card"><h3>{t('stats.longest')}</h3><Bars rows={longest.map((s) => ({ label: `${s.label}. ${s.heading.toUpperCase()}`, value: lengths.get(s.id) ?? 0, id: s.id, color: p.scenes[s.id]?.color && p.scenes[s.id]!.color !== 'none' ? COLOR_HEX[p.scenes[s.id]!.color!] : undefined }))} unit={(v) => eighths(v)} onClick={jump} />
            <h4 className="mt">{t('stats.byLocation')}</h4><Bars rows={locs.slice(0, 12).map((l) => ({ label: l.name, value: l.count }))} /></div>
        </div>
        <div className="card mt"><h3>{t('stats.sceneLengths')}</h3>
          <div className="scene-strip">{scenes.map((s) => { const v = lengths.get(s.id) ?? 0; const col = p.scenes[s.id]?.color; return <button key={s.id} type="button" title={`${s.label}. ${s.heading} · ${eighths(v)}`} style={{ height: `${Math.min(100, 12 + v * 22)}%`, background: col && col !== 'none' ? COLOR_HEX[col] : undefined }} onClick={() => jump(s.id)} />; })}</div>
        </div>
      </div>
    </div>
  );
}
