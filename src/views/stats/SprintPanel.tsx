// Writing sprint timer + daily goal progress.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp, toast } from '../../app/store';
import { saveNow } from '../../app/actions';
import { projectWords, localDay } from '../../core/model';
import { loadLog } from '../../app/settings';
import { t, tn, fmtNum } from '../../i18n';
import { Button, NumberInput } from '../../ui/kit';
import { Icon } from '../../ui/icons';
import { streakOf } from './Stats';

interface Sprint { endsAt: number; startWords: number; paused: number | null; minutes: number }
let active: Sprint | null = null;

export default function SprintPanel() {
  const p = useApp((s) => s.project)!;
  const settings = useApp((s) => s.settings);
  const words = useMemo(() => projectWords(p), [p.blocks]);
  const [minutes, setMinutes] = useState(settings.sprintMinutes);
  const [, tick] = useState(0);
  const done = useRef(false);
  useEffect(() => { const id = setInterval(() => tick((x) => x + 1), 500); return () => clearInterval(id); }, []);
  const now = Date.now();
  const left = active ? Math.max(0, (active.paused ?? active.endsAt) - (active.paused ? 0 : now)) : 0;
  const remaining = active ? (active.paused ? active.endsAt - active.paused : active.endsAt - now) : minutes * 60000;
  const sprintWords = active ? Math.max(0, words - active.startWords) : 0;
  useEffect(() => {
    if (active && !active.paused && Date.now() >= active.endsAt && !done.current) {
      done.current = true;
      toast(t('sp.done', { n: sprintWords }), 'success', undefined, 9000);
      active = null;
      void saveNow();
    }
  });
  void left;
  const fmt = (ms: number) => { const s = Math.max(0, Math.round(ms / 1000)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
  const log = loadLog();
  const today = log[localDay()]?.words ?? 0;
  const goal = Math.max(1, settings.goals.dailyWords);
  const pct = active ? Math.min(100, 100 - (remaining / (active.minutes * 60000)) * 100) : 0;
  return (
    <div className="panel sprint">
      <div className="sprint-clock" style={{ ['--pct' as string]: pct + '%' }}>
        <div className="ring"><span>{fmt(remaining)}</span></div>
      </div>
      {active ? <p className="center-txt">{t('sp.wordsThis', { n: fmtNum(sprintWords) })}</p> : <label className="field center-f"><span className="field-l">{t('sp.minutes')}</span><NumberInput value={minutes} min={1} max={240} onChange={setMinutes} /></label>}
      <div className="row center-row">
        {!active ? <Button kind="primary" icon="play" onClick={() => { done.current = false; active = { endsAt: Date.now() + minutes * 60000, startWords: words, paused: null, minutes }; tick((x) => x + 1); }}>{t('sp.start')}</Button> : (
          <>
            <Button icon={active.paused ? 'play' : 'pause'} onClick={() => { if (!active) return; if (active.paused) { active.endsAt += Date.now() - active.paused; active.paused = null; } else active.paused = Date.now(); tick((x) => x + 1); }}>{active.paused ? t('act.resume') : t('act.pause')}</Button>
            <Button kind="ghost" icon="stop" onClick={() => { toast(t('sp.done', { n: sprintWords }), 'success'); active = null; tick((x) => x + 1); }}>{t('act.stop')}</Button>
          </>
        )}
      </div>
      <hr />
      <h4>{t('sp.goal')}</h4>
      <p><b>{fmtNum(today)}</b> / {fmtNum(goal)} {t('w.words').toLowerCase()}</p>
      <div className="bar"><i style={{ width: `${Math.min(100, (today / goal) * 100)}%` }} /></div>
      <p className="row"><Icon name="flame" size={16} /> {tn('sp.streak', streakOf(log))}</p>
    </div>
  );
}
