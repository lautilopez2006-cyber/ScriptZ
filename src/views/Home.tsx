// Home: library of projects, new project wizard entry, import, sample, tour.
import { useMemo, useState } from 'react';
import { useApp, openModal, toast } from '../app/store';
import { deleteProject, duplicateProject, openProject, renameProject } from '../app/actions';
import { t, relTime, fmtNum } from '../i18n';
import { Button, Empty, MenuButton, Spinner, cx } from '../ui/kit';
import { Icon, Logo } from '../ui/icons';
import { getTemplate } from '../core/format';

function joinSession() {
  openModal('prompt', {
    title: t('co.join'), label: t('co.invite'),
    onSubmit: (v: string) => {
      void import('../collab/client').then((m) => {
        const inv = m.parseInvite(v);
        if (!inv) { toast(t('co.badInvite'), 'error'); return; }
        void m.collab.connect(inv);
      });
    },
  });
}

export function HomeView() {
  const library = useApp((s) => s.library);
  const loaded = useApp((s) => s.libraryLoaded);
  const current = useApp((s) => s.project?.id);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'recent' | 'title'>('recent');
  const list = useMemo(() => {
    const f = q.trim().toLowerCase();
    const l = library.filter((p) => !f || (p.title || '').toLowerCase().includes(f));
    return sort === 'title' ? [...l].sort((a, b) => (a.title || '').localeCompare(b.title || '')) : l;
  }, [library, q, sort]);
  const openSample = async () => { const m = await import('../io/sample'); await m.openSample(); };
  const importFile = async () => { const m = await import('../io/importers'); await m.importWithPicker(); };
  return (
    <div className="home">
      <section className="hero">
        <div className="hero-brand"><Logo size={56} /><div><h1>ScriptZ</h1><p>{t('app.tagline')}</p></div></div>
        <div className="hero-actions">
          <Button kind="primary" icon="plus" onClick={() => openModal('newProject')}>{t('home.new')}</Button>
          <Button icon="upload" onClick={importFile}>{t('home.import')}</Button>
          <Button kind="ghost" icon="book" onClick={openSample}>{t('home.sample')}</Button>
          <Button kind="ghost" icon="users" onClick={joinSession}>{t('co.join')}</Button>
          <Button kind="ghost" icon="help" onClick={() => openModal('tour')}>{t('tour.start')}</Button>
        </div>
        <p className="hero-formats muted">{t('home.formats')}</p>
      </section>
      <section className="library">
        <header className="lib-h">
          <h2>{t('home.library')}</h2>
          <span className="grow" />
          <input className="input sm" placeholder={t('act.search')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('act.search')} />
          <select className="select sm" value={sort} onChange={(e) => setSort(e.target.value as 'recent' | 'title')} aria-label={t('home.sort')}>
            <option value="recent">{t('home.sort.recent')}</option>
            <option value="title">{t('home.sort.title')}</option>
          </select>
        </header>
        {!loaded ? <div className="center pad"><Spinner /></div> : !list.length ? (
          <Empty icon="pen" title={library.length ? t('pal.none') : t('home.empty.title')} action={!library.length ? <Button kind="primary" icon="plus" onClick={() => openModal('newProject')}>{t('home.new')}</Button> : undefined}>
            {!library.length ? t('home.empty.text') : null}
          </Empty>
        ) : (
          <div className="lib-grid">
            {list.map((p) => (
              <article key={p.id} className={cx('proj', current === p.id && 'current')}>
                <button type="button" className="proj-open" onClick={() => openProject(p.id)}>
                  <div className="proj-page" aria-hidden="true">
                    <span className="pp-title">{(p.title || t('w.untitled')).toUpperCase()}</span>
                    <span className="pp-lines"><i /><i /><i /><i /><i /></span>
                  </div>
                  <div className="proj-meta">
                    <h3>{p.title || t('w.untitled')}</h3>
                    <small>{t(getTemplate(p.template ?? 'feature').name)} · {t('home.scenesWords', { s: p.scenes, w: fmtNum(p.words) })}</small>
                    <small className="muted">{p.updatedAt ? relTime(Date.parse(p.updatedAt)) : ''}</small>
                  </div>
                </button>
                <MenuButton className="proj-menu" icon="moreV" title={t('act.more')} align="right" items={[
                  { label: t('act.open'), icon: 'pen', onClick: () => openProject(p.id) },
                  { label: t('act.rename'), icon: 'type', onClick: () => openModal('prompt', { title: t('act.rename'), label: t('w.title'), value: p.title, onSubmit: (v: string) => renameProject(p.id, v) }) },
                  { label: t('act.duplicate'), icon: 'copy', onClick: () => duplicateProject(p.id) },
                  { separator: true },
                  { label: t('act.delete'), icon: 'trash', danger: true, onClick: () => openModal('confirm', { title: t('act.confirmDelete'), text: t('home.deleteText', { title: p.title || t('w.untitled') }), danger: true, onConfirm: () => deleteProject(p.id) }) },
                ]} />
              </article>
            ))}
          </div>
        )}
      </section>
      <footer className="home-foot muted">
        <span><Icon name="info" size={14} /> {t('home.privacy')}</span>
      </footer>
    </div>
  );
}
