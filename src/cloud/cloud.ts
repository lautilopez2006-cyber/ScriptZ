// App side of cloud sync: connecting, running syncs in the background, reporting status.
import { getState, setState, toast, openModal, subscribe } from '../app/store';
import { refreshLibrary, saveNow, setSettings, openProject } from '../app/actions';
import { isTauri, openExternal, projectStore } from '../platform';
import { loadProject, serializeProject } from '../core/migrate';
import { uid } from '../core/model';
import { t } from '../i18n';
import { CLOUD_APPS, CloudAuthError, Dropbox, GoogleDrive, writeTokens, readTokens, type CloudProvider } from './providers';
import { syncLibrary, type SyncMeta } from './sync';

const META = 'sz.cloud.meta.v1';
const readMeta = (p: string): SyncMeta => { try { return (JSON.parse(localStorage.getItem(META) || '{}') as Record<string, SyncMeta>)[p] ?? {}; } catch { return {}; } };
const writeMeta = (p: string, m: SyncMeta) => { try { const all = JSON.parse(localStorage.getItem(META) || '{}') as Record<string, SyncMeta>; all[p] = m; localStorage.setItem(META, JSON.stringify(all)); } catch { /* private mode */ } };

export const dropboxKey = () => getState().settings.cloud.dropboxKey || CLOUD_APPS.dropboxKey;
export const googleClientId = () => getState().settings.cloud.googleClientId || CLOUD_APPS.googleClientId;
/** Google sign-in runs in the browser (web and installed web app). */
export const googleAvailable = () => !isTauri();

function provider(): CloudProvider | null {
  const c = getState().settings.cloud;
  if (c.provider === 'dropbox' && dropboxKey()) return new Dropbox(dropboxKey());
  if (c.provider === 'gdrive' && googleClientId()) return new GoogleDrive(googleClientId());
  return null;
}

export async function connect(which: 'dropbox' | 'gdrive'): Promise<void> {
  try {
    if (which === 'dropbox') {
      const key = dropboxKey();
      if (!key) { toast(t('cl.noKey'), 'error'); return; }
      await Dropbox.connect(key, {
        desktop: isTauri(),
        open: (url) => void openExternal(url),
        askCode: () => new Promise((res) => openModal('prompt', { title: t('cl.pasteCode'), label: t('cl.pasteCode.h'), onSubmit: (v: string) => res(v || null) })),
      });
    } else {
      const id = googleClientId();
      if (!id) { toast(t('cl.noKey'), 'error'); return; }
      await GoogleDrive.connect(id);
    }
    setSettings({ cloud: { ...getState().settings.cloud, provider: which } });
    toast(t('cl.connected', { p: which === 'dropbox' ? 'Dropbox' : 'Google Drive' }), 'success');
    await syncNow();
  } catch (e) {
    const m = String((e as Error)?.message ?? e);
    if (m !== 'cancelled') toast(m === 'popup-blocked' ? t('cl.popup') : t('cl.failed', { msg: m }), 'error');
  }
}

export function disconnect(): void {
  const c = getState().settings.cloud;
  if (c.provider) writeTokens(c.provider, null);
  setSettings({ cloud: { ...c, provider: '' } });
  setState({ cloud: { state: 'off', last: 0, error: '', done: 0, total: 0 } });
}

let running = false;
export async function syncNow(opts: { silent?: boolean } = {}): Promise<void> {
  const cloud = provider();
  if (!cloud || running) return;
  const which = getState().settings.cloud.provider as string;
  if (!readTokens(which)) { setState({ cloud: { ...getState().cloud, state: 'error', error: 'auth' } }); return; }
  running = true;
  setState({ cloud: { ...getState().cloud, state: 'syncing', done: 0, total: 0, error: '' } });
  try {
    await saveNow();
    const openId = getState().project?.id;
    const openAt = getState().project?.updatedAt;
    const store = projectStore();
    const { report, meta } = await syncLibrary(cloud, {
      list: () => store.list(), load: (id) => store.load(id), save: (p) => store.save(p),
      serialize: serializeProject, parse: (s) => loadProject(s), newId: uid,
    }, readMeta(which), (done, total) => setState({ cloud: { ...getState().cloud, done, total } }), t('cl.other'));
    writeMeta(which, meta);
    await refreshLibrary();
    // The open script changed in the cloud and not here: show the new version.
    if (openId && report.downloaded.length && getState().project?.updatedAt === openAt) {
      const fresh = await store.load(openId).catch(() => null);
      if (fresh && fresh.updatedAt !== openAt) await openProject(openId, getState().view === 'home' ? 'home' : getState().view);
    }
    setState({ cloud: { state: report.errors.length ? 'error' : 'idle', last: Date.now(), error: report.errors[0] ?? '', done: 0, total: 0 } });
    const n = report.uploaded.length + report.downloaded.length;
    if (report.conflicts.length) toast(t('cl.conflicts', { n: report.conflicts.length, label: t('cl.other') }), 'info', undefined, 8000);
    else if (!opts.silent && n) toast(t('cl.synced', { up: report.uploaded.length, down: report.downloaded.length }), 'success');
    else if (!opts.silent) toast(t('cl.upToDate'), 'success');
  } catch (e) {
    const auth = e instanceof CloudAuthError || (e as Error)?.name === 'CloudAuthError';
    setState({ cloud: { ...getState().cloud, state: 'error', error: auth ? 'auth' : String((e as Error)?.message ?? e) } });
    if (!opts.silent) toast(auth ? t('cl.reconnect') : t('cl.failed', { msg: String((e as Error)?.message ?? e) }), 'error');
  } finally { running = false; }
}

/** Background sync: at start, every few minutes while the window is visible, and shortly after edits. */
export function startCloudSync(): void {
  if (typeof window === 'undefined') return;
  let timer = 0;
  const tick = () => { const c = getState().settings.cloud; if (c.provider && c.auto && document.visibilityState === 'visible') void syncNow({ silent: true }); };
  const c0 = getState().settings.cloud;
  if (c0.provider) { setState({ cloud: { ...getState().cloud, state: 'idle' } }); setTimeout(tick, 2500); }
  setInterval(tick, 3 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') tick(); });
  let lastAt = getState().project?.updatedAt;
  subscribe(() => {
    const at = getState().project?.updatedAt;
    if (at && at !== lastAt) { lastAt = at; window.clearTimeout(timer); timer = window.setTimeout(tick, 30_000); }
  });
}
