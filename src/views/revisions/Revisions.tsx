// Revisions: colored revision sets, revision mode, locked scenes/pages, named drafts, backups and version comparison.
import { useEffect, useMemo, useState } from 'react';
import { useApp, openModal, toast } from '../../app/store';
import { createSnapshot, updateProject, adoptProject } from '../../app/actions';
import { REVISION_SEQUENCE, uid, type Block, type RevColor } from '../../core/model';
import { REV_HEX, clearRevisionMarks, lockPages, lockScenes, newRevisionSet, unlockPages, unlockScenes, revisedSceneIds } from '../../core/revisions';
import { compareBlocks, type CompareResult } from '../../core/compare';
import { projectStore, type SnapshotSummary } from '../../platform';
import { saveFile } from '../../platform';
import { t, fmtDate, relTime, fmtNum } from '../../i18n';
import { Button, IconBtn, LazyInput, Toggle, cx, Empty } from '../../ui/kit';
import { esc } from '../../io/xml';

const COLOR_NAME: Record<RevColor, string> = { white: 'rv.c.white', blue: 'rv.c.blue', pink: 'rv.c.pink', yellow: 'rv.c.yellow', green: 'rv.c.green', goldenrod: 'rv.c.goldenrod', buff: 'rv.c.buff', salmon: 'rv.c.salmon', cherry: 'rv.c.cherry', blue2: 'rv.c.blue2', pink2: 'rv.c.pink2', yellow2: 'rv.c.yellow2', green2: 'rv.c.green2', goldenrod2: 'rv.c.goldenrod2' };

type Source = { kind: 'current' } | { kind: 'draft'; id: string } | { kind: 'snap'; id: string };

