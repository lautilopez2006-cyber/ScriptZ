// Sides: pick a shooting day (or scenes) and generate the actors' pages.
import { useMemo, useState } from 'react';
import { useApp, closeModal } from '../../app/store';
import { plannedDays } from '../../core/production';
import { buildScenes } from '../../core/scenes';
import { layoutProject, sceneLengths } from '../../core/layout';
import { officialProject } from '../../core/suggest';
import { exportSides } from '../../io/exporters';
import { sidesPlan } from '../../io/sides';
import { t, tn } from '../../i18n';
import { Button, Field, Modal, Spinner, cx } from '../../ui/kit';

export default function SidesModal({ dayId }: { dayId?: string }) {
  const p0 = useApp((s) => s.project)!;
  const p = useMemo(() => officialProject(p0), [p0]);
  const scenes = useMemo(() => buildScenes(p.blocks).filter((s) => !s.omitted), [p.blocks]);
  const plan = useMemo(() => { const l = layoutProject(p); return plannedDays(p, sceneLengths(l, p.blocks)); }, [p]);
  const dayLabel = (id: string) => p.schedule.days[id]?.label || t('pd.day');
  const [day, setDay] = useState<string>(dayId ?? plan.days.find((d) => d.dayId)?.dayId ?? '');
  const fromDay = (id: string) => new Set(plan.days.find((d) => d.dayId === id)?.scenes ?? []);
  const [picked, setPicked] = useState<Set<string>>(() => fromDay(dayId ?? plan.days.find((d) => d.dayId)?.dayId ?? ''));
  const [title, setTitle] = useState(() => (day ? `${p.title || t('w.untitled')} · ${dayLabel(day)}` : p.title || t('w.untitled')));
  const [busy, setBusy] = useState(false);
  const ids = scenes.filter((s) => picked.has(s.id)).map((s) => s.id);
  const pageCount = useMemo(() => (ids.length ? sidesPlan(p, ids).pages.length : 0), [p, ids.join(',')]);
  const chooseDay = (id: string) => {
    setDay(id);
    setPicked(fromDay(id));
    if (id) setTitle(`${p.title || t('w.untitled')} · ${dayLabel(id)}`);
  };
  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const go = async () => {
    setBusy(true);
    const ok = await exportSides(p0, ids, title.trim() || t('sd.title'));
    setBusy(false);
    if (ok) closeModal();
  };
  return (
    <Modal title={t('sd.title')} onClose={closeModal} size="lg" footer={<>
      <span className="muted small grow">{ids.length ? tn('sd.pages', pageCount) : t('sd.pick')}</span>
      <Button onClick={closeModal}>{t('act.cancel')}</Button>
      <Button kind="primary" icon="download" disabled={!ids.length || busy} onClick={go}>{busy ? <Spinner /> : t('sd.go')}</Button>
    </>}>
      <p className="muted small">{t('sd.intro')}</p>
      <div className="grid2">
        <Field label={t('sd.day')}>
          <select className="input" value={day} onChange={(e) => chooseDay(e.target.value)}>
            <option value="">{t('sd.custom')}</option>
            {plan.days.filter((d) => d.dayId).map((d) => <option key={d.dayId!} value={d.dayId!}>{dayLabel(d.dayId!)} · {tn('sd.scenes', d.scenes.length)}</option>)}
          </select>
        </Field>
        <Field label={t('sd.header')} hint={t('sd.header.h')}><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
      </div>
      <div className="sd-list" role="group" aria-label={t('sd.scenesLabel')}>
        {scenes.map((s) => (
          <label key={s.id} className={cx('sd-scene', picked.has(s.id) && 'on')}>
            <input type="checkbox" checked={picked.has(s.id)} onChange={() => { toggle(s.id); setDay(''); }} />
            <b>{s.label}</b><span>{s.heading || '—'}</span>
            {s.speakers.length ? <small className="muted">{s.speakers.slice(0, 4).join(', ')}{s.speakers.length > 4 ? '…' : ''}</small> : null}
          </label>
        ))}
      </div>
    </Modal>
  );
}
