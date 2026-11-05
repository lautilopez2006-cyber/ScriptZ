// The writing workspace: toolbar, navigator, page editor, side panels and status bar.
import { lazy, Suspense, useMemo } from 'react';
import { useApp, setState } from '../../app/store';
import { getEditor, setSettings } from '../../app/actions';
import { runCommand, togglePanel, zoomBy, toggleFullscreen } from '../../app/commands';
import { getTemplate } from '../../core/format';
import { projectWords, type ElementType } from '../../core/model';
import { buildScenes } from '../../core/scenes';
import { t, fmtNum } from '../../i18n';
import { IconBtn, MenuButton, Kbd, cx, Spinner, useDebounced, type MenuItem } from '../../ui/kit';
import { Icon } from '../../ui/icons';
import { EditorHost } from './EditorHost';
import { Navigator } from './Navigator';
import { ReviewPanel, SuggestPanel, AltsPanel } from './ReviewPanels';
import { RefsPanel } from '../research/Research';
import { FindPanel } from './FindPanel';
import { CommentsPanel, NotesPanel } from './SidePanels';
import { DictationButton } from './Dictation';

const ReadPanel = lazy(() => import('./ReadPanel'));
const SprintPanel = lazy(() => import('../stats/SprintPanel'));
const CollabPanel = lazy(() => import('../../collab/CollabPanel'));
const AiPanel = lazy(() => import('../ai/AiPanel'));

