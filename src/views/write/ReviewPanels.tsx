// Review tools beside the page: script review, suggestions (track changes) and alternate versions.
import { useMemo } from 'react';
import { useApp, getState } from '../../app/store';
import { getEditor, resolveSuggestions, setSuggesting, updateProject } from '../../app/actions';
import { reviewScript, type Issue, type Severity } from '../../core/doctor';
import { listSuggestions } from '../../core/suggest';
import { addAlternate, cycleAlternate, keepOnlyCurrent, removeAlternate, useAlternate } from '../../core/alts';
import type { Block } from '../../core/model';
import { t, tn, relTime } from '../../i18n';
import { Button, IconBtn, Toggle, cx, Kbd, useDebounced } from '../../ui/kit';
import { Icon } from '../../ui/icons';

const jump = (id: string) => { if (id) getEditor()?.scrollToBlock(id, { select: true }); };

/** Replace blocks through the editor (undoable), keeping the caret in `focusId`. */
export function editBlocks(fn: (blocks: Block[]) => Block[], focusId?: string): void {
  const p = getState().project;
  const ed = getEditor();
  if (!p) return;
  const next = fn(p.blocks);
  if (next === p.blocks) return;
  if (ed) {
    const b = focusId ? next.find((x) => x.id === focusId) : undefined;
    const sel = ed.getSelection();
    const off = b ? Math.min(b.text.length, sel && sel.focus.id === focusId ? sel.focus.off : b.text.length) : 0;
    ed.setBlocks(next, { history: true, local: true, sel: b ? { anchor: { id: b.id, off }, focus: { id: b.id, off } } : undefined });
  } else updateProject((x) => ({ ...x, blocks: next }));
}

// ---------------------------------------------------------------- script review

const SEV_ICON: Record<Severity, string> = { error: 'alert', warn: 'flag', info: 'info' };

export function ReviewPanel() {
  const live = useApp((s) => s.project!.blocks);
  const blocks = useDebounced(live, 500);
  const template = useApp((s) => s.project!.template);
  const comments = useApp((s) => s.project!.comments);
  const suggestions = useApp((s) => s.project!.suggestions);
  const issues = useMemo(() => reviewScript({ blocks, template, comments, suggestions }), [blocks, template, comments, suggestions]);
  const counts = { error: 0, warn: 0, info: 0 };
  for (const i of issues) counts[i.severity]++;
  const fixAll = () => {
    let bs = getState().project!.blocks;
    for (const i of issues) if (i.fix && i.severity !== 'info') bs = i.fix.apply(bs);
    editBlocks(() => bs);
  };
  const fixable = issues.filter((i) => i.fix && i.severity !== 'info').length;
  return (
    <div className="panel review">
      <div className="dr-summary">
        <span className={cx('dr-count', 'error', !counts.error && 'zero')}><b>{counts.error}</b>{t('dr.errors')}</span>
        <span className={cx('dr-count', 'warn', !counts.warn && 'zero')}><b>{counts.warn}</b>{t('dr.warnings')}</span>
        <span className={cx('dr-count', 'info', !counts.info && 'zero')}><b>{counts.info}</b>{t('dr.tips')}</span>
      </div>
      {fixable > 1 ? <Button small icon="wand" onClick={fixAll}>{t('dr.fixAll', { n: fixable })}</Button> : null}
      {!issues.length ? (
        <div className="dr-clean"><Icon name="check" size={28} /><p>{t('dr.clean')}</p></div>
      ) : issues.map((i) => <IssueRow key={i.id} i={i} />)}
    </div>
  );
}

function IssueRow({ i }: { i: Issue }) {
  const target = i.kind === 'comments' ? () => document.dispatchEvent(new CustomEvent('sz-panel', { detail: 'comments' })) : i.kind === 'suggestions' ? () => document.dispatchEvent(new CustomEvent('sz-panel', { detail: 'suggest' })) : () => jump(i.blockId);
  return (
    <article className={cx('dr-issue', i.severity)}>
      <button type="button" className="dr-main" onClick={target}>
        <Icon name={SEV_ICON[i.severity]} size={15} />
        <span>{t(i.msg, i.vars)}</span>
      </button>
      {i.fix ? <Button small kind="ghost" onClick={() => editBlocks((bs) => i.fix!.apply(bs))}>{t(i.fix.msg, i.fix.vars)}</Button> : null}
    </article>
  );
}

// ---------------------------------------------------------------- suggestions

