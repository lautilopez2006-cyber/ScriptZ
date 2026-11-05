// Production: breakdown sheets & elements, stripboard, call sheets and budget.
import { useMemo, useRef, useState } from 'react';
import { useApp, openModal } from '../../app/store';
import { getEditor, setView, updateProject } from '../../app/actions';
import { BREAKDOWN_CATEGORIES, uid, type BreakdownCategory, type BudgetLine, type CallSheet, type Project, type ShootDay } from '../../core/model';
import { breakdown, budgetTotals, CATEGORY_HEX, plannedDays, stripColor, type SceneBreakdown } from '../../core/production';
import { buildScenes, characterName } from '../../core/scenes';
import { eighths, layoutProject, sceneLengths } from '../../core/layout';
import { saveCsv } from '../../io/exporters';
import { esc } from '../../io/xml';
import { t, fmtNum, fmtDate } from '../../i18n';
import { Button, Empty, Field, IconBtn, LazyInput, NumberInput, Tabs, cx } from '../../ui/kit';

type Tab = 'breakdown' | 'elements' | 'strips' | 'calls' | 'budget';

function printHtml(title: string, body: string, landscape = false) {
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;width:1px;height:1px;right:0;bottom:0;border:0;opacity:0';
  document.body.appendChild(frame);
  const d = frame.contentDocument!;
  d.open();
  d.write(`<!doctype html><meta charset="utf-8"><title>${esc(title)}</title><style>@page{size:${landscape ? 'landscape' : 'portrait'};margin:12mm}body{font:11px/1.35 system-ui,Arial,sans-serif;color:#111}h1{font-size:16px;margin:0 0 6px}h2{font-size:13px;margin:12px 0 4px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #bbb;padding:3px 5px;text-align:left;vertical-align:top}th{background:#f0f0f0}.sheet{page-break-after:always;border:2px solid #333;padding:8px;margin-bottom:10px}.cats{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}.cat{border:1px solid #999;min-height:54px;padding:4px}.cat b{display:block;border-bottom:2px solid var(--c);margin-bottom:3px}.strip td{border-color:#888}</style>${body}`);
  d.close();
  setTimeout(() => { try { frame.contentWindow!.focus(); frame.contentWindow!.print(); } catch { /* ignore */ } setTimeout(() => frame.remove(), 60000); }, 300);
}

function jumpTo(id: string) { setView('write'); setTimeout(() => getEditor()?.scrollToBlock(id, { select: true }), 80); }