function Compare({ snaps }: { snaps: SnapshotSummary[] }) {
  const p = useApp((s) => s.project)!;
  const drafts = Object.values(p.drafts).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const [a, setA] = useState<string>(drafts.length ? 'draft:' + drafts[drafts.length - 1].id : snaps[0] ? 'snap:' + snaps[0].id : 'current');
  const [b, setB] = useState<string>('current');
  const [res, setRes] = useState<CompareResult | null>(null);
  const [onlyChanges, setOnlyChanges] = useState(true);
  const parse = (v: string): Source => (v === 'current' ? { kind: 'current' } : v.startsWith('draft:') ? { kind: 'draft', id: v.slice(6) } : { kind: 'snap', id: v.slice(5) });
  const blocksOf = async (s: Source): Promise<Block[]> => {
    if (s.kind === 'current') return p.blocks;
    if (s.kind === 'draft') return p.drafts[s.id]?.blocks ?? [];
    try { return (await projectStore().loadSnapshot(p.id, s.id)).blocks; } catch { return []; }
  };
  const run = async () => setRes(compareBlocks(await blocksOf(parse(a)), await blocksOf(parse(b))));
  const label = (v: string) => { const s = parse(v); if (s.kind === 'current') return t('rv.current'); if (s.kind === 'draft') return p.drafts[s.id]?.name ?? '?'; const sn = snaps.find((x) => x.id === s.id); return sn ? fmtDate(sn.createdAtMs) : '?'; };
  const opts = [<option key="c" value="current">{t('rv.current')}</option>, ...drafts.map((d) => <option key={d.id} value={'draft:' + d.id}>{t('rv.draft')}: {d.name}</option>), ...snaps.map((s) => <option key={s.id} value={'snap:' + s.id}>{t('rv.backup')}: {fmtDate(s.createdAtMs)}</option>)];
  const exportReport = async () => {
    if (!res) return;
    const rows = res.rows.filter((r) => !onlyChanges || r.kind !== 'same').map((r) => {
      const body = r.kind === 'mod' ? r.parts!.map((x) => (x.kind === 'add' ? `<ins>${esc(x.text)}</ins>` : x.kind === 'del' ? `<del>${esc(x.text)}</del>` : esc(x.text))).join('') : esc((r.b ?? r.a)!.text);
      return `<tr class="${r.kind}"><td>${esc(r.sceneLabel)}</td><td>${t('el.' + (r.b ?? r.a)!.type)}</td><td>${body}</td></tr>`;
    }).join('');
    const html = `<!doctype html><meta charset="utf-8"><title>${esc(p.title)} — ${t('rv.compare')}</title><style>body{font:14px/1.5 system-ui;margin:32px;color:#222}table{border-collapse:collapse;width:100%}td{border-bottom:1px solid #eee;padding:6px 8px;vertical-align:top}td:last-child{font-family:'Courier New',monospace;white-space:pre-wrap}ins{background:#d4f5c9;text-decoration:none}del{background:#ffd6d6}.add td:last-child{background:#ecfbe7}.del td:last-child{background:#fff0f0;text-decoration:line-through}</style><h1>${esc(p.title)}</h1><p>${esc(label(a))} → ${esc(label(b))}</p><p>${t('rv.cmp.summary', { a: res.added, r: res.removed, m: res.modified, wa: res.wordsAdded, wr: res.wordsRemoved })}</p><table>${rows}</table>`;
    await saveFile(`${p.title || 'guion'}-comparacion.html`, html, [{ name: 'HTML', extensions: ['html'] }]);
  };
  return (
    <div className="card">
      <h3>{t('rv.compare')}</h3>
      <div className="row wrap">
        <select className="select sm" value={a} onChange={(e) => setA(e.target.value)}>{opts}</select>
        <span>→</span>
        <select className="select sm" value={b} onChange={(e) => setB(e.target.value)}>{opts}</select>
        <Button small kind="primary" icon="compare" onClick={() => void run()}>{t('rv.compare.go')}</Button>
        {res ? <Button small icon="download" onClick={() => void exportReport()}>{t('rv.cmp.export')}</Button> : null}
      </div>
      {res ? (
        <>
          <p className="cmp-sum">{t('rv.cmp.summary', { a: res.added, r: res.removed, m: res.modified, wa: fmtNum(res.wordsAdded), wr: fmtNum(res.wordsRemoved) })}{res.scenesChanged.length ? ' · ' + t('rv.cmp.scenes', { list: res.scenesChanged.slice(0, 20).join(', ') }) : ''}</p>
          <Toggle checked={onlyChanges} onChange={setOnlyChanges} label={t('rv.cmp.only')} />
          <div className="cmp">
            {res.rows.filter((r) => !onlyChanges || r.kind !== 'same').slice(0, 1500).map((r, i) => (
              <div key={i} className={cx('cmp-row', r.kind)}>
                <span className="cmp-sc">{r.sceneLabel}</span>
                <span className="cmp-ty">{t('el.' + (r.b ?? r.a)!.type)}</span>
                <span className="cmp-tx">{r.kind === 'mod' ? r.parts!.map((x, k) => (x.kind === 'add' ? <ins key={k}>{x.text}</ins> : x.kind === 'del' ? <del key={k}>{x.text}</del> : <span key={k}>{x.text}</span>)) : (r.b ?? r.a)!.text}</span>
              </div>
            ))}
            {!res.rows.some((r) => r.kind !== 'same') ? <p className="muted">{t('rv.cmp.same')}</p> : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

export default function RevisionsView() {
  const p = useApp((s) => s.project)!;
  const [snaps, setSnaps] = useState<SnapshotSummary[]>([]);
  const refresh = () => projectStore().snapshots(p.id).then(setSnaps).catch(() => setSnaps([]));
  useEffect(() => { void refresh(); }, [p.id]);
  const revised = useMemo(() => revisedSceneIds(p).size, [p.blocks]);
  const r = p.revisions;
  const setRev = (patch: Partial<typeof r>) => updateProject((x) => ({ ...x, revisions: { ...x.revisions, ...patch } }));
  const addSet = () => {
    const set = newRevisionSet(p, '');
    set.name = t('rv.defaultName', { color: t(COLOR_NAME[set.color]) });
    updateProject((x) => ({ ...x, revisions: { ...x.revisions, sets: [...x.revisions.sets, set], current: set.id, active: true } }));
  };
  const saveDraft = () => openModal('prompt', {
    title: t('rv.newDraft'), label: t('w.name'), value: t('rv.draftName', { n: Object.keys(p.drafts).length + 1 }),
    onSubmit: (name: string) => { const id = uid(); updateProject((x) => ({ ...x, drafts: { ...x.drafts, [id]: { id, name: name || t('rv.draft'), createdAt: new Date().toISOString(), blocks: x.blocks } } })); toast(t('rv.draftSaved'), 'success'); },
  });
  return (
    <div className="view revisions-view">
      <header className="view-h"><h2>{t('nav.revisions')}</h2></header>
      <div className="view-b">
        <div className="grid2">
          <div className="card">
            <h3>{t('rv.sets')}</h3>
            <p className="muted small">{t('rv.sets.h')}</p>
            <Toggle checked={r.active} disabled={!r.sets.length} onChange={(v) => setRev({ active: v })} label={t('ed.revMode')} hint={r.active ? t('rv.revisedScenes', { n: revised }) : undefined} />
            <div className="rev-sets">
              {r.sets.map((s) => (
                <div key={s.id} className={cx('rev-set', r.current === s.id && 'on')}>
                  <button type="button" className="sw" style={{ background: REV_HEX[s.color] }} title={t('rv.makeCurrent')} onClick={() => setRev({ current: s.id })} />
                  <LazyInput value={s.name} onCommit={(v) => setRev({ sets: r.sets.map((x) => (x.id === s.id ? { ...x, name: v } : x)) })} />
                  <select className="select sm" value={s.color} onChange={(e) => setRev({ sets: r.sets.map((x) => (x.id === s.id ? { ...x, color: e.target.value as RevColor } : x)) })}>{REVISION_SEQUENCE.map((c) => <option key={c} value={c}>{t(COLOR_NAME[c])}</option>)}</select>
                  <input className="input sm" type="date" value={s.date} onChange={(e) => setRev({ sets: r.sets.map((x) => (x.id === s.id ? { ...x, date: e.target.value } : x)) })} />
                  <input className="input sm mark" value={s.mark} maxLength={2} aria-label={t('rv.mark')} onChange={(e) => setRev({ sets: r.sets.map((x) => (x.id === s.id ? { ...x, mark: e.target.value || '*' } : x)) })} />
                  <IconBtn small icon="x" title={t('rv.clearMarks')} onClick={() => updateProject((x) => clearRevisionMarks(x, s.id))} />
                </div>
              ))}
            </div>
            <div className="row"><Button small icon="plus" onClick={addSet}>{t('rv.addSet', { color: t(COLOR_NAME[REVISION_SEQUENCE[Math.min(r.sets.length + 1, REVISION_SEQUENCE.length - 1)]]) })}</Button>{r.sets.length ? <Button small kind="ghost" onClick={() => updateProject((x) => clearRevisionMarks(x))}>{t('rv.clearAll')}</Button> : null}</div>
          </div>
          <div className="card">
            <h3>{t('rv.locks')}</h3>
            <div className="lock-row">
              <div><b>{t('rv.lockScenes')}</b><p className="muted small">{t('rv.lockScenes.h')}</p></div>
              {r.scenesLocked ? <Button small icon="unlock" onClick={() => openModal('confirm', { title: t('rv.unlockScenes'), text: t('rv.unlockScenes.t'), onConfirm: () => updateProject(unlockScenes) })}>{t('rv.unlock')}</Button> : <Button small kind="primary" icon="lock" onClick={() => updateProject(lockScenes)}>{t('rv.lock')}</Button>}
            </div>
            <div className="lock-row">
              <div><b>{t('rv.lockPages')}</b><p className="muted small">{t('rv.lockPages.h')}</p></div>
              {r.pageLocks ? <Button small icon="unlock" onClick={() => updateProject(unlockPages)}>{t('rv.unlock')}</Button> : <Button small kind="primary" icon="lock" onClick={() => updateProject(lockPages)}>{t('rv.lock')}</Button>}
            </div>
          </div>
        </div>
        <div className="grid2 mt">
          <div className="card">
            <div className="row between"><h3>{t('rv.drafts')}</h3><Button small icon="plus" onClick={saveDraft}>{t('rv.newDraft')}</Button></div>
            {!Object.keys(p.drafts).length ? <p className="muted small">{t('rv.drafts.h')}</p> : null}
            {Object.values(p.drafts).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((d) => (
              <div key={d.id} className="draft-row">
                <b>{d.name}</b><small className="muted">{fmtDate(d.createdAt)} · {d.blocks.length} ¶</small><span className="grow" />
                <Button small kind="ghost" onClick={() => openModal('confirm', { title: t('rv.restoreDraft'), text: t('rv.restoreDraft.t', { name: d.name }), confirmLabel: t('act.restore'), onConfirm: () => updateProject((x) => ({ ...x, blocks: d.blocks.map((b) => ({ ...b })) })) })}>{t('act.restore')}</Button>
                <Button small kind="ghost" onClick={() => void adoptProject({ ...p, id: uid(), title: `${p.title} — ${d.name}`, blocks: d.blocks, revision: 1, drafts: {} })}>{t('rv.asProject')}</Button>
                <IconBtn small icon="trash" title={t('act.delete')} onClick={() => updateProject((x) => { const drafts = { ...x.drafts }; delete drafts[d.id]; return { ...x, drafts }; })} />
              </div>
            ))}
          </div>
          <div className="card">
            <div className="row between"><h3>{t('rv.backups')}</h3><Button small icon="download" onClick={async () => { await createSnapshot(); void refresh(); }}>{t('rv.backupNow')}</Button></div>
            <p className="muted small">{t('rv.backups.h')}</p>
            {!snaps.length ? <Empty icon="clock" title={t('rv.noBackups')} /> : snaps.slice(0, 30).map((s) => (
              <div key={s.id} className="draft-row">
                <b>{relTime(s.createdAtMs)}</b><small className="muted">{s.kind === 'auto' ? t('rv.auto') : t('rv.manual')} · {fmtNum(s.words)} {t('w.words').toLowerCase()}</small><span className="grow" />
                <Button small kind="ghost" onClick={() => openModal('confirm', { title: t('rv.restoreBackup'), text: t('rv.restoreBackup.t'), confirmLabel: t('act.restore'), onConfirm: async () => { const restored = await projectStore().restore(p.id, s.id); await adoptProject(restored); void refresh(); } })}>{t('act.restore')}</Button>
              </div>
            ))}
          </div>
        </div>
        <div className="mt"><Compare snaps={snaps} /></div>
      </div>
    </div>
  );
}
