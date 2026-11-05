// App shell: sidebar navigation, views, modals, toasts, global shortcuts, theme.
import { lazy, Suspense, useEffect } from 'react';
import { useApp, setState, getState, dismissToast, openModal, toast } from './store';
import { refreshLibrary, setView, saveNow, setSettings } from './actions';
import { COMMANDS, runCommand } from './commands';
import { comboOf } from '../editor/engine';
import { t, setLang } from '../i18n';
import { Icon, Logo } from '../ui/icons';
import { cx, Spinner } from '../ui/kit';
import { WriteView } from '../views/write/Write';
import { HomeView } from '../views/Home';
import { Modals } from './Modals';
import type { View } from './store';

const CardsView = lazy(() => import('../views/story/Cards'));
const BeatsView = lazy(() => import('../views/story/Beats'));
const TimelineView = lazy(() => import('../views/story/Timeline'));
const CharactersView = lazy(() => import('../views/story/Characters'));
const StatsView = lazy(() => import('../views/stats/Stats'));
const RevisionsView = lazy(() => import('../views/revisions/Revisions'));
const ProductionView = lazy(() => import('../views/production/Production'));
const SettingsView = lazy(() => import('../views/settings/Settings'));

const NAV: { view: View; icon: string; needsProject: boolean }[] = [
  { view: 'home', icon: 'home', needsProject: false },
  { view: 'write', icon: 'pen', needsProject: true },
  { view: 'cards', icon: 'cards', needsProject: true },
  { view: 'beats', icon: 'structure', needsProject: true },
  { view: 'timeline', icon: 'timeline', needsProject: true },
  { view: 'characters', icon: 'users', needsProject: true },
  { view: 'stats', icon: 'chart', needsProject: true },
  { view: 'revisions', icon: 'revisions', needsProject: true },
  { view: 'production', icon: 'clapper', needsProject: true },
];

function useTheme() {
  const theme = useApp((s) => s.settings.theme);
  useEffect(() => {
    const apply = () => {
      const dark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
      const name = theme === 'system' ? (dark ? 'dark' : 'light') : theme;
      document.documentElement.dataset.theme = name;
    };
    apply();
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    mq?.addEventListener?.('change', apply);
    return () => mq?.removeEventListener?.('change', apply);
  }, [theme]);
}

function Sidebar() {
  const view = useApp((s) => s.view);
  const project = useApp((s) => !!s.project);
  return (
    <nav className="sidebar" aria-label="ScriptZ">
      <button type="button" className="brand" onClick={() => setView('home')} title="ScriptZ">
        <Logo size={30} />
      </button>
      <div className="nav-items">
        {NAV.map((n) => (
          <button key={n.view} type="button" data-view={n.view} className={cx('nav-btn', view === n.view && 'on')} disabled={n.needsProject && !project} onClick={() => setView(n.view)} title={t('nav.' + n.view)} aria-current={view === n.view ? 'page' : undefined}>
            {view === n.view ? <i className="nav-ind" /> : null}
            <Icon name={n.icon} size={20} />
            <span>{t('nav.' + n.view)}</span>
          </button>
        ))}
      </div>
      <div className="nav-bottom">
        <button type="button" data-view="palette" className="nav-btn" onClick={() => runCommand('palette')} title={t('pal.title') + ' (Ctrl+K)'}><Icon name="command" size={20} /><span>{t('pal.title')}</span></button>
        <button type="button" data-view="settings" className={cx('nav-btn', view === 'settings' && 'on')} onClick={() => setView('settings')} title={t('nav.settings')}>{view === 'settings' ? <i className="nav-ind" /> : null}<Icon name="settings" size={20} /><span>{t('nav.settings')}</span></button>
      </div>
    </nav>
  );
}