function BreakdownTab({ rows }: { rows: SceneBreakdown[] }) {
  const p = useApp((s) => s.project)!;
  const [sel, setSel] = useState(rows[0]?.scene.id ?? '');
  const row = rows.find((r) => r.scene.id === sel) ?? rows[0];
  const [adding, setAdding] = useState<BreakdownCategory | null>(null);
  const [newName, setNewName] = useState('');
  if (!rows.length) return <Empty icon="clapper" title={t('pd.noScenes')}>{t('nv.noScenes')}</Empty>;
  const meta = p.scenes[row.scene.id] ?? {};
  const setMeta = (patch: object) => updateProject((x) => ({ ...x, scenes: { ...x.scenes, [row.scene.id]: { ...(x.scenes[row.scene.id] ?? {}), ...patch } } }));
  const addElement = (cat: BreakdownCategory, name: string) => {
    if (!name.trim()) return;
    updateProject((x) => {
      const ex = Object.values(x.breakdown.elements).find((e) => e.category === cat && e.name.toLowerCase() === name.trim().toLowerCase());
      const id = ex?.id ?? uid();
      const elements = ex ? x.breakdown.elements : { ...x.breakdown.elements, [id]: { id, category: cat, name: name.trim(), notes: '' } };
      const cur = x.scenes[row.scene.id]?.elements ?? [];
      return { ...x, breakdown: { elements }, scenes: { ...x.scenes, [row.scene.id]: { ...(x.scenes[row.scene.id] ?? {}), elements: cur.includes(id) ? cur : [...cur, id] } } };
    });
    setNewName(''); setAdding(null);
  };
  const removeManual = (id: string) => setMeta({ elements: (meta.elements ?? []).filter((x) => x !== id) });
  const print = () => printHtml(`${p.title} — ${t('pd.breakdown')}`, rows.map((r) => `<div class="sheet"><h1>${esc(p.title)} · ${t('w.scene')} ${esc(r.scene.label)}</h1><table><tr><th>${t('w.scene')}</th><td>${esc(r.scene.label)}</td><th>INT/EXT</th><td>${r.scene.parsed.intExt.toUpperCase()}</td><th>${t('w.day')}/${t('w.night')}</th><td>${esc(r.scene.parsed.time)}</td><th>${t('w.pages')}</th><td>${eighths(r.pages)}</td></tr><tr><th>${t('st.location')}</th><td colspan="7">${esc(r.scene.parsed.location)}</td></tr><tr><th>${t('w.summary')}</th><td colspan="7">${esc(p.scenes[r.scene.id]?.summary ?? '')}</td></tr></table><div class="cats">${[`<div class="cat" style="--c:${CATEGORY_HEX.cast}"><b>${t('pd.cat.cast')}</b>${r.cast.map(esc).join('<br>')}</div>`, ...BREAKDOWN_CATEGORIES.filter((c) => c !== 'cast' && r.elements.get(c)?.length).map((c) => `<div class="cat" style="--c:${CATEGORY_HEX[c]}"><b>${t('pd.cat.' + c)}</b>${(r.elements.get(c) ?? []).map((e) => esc(e.name)).join('<br>')}</div>`)].join('')}</div>${p.scenes[r.scene.id]?.prodNotes ? `<h2>${t('w.notes')}</h2><p>${esc(p.scenes[r.scene.id]!.prodNotes!)}</p>` : ''}</div>`).join(''));
  const manual = new Set(meta.elements ?? []);
  return (
    <div className="bd">
      <aside className="bd-list">
        {rows.map((r) => (
          <button key={r.scene.id} type="button" className={cx('bd-item', r.scene.id === row.scene.id && 'on')} onClick={() => setSel(r.scene.id)}>
            <span className="strip-chip" style={{ background: stripColor(r.scene).bg, color: stripColor(r.scene).ink }}>{r.scene.label}</span>
            <span className="grow"><b>{r.scene.heading.toUpperCase()}</b><small>{eighths(r.pages)} · {[...r.elements.values()].reduce((a, l) => a + l.length, 0) + r.cast.length} {t('pd.elements').toLowerCase()}</small></span>
          </button>
        ))}
      </aside>
      <div className="bd-sheet">
        <div className="row between"><h3>{t('w.scene')} {row.scene.label} · {row.scene.heading.toUpperCase()}</h3><div className="row"><Button small icon="pen" onClick={() => jumpTo(row.scene.id)}>{t('cd.open')}</Button><Button small icon="printer" onClick={print}>{t('pd.printSheets')}</Button></div></div>
        <div className="bd-head">
          <span><b>INT/EXT</b> {row.scene.parsed.intExt.toUpperCase() || '—'}</span>
          <span><b>{t('st.location')}</b> {row.scene.parsed.location || '—'}</span>
          <span><b>{t('st.time')}</b> {row.scene.parsed.time || '—'}</span>
          <span><b>{t('w.pages')}</b> {eighths(row.pages)}</span>
          <span><b>{t('pd.hours')}</b> <NumberInput value={meta.shootHours ?? 0} step={0.5} min={0} onChange={(v) => setMeta({ shootHours: v })} /></span>
        </div>
        <p className="muted">{meta.summary || t('cd.noSummary')}</p>
        <div className="bd-cats">
          <div className="bd-cat" style={{ ['--cat' as string]: CATEGORY_HEX.cast }}><b>{t('pd.cat.cast')}</b>{row.cast.map((c) => <span key={c} className="el">{c}</span>)}{!row.cast.length ? <small className="muted">—</small> : null}</div>
          {BREAKDOWN_CATEGORIES.filter((c) => c !== 'cast').map((c) => (
            <div key={c} className="bd-cat" style={{ ['--cat' as string]: CATEGORY_HEX[c] }}>
              <b>{t('pd.cat.' + c)}</b>
              {(row.elements.get(c) ?? []).map((e) => <span key={e.id} className="el" title={e.notes}>{e.name}{manual.has(e.id) ? <button type="button" aria-label={t('act.remove')} onClick={() => removeManual(e.id)}>×</button> : null}</span>)}
              {adding === c ? <input className="input sm" autoFocus value={newName} placeholder={t('pd.elementName')} onChange={(e) => setNewName(e.target.value)} onBlur={() => { addElement(c, newName); }} onKeyDown={(e) => { if (e.key === 'Enter') addElement(c, newName); if (e.key === 'Escape') setAdding(null); }} /> : <button type="button" className="add-el" onClick={() => setAdding(c)}>+</button>}
            </div>
          ))}
        </div>
        <Field label={t('pd.prodNotes')}><LazyInput multiline rows={3} value={meta.prodNotes ?? ''} onCommit={(v) => setMeta({ prodNotes: v })} /></Field>
        <p className="muted small">{t('pd.tagHint')}</p>
      </div>
    </div>
  );
}

