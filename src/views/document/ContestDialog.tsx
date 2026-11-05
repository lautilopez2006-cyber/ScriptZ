// Contest formats: pick a call, see what the script still needs, export the submission PDF.
import { useMemo, useState } from 'react';
import { closeModal, useApp, openModal } from '../../app/store';
import { updateProject } from '../../app/actions';
import { CONTESTS, checkContest, contestProject } from '../../core/contests';
import { layoutProject } from '../../core/layout';
import { exportProject } from '../../io/exporters';
import { openExternal } from '../../platform';
import { t } from '../../i18n';
import { Button, Modal, Spinner, cx } from '../../ui/kit';
import { Icon } from '../../ui/icons';

export default function ContestDialog() {
  const p = useApp((s) => s.project)!;
  const author = useApp((s) => s.settings.author);
  const [id, setId] = useState(CONTESTS[0].id);
  const [busy, setBusy] = useState(false);
  const rules = CONTESTS.find((c) => c.id === id)!;
  const pages = useMemo(() => layoutProject(p).pages.length, [p]);
  const checks = useMemo(() => checkContest(p, rules, pages, author), [p, rules, pages, author]);
  const errors = checks.filter((c) => !c.ok && c.severity === 'error').length;
  const warns = checks.filter((c) => !c.ok && c.severity === 'warn').length;
  const fix = (f: 'anon' | 'numbers' | 'logline') => {
    if (f === 'numbers') updateProject((x) => ({ ...x, page: { ...x.page, sceneNumbers: 'both' } }), { history: true });
    if (f === 'anon') updateProject((x) => contestProject(x, rules), { history: true });
    if (f === 'logline') openModal('pitch');
  };
  const go = async () => {
    setBusy(true);
    await exportProject(contestProject(p, rules), 'pdf', { titlePage: true });
    setBusy(false);
  };
  return (
    <Modal title={t('ct.title')} onClose={closeModal} size="xl" footer={<>
      <small className="muted grow">{errors ? t('ct.errors', { n: errors }) : warns ? t('ct.warns', { n: warns }) : t('ct.ready')}</small>
      <Button onClick={closeModal}>{t('act.close')}</Button>
      <Button kind="primary" icon="download" onClick={() => void go()} disabled={busy}>{busy ? <Spinner /> : t('ct.export')}</Button>
    </>}>
      <div className="ct">
        <nav className="ct-list" aria-label={t('ct.pick')}>
          {CONTESTS.map((c) => (
            <button key={c.id} type="button" className={cx('ct-it', c.id === id && 'on')} onClick={() => setId(c.id)}>
              <b>{c.name}</b><small>{c.where} · {c.pages ? t('ct.range', { min: c.pages.min ?? 1, max: c.pages.max ?? '∞' }) : t('ct.noRange')}{c.anonymous ? ' · ' + t('ct.anon') : ''}</small>
            </button>
          ))}
        </nav>
        <section className="ct-main">
          <header>
            <h3>{rules.name}</h3>
            <p className="muted small">{t('ct.edition', { e: rules.edition })} · <button type="button" className="linklike" onClick={() => void openExternal(rules.source)}>{t('ct.source')}</button></p>
          </header>
          <div className="ct-checks">
            {checks.map((c, i) => (
              <div key={c.id} className={cx('ct-check', c.ok ? 'ok' : c.severity)} style={{ ['--i' as string]: i }}>
                <Icon name={c.ok ? 'check' : c.severity === 'error' ? 'alert' : 'flag'} size={16} />
                <span>{t(c.msg, c.vars)}</span>
                {c.fix ? <Button small kind="ghost" onClick={() => fix(c.fix!)}>{t('ct.fix.' + c.fix)}</Button> : null}
              </div>
            ))}
          </div>
          {rules.notes.length ? <ul className="ct-notes">{rules.notes.map((n) => <li key={n}>{t(n)}</li>)}</ul> : null}
          <p className="ct-warn"><Icon name="info" size={15} />{t('ct.verify')}</p>
        </section>
      </div>
    </Modal>
  );
}