export function SuggestPanel() {
  const blocks = useApp((s) => s.project!.blocks);
  const meta = useApp((s) => s.project!.suggestions);
  const on = useApp((s) => s.suggesting);
  const key = useApp((s) => s.settings.shortcuts.suggestMode);
  const viewer = useApp((s) => s.collab.role === 'viewer');
  const list = useMemo(() => listSuggestions(blocks, meta), [blocks, meta]);
  return (
    <div className="panel sg-panel">
      <Toggle checked={on} disabled={viewer} onChange={(v) => setSuggesting(v)} label={t('sg.mode')} hint={t('sg.mode.h')} />
      <p className="muted small row">{t('sg.shortcut')} <Kbd combo={key} /></p>
      {list.length ? (
        <div className="row wrap">
          <Button small kind="primary" icon="check" onClick={() => resolveSuggestions(null, true)}>{t('sg.acceptAll')}</Button>
          <Button small icon="x" onClick={() => resolveSuggestions(null, false)}>{t('sg.rejectAll')}</Button>
        </div>
      ) : <p className="muted pad">{t('sg.none')}</p>}
      {list.map((s) => (
        <article key={s.id} className="sg-item" style={{ ['--who' as string]: s.meta?.color ?? 'var(--accent)' }}>
          <header>
            <span className="dot" />
            <b>{s.meta?.author ?? t('w.unknown')}</b>
            {s.meta?.at ? <small className="muted">{relTime(Date.parse(s.meta.at))}</small> : null}
            <span className="grow" />
            <IconBtn small icon="check" title={t('sg.accept')} onClick={() => resolveSuggestions(s.id, true)} />
            <IconBtn small icon="x" title={t('sg.reject')} onClick={() => resolveSuggestions(s.id, false)} />
          </header>
          <button type="button" className="sg-body" onClick={() => jump(s.firstBlock)}>
            {s.deleted ? <del>{s.deleted.length > 220 ? s.deleted.slice(0, 220) + '…' : s.deleted}</del> : null}
            {s.inserted ? <ins>{s.inserted.length > 220 ? s.inserted.slice(0, 220) + '…' : s.inserted}</ins> : null}
          </button>
        </article>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- alternates

export function altCommand(kind: 'new' | 'next' | 'prev'): void {
  const sel = getEditor()?.getSelection();
  const id = sel?.focus.id;
  if (!id) return;
  editBlocks((bs) => bs.map((b) => (b.id !== id ? b : kind === 'new' ? addAlternate(b) : cycleAlternate(b, kind === 'next' ? 1 : -1))), id);
}

export function AltsPanel() {
  const caret = useApp((s) => s.caret);
  const blocks = useApp((s) => s.project!.blocks);
  const keys = useApp((s) => s.settings.shortcuts);
  const b = blocks.find((x) => x.id === caret?.blockId);
  const withAlts = useMemo(() => blocks.filter((x) => x.alts?.length), [blocks]);
  const set = (fn: (x: Block) => Block) => b && editBlocks((bs) => bs.map((x) => (x.id === b.id ? fn(x) : x)), b.id);
  return (
    <div className="panel alts">
      <p className="muted small">{t('al.intro')}</p>
      {b ? (
        <>
          <div className="al-current">
            <small className="muted">{t('al.current')}</small>
            <p className={'al-text t-' + b.type}>{b.text || '—'}</p>
          </div>
          <div className="row wrap">
            <Button small kind="primary" icon="plus" onClick={() => altCommand('new')}>{t('al.new')}</Button>
            {b.alts?.length ? <Button small kind="ghost" onClick={() => set(keepOnlyCurrent)}>{t('al.keepOnly')}</Button> : null}
          </div>
          <p className="muted small row">{t('al.keys')} <Kbd combo={keys.altNew} /> <Kbd combo={keys.altPrev} /> <Kbd combo={keys.altNext} /></p>
          {(b.alts ?? []).map((a, i) => (
            <article key={i} className="al-item">
              <p className={'al-text t-' + b.type}>{a.text || '—'}</p>
              <div className="row">
                <Button small onClick={() => set((x) => useAlternate(x, i))}>{t('al.use')}</Button>
                <IconBtn small icon="trash" title={t('act.delete')} onClick={() => set((x) => removeAlternate(x, i))} />
              </div>
            </article>
          ))}
        </>
      ) : <p className="muted pad">{t('al.noCaret')}</p>}
      {withAlts.length ? (
        <>
          <h4 className="mt">{tn('al.inScript', withAlts.length)}</h4>
          {withAlts.map((x) => (
            <button key={x.id} type="button" className="al-link" onClick={() => jump(x.id)}>
              <span>{x.text.slice(0, 70) || '—'}</span><small className="muted">{t('al.versions', { n: (x.alts?.length ?? 0) + 1 })}</small>
            </button>
          ))}
        </>
      ) : null}
    </div>
  );
}
