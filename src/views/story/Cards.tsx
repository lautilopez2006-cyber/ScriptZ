// Index cards: ordered grid (dragging reorders the script) and a free cork board with idea cards.
import { useMemo, useRef, useState, type DragEvent, type PointerEvent } from 'react';
import { useApp } from '../../app/store';
import { getEditor, setView, updateProject } from '../../app/actions';
import { buildScenes, sceneOptions, type SceneInfo } from '../../core/scenes';
import { layoutProject, sceneLengths, eighths } from '../../core/layout';
import { moveScene } from '../../core/story';
import { uid, CARD_COLORS, type CardColor, type IdeaCard } from '../../core/model';
import { t } from '../../i18n';
import { Button, COLOR_HEX, ColorPicker, IconBtn, LazyInput, Segmented, cx } from '../../ui/kit';
import { Icon } from '../../ui/icons';

type Mode = 'grid' | 'board';

function goToScene(id: string) {
  setView('write');
  setTimeout(() => getEditor()?.scrollToBlock(id, { select: true }), 80);
}

function SceneCard({ s, i, pages, draggable, onDragStart, onDragOver, onDrop, dropBefore }: { s: SceneInfo; i?: number; pages: number; draggable?: boolean; onDragStart?: (e: DragEvent) => void; onDragOver?: (e: DragEvent) => void; onDrop?: (e: DragEvent) => void; dropBefore?: boolean }) {
  const p = useApp((st) => st.project)!;
  const meta = p.scenes[s.id] ?? {};
  const [editing, setEditing] = useState(false);
  const color = meta.color && meta.color !== 'none' ? COLOR_HEX[meta.color] : 'var(--line-2)';
  const setMeta = (patch: object) => updateProject((x) => ({ ...x, scenes: { ...x.scenes, [s.id]: { ...(x.scenes[s.id] ?? {}), ...patch } } }));
  return (
    <article className={cx('icard', dropBefore && 'drop-before', s.omitted && 'omitted')} draggable={draggable} onDragStart={onDragStart} onDragOver={onDragOver} onDrop={onDrop} style={{ ['--cc' as string]: color, ['--i' as string]: Math.min(i ?? 0, 24) }}>
      <header>
        <span className="icard-num">{s.label}</span>
        <b className="icard-h" title={s.heading}>{s.heading.toUpperCase() || '—'}</b>
        <IconBtn small icon="pen" title={t('cd.open')} onClick={() => goToScene(s.id)} />
      </header>
      {editing ? (
        <LazyInput multiline rows={4} autoFocus value={meta.summary ?? ''} placeholder={t('sn.summary.ph')} onCommit={(v) => { setMeta({ summary: v }); setEditing(false); }} />
      ) : (
        <p className={cx('icard-sum', !meta.summary && 'muted')} onDoubleClick={() => setEditing(true)} title={t('cd.editHint')}>{meta.summary || t('cd.noSummary')}</p>
      )}
      <footer>
        <span className="chips">{s.speakers.slice(0, 4).map((n) => <span key={n} className="who" title={n}>{n.slice(0, 2)}</span>)}{s.speakers.length > 4 ? <span className="who">+{s.speakers.length - 4}</span> : null}</span>
        <span className="muted small">{eighths(pages)} {t('w.page').toLowerCase()}</span>
        <div className="icard-colors">{CARD_COLORS.slice(0, 7).map((c) => <button key={c} type="button" aria-label={t('clr.' + c)} title={t('clr.' + c)} className={cx('dot', meta.color === c && 'on')} style={{ background: c === 'none' ? 'var(--panel)' : COLOR_HEX[c] }} onClick={() => setMeta({ color: c })} />)}</div>
      </footer>
    </article>
  );
}

