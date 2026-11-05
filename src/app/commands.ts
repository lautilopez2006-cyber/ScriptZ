// Command registry: shortcuts, command palette and menus share these definitions.
import { getState, setState, openModal, toast, type RightPanel } from './store';
import { closeProject, createSnapshot, getEditor, saveNow, setSettings, setView, updateProject } from './actions';
import { t } from '../i18n';
import type { IconName } from '../ui/icons';
import { addCommentAtSelection } from '../views/write/comments';
import { buildScenes } from '../core/scenes';
import type { ElementType } from '../core/model';

export interface Command { id: string; label: () => string; icon?: IconName; run: () => void; when?: () => boolean; group?: string }

const hasProject = () => !!getState().project;
const inWrite = () => !!getState().project && getState().view === 'write';

export function togglePanel(p: RightPanel): void {
  setState((s) => ({ right: s.right === p ? null : p, view: s.project ? 'write' : s.view }));
}

export function zoomBy(delta: number | 'reset'): void {
  const z = getState().settings.zoom;
  const next = delta === 'reset' ? 1 : Math.round(Math.min(2.5, Math.max(0.5, z + delta)) * 100) / 100;
  setSettings({ zoom: next });
}

export async function toggleFullscreen(): Promise<void> {
  const on = !getState().fullscreen;
  setState({ fullscreen: on });
  try {
    if (on && !document.fullscreenElement) await document.documentElement.requestFullscreen?.();
    if (!on && document.fullscreenElement) await document.exitFullscreen?.();
  } catch { /* not allowed */ }
  setTimeout(() => getEditor()?.focus(), 60);
}

export function jumpScene(dir: 1 | -1): void {
  const ed = getEditor();
  const p = getState().project;
  if (!ed || !p) return;
  const scenes = buildScenes(p.blocks);
  const cur = getState().caret?.sceneId;
  const i = scenes.findIndex((s) => s.id === cur);
  const next = scenes[Math.max(0, Math.min(scenes.length - 1, i + dir))];
  if (next) ed.scrollToBlock(next.id, { select: true });
}

export function promptBookmark(): void {
  const ed = getEditor();
  if (!ed) return;
  const b = ed.selectedBlocks()[0];
  if (!b) return;
  if (b.bookmark) { ed.setBookmark(null); return; }
  openModal('prompt', {
    title: t('ed.bookmark.add'), label: t('ed.bookmark.name'), value: b.text.slice(0, 40),
    onSubmit: (v: string) => { ed.setBookmark(v || b.text.slice(0, 40) || '•'); },
  });
}

export function setElement(type: ElementType): void { getEditor()?.setType(type); }