function ElementsTab({ rows }: { rows: SceneBreakdown[] }) {
  const p = useApp((s) => s.project)!;
  const [cat, setCat] = useState<BreakdownCategory | ''>('');
  const count = new Map<string, string[]>();
  for (const r of rows) for (const list of r.elements.values()) for (const e of list) count.set(e.id, [...(count.get(e.id) ?? []), r.scene.label]);
  const list = Object.values(p.breakdown.elements).filter((e) => !cat || e.category === cat).sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  const set = (id: string, patch: object) => updateProject((x) => ({ ...x, breakdown: { elements: { ...x.breakdown.elements, [id]: { ...x.breakdown.elements[id], ...patch } } } }));
  const remove = (id: string) => {
    getEditor()?.stripMark('tag', id);
    updateProject((x) => {
      const elements = { ...x.breakdown.elements };
      delete elements[id];
      const scenes = Object.fromEntries(Object.entries(x.scenes).map(([k, v]) => [k, v.elements ? { ...v, elements: v.elements.filter((e) => e !== id) } : v]));
      const blocks = x.blocks.map((b) => (b.marks?.some((m) => m.k === 'tag' && m.v === id) ? { ...b, marks: b.marks.filter((m) => !(m.k === 'tag' && m.v === id)) } : b));
      return { ...x, blocks, scenes, breakdown: { elements } };
    });
  };
  return (
    <div>
      <div className="row"><select className="select sm" value={cat} onChange={(e) => setCat(e.target.value as BreakdownCategory | '')}><option value="">{t('w.all')}</option>{BREAKDOWN_CATEGORIES.map((c) => <option key={c} value={c}>{t('pd.cat.' + c)}</option>)}</select>
        <Button small icon="download" onClick={() => saveCsv(`${p.title || 'guion'}-desglose.csv`, [[t('pd.category'), t('w.name'), t('w.scenes'), t('w.notes')], ...list.map((e) => [t('pd.cat.' + e.category), e.name, (count.get(e.id) ?? []).join(' '), e.notes])])}>CSV</Button></div>
      {!list.length ? <Empty icon="tag" title={t('pd.noElements')}>{t('pd.tagHint')}</Empty> : (
        <table className="tbl mt"><thead><tr><th>{t('pd.category')}</th><th>{t('w.name')}</th><th>{t('w.scenes')}</th><th>{t('w.notes')}</th><th /></tr></thead><tbody>
          {list.map((e) => (
            <tr key={e.id}>
              <td><select className="select sm" value={e.category} onChange={(ev) => set(e.id, { category: ev.target.value })}>{BREAKDOWN_CATEGORIES.map((c) => <option key={c} value={c}>{t('pd.cat.' + c)}</option>)}</select></td>
              <td><LazyInput value={e.name} onCommit={(v) => set(e.id, { name: v })} /></td>
              <td>{(count.get(e.id) ?? []).join(', ') || '—'}</td>
              <td><LazyInput value={e.notes} onCommit={(v) => set(e.id, { notes: v })} /></td>
              <td><IconBtn small icon="trash" title={t('act.delete')} onClick={() => remove(e.id)} /></td>
            </tr>
          ))}
        </tbody></table>
      )}
    </div>
  );
}

function castNumbers(p: Project): Map<string, number> {
  const out = new Map<string, number>();
  const profiles = Object.values(p.characters);
  let next = Math.max(0, ...profiles.map((c) => c.castNumber ?? 0)) + 1;
  const names: string[] = [];
  for (const b of p.blocks) if (b.type === 'character') { const n = characterName(b.text); if (n && !names.includes(n)) names.push(n); }
  for (const n of names) {
    const pr = profiles.find((c) => c.name === n);
    out.set(n, pr?.castNumber ?? next++);
  }
  return out;
}

