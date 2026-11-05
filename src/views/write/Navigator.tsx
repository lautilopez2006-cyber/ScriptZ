// Left navigator: scenes, characters, locations and bookmarks. Click to jump.
import { useMemo, useState } from 'react';
import { useApp, setState } from '../../app/store';
import { getEditor } from '../../app/actions';
import { buildScenes, characterStats, locationsOf, sceneOptions } from '../../core/scenes';
import { t, tn } from '../../i18n';
import { COLOR_HEX, Segmented, cx, useDebounced } from '../../ui/kit';
import { Icon } from '../../ui/icons';
import { findPrefill } from './FindPanel';
import { getDevice } from '../../ui/device';

type Tab = 'scenes' | 'characters' | 'locations' | 'bookmarks';

const jump = (id: string) => { getEditor()?.scrollToBlock(id, { select: true }); if (getDevice() !== 'desktop') setState({ mobileNav: false }); };

export function Navigator() {
  // Subscribe to the pieces we show; scene/character lists follow the text with a short delay
  // so typing in a long script never waits for the sidebar.
  const liveBlocks = useApp((s) => s.project!.blocks);
  const blocks = useDebounced(liveBlocks, 350);
  const sceneMeta = useApp((s) => s.project!.scenes);
  const template = useApp((s) => s.project!.template);
  const locked = useApp((s) => s.project!.revisions.scenesLocked);
  const caretScene = useApp((s) => s.caret?.sceneId ?? '');
  const shortcut = useApp((s) => s.settings.shortcuts.bookmark);
  const [tab, setTab] = useState<Tab>('scenes');
  const [filter, setFilter] = useState('');
  const scenes = useMemo(() => buildScenes(blocks, sceneOptions({ template, revisions: { scenesLocked: locked } as never })), [blocks, template, locked]);
  const chars = useMemo(() => characterStats(blocks), [blocks]);
  const locs = useMemo(() => locationsOf(scenes), [scenes]);
  const bookmarks = useMemo(() => blocks.filter((b) => b.bookmark), [blocks]);
  const f = filter.trim().toUpperCase();
  const list = useMemo(() => (
      <div className="nav-list">
        {tab === 'scenes' && (scenes.length ? scenes.filter((s) => !f || s.heading.toUpperCase().includes(f) || (sceneMeta[s.id]?.summary ?? '').toUpperCase().includes(f)).map((s) => {
          const meta = sceneMeta[s.id];
          return (
            <button key={s.id} type="button" className={cx('nav-item scene', caretScene === s.id && 'on', s.omitted && 'omitted')} onClick={() => jump(s.id)}>
              <span className="num" style={meta?.color && meta.color !== 'none' ? { background: COLOR_HEX[meta.color], color: '#fff' } : undefined}>{s.label}</span>
              <span className="txt">
                <b>{s.heading.trim().toUpperCase() || '—'}</b>
                {meta?.summary ? <small>{meta.summary}</small> : null}
              </span>
            </button>
          );
        }) : <p className="muted pad">{t('nv.noScenes')}</p>)}
        {tab === 'characters' && chars.filter((c) => !f || c.name.includes(f)).map((c) => (
          <div key={c.name} className="nav-item row">
            <button type="button" className="grow" onClick={() => jump(c.firstBlock)}>
              <b>{c.name}</b><small>{tn('nv.speeches', c.speeches)}</small>
            </button>
            <button type="button" className="ibtn sm" title={t('nv.findCharacter')} onClick={() => { findPrefill.character = c.name; setState({ right: 'find' }); }}><Icon name="search" size={14} /></button>
          </div>
        ))}
        {tab === 'locations' && locs.filter((l) => !f || l.name.includes(f)).map((l) => (
          <button key={l.name} type="button" className="nav-item" onClick={() => { const s = scenes.find((x) => x.parsed.location === l.name); if (s) jump(s.id); }}>
            <b>{l.name}</b><small>{tn('nv.scenesCount', l.count)}</small>
          </button>
        ))}
        {tab === 'bookmarks' && (bookmarks.length ? bookmarks.map((b) => (
          <button key={b.id} type="button" className="nav-item" onClick={() => jump(b.id)}>
            <b><Icon name="bookmark" size={13} /> {b.bookmark}</b><small>{b.text.slice(0, 80)}</small>
          </button>
        )) : <p className="muted pad">{t('nv.noBookmarks', { key: shortcut.replace('Mod', 'Ctrl') })}</p>)}
      </div>
  ), [tab, f, scenes, chars, locs, bookmarks, caretScene, sceneMeta, shortcut]);

  return (
    <aside className="navigator" aria-label={t('ed.navigator')}>
      <div className="nav-head">
        <Segmented<Tab> small value={tab} onChange={setTab} options={[
          { value: 'scenes', label: <Icon name="film" size={15} />, title: t('nv.scenes') },
          { value: 'characters', label: <Icon name="users" size={15} />, title: t('nv.characters') },
          { value: 'locations', label: <Icon name="pin" size={15} />, title: t('nv.locations') },
          { value: 'bookmarks', label: <Icon name="bookmark" size={15} />, title: t('nv.bookmarks') },
        ]} />
        <input className="input sm" placeholder={t('nv.filter')} value={filter} onChange={(e) => setFilter(e.target.value)} aria-label={t('nv.filter')} />
      </div>
      {list}
    </aside>
  );
}
