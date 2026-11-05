// Characters (profiles, stats, emotional arc) and locations.
import { useMemo, useState } from 'react';
import { useApp, openModal, toast } from '../../app/store';
import { getEditor, setView, updateProject } from '../../app/actions';
import { buildScenes, characterName, characterStats, locationsOf } from '../../core/scenes';
import { uid, type CharacterProfile, type Project } from '../../core/model';
import { t, tn, fmtNum } from '../../i18n';
import { Button, COLOR_HEX, ColorPicker, Field, LazyInput, NumberInput, Segmented, cx, Empty } from '../../ui/kit';

function profileFor(p: Project, name: string): CharacterProfile | undefined {
  return Object.values(p.characters).find((c) => c.name.toUpperCase() === name.toUpperCase());
}

function ensureProfile(name: string): string {
  let id = '';
  updateProject((p) => {
    const existing = profileFor(p, name);
    if (existing) { id = existing.id; return p; }
    id = uid();
    const c: CharacterProfile = { id, name: name.toUpperCase(), color: 'none', role: '', bio: '', goal: '', need: '', arc: '', actor: '' };
    return { ...p, characters: { ...p.characters, [id]: c } };
  });
  return id;
}

function ArcChart({ points }: { points: { label: string; v: number; present: boolean }[] }) {
  const W = 640, H = 180, pad = 24;
  if (!points.length) return null;
  const x = (i: number) => pad + (points.length === 1 ? (W - 2 * pad) / 2 : (i * (W - 2 * pad)) / (points.length - 1));
  const y = (v: number) => H / 2 - (v / 5) * (H / 2 - pad);
  const present = points.map((pt, i) => ({ ...pt, i })).filter((pt) => pt.present);
  const d = present.map((pt, k) => `${k ? 'L' : 'M'}${x(pt.i).toFixed(1)} ${y(pt.v).toFixed(1)}`).join(' ');
  return (
    <svg className="arc-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('ch.arc')}>
      <line x1={pad} x2={W - pad} y1={H / 2} y2={H / 2} className="axis" />
      <text x={4} y={pad + 4} className="lbl">+5</text><text x={4} y={H - pad + 4} className="lbl">−5</text>
      {points.map((_, i) => <line key={i} x1={x(i)} x2={x(i)} y1={pad / 2} y2={H - pad / 2} className="grid" />)}
      <path d={d} className="arc draw" pathLength={1} />
      {present.map((pt) => <circle key={pt.i} cx={x(pt.i)} cy={y(pt.v)} r={4.5} className="pt"><title>{`${pt.label}: ${pt.v}`}</title></circle>)}
      {points.map((pt, i) => (points.length <= 40 || i % Math.ceil(points.length / 40) === 0) ? <text key={'l' + i} x={x(i)} y={H - 4} className="lbl" textAnchor="middle">{pt.label}</text> : null)}
    </svg>
  );
}

