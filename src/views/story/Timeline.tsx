// Timeline: script order vs story chronology (flashbacks become visible as crossing lines).
import { useMemo } from 'react';
import { useApp } from '../../app/store';
import { getEditor, setView, updateProject } from '../../app/actions';
import { buildScenes } from '../../core/scenes';
import { chronological } from '../../core/story';
import { t } from '../../i18n';
import { COLOR_HEX } from '../../ui/kit';

const ROW = 34;

export default function TimelineView() {
  const p = useApp((s) => s.project)!;
  const scenes = useMemo(() => buildScenes(p.blocks), [p.blocks]);
  const chrono = useMemo(() => chronological(p, scenes), [p.scenes, scenes]);
  const chronoIdx = new Map(chrono.map((s, i) => [s.id, i]));
  const setMeta = (id: string, patch: object) => updateProject((x) => ({ ...x, scenes: { ...x.scenes, [id]: { ...(x.scenes[id] ?? {}), ...patch } } }));
  const jump = (id: string) => { setView('write'); setTimeout(() => getEditor()?.scrollToBlock(id, { select: true }), 80); };
  const h = Math.max(1, scenes.length) * ROW;
  const nonLinear = scenes.filter((s, i) => chronoIdx.get(s.id) !== i).length;
  const days = [...new Set(chrono.map((s) => p.scenes[s.id]?.storyDay).filter((d): d is number => typeof d === 'number'))];
  return (
    <div className="view timeline-view">
      <header className="view-h">
        <h2>{t('nav.timeline')}</h2>
        <span className="muted small">{nonLinear ? t('tl.nonLinear', { n: nonLinear }) : t('tl.linear')}</span>
        {days.length ? <span className="muted small">· {t('tl.days', { n: days.length })}</span> : null}
      </header>
      <div className="view-b">
        <p className="muted small">{t('tl.hint')}</p>
        {!scenes.length ? <p className="muted">{t('nv.noScenes')}</p> : (
          <div className="tl">
            <div className="tl-col">
              <h4>{t('tl.script')}</h4>
              {scenes.map((s) => {
                const m = p.scenes[s.id] ?? {};
                return (
                  <div key={s.id} className="tl-row" style={{ height: ROW }}>
                    <button type="button" className="tl-scene" onClick={() => jump(s.id)} style={{ borderLeftColor: m.color && m.color !== 'none' ? COLOR_HEX[m.color] : 'var(--line-2)' }}>
                      <b>{s.label}</b> <span>{s.heading.toUpperCase()}</span>
                    </button>
                    <input className="input sm tl-day" type="number" min={1} value={m.storyDay ?? ''} placeholder={t('tl.day')} aria-label={t('tl.day')} onChange={(e) => setMeta(s.id, { storyDay: e.target.value ? Number(e.target.value) : undefined })} />
                    <input className="input sm tl-time" type="time" value={m.storyTime ?? ''} aria-label={t('w.time')} onChange={(e) => setMeta(s.id, { storyTime: e.target.value || undefined })} />
                  </div>
                );
              })}
            </div>
            <svg className="tl-lines" width={140} height={h + 28} aria-hidden="true">
              {scenes.map((s, i) => {
                const j = chronoIdx.get(s.id) ?? i;
                const y1 = 28 + i * ROW + ROW / 2, y2 = 28 + j * ROW + ROW / 2;
                const col = p.scenes[s.id]?.color;
                const stroke = col && col !== 'none' ? COLOR_HEX[col] : i === j ? 'var(--line-2)' : 'var(--accent)';
                return <path key={s.id} className="draw" pathLength={1} style={{ animationDelay: `${Math.min(i, 30) * 25}ms` }} d={`M0 ${y1} C 70 ${y1}, 70 ${y2}, 140 ${y2}`} fill="none" stroke={stroke} strokeWidth={i === j ? 1.5 : 2.5} opacity={i === j ? 0.6 : 0.95} />;
              })}
            </svg>
            <div className="tl-col">
              <h4>{t('tl.story')}</h4>
              {chrono.map((s) => {
                const m = p.scenes[s.id] ?? {};
                return (
                  <div key={s.id} className="tl-row" style={{ height: ROW }}>
                    <span className="tl-when">{m.storyDay ? t('tl.dayN', { n: m.storyDay }) : '—'}{m.storyTime ? ` · ${m.storyTime}` : ''}</span>
                    <button type="button" className="tl-scene" onClick={() => jump(s.id)}><b>{s.label}</b> <span>{s.heading.toUpperCase()}</span></button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
