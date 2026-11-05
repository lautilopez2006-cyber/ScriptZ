// Mounts the ScriptEditor for the current project and keeps it in sync with settings/project format.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ScriptEditor, type EditorConfig } from '../../editor/engine';
import { resolveStyles, localeTokens, getTemplate } from '../../core/format';
import type { Block, ElementType, Project } from '../../core/model';
import { getState, setState, useApp } from '../../app/store';
import { blocksFromEditor, registerEditor, transformCommit, noteActivity } from '../../app/actions';
import { smartContext, suggest, type Suggestions, type SmartContext } from '../../core/smart';
import { characterStats } from '../../core/scenes';
import { t, fmtDate } from '../../i18n';
import { Kbd, cx } from '../../ui/kit';
import { openCommentFor } from './comments';
import { RemoteCursors } from './RemoteCursors';

export function headerFooterFor(p: Project, which: 'header' | 'footer', pageIndex: number, label: string): { left: string; center: string; right: string } {
  const hf = p.page[which];
  if (which === 'header' && pageIndex === 0 && !p.page.firstPageHeader) return { left: '', center: '', right: '' };
  const rev = p.revisions.sets.find((s) => s.id === p.revisions.current);
  const vars: Record<string, string> = {
    page: label,
    title: p.title,
    author: p.author,
    date: fmtDate(Date.now(), { dateStyle: 'short' }),
    revision: rev ? `${rev.name} ${rev.date}` : '',
    episode: p.series ? `${p.series.show} ${p.series.season}x${String(p.series.episode).padStart(2, '0')} ${p.series.episodeTitle}`.trim() : '',
  };
  const fill = (s: string) => s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
  return { left: fill(hf.left), center: fill(hf.center), right: fill(hf.right) };
}

export function editorConfigFor(p: Project): EditorConfig {
  const s = getState().settings;
  const tokens = localeTokens(p.locale);
  const revSets = new Set(p.revisions.sets.map((x) => x.id));
  const tags = p.breakdown.elements;
  return {
    styles: resolveStyles(p),
    template: p.template,
    locale: p.locale,
    page: p.page,
    locks: p.revisions.pageLocks,
    sceneLetters: getTemplate(p.template).sceneNumberStyle === 'letter',
    scenesLocked: p.revisions.scenesLocked,
    lang: tokens.lang,
    readOnly: getState().collab.role === 'viewer',
    zoom: s.zoom,
    pageView: s.pageView,
    showSceneNumbers: s.showSceneNumbers,
    focusMode: s.focusMode,
    typewriter: s.typewriter,
    elementKeys: s.elementKeys,
    macros: s.macros,
    knownCharacters: () => characterStats(getState().project?.blocks ?? []).map((c) => c.name),
    tagCategory: (id) => tags[id]?.category,
    isRevised: (b: Block) => !!b.rev && revSets.has(b.rev),
    header: (i, label) => headerFooterFor(getState().project ?? p, 'header', i, label),
    footer: (i, label) => headerFooterFor(getState().project ?? p, 'footer', i, label),
  };
}

interface Popup { kind: 'suggest'; s: Suggestions; rect: DOMRect; active: number; blockId: string }
interface ElMenu { rect: DOMRect; current: ElementType; active: number }

