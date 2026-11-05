// App actions: project lifecycle, autosave, editor bridge, settings.
import { getState, setState, toast, closeModal } from './store';
import { saveSettings, loadLog, saveLog, type AppSettings } from './settings';
import { projectStore, summarize, chooseScriptzPath, isTauri } from '../platform';
import { coverToPage, transition } from '../ui/motion';
import { emptyProject, block, localDay, projectWords, uid, type Block, type Project, type ElementType, type ScriptLocale, type PaperSize } from '../core/model';
import { preserveLockedScenes, stampRevisions } from '../core/revisions';
import { getTemplate, localeTokens } from '../core/format';
import { t, setLang } from '../i18n';
import type { ScriptEditor } from '../editor/engine';

// ---------------------------------------------------------------- editor bridge

let editor: ScriptEditor | null = null;
export function registerEditor(e: ScriptEditor | null): void { editor = e; }
export function getEditor(): ScriptEditor | null { return editor; }

/** Called by the editor on every change. */
export function blocksFromEditor(blocks: Block[]): void {
  const p = getState().project;
  if (!p || p.blocks === blocks) return;
  setState({ project: { ...p, blocks } });
  markDirty();
}

/** Apply revision stamping / locked scene preservation to editor commits. */
export function transformCommit(prev: Block[], next: Block[]): Block[] {
  const p = getState().project;
  if (!p) return next;
  let out = next;
  if (p.revisions.scenesLocked) out = preserveLockedScenes(prev, out);
  if (p.revisions.active && p.revisions.current) out = stampRevisions(prev, out, p.revisions.current);
  return out;
}

/** Update the project from any view. Blocks changes are pushed into the editor (undoable). */
export function updateProject(fn: (p: Project) => Project, opts: { history?: boolean } = {}): void {
  const p = getState().project;
  if (!p) return;
  const next = fn(p);
  if (next === p) return;
  setState({ project: next });
  if (next.blocks !== p.blocks && editor && editor.getBlocks() !== next.blocks) editor.setBlocks(next.blocks, { history: opts.history !== false, local: true });
  markDirty();
}

export function patchProject(patch: Partial<Project>): void { updateProject((p) => ({ ...p, ...patch })); }

/** Configuration change that requires the editor to re-render (template, styles, locale...). */
export function bumpEditor(): void { setState((s) => ({ editorEpoch: s.editorEpoch + 1 })); }

// ---------------------------------------------------------------- autosave

let saveTimer = 0;
let saving = false;
let pendingAgain = false;
let lastWords = -1;
let activeSince = 0;
let activeSeconds = 0;
let lastInput = 0;

export function noteActivity(): void {
  const now = Date.now();
  if (now - lastInput < 30000 && lastInput) activeSeconds += (now - lastInput) / 1000;
  lastInput = now;
  if (!activeSince) activeSince = now;
}

export function markDirty(): void {
  noteActivity();
  if (getState().saveState !== 'dirty') setState({ saveState: 'dirty' });
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => void saveNow(), 1200);
}

export async function saveNow(): Promise<boolean> {
  clearTimeout(saveTimer);
  const s = getState();
  if (!s.project) return true;
  if (s.collab.role === 'viewer') return true;
  if (saving) { pendingAgain = true; return true; }
  saving = true;
  setState({ saveState: 'saving' });
  const current = getState().project!;
  const words = projectWords(current);
  const day = localDay();
  const delta = lastWords >= 0 ? Math.max(0, words - lastWords) : 0;
  lastWords = words;
  const secs = Math.round(activeSeconds);
  activeSeconds = 0;
  const log = { ...current.writingLog };
  if (delta || secs) {
    const e = log[day] ?? { words: 0, seconds: 0 };
    log[day] = { words: e.words + delta, seconds: e.seconds + secs };
    const g = loadLog();
    const ge = g[day] ?? { words: 0, seconds: 0 };
    g[day] = { words: ge.words + delta, seconds: ge.seconds + secs };
    saveLog(g);
  }
  const toSave: Project = { ...current, writingLog: log, revision: current.revision + 1, updatedAt: new Date().toISOString() };
  try {
    await projectStore().save(toSave);
    // Keep edits made while saving: only the metadata of the saved snapshot is adopted.
    const now = getState().project;
    if (now && now.id === toSave.id) setState({ project: { ...now, revision: toSave.revision, updatedAt: toSave.updatedAt, writingLog: log } });
    setState((st) => ({ saveState: pendingAgain || (st.project && st.project.blocks !== current.blocks) ? 'dirty' : 'saved', saveError: '', library: upsertSummary(st.library, summarize(toSave)) }));
    return true;
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    setState({ saveState: 'error', saveError: msg });
    toast(t('save.error') + ': ' + msg, 'error');
    return false;
  } finally {
    saving = false;
    if (pendingAgain) { pendingAgain = false; markDirty(); }
  }
}

function upsertSummary(list: { id: string }[], s: ReturnType<typeof summarize>) {
  return [s, ...list.filter((x) => x.id !== s.id)] as typeof s[];
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => { if (getState().saveState === 'dirty') void saveNow(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && getState().saveState === 'dirty') void saveNow(); });
}

// ---------------------------------------------------------------- library

export async function refreshLibrary(): Promise<void> {
  try {
    const library = await projectStore().list();
    setState({ library, libraryLoaded: true });
  } catch (e) {
    setState({ libraryLoaded: true });
    toast(t('err.generic', { msg: String((e as Error)?.message ?? e) }), 'error');
  }
}