function CharacterDetail({ name }: { name: string }) {
  const p = useApp((s) => s.project)!;
  const prof = profileFor(p, name);
  const scenes = useMemo(() => buildScenes(p.blocks), [p.blocks]);
  const stats = characterStats(p.blocks).find((c) => c.name === name);
  const present = useMemo(() => {
    const re = new RegExp(`(^|[^\\p{L}])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\p{L}]|$)`, 'iu');
    return new Set(scenes.filter((s) => s.speakers.includes(name) || p.blocks.slice(s.start, s.end).some((b) => b.type === 'action' && re.test(b.text))).map((s) => s.id));
  }, [scenes, name, p.blocks]);
  const set = (patch: Partial<CharacterProfile>) => {
    const id = prof?.id ?? ensureProfile(name);
    updateProject((x) => ({ ...x, characters: { ...x.characters, [id]: { ...x.characters[id], ...patch } } }));
  };
  const setArc = (sceneId: string, v: number) => {
    const id = prof?.id ?? ensureProfile(name);
    updateProject((x) => ({ ...x, scenes: { ...x.scenes, [sceneId]: { ...(x.scenes[sceneId] ?? {}), arcs: { ...(x.scenes[sceneId]?.arcs ?? {}), [id]: v } } } }));
  };
  const points = scenes.map((s) => ({ label: s.label, v: prof ? p.scenes[s.id]?.arcs?.[prof.id] ?? 0 : 0, present: present.has(s.id) }));
  const rename = () => openModal('prompt', {
    title: t('ch.rename'), label: t('ch.rename.l'), value: name,
    onSubmit: (v: string) => {
      const nn = v.trim().toUpperCase();
      if (!nn || nn === name) return;
      let n = 0;
      updateProject((x) => ({
        ...x,
        blocks: x.blocks.map((b) => { if (b.type !== 'character' || characterName(b.text) !== name) return b; n++; return { ...b, text: b.text.replace(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), nn) }; }),
        characters: prof ? { ...x.characters, [prof.id]: { ...x.characters[prof.id], name: nn } } : x.characters,
      }));
      toast(t('ch.renamed', { n }), 'success');
    },
  });
  const first = scenes.find((s) => present.has(s.id));
  const last = [...scenes].reverse().find((s) => present.has(s.id));
  return (
    <div className="ch-detail">
      <header className="row">
        <span className="avatar lg" style={{ background: prof?.color && prof.color !== 'none' ? COLOR_HEX[prof.color] : undefined }}>{name.slice(0, 2)}</span>
        <div className="grow"><h2>{name}</h2><span className="muted">{prof?.role || t('ch.noRole')}</span></div>
        <Button small icon="type" onClick={rename}>{t('ch.rename')}</Button>
        {stats ? <Button small icon="pen" onClick={() => { setView('write'); setTimeout(() => getEditor()?.scrollToBlock(stats.firstBlock, { select: true }), 80); }}>{t('ch.firstAppearance')}</Button> : null}
      </header>
      <div className="cards-row">
        <div className="card stat"><b>{stats?.speeches ?? 0}</b><span>{t('ch.speeches')}</span></div>
        <div className="card stat"><b>{fmtNum(stats?.words ?? 0)}</b><span>{t('ch.words')}</span></div>
        <div className="card stat"><b>{present.size}</b><span>{t('ch.scenes')}</span></div>
        <div className="card stat"><b>{first ? first.label : '—'} → {last ? last.label : '—'}</b><span>{t('ch.span')}</span></div>
      </div>
      <div className="grid2 mt">
        <div className="card">
          <h3>{t('ch.profile')}</h3>
          <div className="grid2">
            <Field label={t('ch.role')}><LazyInput value={prof?.role ?? ''} placeholder={t('ch.role.ph')} onCommit={(v) => set({ role: v })} /></Field>
            <Field label={t('ch.actor')}><LazyInput value={prof?.actor ?? ''} onCommit={(v) => set({ actor: v })} /></Field>
          </div>
          <Field label={t('w.color')}><ColorPicker value={prof?.color ?? 'none'} onChange={(c) => set({ color: c })} /></Field>
          <Field label={t('ch.bio')}><LazyInput multiline rows={3} value={prof?.bio ?? ''} onCommit={(v) => set({ bio: v })} /></Field>
          <div className="grid2">
            <Field label={t('ch.goal')}><LazyInput multiline rows={2} value={prof?.goal ?? ''} placeholder={t('ch.goal.ph')} onCommit={(v) => set({ goal: v })} /></Field>
            <Field label={t('ch.need')}><LazyInput multiline rows={2} value={prof?.need ?? ''} placeholder={t('ch.need.ph')} onCommit={(v) => set({ need: v })} /></Field>
          </div>
          <Field label={t('ch.arcNotes')}><LazyInput multiline rows={2} value={prof?.arc ?? ''} onCommit={(v) => set({ arc: v })} /></Field>
          <Field label={t('ch.cast')}><NumberInput value={prof?.castNumber ?? 0} min={0} onChange={(v) => set({ castNumber: v || undefined })} /></Field>
        </div>
        <div className="card">
          <h3>{t('ch.arc')}</h3>
          <p className="muted small">{t('ch.arc.h')}</p>
          <ArcChart points={points} />
          <div className="arc-edit">
            {scenes.filter((s) => present.has(s.id)).map((s) => (
              <label key={s.id} className="arc-row">
                <span className="num">{s.label}</span><span className="h" title={s.heading}>{s.heading.toUpperCase()}</span>
                <input type="range" min={-5} max={5} step={1} value={prof ? p.scenes[s.id]?.arcs?.[prof.id] ?? 0 : 0} onChange={(e) => setArc(s.id, Number(e.target.value))} aria-label={s.heading} />
                <b>{prof ? p.scenes[s.id]?.arcs?.[prof.id] ?? 0 : 0}</b>
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Locations() {
  const p = useApp((s) => s.project)!;
  const scenes = useMemo(() => buildScenes(p.blocks), [p.blocks]);
  const locs = useMemo(() => locationsOf(scenes), [scenes]);
  const prof = (name: string) => Object.values(p.locations).find((l) => l.name === name);
  const set = (name: string, patch: object) => updateProject((x) => {
    const ex = Object.values(x.locations).find((l) => l.name === name);
    const id = ex?.id ?? uid();
    return { ...x, locations: { ...x.locations, [id]: { id, name, description: '', address: '', notes: '', ...(ex ?? {}), ...patch } } };
  });
  if (!locs.length) return <Empty icon="pin" title={t('nv.locations')}>{t('nv.noScenes')}</Empty>;
  return (
    <table className="tbl locs">
      <thead><tr><th>{t('w.name')}</th><th>{t('w.scenes')}</th><th>INT/EXT</th><th>{t('lc.address')}</th><th>{t('w.notes')}</th></tr></thead>
      <tbody>{locs.map((l) => (
        <tr key={l.name}>
          <td><b>{l.name}</b></td><td>{l.count}</td><td>{l.intExt.toUpperCase()}</td>
          <td><LazyInput value={prof(l.name)?.address ?? ''} placeholder={t('lc.address.ph')} onCommit={(v) => set(l.name, { address: v })} /></td>
          <td><LazyInput value={prof(l.name)?.notes ?? ''} onCommit={(v) => set(l.name, { notes: v })} /></td>
        </tr>
      ))}</tbody>
    </table>
  );
}

export default function CharactersView() {
  const p = useApp((s) => s.project)!;
  const [tab, setTab] = useState<'characters' | 'locations'>('characters');
  const stats = useMemo(() => characterStats(p.blocks), [p.blocks]);
  const names = useMemo(() => [...new Set([...stats.map((s) => s.name), ...Object.values(p.characters).map((c) => c.name)])], [stats, p.characters]);
  const [sel, setSel] = useState<string>(names[0] ?? '');
  const current = names.includes(sel) ? sel : names[0];
  return (
    <div className="view chars-view">
      <header className="view-h">
        <h2>{t('nav.characters')}</h2>
        <Segmented value={tab} onChange={setTab} options={[{ value: 'characters', label: t('w.characters') }, { value: 'locations', label: t('w.locations') }]} />
      </header>
      {tab === 'locations' ? <div className="view-b"><Locations /></div> : (
        <div className="ch-body">
          <aside className="ch-list">
            {names.map((n) => {
              const st = stats.find((s) => s.name === n);
              const pr = profileFor(p, n);
              return (
                <button key={n} type="button" className={cx('ch-item', current === n && 'on')} onClick={() => setSel(n)}>
                  <span className="avatar" style={{ background: pr?.color && pr.color !== 'none' ? COLOR_HEX[pr.color] : undefined }}>{n.slice(0, 2)}</span>
                  <span className="grow"><b>{n}</b><small>{st ? tn('nv.speeches', st.speeches) : t('ch.noSpeech')}</small></span>
                </button>
              );
            })}
            <Button small kind="ghost" icon="plus" onClick={() => openModal('prompt', { title: t('ch.new'), label: t('w.name'), onSubmit: (v: string) => { if (v) { ensureProfile(v); setSel(v.toUpperCase()); } } })}>{t('ch.new')}</Button>
          </aside>
          <div className="view-b">{current ? <CharacterDetail key={current} name={current} /> : <Empty icon="users" title={t('ch.none')}>{t('ch.none.h')}</Empty>}</div>
        </div>
      )}
    </div>
  );
}