export const COMMANDS: Command[] = [
  { id: 'save', label: () => t('act.save'), icon: 'download', run: () => { void saveNow().then(() => createSnapshot()); }, when: hasProject },
  { id: 'find', label: () => t('ed.find'), icon: 'search', run: () => togglePanel('find'), when: hasProject },
  { id: 'replace', label: () => t('fd.replaceAll'), icon: 'replace', run: () => setState({ right: 'find', view: 'write' }), when: hasProject },
  { id: 'contest', label: () => t('ct.title'), icon: 'star', run: () => openModal('contest'), when: hasProject },
  { id: 'pitch', label: () => t('sh.title'), icon: 'share', run: () => openModal('pitch'), when: hasProject },
  { id: 'pasteImport', label: () => t('pi.title'), icon: 'clipboard', run: () => openModal('pasteImport') },
  { id: 'open', label: () => t('act.openFile'), icon: 'folder', run: () => { void import('../io/importers').then((m) => m.importWithPicker()); } },
  { id: 'newProject', label: () => t('home.new'), icon: 'plus', run: () => openModal('newProject') },
  { id: 'export', label: () => t('act.export'), icon: 'upload', run: () => openModal('export'), when: hasProject },
  { id: 'print', label: () => t('act.print'), icon: 'printer', run: () => { void import('../io/exporters').then((m) => m.printProject(getState().project!)); }, when: hasProject },
  { id: 'palette', label: () => t('pal.title'), icon: 'command', run: () => openModal('palette') },
  { id: 'focus', label: () => t('ed.focus'), icon: 'focus', run: () => setSettings({ focusMode: getState().settings.focusMode === 'off' ? 'scene' : 'off' }), when: inWrite },
  { id: 'typewriter', label: () => t('ed.typewriter'), icon: 'typewriter', run: () => setSettings({ typewriter: !getState().settings.typewriter }), when: inWrite },
  { id: 'fullscreen', label: () => t('ed.distractionFree'), icon: 'fullscreen', run: () => void toggleFullscreen(), when: inWrite },
  { id: 'zoomIn', label: () => t('ed.zoomIn'), icon: 'zoomIn', run: () => zoomBy(0.1), when: inWrite },
  { id: 'zoomOut', label: () => t('ed.zoomOut'), icon: 'zoomOut', run: () => zoomBy(-0.1), when: inWrite },
  { id: 'zoomReset', label: () => t('ed.zoomReset'), icon: 'search', run: () => zoomBy('reset'), when: inWrite },
  { id: 'comment', label: () => t('ed.comment'), icon: 'comment', run: () => { addCommentAtSelection(); }, when: inWrite },
  { id: 'highlight', label: () => t('ed.highlight'), icon: 'highlighter', run: () => { const ed = getEditor(); if (ed && !ed.setValuedMark('hl', 'yellow')) toast(t('ed.tag.needSel')); }, when: inWrite },
  { id: 'tag', label: () => t('ed.tag'), icon: 'tag', run: () => openModal('tag'), when: inWrite },
  { id: 'dual', label: () => t('ed.dual'), icon: 'dual', run: () => getEditor()?.toggleDual(), when: inWrite },
  { id: 'bookmark', label: () => t('ed.bookmark'), icon: 'bookmark', run: promptBookmark, when: inWrite },
  { id: 'readAloud', label: () => t('ed.readAloud'), icon: 'speaker', run: () => togglePanel('read'), when: hasProject },
  { id: 'nextScene', label: () => t('act.next') + ' · ' + t('w.scene'), icon: 'chevronDown', run: () => jumpScene(1), when: inWrite },
  { id: 'prevScene', label: () => t('act.prev') + ' · ' + t('w.scene'), icon: 'chevronUp', run: () => jumpScene(-1), when: inWrite },
  { id: 'navigator', label: () => t('ed.navigator'), icon: 'sidebar', run: () => setSettings({ navigatorOpen: !getState().settings.navigatorOpen }), when: inWrite },
  { id: 'sprint', label: () => t('ed.sprint'), icon: 'timer', run: () => togglePanel('sprint'), when: hasProject },
  { id: 'titlePage', label: () => t('ed.titlePage'), icon: 'fileText', run: () => openModal('document', { tab: 'title' }), when: hasProject },
  { id: 'format', label: () => t('ed.format'), icon: 'sliders', run: () => openModal('document', { tab: 'format' }), when: hasProject },
  { id: 'revisionMode', label: () => t('ed.revMode'), icon: 'revisions', run: () => {
    const p = getState().project;
    if (!p) return;
    if (!p.revisions.sets.length) { setView('revisions'); return; }
    updateProject((x) => ({ ...x, revisions: { ...x.revisions, active: !x.revisions.active, current: x.revisions.current || x.revisions.sets[x.revisions.sets.length - 1].id } }));
  }, when: hasProject },
  { id: 'collab', label: () => t('ed.collab'), icon: 'users', run: () => togglePanel('collab'), when: hasProject },
  { id: 'suggestMode', label: () => t('sg.mode'), icon: 'compare', run: () => { void import('./actions').then((m) => m.setSuggesting(!getState().suggesting)); }, when: hasProject },
  { id: 'suggestions', label: () => t('sg.title'), icon: 'compare', run: () => togglePanel('suggest'), when: hasProject },
  { id: 'review', label: () => t('dr.title'), icon: 'check', run: () => togglePanel('review'), when: hasProject },
  { id: 'altNew', label: () => t('al.new'), icon: 'shuffle', run: () => { void import('../views/write/ReviewPanels').then((m) => m.altCommand('new')); }, when: inWrite },
  { id: 'altNext', label: () => t('al.next'), icon: 'shuffle', run: () => { void import('../views/write/ReviewPanels').then((m) => m.altCommand('next')); }, when: inWrite },
  { id: 'altPrev', label: () => t('al.prev'), icon: 'shuffle', run: () => { void import('../views/write/ReviewPanels').then((m) => m.altCommand('prev')); }, when: inWrite },
  { id: 'alts', label: () => t('al.title'), icon: 'shuffle', run: () => togglePanel('alts'), when: hasProject },
  { id: 'refs', label: () => t('rs.panel'), icon: 'pin', run: () => togglePanel('refs'), when: hasProject },
  { id: 'sides', label: () => t('sd.title'), icon: 'fileText', run: () => openModal('sides'), when: hasProject },
  { id: 'ai', label: () => t('ed.ai'), icon: 'sparkles', run: () => togglePanel('ai'), when: hasProject },
  { id: 'notes', label: () => t('ed.notes'), icon: 'clipboard', run: () => togglePanel('notes'), when: hasProject },
  { id: 'comments', label: () => t('w.comments'), icon: 'comment', run: () => togglePanel('comments'), when: hasProject },
  { id: 'closeProject', label: () => t('home.close'), icon: 'logout', run: () => void closeProject(), when: hasProject },
  { id: 'tour', label: () => t('tour.start'), icon: 'help', run: () => openModal('tour') },
  { id: 'settings', label: () => t('nav.settings'), icon: 'settings', run: () => setView('settings') },
  ...(['home', 'write', 'cards', 'beats', 'timeline', 'characters', 'research', 'translation', 'stats', 'revisions', 'production'] as const).map((v) => ({
    id: 'view:' + v, label: () => t('act.goTo') + ': ' + t('nav.' + v), icon: 'arrowRight' as IconName, run: () => setView(v), when: v === 'home' ? undefined : hasProject, group: 'nav',
  })),
];

export function runCommand(id: string): boolean {
  const c = COMMANDS.find((x) => x.id === id);
  if (!c || (c.when && !c.when())) return false;
  c.run();
  return true;
}