function Toolbar() {
  const template = useApp((s) => s.project!.template);
  const comments = useApp((s) => s.project!.comments);
  const revisions = useApp((s) => s.project!.revisions);
  const suggesting = useApp((s) => s.suggesting);
  const sugMeta = useApp((s) => s.project!.suggestions);
  const pendingSug = Object.keys(sugMeta).length;
  const caret = useApp((s) => s.caret);
  const settings = useApp((s) => s.settings);
  const right = useApp((s) => s.right);
  const readOnly = useApp((s) => s.collab.role === 'viewer');
  const order = getTemplate(template).order;
  const ed = getEditor();
  const marks = caret?.marks ?? [];
  const openComments = useMemo(() => Object.values(comments).filter((c) => !c.resolved).length, [comments]);
  const keyFor = (type: ElementType) => Object.entries(settings.elementKeys).find(([, v]) => v === type)?.[0];
  const sc = settings.shortcuts;
  const viewItems: MenuItem[] = [
    { label: t('ed.pageView'), checked: settings.pageView, onClick: () => setSettings({ pageView: true }) },
    { label: t('ed.continuous'), checked: !settings.pageView, onClick: () => setSettings({ pageView: false }) },
    { separator: true },
    { label: t('ed.focus.off'), checked: settings.focusMode === 'off', onClick: () => setSettings({ focusMode: 'off' }) },
    { label: t('ed.focus') + ': ' + t('ed.focus.scene'), checked: settings.focusMode === 'scene', onClick: () => setSettings({ focusMode: 'scene' }), shortcut: sc.focus },
    { label: t('ed.focus') + ': ' + t('ed.focus.paragraph'), checked: settings.focusMode === 'paragraph', onClick: () => setSettings({ focusMode: 'paragraph' }) },
    { separator: true },
    { label: t('ed.typewriter'), checked: settings.typewriter, onClick: () => setSettings({ typewriter: !settings.typewriter }), shortcut: sc.typewriter },
    { label: t('ed.sceneNumbers'), checked: settings.showSceneNumbers, onClick: () => setSettings({ showSceneNumbers: !settings.showSceneNumbers }) },
    { label: t('ed.showTags'), checked: settings.showTags, onClick: () => setSettings({ showTags: !settings.showTags }) },
    { label: t('ed.navigator'), checked: settings.navigatorOpen, onClick: () => setSettings({ navigatorOpen: !settings.navigatorOpen }), shortcut: sc.navigator },
    { separator: true },
    { label: t('ed.distractionFree'), icon: 'fullscreen', onClick: () => void toggleFullscreen(), shortcut: sc.fullscreen },
  ];
  const hlItems: MenuItem[] = [
    ...(['yellow', 'green', 'pink', 'blue', 'orange'] as const).map((c) => ({ label: t('ed.hl.' + c), icon: 'highlighter' as const, onClick: () => ed?.setValuedMark('hl', c) })),
    { separator: true },
    { label: t('ed.highlight.none'), icon: 'x', onClick: () => ed?.setValuedMark('hl', null) },
  ];
  const moreItems: MenuItem[] = [
    { label: t('ed.dual'), icon: 'dual', onClick: () => runCommand('dual'), shortcut: sc.dual, hint: t('ed.dual.hint') },
    { label: t('ed.bookmark'), icon: 'bookmark', onClick: () => runCommand('bookmark'), shortcut: sc.bookmark },
    { label: t('ed.strike'), icon: 'strike', onClick: () => ed?.toggleMark('x') },
    { separator: true },
    { label: t('ed.titlePage'), icon: 'fileText', onClick: () => runCommand('titlePage') },
    { label: t('ed.format'), icon: 'sliders', onClick: () => runCommand('format') },
    { label: t('ed.revMode'), icon: 'revisions', checked: revisions.active, onClick: () => runCommand('revisionMode') },
    { separator: true },
    { label: t('act.export'), icon: 'upload', onClick: () => runCommand('export'), shortcut: sc.export },
    { label: t('act.print'), icon: 'printer', onClick: () => runCommand('print'), shortcut: sc.print },
  ];
  return (
    <div className="toolbar" role="toolbar" aria-label={t('nav.write')}>
      <div className="tb-group">
        <IconBtn icon="sidebar" title={t('ed.navigator')} active={settings.navigatorOpen} onClick={() => setSettings({ navigatorOpen: !settings.navigatorOpen })} />
        <select className="select el-select" value={caret?.type ?? ''} aria-label={t('ed.element')} disabled={readOnly}
          onChange={(e) => { ed?.setType(e.target.value as ElementType); setTimeout(() => ed?.focus(), 0); }}>
          {!caret ? <option value="">{t('ed.element')}</option> : null}
          {order.map((type) => <option key={type} value={type}>{t('el.' + type)}{keyFor(type) ? `  (${keyFor(type)!.replace('Mod', 'Ctrl')})` : ''}</option>)}
          {caret && !order.includes(caret.type as ElementType) ? <option value={caret.type}>{t('el.' + caret.type)}</option> : null}
        </select>
      </div>
      <div className="tb-group">
        <IconBtn icon="bold" title={t('ed.bold') + ' (Ctrl+B)'} active={marks.includes('b')} onClick={() => ed?.toggleMark('b')} disabled={readOnly} />
        <IconBtn icon="italic" title={t('ed.italic') + ' (Ctrl+I)'} active={marks.includes('i')} onClick={() => ed?.toggleMark('i')} disabled={readOnly} />
        <IconBtn icon="underline" title={t('ed.underline') + ' (Ctrl+U)'} active={marks.includes('u')} onClick={() => ed?.toggleMark('u')} disabled={readOnly} />
        <MenuButton icon="highlighter" title={t('ed.highlight')} items={hlItems} />
      </div>
      <div className="tb-group">
        <IconBtn icon="comment" title={t('ed.comment')} onClick={() => runCommand('comment')} disabled={readOnly} />
        <IconBtn icon="tag" title={t('ed.tag')} onClick={() => runCommand('tag')} disabled={readOnly} />
        <MenuButton icon="more" title={t('act.more')} items={moreItems} />
      </div>
      <div className="tb-group">
        <IconBtn icon="undo" title={t('act.undo') + ' (Ctrl+Z)'} onClick={() => ed?.undo()} disabled={readOnly} />
        <IconBtn icon="redo" title={t('act.redo') + ' (Ctrl+Y)'} onClick={() => ed?.redo()} disabled={readOnly} />
      </div>
      <div className="tb-group zoom">
        <IconBtn icon="zoomOut" title={t('ed.zoomOut')} onClick={() => zoomBy(-0.1)} small />
        <button type="button" className="zoom-v" title={t('ed.zoomReset')} onClick={() => zoomBy('reset')}>{Math.round(settings.zoom * 100)}%</button>
        <IconBtn icon="zoomIn" title={t('ed.zoomIn')} onClick={() => zoomBy(0.1)} small />
        <MenuButton icon="eye" title={t('ed.view')} items={viewItems} />
      </div>
      <span className="grow" />
      {revisions.active ? (
        <button type="button" className="chip rev" onClick={() => runCommand('revisionMode')} title={t('ed.revMode')}>
          <Icon name="revisions" size={14} />{revisions.sets.find((s) => s.id === revisions.current)?.name ?? t('ed.revMode')}
        </button>
      ) : null}
      {readOnly ? <span className="chip"><Icon name="eye" size={14} />{t('ed.readOnly')}</span> : null}
      {suggesting ? (
        <button type="button" className="chip sug" onClick={() => togglePanel('suggest')} title={t('sg.mode')}>
          <Icon name="pen" size={14} />{t('sg.chip')}{pendingSug ? <b>{pendingSug}</b> : null}
        </button>
      ) : null}
      <div className="tb-group">
        <IconBtn icon="check" title={t('dr.title') + ' (Ctrl+Shift+K)'} active={right === 'review'} onClick={() => togglePanel('review')} />
        <IconBtn icon="compare" title={t('sg.title') + ' (Ctrl+Shift+E)'} active={right === 'suggest'} onClick={() => togglePanel('suggest')} badge={pendingSug || undefined} />
        <IconBtn icon="shuffle" title={t('al.title')} active={right === 'alts'} onClick={() => togglePanel('alts')} />
        <IconBtn icon="pin" title={t('rs.panel')} active={right === 'refs'} onClick={() => togglePanel('refs')} />
      </div>
      <div className="tb-group">
        <DictationButton />
        <IconBtn icon="search" title={t('ed.find') + ' (Ctrl+F)'} active={right === 'find'} onClick={() => togglePanel('find')} />
        <IconBtn icon="comment" title={t('w.comments')} active={right === 'comments'} onClick={() => togglePanel('comments')} badge={openComments} />
        <IconBtn icon="clipboard" title={t('ed.notes')} active={right === 'notes'} onClick={() => togglePanel('notes')} />
        <IconBtn icon="speaker" title={t('ed.readAloud')} active={right === 'read'} onClick={() => togglePanel('read')} />
        <IconBtn icon="timer" title={t('ed.sprint')} active={right === 'sprint'} onClick={() => togglePanel('sprint')} />
        <IconBtn icon="users" title={t('ed.collab')} active={right === 'collab'} onClick={() => togglePanel('collab')} />
        <IconBtn icon="sparkles" title={t('ed.ai')} active={right === 'ai'} onClick={() => togglePanel('ai')} />
      </div>
    </div>
  );
}