function Toasts() {
  const toasts = useApp((s) => s.toasts);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((tt) => (
        <div key={tt.id} className={cx('toast', tt.kind)}>
          <Icon name={tt.kind === 'error' ? 'alert' : tt.kind === 'success' ? 'check' : 'info'} size={16} />
          <span>{tt.text}</span>
          {tt.action ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => { tt.action!.run(); dismissToast(tt.id); }}>{tt.action.label}</button> : null}
          <button type="button" className="ibtn sm" aria-label={t('act.close')} onClick={() => dismissToast(tt.id)}><Icon name="x" size={14} /></button>
        </div>
      ))}
    </div>
  );
}

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (getState().modal && e.key !== 'Escape') {
        // Modals handle their own keys, except the palette shortcut.
        if (comboOf(e) !== getState().settings.shortcuts.palette) return;
      }
      if (e.key === 'Escape' && getState().fullscreen) { e.preventDefault(); setState({ fullscreen: false }); if (document.fullscreenElement) void document.exitFullscreen(); return; }
      const combo = comboOf(e);
      const sc = getState().settings.shortcuts;
      for (const [id, key] of Object.entries(sc)) {
        if (key && key === combo) {
          const cmd = COMMANDS.find((c) => c.id === id);
          if (cmd && (!cmd.when || cmd.when())) { e.preventDefault(); e.stopPropagation(); cmd.run(); return; }
        }
      }
    };
    window.addEventListener('keydown', onKey, true);
    const onFs = () => { if (!document.fullscreenElement && getState().fullscreen) setState({ fullscreen: false }); };
    document.addEventListener('fullscreenchange', onFs);
    return () => { window.removeEventListener('keydown', onKey, true); document.removeEventListener('fullscreenchange', onFs); };
  }, []);
}

function useFileDrop() {
  useEffect(() => {
    const over = (e: DragEvent) => { if (e.dataTransfer?.types.includes('Files')) { e.preventDefault(); document.body.classList.add('dropping'); } };
    const leave = (e: DragEvent) => { if (!e.relatedTarget) document.body.classList.remove('dropping'); };
    const drop = async (e: DragEvent) => {
      document.body.classList.remove('dropping');
      const f = e.dataTransfer?.files?.[0];
      if (!f) return;
      e.preventDefault();
      const m = await import('../io/importers');
      await m.importBytes(f.name, new Uint8Array(await f.arrayBuffer()));
    };
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => { window.removeEventListener('dragover', over); window.removeEventListener('dragleave', leave); window.removeEventListener('drop', drop); };
  }, []);
}

export function App() {
  const view = useApp((s) => s.view);
  const project = useApp((s) => !!s.project);
  const title = useApp((s) => s.project?.title);
  const lang = useApp((s) => s.settings.uiLang);
  const fullscreen = useApp((s) => s.fullscreen);
  setLang(lang);
  useTheme();
  useShortcuts();
  useFileDrop();
  useEffect(() => {
    void refreshLibrary().then(() => {
      const st = getState();
      if (!st.settings.tourDone && !st.library.length) openModal('tour');
      if (st.settings.update.auto && st.settings.update.repo && Date.now() - st.settings.update.lastCheck > 86400000) void import('../platform/update').then(async (m) => {
        try {
          const u = await m.checkForUpdate(st.settings.update.repo);
          setSettings({ update: { ...getState().settings.update, lastCheck: Date.now() } });
          if (u.available) toast(t('st.up.available', { v: u.version }), 'info', { label: t('act.download'), run: () => void import('../platform').then((x) => x.openExternal(u.url)) }, 15000);
        } catch { /* offline */ }
      });
    });
  }, []);
  useEffect(() => {
    document.title = project ? `${title || t('w.untitled')} — ScriptZ` : 'ScriptZ';
  }, [project, title]);
  useEffect(() => { if (view !== 'write') void saveNow(); }, [view]);
  const active = project ? view : view === 'settings' ? 'settings' : 'home';
  return (
    <div className={cx('app', fullscreen && 'df')} data-view={active}>
      {!fullscreen ? <Sidebar /> : null}
      <main className="main">
        <Suspense fallback={<div className="center"><Spinner /></div>}>
          {active === 'home' ? <HomeView /> : null}
          {active === 'write' ? <WriteView /> : null}
          {active === 'cards' ? <CardsView /> : null}
          {active === 'beats' ? <BeatsView /> : null}
          {active === 'timeline' ? <TimelineView /> : null}
          {active === 'characters' ? <CharactersView /> : null}
          {active === 'stats' ? <StatsView /> : null}
          {active === 'revisions' ? <RevisionsView /> : null}
          {active === 'production' ? <ProductionView /> : null}
          {active === 'settings' ? <SettingsView /> : null}
        </Suspense>
      </main>
      <Modals />
      <Toasts />
      <div className="drop-hint" aria-hidden="true"><Icon name="upload" size={34} /><span>{t('home.dropHint')}</span></div>
    </div>
  );
}
