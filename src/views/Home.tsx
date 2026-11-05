// Home: library of projects, new project wizard entry, import, sample, tour.
import { useEffect, useMemo, useState } from 'react';
import { useApp, openModal, toast, setState } from '../app/store';
import { deleteProject, duplicateProject, openProject, renameProject, setView } from '../app/actions';
import { t, tn, relTime, fmtNum } from '../i18n';
import { epCode, isBible, seriesShelf } from '../core/series';
import { Button, Empty, MenuButton, Spinner, cx } from '../ui/kit';
import { Icon } from '../ui/icons';
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

/** Opening a script: its cover is named for the view transition, so it grows into the editor page. */
function open(id: string, el: HTMLElement) {
  const front = el.querySelector<HTMLElement>('.front');
  if (front) front.style.viewTransitionName = 'script-page';
  void openProject(id).finally(() => { if (front) front.style.viewTransitionName = ''; });
}

/** The tagline types itself once per session, like a page in the typewriter. */
function Typed({ text, animate }: { text: string; animate: boolean }) {
  const [n, setN] = useState(animate ? 0 : text.length);
  useEffect(() => {
    if (!animate) { setN(text.length); return; }
    let i = 0;
    let id = 0;
    const tick = () => { i++; setN(i); if (i < text.length) id = window.setTimeout(tick, 22 + Math.random() * 38); };
    id = window.setTimeout(tick, 650);
    return () => clearTimeout(id);
  }, [text, animate]);
  return <p className="ts-typed" aria-label={text}><span aria-hidden="true">{text.slice(0, n)}</span><i className="tw-caret" aria-hidden="true" /></p>;
}

export function HomeView() {
  const library = useApp((s) => s.library);
  const loaded = useApp((s) => s.libraryLoaded);
  const current = useApp((s) => s.project?.id);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'recent' | 'title'>('recent');
  const list = useMemo(() => {
    const f = q.trim().toLowerCase();
    const l = library.filter((p) => !isBible(p) && (!f || (p.title || '').toLowerCase().includes(f) || (p.series?.show ?? '').toLowerCase().includes(f)));
    return sort === 'title' ? [...l].sort((a, b) => (a.title || '').localeCompare(b.title || '')) : l;
  }, [library, q, sort]);
  const shelf = useMemo(() => seriesShelf(library), [library]);
  const openSample = async () => { const m = await import('../io/sample'); await m.openSample(); };
  const importFile = async () => { const m = await import('../io/importers'); await m.importWithPicker(); };
  const intro = useMemo(() => { try { const seen = sessionStorage.getItem('sz-intro'); sessionStorage.setItem('sz-intro', '1'); return !seen; } catch { return false; } }, []);
  return (
    <div className="home">
      <section className="title-sheet" aria-label="ScriptZ">
        <div className={cx('ts-paper', intro && 'intro')}>
          <div className="brads" aria-hidden="true"><i className="brad" /><i className="hole" /><i className="brad" /></div>
          <h1 className="ts-title">ScriptZ</h1>
          <Typed text={t('app.tagline')} animate={intro} />
          <div className="ts-actions">
            <Button kind="primary" icon="plus" onClick={() => openModal('newProject')}>{t('home.new')}</Button>
            <Button icon="upload" onClick={importFile}>{t('home.import')}</Button>
            <Button kind="ghost" icon="clipboard" onClick={() => openModal('pasteImport')}>{t('pi.button')}</Button>
          </div>
          <div className="ts-corner" aria-hidden="true"><span>{t('home.corner.left')}</span><span>{t('home.corner.right')}</span></div>
          <div className="ts-links">
            <button type="button" onClick={openSample}><Icon name="book" size={15} />{t('home.sample')}</button>
            <button type="button" onClick={joinSession}><Icon name="users" size={15} />{t('co.join')}</button>
            <button type="button" onClick={() => openModal('tour')}><Icon name="help" size={15} />{t('tour.start')}</button>
          </div>
        </div>
        <figure className={cx('ts-stack', intro && 'intro')} aria-hidden="true">
          <i /><i /><i />
          <div className="rv-page">
            <span className="rv-num">12A.</span>
            <p className="rv-scene">{t('home.stack.scene')}<b>*</b></p>
            <p className="rv-act">{t('home.stack.action')}<b>*</b></p>
            <p className="rv-char">MARA</p>
            <p className="rv-dlg">{t('home.stack.line')}<b>*</b></p>
            <span className="rv-foot">{t('home.stack.rev')}</span>
          </div>
        </figure>
      </section>
      {shelf.length ? (
        <section className="series-shelf" aria-label={t('se.shelf')}>
          <header className="lib-h"><h2>{t('se.shelf')}</h2></header>
          <div className="shelf">
            {shelf.map((s, i) => (
              <button key={s.show} type="button" className="show" style={{ ['--i' as string]: Math.min(i, 8) }} onClick={() => { setState({ series: s.show }); setView('series'); }}>
                <div className="show-spines" aria-hidden="true">
                  {s.episodes.slice(0, 7).map((e) => <i key={e.id}><span>{epCode(e.series)}</span></i>)}
                  <em className="show-cover"><span className="brads"><i className="brad" /><i className="brad" /></span><span className="sc-t">{s.show}</span><span className="sc-k">{t('se.tab.bible')}</span></em>
                </div>
                <b>{s.show}</b>
                <small className="muted">{tn('se.episodes', s.episodes.length)}{s.bible ? ' · ' + t('se.tab.bible') : ''}</small>
              </button>
            ))}
          </div>
        </section>
      ) : null}
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
            {list.map((p, i) => (
              <article key={p.id} className={cx('proj', current === p.id && 'current')} style={{ ['--i' as string]: Math.min(i, 12) }}>
                <button type="button" className="proj-open" onClick={(e) => open(p.id, e.currentTarget)}>
                  <div className="cover" aria-hidden="true">
                    {p.words > 4000 ? <i className="sheet s3" /> : null}
                    {p.words > 400 ? <i className="sheet s2" /> : null}
                    <div className="front">
                      <div className="brads"><i className="brad" /><i className="hole" /><i className="brad" /></div>
                      <span className="cv-title">{(p.title || t('w.untitled')).toUpperCase()}</span>
                      {p.series?.show ? <span className="cv-ep">{p.series.show} · {epCode(p.series)}</span> : null}
                      <span className="cv-kind">{t(getTemplate(p.template ?? 'feature').name)}</span>
                    </div>
                  </div>
                  <div className="proj-meta">
                    <h3>{p.title || t('w.untitled')}</h3>
                    <small>{t('home.scenesWords', { s: p.scenes, w: fmtNum(p.words) })}</small>
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
      <p className="home-formats muted">{t('home.formats')}</p>
      <footer className="home-foot muted">
        <span><Icon name="info" size={14} /> {t('home.privacy')}</span>
      </footer>
    </div>
  );
}