function StatusBar() {
  const liveBlocks = useApp((s) => s.project!.blocks);
  const minutesPerPage = useApp((s) => s.project!.page.minutesPerPage);
  const pageLocks = useApp((s) => !!s.project!.revisions.pageLocks);
  const caret = useApp((s) => s.caret);
  const pages = useApp((s) => s.pages);
  const saveState = useApp((s) => s.saveState);
  const linked = useApp((s) => s.linkedPath);
  const collab = useApp((s) => s.collab);
  const zoom = useApp((s) => s.settings.zoom);
  // Counting a long script on every keystroke is wasteful: the totals follow after a short pause.
  const blocks = useDebounced(liveBlocks, 400);
  const words = useMemo(() => projectWords({ blocks }), [blocks]);
  const scenes = useMemo(() => buildScenes(blocks), [blocks]);
  const sceneLabel = scenes.find((s) => s.id === caret?.sceneId)?.label;
  const minutes = Math.round(pages * minutesPerPage);
  return (
    <footer className="statusbar">
      <span>{t('sb.page', { n: (caret?.page ?? 0) + 1, total: Math.max(1, pages) })}</span>
      {sceneLabel ? <span>{t('sb.scene', { n: sceneLabel })}</span> : null}
      <span>{t('sb.words', { n: fmtNum(words) })}</span>
      <span title={t('stats.duration')}>{t('sb.duration', { n: minutes })}</span>
      {pageLocks ? <span><Icon name="lock" size={13} /> {t('sb.locked')}</span> : null}
      <span className="grow" />
      {collab.state !== 'off' ? <span className={cx('collab-st', collab.state)}><Icon name={collab.state === 'online' ? 'wifi' : 'wifiOff'} size={13} /> {t('co.state.' + collab.state)}{collab.peers.length ? ` · ${collab.peers.length}` : ''}</span> : null}
      {linked ? <span title={linked}><Icon name="link" size={13} /> {linked.split(/[\\/]/).pop()}</span> : null}
      <span className={cx('save-st', saveState)}>{saveState === 'saving' ? <Spinner /> : null}{t(saveState === 'error' ? 'save.error' : saveState === 'dirty' ? 'save.unsaved' : saveState === 'saving' ? 'save.saving' : 'save.saved')}</span>
      <span className="muted">{Math.round(zoom * 100)}%</span>
    </footer>
  );
}