function StripsTab({ lengths }: { lengths: Map<string, number> }) {
  const p = useApp((s) => s.project)!;
  const scenes = useMemo(() => buildScenes(p.blocks), [p.blocks]);
  const byId = new Map(scenes.map((s) => [s.id, s]));
  const plan = plannedDays(p, lengths);
  const cast = castNumbers(p);
  const drag = useRef<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  // Normalised order: days with their scenes, then unscheduled.
  const order: string[] = [];
  for (const d of plan.days) { order.push('day:' + d.dayId); order.push(...d.scenes); }
  const setOrder = (o: string[]) => updateProject((x) => ({ ...x, schedule: { ...x.schedule, order: o } }));
  const moveBefore = (item: string, before: string | null) => {
    const base = order.filter((x) => x !== item);
    if (before === '__unsched') { setOrder(base); return; }
    const i = before ? base.indexOf(before) : base.length;
    base.splice(i < 0 ? base.length : i, 0, item);
    setOrder(base);
  };
  const addDay = () => {
    const id = uid();
    const n = Object.keys(p.schedule.days).length + 1;
    const d: ShootDay = { id, date: '', label: t('pd.dayN', { n }), callTime: '07:00', notes: '' };
    updateProject((x) => ({ ...x, schedule: { order: [...order, 'day:' + id], days: { ...x.schedule.days, [id]: d } } }));
  };
  const autoPlan = () => openModal('confirm', {
    title: t('pd.auto'), text: t('pd.auto.t'), confirmLabel: t('act.apply'),
    onConfirm: () => updateProject((x) => {
      // Group by location then day/night; ~5 pages per shooting day.
      const list = scenes.filter((s) => !s.omitted).slice().sort((a, b) => a.parsed.location.localeCompare(b.parsed.location) || a.parsed.dayNight.localeCompare(b.parsed.dayNight) || a.index - b.index);
      const days: Record<string, ShootDay> = {};
      const out: string[] = [];
      let acc = 99, n = 0;
      for (const s of list) {
        const len = lengths.get(s.id) ?? 0;
        if (acc + len > 5.25) { const id = uid(); n++; days[id] = { id, date: '', label: t('pd.dayN', { n }), callTime: '07:00', notes: '' }; out.push('day:' + id); acc = 0; }
        out.push(s.id); acc += len;
      }
      return { ...x, schedule: { order: out, days } };
    }),
  });
  const setDay = (id: string, patch: Partial<ShootDay>) => updateProject((x) => ({ ...x, schedule: { ...x.schedule, days: { ...x.schedule.days, [id]: { ...x.schedule.days[id], ...patch } } } }));
  const strip = (id: string) => {
    const s = byId.get(id);
    if (!s) return null;
    const c = stripColor(s);
    const nums = s.speakers.map((n) => cast.get(n)).filter(Boolean).sort((a, b) => a! - b!).join(',');
    return (
      <div key={id} className={cx('strip', over === id && 'drop-before')} draggable onDragStart={(e) => { drag.current = id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', id); }} onDragOver={(e) => { e.preventDefault(); setOver(id); }} onDrop={(e) => { e.preventDefault(); e.stopPropagation(); if (drag.current) moveBefore(drag.current, id); drag.current = null; setOver(null); }} style={{ background: c.bg, color: c.ink }}>
        <span className="s-num">{s.label}</span><span className="s-ie">{c.key}</span><span className="s-loc">{s.parsed.location || s.heading.toUpperCase()}</span><span className="s-sum">{p.scenes[s.id]?.summary ?? ''}</span><span className="s-cast" title={s.speakers.join(', ')}>{nums}</span><span className="s-pg">{eighths(lengths.get(s.id) ?? 0)}</span>
      </div>
    );
  };
  const exportCsv = () => saveCsv(`${p.title || 'guion'}-plan.csv`, [[t('pd.day'), t('w.date'), t('w.scene'), 'I/E', t('st.location'), t('w.pages'), t('pd.cast')], ...plan.days.flatMap((d) => d.scenes.map((id) => { const s = byId.get(id)!; return [p.schedule.days[d.dayId!]?.label ?? '', p.schedule.days[d.dayId!]?.date ?? '', s.label, stripColor(s).key, s.parsed.location, eighths(lengths.get(id) ?? 0), s.speakers.join(' / ')]; }))]);
  const print = () => printHtml(`${p.title} — ${t('pd.strips')}`, `<h1>${esc(p.title)} — ${t('pd.strips')}</h1>${plan.days.map((d) => { const day = p.schedule.days[d.dayId!]; return `<h2>${esc(day?.label ?? '')} ${day?.date ? '· ' + esc(day.date) : ''} · ${eighths(d.pages)} ${t('w.pages').toLowerCase()}</h2><table class="strip">${d.scenes.map((id) => { const s = byId.get(id)!; const c = stripColor(s); return `<tr style="background:${c.bg};color:${c.ink}"><td>${esc(s.label)}</td><td>${c.key}</td><td>${esc(s.parsed.location)}</td><td>${esc(p.scenes[id]?.summary ?? '')}</td><td>${eighths(lengths.get(id) ?? 0)}</td></tr>`; }).join('')}</table>`; }).join('')}`, true);
  return (
    <div className="strips">
      <div className="row"><Button small icon="plus" onClick={addDay}>{t('pd.addDay')}</Button><Button small icon="wand" onClick={autoPlan}>{t('pd.auto')}</Button><span className="grow" /><Button small icon="download" onClick={exportCsv}>CSV</Button><Button small icon="printer" onClick={print}>{t('act.print')}</Button></div>
      <div className="strip-legend muted small"><span className="strip-chip" style={{ background: '#fff', color: '#222' }}>INT/D</span><span className="strip-chip" style={{ background: '#ffe066', color: '#222' }}>EXT/D</span><span className="strip-chip" style={{ background: '#1e56b4', color: '#fff' }}>INT/N</span><span className="strip-chip" style={{ background: '#2e7d32', color: '#fff' }}>EXT/N</span> · {t('pd.stripHint')}</div>
      <div className="board-strips" onDragOver={(e) => e.preventDefault()}>
        {plan.days.map((d) => {
          const day = p.schedule.days[d.dayId!];
          return (
            <section key={d.dayId} className="day">
              <header className={cx('day-h', over === 'day:' + d.dayId && 'drop-before')} onDragOver={(e) => { e.preventDefault(); setOver('day:' + d.dayId); }} onDrop={(e) => { e.preventDefault(); if (drag.current) { const base = order.filter((x) => x !== drag.current); base.splice(base.indexOf('day:' + d.dayId) + 1, 0, drag.current); setOrder(base); } drag.current = null; setOver(null); }}>
                <LazyInput className="day-label" value={day.label} onCommit={(v) => setDay(day.id, { label: v })} />
                <input className="input sm" type="date" value={day.date} onChange={(e) => setDay(day.id, { date: e.target.value })} aria-label={t('w.date')} />
                <input className="input sm" type="time" value={day.callTime} onChange={(e) => setDay(day.id, { callTime: e.target.value })} aria-label={t('pd.call')} />
                <span className="muted small">{eighths(d.pages)} {t('w.pages').toLowerCase()} · {d.scenes.length} {t('w.scenes').toLowerCase()}</span>
                <span className="grow" />
                <IconBtn small icon="clipboard" title={t('pd.callSheet')} onClick={() => openModal('callsheet', { dayId: day.id })} />
                <IconBtn small icon="trash" title={t('act.delete')} onClick={() => updateProject((x) => { const days = { ...x.schedule.days }; delete days[day.id]; return { ...x, schedule: { order: x.schedule.order.filter((o) => o !== 'day:' + day.id), days } }; })} />
              </header>
              {d.scenes.map(strip)}
            </section>
          );
        })}
        <section className="day unsched" onDragOver={(e) => { e.preventDefault(); setOver('__unsched'); }} onDrop={(e) => { e.preventDefault(); if (drag.current) moveBefore(drag.current, '__unsched'); drag.current = null; setOver(null); }}>
          <header className="day-h"><b>{t('pd.unscheduled')}</b><span className="muted small">{plan.unscheduled.length}</span></header>
          {plan.unscheduled.map(strip)}
          {!plan.days.length ? <p className="muted small pad">{t('pd.noDays')}</p> : null}
        </section>
      </div>
    </div>
  );
}

export function CallSheetEditor({ dayId, onClose }: { dayId: string; onClose?: () => void }) {
  const p = useApp((s) => s.project)!;
  const lengths = useMemo(() => sceneLengths(layoutProject(p), p.blocks), [p.blocks]);
  const scenes = useMemo(() => buildScenes(p.blocks), [p.blocks]);
  const plan = plannedDays(p, lengths);
  const d = plan.days.find((x) => x.dayId === dayId);
  const day = p.schedule.days[dayId];
  const sheet: CallSheet = Object.values(p.callSheets).find((c) => c.dayId === dayId) ?? { id: '', dayId, generalCall: day?.callTime ?? '07:00', crewCall: day?.callTime ?? '07:00', location: '', parking: '', hospital: '', weather: '', notes: '', contacts: '', cast: {} };
  const set = (patch: Partial<CallSheet>) => updateProject((x) => {
    const id = sheet.id || uid();
    return { ...x, callSheets: { ...x.callSheets, [id]: { ...sheet, id, ...patch } } };
  });
  if (!day || !d) return <p className="muted">{t('pd.noDays')}</p>;
  const dayScenes = d.scenes.map((id) => scenes.find((s) => s.id === id)!).filter(Boolean);
  const castNames = [...new Set(dayScenes.flatMap((s) => s.speakers))];
  const nums = castNumbers(p);
  const actor = (n: string) => Object.values(p.characters).find((c) => c.name === n)?.actor ?? '';
  const print = () => printHtml(`${p.title} — ${day.label}`, `<h1>${esc(p.title)} — ${t('pd.callSheet')}</h1><table><tr><th>${t('pd.day')}</th><td>${esc(day.label)}</td><th>${t('w.date')}</th><td>${esc(day.date ? fmtDate(day.date + 'T12:00:00', { dateStyle: 'full' }) : '')}</td></tr><tr><th>${t('pd.generalCall')}</th><td>${esc(sheet.generalCall)}</td><th>${t('pd.crewCall')}</th><td>${esc(sheet.crewCall)}</td></tr><tr><th>${t('st.location')}</th><td>${esc(sheet.location)}</td><th>${t('pd.parking')}</th><td>${esc(sheet.parking)}</td></tr><tr><th>${t('pd.hospital')}</th><td>${esc(sheet.hospital)}</td><th>${t('pd.weather')}</th><td>${esc(sheet.weather)}</td></tr></table><h2>${t('w.scenes')}</h2><table><tr><th>#</th><th>I/E</th><th>${t('st.location')}</th><th>${t('w.summary')}</th><th>${t('pd.cast')}</th><th>${t('w.pages')}</th></tr>${dayScenes.map((s) => `<tr><td>${esc(s.label)}</td><td>${stripColor(s).key}</td><td>${esc(s.parsed.location)}</td><td>${esc(p.scenes[s.id]?.summary ?? '')}</td><td>${s.speakers.map((n) => nums.get(n)).join(', ')}</td><td>${eighths(lengths.get(s.id) ?? 0)}</td></tr>`).join('')}</table><h2>${t('pd.cast')}</h2><table><tr><th>#</th><th>${t('w.characters')}</th><th>${t('ch.actor')}</th><th>${t('pd.pickup')}</th><th>${t('pd.makeup')}</th><th>${t('pd.onSet')}</th></tr>${castNames.map((n) => `<tr><td>${nums.get(n)}</td><td>${esc(n)}</td><td>${esc(actor(n))}</td><td>${esc(sheet.cast[n]?.pickup ?? '')}</td><td>${esc(sheet.cast[n]?.makeup ?? '')}</td><td>${esc(sheet.cast[n]?.onSet ?? '')}</td></tr>`).join('')}</table>${sheet.notes ? `<h2>${t('w.notes')}</h2><p>${esc(sheet.notes)}</p>` : ''}${sheet.contacts ? `<h2>${t('pd.contacts')}</h2><p>${esc(sheet.contacts).replace(/\n/g, '<br>')}</p>` : ''}`);
  return (
    <div className="callsheet">
      <div className="row between"><h3>{day.label} {day.date ? '· ' + fmtDate(day.date + 'T12:00:00', { dateStyle: 'long' }) : ''}</h3><div className="row"><Button small icon="printer" onClick={print}>{t('act.print')}</Button>{onClose ? <Button small onClick={onClose}>{t('act.close')}</Button> : null}</div></div>
      <div className="grid4">
        <Field label={t('pd.generalCall')}><input className="input" type="time" value={sheet.generalCall} onChange={(e) => set({ generalCall: e.target.value })} /></Field>
        <Field label={t('pd.crewCall')}><input className="input" type="time" value={sheet.crewCall} onChange={(e) => set({ crewCall: e.target.value })} /></Field>
        <Field label={t('st.location')}><LazyInput value={sheet.location} onCommit={(v) => set({ location: v })} /></Field>
        <Field label={t('pd.weather')}><LazyInput value={sheet.weather} onCommit={(v) => set({ weather: v })} /></Field>
      </div>
      <div className="grid2">
        <Field label={t('pd.parking')}><LazyInput value={sheet.parking} onCommit={(v) => set({ parking: v })} /></Field>
        <Field label={t('pd.hospital')}><LazyInput value={sheet.hospital} onCommit={(v) => set({ hospital: v })} /></Field>
      </div>
      <h4 className="mt">{t('w.scenes')}</h4>
      <table className="tbl"><thead><tr><th>#</th><th>I/E</th><th>{t('st.location')}</th><th>{t('w.summary')}</th><th>{t('w.pages')}</th></tr></thead><tbody>{dayScenes.map((s) => <tr key={s.id}><td>{s.label}</td><td>{stripColor(s).key}</td><td>{s.parsed.location}</td><td>{p.scenes[s.id]?.summary ?? ''}</td><td>{eighths(lengths.get(s.id) ?? 0)}</td></tr>)}</tbody></table>
      <h4 className="mt">{t('pd.cast')}</h4>
      <table className="tbl"><thead><tr><th>#</th><th>{t('w.characters')}</th><th>{t('ch.actor')}</th><th>{t('pd.pickup')}</th><th>{t('pd.makeup')}</th><th>{t('pd.onSet')}</th></tr></thead><tbody>
        {castNames.map((n) => (
          <tr key={n}><td>{nums.get(n)}</td><td>{n}</td><td>{actor(n)}</td>
            {(['pickup', 'makeup', 'onSet'] as const).map((k) => <td key={k}><input className="input sm" type="time" value={sheet.cast[n]?.[k] ?? ''} onChange={(e) => set({ cast: { ...sheet.cast, [n]: { ...{ pickup: '', makeup: '', onSet: '', notes: '' }, ...(sheet.cast[n] ?? {}), [k]: e.target.value } } })} /></td>)}
          </tr>
        ))}
      </tbody></table>
      <div className="grid2 mt">
        <Field label={t('w.notes')}><LazyInput multiline rows={3} value={sheet.notes} onCommit={(v) => set({ notes: v })} /></Field>
        <Field label={t('pd.contacts')}><LazyInput multiline rows={3} value={sheet.contacts} onCommit={(v) => set({ contacts: v })} /></Field>
      </div>
    </div>
  );
}

function CallsTab({ lengths }: { lengths: Map<string, number> }) {
  const p = useApp((s) => s.project)!;
  const plan = plannedDays(p, lengths);
  const [sel, setSel] = useState(plan.days[0]?.dayId ?? '');
  if (!plan.days.length) return <Empty icon="calendar" title={t('pd.noDays')}>{t('pd.noDays.h')}</Empty>;
  return (
    <div>
      <div className="row wrap">{plan.days.map((d) => <Button key={d.dayId} small kind={sel === d.dayId ? 'primary' : 'default'} onClick={() => setSel(d.dayId!)}>{p.schedule.days[d.dayId!]?.label}</Button>)}</div>
      <div className="mt"><CallSheetEditor dayId={sel || plan.days[0].dayId!} /></div>
    </div>
  );
}

function BudgetTab({ rows }: { rows: SceneBreakdown[] }) {
  const p = useApp((s) => s.project)!;
  const tot = budgetTotals(p);
  const cur = p.budget.currency;
  const money = (v: number) => { try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(v); } catch { return `${cur} ${fmtNum(v)}`; } };
  const setLine = (id: string, patch: Partial<BudgetLine>) => updateProject((x) => ({ ...x, budget: { ...x.budget, lines: { ...x.budget.lines, [id]: { ...x.budget.lines[id], ...patch } } } }));
  const add = (section: BudgetLine['section'], description = '', qty = 1, units = 1, unitLabel = t('pd.unit.days'), rate = 0) => {
    const id = uid();
    updateProject((x) => ({ ...x, budget: { ...x.budget, lines: { ...x.budget.lines, [id]: { id, section, account: '', description, qty, units, unitLabel, rate } } } }));
  };
  const suggest = () => {
    const chars = new Set(rows.flatMap((r) => r.cast));
    const days = Math.max(1, Object.keys(p.schedule.days).length);
    const locs = new Set(rows.map((r) => r.scene.parsed.location).filter(Boolean));
    const countCat = (c: BreakdownCategory) => new Set(rows.flatMap((r) => (r.elements.get(c) ?? []).map((e) => e.id))).size;
    add('atl', t('pd.b.writer'), 1, 1, t('pd.unit.flat'));
    add('atl', t('pd.b.director'), 1, days, t('pd.unit.days'));
    add('atl', t('pd.b.cast', { n: chars.size }), chars.size, days, t('pd.unit.days'));
    add('production', t('pd.b.crew'), 12, days, t('pd.unit.days'));
    add('production', t('pd.b.locations', { n: locs.size }), locs.size, days, t('pd.unit.days'));
    if (countCat('extras')) add('production', t('pd.cat.extras'), countCat('extras'), 1, t('pd.unit.flat'));
    if (countCat('props')) add('production', t('pd.cat.props'), countCat('props'), 1, t('pd.unit.flat'));
    if (countCat('wardrobe')) add('production', t('pd.cat.wardrobe'), countCat('wardrobe'), 1, t('pd.unit.flat'));
    if (countCat('vehicles')) add('production', t('pd.cat.vehicles'), countCat('vehicles'), days, t('pd.unit.days'));
    add('production', t('pd.b.equipment'), 1, days, t('pd.unit.days'));
    add('production', t('pd.b.catering'), 20, days, t('pd.unit.days'));
    add('post', t('pd.b.edit'), 1, 20, t('pd.unit.days'));
    add('post', t('pd.b.sound'), 1, 10, t('pd.unit.days'));
    add('post', t('pd.b.color'), 1, 5, t('pd.unit.days'));
    if (countCat('music')) add('post', t('pd.cat.music'), countCat('music'), 1, t('pd.unit.flat'));
    add('other', t('pd.b.insurance'), 1, 1, t('pd.unit.flat'));
  };
  const sections: BudgetLine['section'][] = ['atl', 'production', 'post', 'other'];
  const lines = Object.values(p.budget.lines);
  return (
    <div className="budget">
      <div className="row wrap">
        <Field label={t('pd.currency')} inline><select className="select sm" value={cur} onChange={(e) => updateProject((x) => ({ ...x, budget: { ...x.budget, currency: e.target.value } }))}>{['USD', 'EUR', 'ARS', 'MXN', 'CLP', 'COP', 'BRL', 'PEN', 'UYU', 'GBP'].map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label={t('pd.fringe')} inline><NumberInput value={p.budget.fringePct} min={0} max={100} onChange={(v) => updateProject((x) => ({ ...x, budget: { ...x.budget, fringePct: v } }))} /></Field>
        <Field label={t('pd.contingency')} inline><NumberInput value={p.budget.contingencyPct} min={0} max={100} onChange={(v) => updateProject((x) => ({ ...x, budget: { ...x.budget, contingencyPct: v } }))} /></Field>
        <span className="grow" />
        <Button small icon="wand" onClick={suggest}>{t('pd.b.suggest')}</Button>
        <Button small icon="download" onClick={() => saveCsv(`${p.title || 'guion'}-presupuesto.csv`, [[t('pd.section'), t('pd.account'), t('w.description'), t('pd.qty'), t('pd.units'), t('pd.unit'), t('pd.rate'), t('w.total')], ...lines.map((l) => [t('pd.s.' + l.section), l.account, l.description, l.qty, l.units, l.unitLabel, l.rate, l.qty * l.units * l.rate]), [], ['', '', t('pd.subtotal'), '', '', '', '', tot.subtotal], ['', '', t('pd.fringe'), '', '', '', '', tot.fringe], ['', '', t('pd.contingency'), '', '', '', '', tot.contingency], ['', '', t('w.total'), '', '', '', '', tot.total]])}>CSV</Button>
      </div>
      {sections.map((sec) => (
        <section key={sec} className="card mt">
          <div className="row between"><h3>{t('pd.s.' + sec)}</h3><span><b>{money(tot.sections[sec] ?? 0)}</b> <Button small kind="ghost" icon="plus" onClick={() => add(sec)}>{t('act.add')}</Button></span></div>
          <table className="tbl"><thead><tr><th>{t('pd.account')}</th><th>{t('w.description')}</th><th>{t('pd.qty')}</th><th>{t('pd.units')}</th><th>{t('pd.unit')}</th><th>{t('pd.rate')}</th><th>{t('w.total')}</th><th /></tr></thead><tbody>
            {lines.filter((l) => l.section === sec).map((l) => (
              <tr key={l.id}>
                <td><LazyInput className="acc" value={l.account} onCommit={(v) => setLine(l.id, { account: v })} /></td>
                <td><LazyInput value={l.description} onCommit={(v) => setLine(l.id, { description: v })} /></td>
                <td><NumberInput value={l.qty} min={0} onChange={(v) => setLine(l.id, { qty: v })} /></td>
                <td><NumberInput value={l.units} min={0} onChange={(v) => setLine(l.id, { units: v })} /></td>
                <td><LazyInput className="unit" value={l.unitLabel} onCommit={(v) => setLine(l.id, { unitLabel: v })} /></td>
                <td><NumberInput value={l.rate} min={0} step={10} onChange={(v) => setLine(l.id, { rate: v })} /></td>
                <td className="num-cell">{money(l.qty * l.units * l.rate)}</td>
                <td><IconBtn small icon="trash" title={t('act.delete')} onClick={() => updateProject((x) => { const ls = { ...x.budget.lines }; delete ls[l.id]; return { ...x, budget: { ...x.budget, lines: ls } }; })} /></td>
              </tr>
            ))}
          </tbody></table>
        </section>
      ))}
      <div className="card mt budget-total">
        <div><span>{t('pd.subtotal')}</span><b>{money(tot.subtotal)}</b></div>
        <div><span>{t('pd.fringe')} ({p.budget.fringePct}%)</span><b>{money(tot.fringe)}</b></div>
        <div><span>{t('pd.contingency')} ({p.budget.contingencyPct}%)</span><b>{money(tot.contingency)}</b></div>
        <div className="grand"><span>{t('w.total')}</span><b>{money(tot.total)}</b></div>
      </div>
    </div>
  );
}

export default function ProductionView() {
  const p = useApp((s) => s.project)!;
  const [tab, setTab] = useState<Tab>('breakdown');
  const rows = useMemo(() => breakdown(p), [p.blocks, p.breakdown, p.scenes, p.template, p.page.paper]);
  const lengths = useMemo(() => new Map(rows.map((r) => [r.scene.id, r.pages])), [rows]);
  return (
    <div className="view production-view">
      <header className="view-h">
        <h2>{t('nav.production')}</h2>
        <Tabs value={tab} onChange={setTab} tabs={[{ value: 'breakdown', label: t('pd.breakdown'), icon: 'clipboard' }, { value: 'elements', label: t('pd.elements'), icon: 'tag' }, { value: 'strips', label: t('pd.strips'), icon: 'list' }, { value: 'calls', label: t('pd.calls'), icon: 'calendar' }, { value: 'budget', label: t('pd.budget'), icon: 'dollar' }]} />
      </header>
      <div className={cx('view-b', tab === 'breakdown' && 'flush')}>
        {tab === 'breakdown' ? <BreakdownTab rows={rows} /> : null}
        {tab === 'elements' ? <ElementsTab rows={rows} /> : null}
        {tab === 'strips' ? <StripsTab lengths={lengths} /> : null}
        {tab === 'calls' ? <CallsTab lengths={lengths} /> : null}
        {tab === 'budget' ? <BudgetTab rows={rows} /> : null}
      </div>
    </div>
  );
}