export async function openProject(id: string, view: AppStateView = 'write'): Promise<void> {
  await saveNow();
  try {
    const p = await projectStore().load(id);
    lastWords = projectWords(p);
    let linkedPath: string | null = null;
    try { linkedPath = await projectStore().linkedFile(id); } catch { linkedPath = null; }
    const apply = () => setState({ project: p, view, saveState: 'saved', linkedPath, caret: null, right: null });
    if (view === 'write' && document.querySelector('[style*="script-page"]')) await coverToPage(apply);
    else await transition(apply);
    rememberRecent(id);
  } catch (e) {
    toast(t('err.generic', { msg: String((e as Error)?.message ?? e) }), 'error');
  }
}

type AppStateView = ReturnType<typeof getState>['view'];

export async function adoptProject(p: Project, opts: { view?: AppStateView; message?: string } = {}): Promise<void> {
  await saveNow();
  lastWords = projectWords(p);
  await transition(() => setState({ project: p, view: opts.view ?? 'write', saveState: 'dirty', linkedPath: null, caret: null, right: null }));
  await saveNow();
  await refreshLibrary();
  rememberRecent(p.id);
  if (opts.message) toast(opts.message, 'success');
}

export interface NewProjectOptions { title: string; author: string; template: string; locale: ScriptLocale; paper: PaperSize; series?: { show: string; season: number; episode: number; episodeTitle: string } }

export async function createProject(o: NewProjectOptions): Promise<void> {
  const p = emptyProject({ title: o.title, author: o.author, template: o.template, locale: o.locale, paper: o.paper });
  const tpl = getTemplate(o.template);
  const tokens = localeTokens(o.locale);
  const first: ElementType = tpl.first;
  if (tpl.id === 'tv' || tpl.id === 'multicam') {
    p.blocks = [block('act', tokens.acts[1]), block('scene', '')];
    p.series = o.series ?? { show: '', season: 1, episode: 1, episodeTitle: '' };
  } else if (tpl.id === 'stage') {
    p.blocks = [block('act', tokens.acts[1]), block('scene', ''), block('action', '')];
  } else if (tpl.id === 'comic') {
    p.blocks = [block('page', o.locale.startsWith('en') ? 'PAGE ONE' : o.locale.startsWith('pt') ? 'PÁGINA UM' : 'PÁGINA UNO'), block('panel', o.locale.startsWith('en') ? 'Panel 1' : o.locale.startsWith('pt') ? 'Quadro 1' : 'Viñeta 1'), block('action', '')];
  } else if (tpl.id === 'av') {
    p.blocks = [block('scene', ''), block('video', ''), block('audio', '')];
  } else {
    p.blocks = [block(first, '')];
  }
  if (o.series) p.series = o.series;
  closeModal();
  await adoptProject(p);
  if (getState().settings.author !== o.author && o.author) setSettings({ author: o.author });
}

export async function deleteProject(id: string): Promise<void> {
  try {
    await projectStore().remove(id);
    if (getState().project?.id === id) setState({ project: null, view: 'home' });
    await refreshLibrary();
  } catch (e) {
    toast(t('err.generic', { msg: String((e as Error)?.message ?? e) }), 'error');
  }
}

export async function duplicateProject(id: string): Promise<void> {
  const p = await projectStore().load(id);
  const copy: Project = { ...p, id: uid(), title: `${p.title || t('w.untitled')} (${t('act.duplicate').toLowerCase()})`, revision: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  await projectStore().save(copy);
  await refreshLibrary();
}

export async function renameProject(id: string, title: string): Promise<void> {
  if (getState().project?.id === id) { patchProject({ title }); await saveNow(); await refreshLibrary(); return; }
  const p = await projectStore().load(id);
  await projectStore().save({ ...p, title, revision: p.revision + 1, updatedAt: new Date().toISOString() });
  await refreshLibrary();
}

export async function closeProject(): Promise<void> {
  await saveNow();
  setState({ project: null, view: 'home', caret: null, linkedPath: null });
  await refreshLibrary();
}

/** Desktop: link the project to a .scriptz file (e.g. inside a Dropbox/Drive/OneDrive folder). */
export async function saveAsFile(): Promise<void> {
  const p = getState().project;
  if (!p) return;
  if (!isTauri()) {
    const { exportScriptz } = await import('../io/exporters');
    await exportScriptz(p);
    return;
  }
  await saveNow();
  const path = await chooseScriptzPath(`${(p.title || 'guion').replace(/[\\/:*?"<>|]+/g, '_')}.scriptz`);
  if (!path) return;
  try {
    await projectStore().linkFile(p.id, path);
    setState({ linkedPath: path });
    toast(t('save.linked', { path }), 'success');
  } catch (e) {
    toast(t('err.generic', { msg: String((e as Error)?.message ?? e) }), 'error');
  }
}

export async function createSnapshot(): Promise<void> {
  const p = getState().project;
  if (!p) return;
  await saveNow();
  try { await projectStore().snapshot(p.id); toast(t('save.snapshot'), 'success'); } catch (e) { toast(String((e as Error)?.message ?? e), 'error'); }
}

const RECENT_KEY = 'sz.recent';
function rememberRecent(id: string): void {
  try {
    const list: string[] = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    localStorage.setItem(RECENT_KEY, JSON.stringify([id, ...list.filter((x) => x !== id)].slice(0, 12)));
  } catch { /* ignore */ }
}
export function recentIds(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; }
}

// ---------------------------------------------------------------- settings

export function setSettings(patch: Partial<AppSettings>): void {
  const settings = { ...getState().settings, ...patch };
  saveSettings(settings);
  if (patch.uiLang) setLang(patch.uiLang);
  setState({ settings });
}

export function setView(view: AppStateView): void {
  if (view !== 'home' && view !== 'settings' && !getState().project) { setState({ view: 'home' }); return; }
  if (getState().view === view) return;
  void transition(() => setState({ view }));
}