function Board({ scenes, lengths }: { scenes: SceneInfo[]; lengths: Map<string, number> }) {
  const p = useApp((s) => s.project)!;
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ kind: 'scene' | 'idea'; id: string; dx: number; dy: number; x: number; y: number } | null>(null);
  const pos = (kind: 'scene' | 'idea', id: string, i: number) => {
    if (drag && drag.id === id) return { x: drag.x, y: drag.y };
    if (kind === 'idea') { const c = p.cards[id]; return { x: c.x, y: c.y }; }
    const m = p.scenes[id]?.card;
    return m ?? { x: 24 + (i % 5) * 250, y: 24 + Math.floor(i / 5) * 200 };
  };
  const start = (e: PointerEvent, kind: 'scene' | 'idea', id: string, i: number) => {
    if ((e.target as HTMLElement).closest('button,textarea,input')) return;
    const cur = pos(kind, id, i);
    const box = ref.current!.getBoundingClientRect();
    setDrag({ kind, id, dx: e.clientX - box.left + ref.current!.scrollLeft - cur.x, dy: e.clientY - box.top + ref.current!.scrollTop - cur.y, x: cur.x, y: cur.y });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent) => {
    if (!drag) return;
    const box = ref.current!.getBoundingClientRect();
    setDrag({ ...drag, x: Math.max(0, e.clientX - box.left + ref.current!.scrollLeft - drag.dx), y: Math.max(0, e.clientY - box.top + ref.current!.scrollTop - drag.dy) });
  };
  const end = () => {
    if (!drag) return;
    const { kind, id, x, y } = drag;
    setDrag(null);
    if (kind === 'idea') updateProject((q) => ({ ...q, cards: { ...q.cards, [id]: { ...q.cards[id], x, y } } }));
    else updateProject((q) => ({ ...q, scenes: { ...q.scenes, [id]: { ...(q.scenes[id] ?? {}), card: { x, y } } } }));
  };
  const addIdea = (x = 40, y = 40) => {
    const id = uid();
    const c: IdeaCard = { id, title: t('cd.newIdea'), text: '', color: 'yellow', x, y };
    updateProject((q) => ({ ...q, cards: { ...q.cards, [id]: c } }));
  };
  const setIdea = (id: string, patch: Partial<IdeaCard>) => updateProject((q) => ({ ...q, cards: { ...q.cards, [id]: { ...q.cards[id], ...patch } } }));
  return (
    <div className="board" ref={ref} onPointerMove={move} onPointerUp={end} onPointerCancel={end}
      onDoubleClick={(e) => { if (e.target === ref.current || (e.target as HTMLElement).classList.contains('board-canvas')) { const box = ref.current!.getBoundingClientRect(); addIdea(e.clientX - box.left + ref.current!.scrollLeft - 100, e.clientY - box.top + ref.current!.scrollTop - 30); } }}>
      <div className="board-canvas">
        {scenes.map((s, i) => {
          const at = pos('scene', s.id, i);
          return <div key={s.id} className={cx('board-item', drag?.id === s.id && 'dragging')} style={{ left: at.x, top: at.y }} onPointerDown={(e) => start(e, 'scene', s.id, i)}><SceneCard s={s} pages={lengths.get(s.id) ?? 0} /></div>;
        })}
        {Object.values(p.cards).map((c) => {
          const at = pos('idea', c.id, 0);
          return (
            <div key={c.id} className={cx('board-item idea', drag?.id === c.id && 'dragging')} style={{ left: at.x, top: at.y, ['--cc' as string]: COLOR_HEX[c.color] }} onPointerDown={(e) => start(e, 'idea', c.id, 0)}>
              <article className="icard idea-card">
                <header><Icon name="star" size={14} /><LazyInput className="idea-title" value={c.title} onCommit={(v) => setIdea(c.id, { title: v })} /><IconBtn small icon="trash" title={t('act.delete')} onClick={() => updateProject((q) => { const cards = { ...q.cards }; delete cards[c.id]; return { ...q, cards }; })} /></header>
                <LazyInput multiline rows={3} value={c.text} placeholder={t('cd.ideaPh')} onCommit={(v) => setIdea(c.id, { text: v })} />
                <ColorPicker value={c.color} onChange={(col: CardColor) => setIdea(c.id, { color: col })} />
              </article>
            </div>
          );
        })}
      </div>
      <div className="board-hint muted small">{t('cd.boardHint')}</div>
      <Button className="board-add" kind="primary" icon="plus" onClick={() => addIdea(ref.current!.scrollLeft + 60, ref.current!.scrollTop + 60)}>{t('cd.addIdea')}</Button>
    </div>
  );
}

export default function CardsView() {
  const p = useApp((s) => s.project)!;
  const [mode, setMode] = useState<Mode>('grid');
  const [colorFilter, setColorFilter] = useState<CardColor | ''>('');
  const [over, setOver] = useState<string | null>(null);
  const dragId = useRef<string | null>(null);
  const scenes = useMemo(() => buildScenes(p.blocks, sceneOptions(p)), [p.blocks, p.template, p.revisions.scenesLocked]);
  const lengths = useMemo(() => sceneLengths(layoutProject(p), p.blocks), [p.blocks, p.template, p.page.paper]);
  const visible = scenes.filter((s) => !colorFilter || (p.scenes[s.id]?.color ?? 'none') === colorFilter);
  const drop = (beforeId: string | null) => {
    const id = dragId.current;
    dragId.current = null;
    setOver(null);
    if (!id || id === beforeId) return;
    updateProject((q) => ({ ...q, blocks: moveScene(q.blocks, id, beforeId) }));
  };
  return (
    <div className="view cards-view">
      <header className="view-h">
        <h2>{t('nav.cards')}</h2>
        <Segmented value={mode} onChange={setMode} options={[{ value: 'grid', label: <><Icon name="grid" size={14} /> {t('cd.grid')}</> }, { value: 'board', label: <><Icon name="cards" size={14} /> {t('cd.board')}</> }]} />
        <span className="grow" />
        <select className="select sm" value={colorFilter} onChange={(e) => setColorFilter(e.target.value as CardColor | '')} aria-label={t('w.color')}>
          <option value="">{t('cd.allColors')}</option>
          {CARD_COLORS.map((c) => <option key={c} value={c}>{t('clr.' + c)}</option>)}
        </select>
        <span className="muted small">{scenes.length} {t('w.scenes').toLowerCase()}</span>
      </header>
      {mode === 'grid' ? (
        <div className="view-b">
          {!scenes.length ? <p className="muted">{t('nv.noScenes')}</p> : null}
          <p className="muted small">{t('cd.gridHint')}</p>
          <div className="card-grid" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); if (!over) drop(null); }}>
            {visible.map((s, i) => (
              <SceneCard key={s.id} i={i} s={s} pages={lengths.get(s.id) ?? 0} draggable={!colorFilter} dropBefore={over === s.id}
                onDragStart={(e) => { dragId.current = s.id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', s.id); }}
                onDragOver={(e) => { e.preventDefault(); setOver(s.id); }}
                onDrop={(e) => { e.preventDefault(); e.stopPropagation(); drop(s.id); }} />
            ))}
            {visible.length && !colorFilter ? <div className={cx('icard end-slot', over === '__end' && 'drop-before')} onDragOver={(e) => { e.preventDefault(); setOver('__end'); }} onDrop={(e) => { e.preventDefault(); e.stopPropagation(); drop(null); }}>{t('cd.toEnd')}</div> : null}
          </div>
        </div>
      ) : <Board scenes={visible} lengths={lengths} />}
    </div>
  );
}
