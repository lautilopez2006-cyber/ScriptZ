// Structure: logline/synopsis/theme, beat sheets mapped onto the script's pages.
import { useMemo, useState } from 'react';
import { useApp, openModal } from '../../app/store';
import { getEditor, patchProject, setView, updateProject } from '../../app/actions';
import { buildScenes } from '../../core/scenes';
import { layoutProject } from '../../core/layout';
import { beatTemplates, beatsFromTemplate } from '../../core/story';
import { uid, type Beat } from '../../core/model';
import { getLang, t } from '../../i18n';
import { Button, COLOR_HEX, IconBtn, LazyInput, NumberInput, cx } from '../../ui/kit';

export default function BeatsView() {
  const p = useApp((s) => s.project)!;
  const lang = getLang();
  const templates = beatTemplates(lang);
  const scenes = useMemo(() => buildScenes(p.blocks), [p.blocks]);
  const layout = useMemo(() => layoutProject(p), [p.blocks, p.template, p.page.paper]);
  const total = Math.max(1, layout.pages.length);
  const scenePage = (id: string) => (layout.blockPage.get(id) ?? 0) + 1;
  const [adding, setAdding] = useState<string | null>(null);
  const beats = p.beats.beats;
  const setBeats = (list: Beat[], sheet = p.beats.sheet) => updateProject((x) => ({ ...x, beats: { sheet, beats: list } }));
  const setBeat = (id: string, patch: Partial<Beat>) => setBeats(beats.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  const applyTemplate = (id: string) => {
    const tpl = templates.find((x) => x.id === id);
    if (!tpl) return;
    const doit = () => setBeats(beatsFromTemplate(tpl), id);
    if (beats.some((b) => b.sceneIds.length)) openModal('confirm', { title: t('bt.replace'), text: t('bt.replace.t'), confirmLabel: t('act.apply'), onConfirm: doit });
    else doit();
  };
  const assigned = new Map<string, string>();
  for (const b of beats) for (const s of b.sceneIds) assigned.set(s, b.id);
  const jump = (id: string) => { setView('write'); setTimeout(() => getEditor()?.scrollToBlock(id, { select: true }), 80); };

  return (
    <div className="view beats-view">
      <header className="view-h"><h2>{t('nav.beats')}</h2></header>
      <div className="view-b">
        <section className="card story-core">
          <label className="field"><span className="field-l">{t('bt.logline')}</span><LazyInput multiline rows={2} value={p.logline} placeholder={t('bt.logline.ph')} onCommit={(v) => patchProject({ logline: v })} /></label>
          <div className="grid2">
            <label className="field"><span className="field-l">{t('bt.synopsis')}</span><LazyInput multiline rows={4} value={p.synopsis} onCommit={(v) => patchProject({ synopsis: v })} /></label>
            <label className="field"><span className="field-l">{t('bt.theme')}</span><LazyInput multiline rows={4} value={p.theme} placeholder={t('bt.theme.ph')} onCommit={(v) => patchProject({ theme: v })} /></label>
          </div>
        </section>

        <section className="beats-head">
          <h3>{t('bt.sheet')}</h3>
          <select className="select sm" value={p.beats.sheet} onChange={(e) => applyTemplate(e.target.value)} aria-label={t('bt.sheet')}>
            <option value="">{t('bt.choose')}</option>
            {templates.map((tp) => <option key={tp.id} value={tp.id}>{tp.name}</option>)}
            {p.beats.sheet === 'custom' ? <option value="custom">{t('bt.custom')}</option> : null}
          </select>
          <Button small icon="plus" onClick={() => setBeats([...beats, { id: uid(), name: t('bt.newBeat'), description: '', pct: 50, sceneIds: [] }].sort((a, b) => a.pct - b.pct), p.beats.sheet || 'custom')}>{t('bt.addBeat')}</Button>
        </section>

        {/* Page ruler: scenes as segments, beats as markers */}
        <div className="ruler" aria-label={t('bt.ruler')}><div className="ruler-in">
          <div className="ruler-scenes">
            {scenes.map((s, i) => {
              const a = (scenePage(s.id) - 1) / total;
              const next = scenes[i + 1];
              const b = next ? (scenePage(next.id) - 1) / total : 1;
              const col = p.scenes[s.id]?.color;
              return <button key={s.id} type="button" className={cx('rs-seg', assigned.has(s.id) && 'assigned')} title={`${s.label}. ${s.heading}`} style={{ left: `${a * 100}%`, width: `${Math.max(0.4, (b - a) * 100)}%`, background: col && col !== 'none' ? COLOR_HEX[col] : undefined }} onClick={() => jump(s.id)} />;
            })}
          </div>
          {beats.map((b) => <span key={b.id} className="rs-beat" style={{ left: `${b.pct}%` }} title={`${b.name} · ${t('bt.target', { p: Math.max(1, Math.round((b.pct / 100) * total)) })}`}><i /></span>)}
          <div className="ruler-scale">{[0, 25, 50, 75, 100].map((x) => <span key={x} style={{ left: `${x}%` }}>{Math.max(1, Math.round((x / 100) * total))}</span>)}</div>
        </div></div>

        {!beats.length ? <p className="muted">{t('bt.empty')}</p> : null}
        <div className="beats">
          {beats.map((b) => {
            const target = Math.max(1, Math.round((b.pct / 100) * total));
            const firstScene = b.sceneIds.map((id) => scenes.find((s) => s.id === id)).filter(Boolean).sort((x, y) => x!.index - y!.index)[0];
            const actual = firstScene ? scenePage(firstScene.id) : 0;
            const delta = actual ? actual - target : 0;
            const tol = Math.max(2, total * 0.05);
            return (
              <article key={b.id} className="beat">
                <header>
                  <LazyInput className="beat-name" value={b.name} onCommit={(v) => setBeat(b.id, { name: v })} />
                  <span className="beat-pct"><NumberInput value={b.pct} min={0} max={100} onChange={(v) => setBeats(beats.map((x) => (x.id === b.id ? { ...x, pct: Math.max(0, Math.min(100, v)) } : x)).sort((x, y) => x.pct - y.pct))} ariaLabel="%" />%</span>
                  <IconBtn small icon="trash" title={t('act.delete')} onClick={() => setBeats(beats.filter((x) => x.id !== b.id))} />
                </header>
                <LazyInput multiline rows={2} value={b.description} placeholder={t('bt.desc.ph')} onCommit={(v) => setBeat(b.id, { description: v })} />
                <div className="beat-pages">
                  <span>{t('bt.target', { p: target })}</span>
                  {actual ? <span className={cx('beat-st', Math.abs(delta) <= tol ? 'ok' : delta < 0 ? 'early' : 'late')}>{t('bt.actual', { p: actual })} · {Math.abs(delta) <= tol ? t('bt.onTime') : delta < 0 ? t('bt.early', { n: -delta }) : t('bt.late', { n: delta })}</span> : <span className="muted">{t('bt.noScene')}</span>}
                </div>
                <ul className="beat-scenes">
                  {b.sceneIds.map((id) => { const s = scenes.find((x) => x.id === id); return s ? <li key={id}><button type="button" className="link" onClick={() => jump(id)}>{s.label}. {s.heading.toUpperCase()}</button><IconBtn small icon="x" title={t('act.remove')} onClick={() => setBeat(b.id, { sceneIds: b.sceneIds.filter((x) => x !== id) })} /></li> : null; })}
                </ul>
                {adding === b.id ? (
                  <select className="select sm" autoFocus value="" onBlur={() => setAdding(null)} onChange={(e) => { if (e.target.value) setBeat(b.id, { sceneIds: [...b.sceneIds, e.target.value] }); setAdding(null); }}>
                    <option value="">{t('bt.pickScene')}</option>
                    {scenes.filter((s) => !b.sceneIds.includes(s.id)).map((s) => <option key={s.id} value={s.id}>{s.label}. {s.heading.toUpperCase()} {assigned.has(s.id) ? '•' : ''}</option>)}
                  </select>
                ) : <Button small kind="ghost" icon="plus" onClick={() => setAdding(b.id)}>{t('bt.addScene')}</Button>}
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}