export function WriteView() {
  const right = useApp((s) => s.right);
  const navOpen = useApp((s) => s.settings.navigatorOpen);
  const fullscreen = useApp((s) => s.fullscreen);
  const panelTitle: Record<string, string> = { review: t('dr.title'), suggest: t('sg.title'), alts: t('al.title'), refs: t('rs.panel'), find: t('ed.find'), comments: t('w.comments'), notes: t('ed.notes'), read: t('ra.title'), sprint: t('ed.sprint'), collab: t('ed.collab'), ai: t('ed.ai') };
  return (
    <div className={cx('write', fullscreen && 'df')}>
      {!fullscreen ? <Toolbar /> : (
        <div className="df-bar"><button type="button" className="btn btn-ghost btn-sm" onClick={() => void toggleFullscreen()}><Icon name="exitFullscreen" size={15} /> <span>{t('act.close')}</span> <Kbd combo="Escape" /></button></div>
      )}
      <div className="write-body">
        {navOpen && !fullscreen ? <Navigator /> : null}
        <div className="editor-scroll" id="editor-scroll">
          <EditorHost />
        </div>
        {right && !fullscreen ? (
          <aside className="side-panel" aria-label={panelTitle[right]}>
            <header className="side-h"><h3>{panelTitle[right]}</h3><IconBtn icon="x" small title={t('act.close')} onClick={() => { setState({ right: null }); getEditor()?.focus(); }} /></header>
            <Suspense fallback={<div className="pad"><Spinner /></div>}>
              {right === 'review' ? <ReviewPanel /> : null}
              {right === 'suggest' ? <SuggestPanel /> : null}
              {right === 'alts' ? <AltsPanel /> : null}
              {right === 'refs' ? <RefsPanel /> : null}
              {right === 'find' ? <FindPanel /> : null}
              {right === 'comments' ? <CommentsPanel /> : null}
              {right === 'notes' ? <NotesPanel /> : null}
              {right === 'read' ? <ReadPanel /> : null}
              {right === 'sprint' ? <SprintPanel /> : null}
              {right === 'collab' ? <CollabPanel /> : null}
              {right === 'ai' ? <AiPanel /> : null}
            </Suspense>
          </aside>
        ) : null}
      </div>
      {!fullscreen ? <StatusBar /> : null}
    </div>
  );
}

