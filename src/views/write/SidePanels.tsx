// Right-hand panels: comments and scene notes.
import { useMemo, useState } from 'react';
import { useApp } from '../../app/store';
import { patchProject, updateProject } from '../../app/actions';
import { uid, nowIso, type Comment, type SceneStatus } from '../../core/model';
import { buildScenes } from '../../core/scenes';
import { t, relTime } from '../../i18n';
import { Button, ColorPicker, IconBtn, LazyInput, Segmented, cx } from '../../ui/kit';
import { addCommentAtSelection, deleteComment, focusComment, jumpToComment } from './comments';

function Mentions({ text }: { text: string }) {
  const parts = text.split(/(@[\p{L}\p{N}_.-]+)/u);
  return <>{parts.map((p, i) => (p.startsWith('@') ? <b key={i} className="mention">{p}</b> : <span key={i}>{p}</span>))}</>;
}

function MentionBox({ onSubmit, placeholder, names, autoFocus }: { onSubmit: (v: string) => void; placeholder: string; names: string[]; autoFocus?: boolean }) {
  const [v, setV] = useState('');
  const at = /@([\p{L}\p{N}_.-]*)$/u.exec(v);
  const opts = at ? names.filter((n) => n.toLowerCase().startsWith(at[1].toLowerCase())).slice(0, 5) : [];
  return (
    <div className="mention-box">
      <textarea className="input" rows={2} value={v} placeholder={placeholder} autoFocus={autoFocus} onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && v.trim()) { e.preventDefault(); onSubmit(v.trim()); setV(''); } }} />
      {opts.length ? (
        <div className="mention-opts">{opts.map((n) => <button key={n} type="button" onClick={() => setV(v.replace(/@[\p{L}\p{N}_.-]*$/u, '@' + n.replace(/\s+/g, '') + ' '))}>@{n}</button>)}</div>
      ) : null}
      <div className="row end"><Button small kind="primary" disabled={!v.trim()} onClick={() => { onSubmit(v.trim()); setV(''); }}>{t('act.sendMessage')}</Button></div>
    </div>
  );
}

export function CommentsPanel() {
  const project = useApp((s) => s.project)!;
  const settings = useApp((s) => s.settings);
  const peers = useApp((s) => s.collab.peers);
  const [tab, setTab] = useState<'open' | 'resolved'>('open');
  const all = Object.values(project.comments).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const order = useMemo(() => new Map(project.blocks.map((b, i) => [b.id, i])), [project.blocks]);
  const anchored = useMemo(() => {
    const set = new Set<string>();
    for (const b of project.blocks) for (const m of b.marks ?? []) if (m.k === 'cmt' && m.v) set.add(m.v);
    return set;
  }, [project.blocks]);
  const list = all.filter((c) => (tab === 'open' ? !c.resolved : c.resolved)).sort((a, b) => (order.get(a.blockId) ?? 1e9) - (order.get(b.blockId) ?? 1e9));
  const me = settings.collab.name || settings.author || t('w.you');
  const names = [...new Set([me, ...peers.map((p) => p.name), ...all.map((c) => c.author), ...all.flatMap((c) => c.replies.map((r) => r.author))].filter(Boolean))];
  const setComment = (id: string, patch: Partial<Comment>) => updateProject((p) => ({ ...p, comments: { ...p.comments, [id]: { ...p.comments[id], ...patch } } }));

  return (
    <div className="panel comments">
      <div className="row between">
        <Segmented value={tab} onChange={setTab} small options={[{ value: 'open', label: `${t('cm.open')} (${all.filter((c) => !c.resolved).length})` }, { value: 'resolved', label: `${t('cm.resolved')} (${all.filter((c) => c.resolved).length})` }]} />
        <Button small icon="plus" onClick={() => addCommentAtSelection()}>{t('cm.new')}</Button>
      </div>
      {!list.length ? <p className="muted pad">{t('cm.none', { key: settings.shortcuts.comment.replace('Mod', 'Ctrl') })}</p> : null}
      {list.map((c) => (
        <article key={c.id} id={'cm-' + c.id} className={cx('comment', focusComment.id === c.id && 'focus')}>
          <header>
            <b>{c.author || t('w.unknown')}</b>
            <small>{relTime(Date.parse(c.createdAt))}</small>
            <span className="grow" />
            <IconBtn small icon={c.resolved ? 'refresh' : 'check'} title={c.resolved ? t('act.reopen') : t('act.resolve')} onClick={() => setComment(c.id, { resolved: !c.resolved })} />
            <IconBtn small icon="trash" title={t('act.delete')} onClick={() => deleteComment(c.id)} />
          </header>
          {c.excerpt ? <button type="button" className="excerpt" onClick={() => jumpToComment(c)}>“{c.excerpt}”{!anchored.has(c.id) && c.excerpt ? <em> · {t('cm.orphan')}</em> : null}</button> : <small className="muted">{t('cm.general')}</small>}
          {c.body ? <p><Mentions text={c.body} /></p> : <MentionBox autoFocus names={names} placeholder={t('cm.placeholder')} onSubmit={(v) => setComment(c.id, { body: v })} />}
          {c.replies.map((r) => (
            <div key={r.id} className="reply"><b>{r.author}</b> <small>{relTime(Date.parse(r.createdAt))}</small><p><Mentions text={r.body} /></p></div>
          ))}
          {c.body ? <details className="reply-box"><summary>{t('act.reply')}</summary><MentionBox names={names} placeholder={t('cm.reply')} onSubmit={(v) => setComment(c.id, { replies: [...c.replies, { id: uid(), author: me, body: v, createdAt: nowIso() }] })} /></details> : null}
        </article>
      ))}
    </div>
  );
}

export function NotesPanel() {
  const project = useApp((s) => s.project)!;
  const sceneId = useApp((s) => s.caret?.sceneId ?? '');
  const scenes = useMemo(() => buildScenes(project.blocks), [project.blocks]);
  const scene = scenes.find((s) => s.id === sceneId);
  const meta = project.scenes[sceneId] ?? {};
  const setMeta = (patch: object) => updateProject((p) => ({ ...p, scenes: { ...p.scenes, [sceneId]: { ...(p.scenes[sceneId] ?? {}), ...patch } } }));
  const statuses: SceneStatus[] = ['idea', 'draft', 'revised', 'final'];
  return (
    <div className="panel notes">
      {scene ? (
        <>
          <h4>{scene.label}. {scene.heading || '—'}</h4>
          <label className="field"><span className="field-l">{t('sn.summary')}</span>
            <LazyInput multiline rows={4} value={meta.summary ?? ''} placeholder={t('sn.summary.ph')} onCommit={(v) => setMeta({ summary: v })} />
          </label>
          <div className="field"><span className="field-l">{t('sn.color')}</span><ColorPicker value={meta.color ?? 'none'} onChange={(c) => setMeta({ color: c })} /></div>
          <div className="field"><span className="field-l">{t('sn.status')}</span>
            <Segmented small value={meta.status ?? 'draft'} onChange={(v) => setMeta({ status: v })} options={statuses.map((s) => ({ value: s, label: t('sn.status.' + s) }))} />
          </div>
        </>
      ) : <p className="muted">{t('sn.noScene')}</p>}
      <hr />
      <label className="field"><span className="field-l">{t('sn.projectNotes')}</span>
        <LazyInput multiline rows={10} value={project.notes} onCommit={(v) => patchProject({ notes: v })} />
      </label>
    </div>
  );
}
