// First-run guided tour.
import { useState } from 'react';
import { closeModal } from '../app/store';
import { setSettings } from '../app/actions';
import { t } from '../i18n';
import { Button, Modal } from '../ui/kit';
import { Icon, Logo } from '../ui/icons';

const STEPS: { icon: string }[] = [{ icon: 'logo' }, { icon: 'pen' }, { icon: 'wand' }, { icon: 'pageView' }, { icon: 'cards' }, { icon: 'clapper' }, { icon: 'command' }];

export default function Tour() {
  const [i, setI] = useState(0);
  const done = (sample: boolean) => {
    setSettings({ tourDone: true });
    closeModal();
    if (sample) void import('../io/sample').then((m) => m.openSample());
  };
  const last = i === STEPS.length - 1;
  return (
    <Modal title={t('tour.step', { n: i + 1, total: STEPS.length })} onClose={() => done(false)} size="md" footer={
      <>
        <Button kind="ghost" onClick={() => done(false)}>{t('tour.skip')}</Button>
        <span className="grow" />
        {i > 0 ? <Button onClick={() => setI(i - 1)}>{t('act.prev')}</Button> : null}
        {last ? <Button kind="primary" icon="book" onClick={() => done(true)}>{t('home.sample')}</Button> : null}
        <Button kind={last ? 'default' : 'primary'} onClick={() => (last ? done(false) : setI(i + 1))}>{last ? t('tour.finish') : t('act.next')}</Button>
      </>
    }>
      <div className="tour">
        <div className="tour-ic">{STEPS[i].icon === 'logo' ? <Logo size={64} /> : <Icon name={STEPS[i].icon} size={40} />}</div>
        <h2>{t(`tour.${i + 1}.t`)}</h2>
        <p>{t(`tour.${i + 1}.d`)}</p>
        <div className="tour-dots">{STEPS.map((_, k) => <button key={k} type="button" className={k === i ? 'on' : ''} aria-label={String(k + 1)} onClick={() => setI(k)} />)}</div>
      </div>
    </Modal>
  );
}