export function EditorHost() {
  const project = useApp((s) => s.project);
  const settings = useApp((s) => s.settings);
  const epoch = useApp((s) => s.editorEpoch);
  const role = useApp((s) => s.collab.role);
  const hostRef = useRef<HTMLDivElement>(null);
  const edRef = useRef<ScriptEditor | null>(null);
  const [popup, setPopup] = useState<Popup | null>(null);
  const [elMenu, setElMenu] = useState<ElMenu | null>(null);
  const popupRef = useRef<Popup | null>(null);
  const elMenuRef = useRef<ElMenu | null>(null);
  popupRef.current = popup;
  elMenuRef.current = elMenu;
  const smartRef = useRef<{ ctx: SmartContext; at: number } | null>(null);
  const projectId = project?.id;

  const smart = (): SmartContext => {
    const p = getState().project!;
    if (!smartRef.current || Date.now() - smartRef.current.at > 4000) smartRef.current = { ctx: smartContext(p), at: Date.now() };
    return smartRef.current.ctx;
  };

  // Create the editor once per project (synchronously, so view transitions can land on the real page).
  useLayoutEffect(() => {
    const p = getState().project;
    if (!p || !hostRef.current) return;
    const ed = new ScriptEditor(hostRef.current, p.blocks, editorConfigFor(p), {
      onChange: (blocks, info) => { if (info.local) blocksFromEditor(blocks); if (info.structural) smartRef.current = null; /* plain typing reuses the cached context (refreshed every 4 s) */ },
      onSelection: (sel, ctx) => {
        setState({ caret: ctx.block ? { blockId: ctx.block.id, type: ctx.block.type, sceneId: ctx.sceneId, page: ctx.page, pageCount: ctx.pageCount, marks: ctx.marks.map((m) => m.k), collapsed: ctx.collapsed, index: ctx.index } : null });
        // SmartType popup
        if (sel && ctx.block && ctx.collapsed && document.activeElement === ed.doc) {
          const sg = suggest(ctx.block, sel.focus.off, smart());
          if (sg && sg.items.length) {
            const rect = ed.rectAt(sel.focus);
            if (rect) { setPopup((old) => ({ kind: 'suggest', s: sg, rect, active: old && old.blockId === ctx.block!.id ? Math.min(old.active, sg.items.length - 1) : 0, blockId: ctx.block!.id })); return; }
          }
        }
        setPopup(null);
      },
      onLayout: (layout) => setState({ pages: layout.pages.length }),
      onElementMenu: (rect, current) => setElMenu({ rect, current, active: Math.max(0, getTemplate(getState().project!.template).order.indexOf(current)) }),
      onMarkClick: (kind, id) => { if (kind === 'cmt') openCommentFor(id); },
      keyHook: (e) => {
        noteActivity();
        const em = elMenuRef.current;
        if (em) {
          const order = getTemplate(getState().project!.template).order;
          if (e.key === 'ArrowDown') { setElMenu({ ...em, active: (em.active + 1) % order.length }); return true; }
          if (e.key === 'ArrowUp') { setElMenu({ ...em, active: (em.active - 1 + order.length) % order.length }); return true; }
          if (e.key === 'Enter' || e.key === 'Tab') { ed.setType(order[em.active]); setElMenu(null); return true; }
          if (e.key === 'Escape') { setElMenu(null); return true; }
          setElMenu(null);
          return false;
        }
        const pp = popupRef.current;
        if (pp) {
          if (e.key === 'ArrowDown') { setPopup({ ...pp, active: (pp.active + 1) % pp.s.items.length }); return true; }
          if (e.key === 'ArrowUp') { setPopup({ ...pp, active: (pp.active - 1 + pp.s.items.length) % pp.s.items.length }); return true; }
          if (e.key === 'Escape') { setPopup(null); return true; }
          if (e.key === 'Tab' && !e.shiftKey) { accept(pp, pp.active); return true; }
          if (e.key === 'Enter' && !e.shiftKey) {
            accept(pp, pp.active);
            // Scene headings are built in steps (prefix → location → time): stay in the element.
            // Character names and transitions are complete: let Enter move on to the next element.
            return pp.s.kind === 'scene';
          }
        }
        return false;
      },
      transformCommit,
      onFocusChange: (f) => { if (!f) setTimeout(() => { if (document.activeElement !== ed.doc) setPopup(null); }, 150); },
    });
    edRef.current = ed;
    registerEditor(ed);
    (window as unknown as { __sz: unknown }).__sz = ed;
    setTimeout(() => ed.focus(), 30);
    return () => { registerEditor(null); ed.destroy(); edRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Keep config in sync.
  const fmtKey = project ? `${project.template}|${project.locale}|${JSON.stringify(project.styleOverrides)}|${JSON.stringify(project.page)}|${JSON.stringify(project.revisions)}|${Object.keys(project.breakdown.elements).length}` : '';
  const cfgKey = useMemo(() => fmtKey + `|${settings.zoom}|${settings.pageView}|${settings.showSceneNumbers}|${settings.focusMode}|${settings.typewriter}|${JSON.stringify(settings.elementKeys)}|${JSON.stringify(settings.macros)}|${epoch}|${role}`, [fmtKey, settings, epoch, role]);
  useEffect(() => {
    const ed = edRef.current;
    const p = getState().project;
    if (ed && p) ed.setConfig(editorConfigFor(p));
  }, [cfgKey]);

  // Remote/other-view changes to blocks.
  useEffect(() => {
    const ed = edRef.current;
    if (ed && project && ed.getBlocks() !== project.blocks) ed.setBlocks(project.blocks, { history: true });
  }, [project?.blocks]);

  function accept(pp: Popup, i: number) {
    const ed = edRef.current;
    if (!ed) return;
    const item = pp.s.items[i];
    const sel = ed.getSelection();
    if (!sel) return;
    ed.selectRange({ id: pp.blockId, off: pp.s.from }, { id: pp.blockId, off: pp.s.to }, false);
    ed.insertText(item);
    setPopup(null);
  }

  const order = project ? getTemplate(project.template).order : [];
  const keyFor = (type: ElementType) => Object.entries(settings.elementKeys).find(([, v]) => v === type)?.[0];

  return (
    <div className={cx('editor-host', !settings.showTags && 'no-tags')} style={{ ['--script-font' as string]: settings.scriptFont === 'SZ Mono' ? "'SZ Mono'" : `'${settings.scriptFont}'` }}>
      <div ref={hostRef} className={cx('editor-mount', !settings.showTags && 'hide-tags')} />
      <RemoteCursors />
      {popup ? (
        <div className="suggest" style={{ left: popup.rect.left, top: popup.rect.bottom + 4 }} role="listbox" onMouseDown={(e) => e.preventDefault()}>
          {popup.s.items.map((it, i) => (
            <button key={it} type="button" role="option" aria-selected={i === popup.active} className={cx(i === popup.active && 'on')} onMouseDown={(e) => { e.preventDefault(); accept(popup, i); }}>{it.trim()}</button>
          ))}
          <small className="suggest-h">↑↓ · Tab</small>
        </div>
      ) : null}
      {elMenu ? (
        <div className="suggest elmenu" style={{ left: elMenu.rect.left, top: elMenu.rect.bottom + 4 }} role="listbox" onMouseDown={(e) => e.preventDefault()}>
          {order.map((type, i) => (
            <button key={type} type="button" role="option" aria-selected={i === elMenu.active} className={cx(i === elMenu.active && 'on')} onMouseDown={(e) => { e.preventDefault(); edRef.current?.setType(type); setElMenu(null); }}>
              <span>{t('el.' + type)}</span>{keyFor(type) ? <Kbd combo={keyFor(type)!} /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
