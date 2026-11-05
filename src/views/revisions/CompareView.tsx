// Side-by-side comparison of two versions: both pages aligned paragraph by paragraph, changes highlighted
// word by word, a change map on the right and keyboard navigation between changes.
import { useEffect, useMemo, useRef, useState } from 'react';
import { closeModal, useApp } from '../../app/store';
import type { CompareResult, CompareRow } from '../../core/compare';
import { saveFile } from '../../platform';
import { t, tn, fmtNum } from '../../i18n';
import { Button, IconBtn, Toggle, cx } from '../../ui/kit';
import { Icon } from '../../ui/icons';
import { esc } from '../../io/xml';

type Item = { kind: 'row'; row: CompareRow; i: number } | { kind: 'gap'; from: number; to: number };

const CONTEXT = 2;

function side(r: CompareRow, which: 'a' | 'b') {
  const b = which === 'a' ? r.a : r.b;
  if (!b) return null;
  if (r.kind !== 'mod' || !r.parts) return b.text;
  return r.parts.filter((p) => p.kind === 'same' || p.kind === (which === 'a' ? 'del' : 'add')).map((p, k) => (p.kind === 'same' ? <span key={k}>{p.text}</span> : which === 'a' ? <del key={k}>{p.text}</del> : <ins key={k}>{p.text}</ins>));
}

export default function CompareView({ res, labelA, labelB }: { res: CompareResult; labelA: string; labelB: string }) {
  const title = useApp((s) => s.project?.title ?? '');
  const [onlyChanges, setOnlyChanges] = useState(true);
  const [open, setOpen] = useState<Set<number>>(new Set());
  const [cur, setCur] = useState(-1);
  const body = useRef<HTMLDivElement>(null);
  const changes = useMemo(() => res.rows.map((r, i) => (r.kind !== 'same' ? i : -1)).filter((i) => i >= 0), [res]);
  // Rows to show: every change with a little context; long unchanged runs fold into a gap.
  const items = useMemo<Item[]>(() => {
    if (!onlyChanges) return res.rows.map((row, i) => ({ kind: 'row', row, i }));
    const keep = new Set<number>();
    for (const c of changes) for (let k = c - CONTEXT; k <= c + CONTEXT; k++) keep.add(k);
    const out: Item[] = [];
    let gapStart = -1;
    res.rows.forEach((row, i) => {
      if (keep.has(i) || open.has(i)) {
        if (gapStart >= 0) { out.push({ kind: 'gap', from: gapStart, to: i - 1 }); gapStart = -1; }
        out.push({ kind: 'row', row, i });
      } else if (gapStart < 0) gapStart = i;
    });
    if (gapStart >= 0) out.push({ kind: 'gap', from: gapStart, to: res.rows.length - 1 });
    return out;
  }, [res, onlyChanges, open, changes]);

  const go = (dir: 1 | -1) => {
    if (!changes.length) return;
    const k = cur < 0 ? (dir > 0 ? 0 : changes.length - 1) : Math.max(0, Math.min(changes.length - 1, cur + dir));
    setCur(k);
    body.current?.querySelector(`[data-row="${changes[k]}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal();
      else if (e.key === 'ArrowDown' || e.key === 'j' || e.key === 'n') { e.preventDefault(); go(1); }
      else if (e.key === 'ArrowUp' || e.key === 'k' || e.key === 'p') { e.preventDefault(); go(-1); }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  });

  const exportHtml = async () => {
    const cell = (r: CompareRow, w: 'a' | 'b') => {
      const b = w === 'a' ? r.a : r.b;
      if (!b) return '<td class="empty"></td>';
      const inner = r.kind === 'mod' && r.parts ? r.parts.filter((p) => p.kind === 'same' || p.kind === (w === 'a' ? 'del' : 'add')).map((p) => (p.kind === 'same' ? esc(p.text) : w === 'a' ? `<del>${esc(p.text)}</del>` : `<ins>${esc(p.text)}</ins>`)).join('') : esc(b.text);
      return `<td class="t-${b.type} ${r.kind}">${inner}</td>`;
    };
    const rows = res.rows.filter((r) => !onlyChanges || r.kind !== 'same').map((r) => `<tr><th>${esc(r.sceneLabel)}</th>${cell(r, 'a')}${cell(r, 'b')}</tr>`).join('\n');
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)} — ${esc(labelA)} / ${esc(labelB)}</title><style>
@page{size:landscape;margin:.6in}body{font:11pt/1.4 'Courier Prime','Courier New',monospace;color:#111;margin:24px}h1{font-size:14pt}p.sum{font-family:system-ui;font-size:10pt;color:#555}
table{width:100%;border-collapse:collapse;table-layout:fixed}th{width:44px;font:9pt system-ui;color:#999;vertical-align:top;padding:4px}td{vertical-align:top;padding:4px 10px;white-space:pre-wrap;border-left:1px solid #eee}
thead th{width:auto;text-align:left;color:#333}td.add{background:#ecfbe7}td.del{background:#fff0f0;text-decoration:line-through;color:#a33}td.empty{background:repeating-linear-gradient(135deg,#fafafa 0 6px,#f0f0f0 6px 7px)}
ins{background:#c9f0bd;text-decoration:none}del{background:#ffd0d0;color:#a33}.t-scene{font-weight:bold;text-transform:uppercase}.t-character{padding-left:30%}.t-dialogue{padding-left:12%}.t-parenthetical{padding-left:22%}.t-transition{text-align:right}tr{break-inside:avoid}
</style></head><body><h1>${esc(title)}</h1><p class="sum">${esc(t('rv.cmp.summary', { a: res.added, r: res.removed, m: res.modified, wa: res.wordsAdded, wr: res.wordsRemoved }))}</p>
<table><thead><tr><th></th><th>${esc(labelA)}</th><th>${esc(labelB)}</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
    await saveFile(`${title || 'guion'} - ${t('cv.file')}.html`, html, [{ name: 'HTML', extensions: ['html'] }]);
  };

  const total = res.rows.length || 1;
  return (
    <div className="cv" role="dialog" aria-label={t('rv.compare')}>
      <header className="cv-head">
        <div className="cv-names">
          <span className="cv-name a"><i />{labelA}</span>
          <Icon name="arrowRight" size={16} />
          <span className="cv-name b"><i />{labelB}</span>
        </div>
        <div className="cv-stats">
          <span className="st add"><b>+{fmtNum(res.wordsAdded)}</b>{t('cv.words')}</span>
          <span className="st del"><b>−{fmtNum(res.wordsRemoved)}</b>{t('cv.words')}</span>
          <span className="st"><b>{res.scenesChanged.length}</b>{t('cv.scenes')}</span>
        </div>
        <span className="grow" />
        <Toggle checked={onlyChanges} onChange={setOnlyChanges} label={t('rv.cmp.only')} />
        <div className="cv-nav">
          <IconBtn icon="chevronUp" title={t('cv.prev')} onClick={() => go(-1)} disabled={!changes.length} />
          <span className="muted small">{changes.length ? `${cur < 0 ? '–' : cur + 1} / ${changes.length}` : t('rv.cmp.same')}</span>
          <IconBtn icon="chevronDown" title={t('cv.next')} onClick={() => go(1)} disabled={!changes.length} />
        </div>
        <Button small icon="download" onClick={() => void exportHtml()}>{t('rv.cmp.export')}</Button>
        <IconBtn icon="x" title={t('act.close')} onClick={closeModal} />
      </header>
      <div className="cv-main">
        <div className="cv-body" ref={body}>
          <div className="cv-pages">
            {items.map((it) => it.kind === 'gap' ? (
              <button key={'g' + it.from} type="button" className="cv-gap" onClick={() => setOpen((s) => { const n = new Set(s); for (let k = it.from; k <= it.to; k++) n.add(k); return n; })}>
                <span>{tn('cv.unchanged', it.to - it.from + 1)}</span>
              </button>
            ) : (
              <div key={it.i} data-row={it.i} className={cx('cv-row', it.row.kind, changes[cur] === it.i && 'cur')}>
                <span className="cv-sc">{it.row.sceneLabel}</span>
                <div className={cx('cv-cell a', it.row.a && 't-' + it.row.a.type, !it.row.a && 'empty')}>{side(it.row, 'a')}</div>
                <div className={cx('cv-cell b', it.row.b && 't-' + it.row.b.type, !it.row.b && 'empty')}>{side(it.row, 'b')}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="cv-map" aria-hidden="true">
          {changes.map((c, k) => <button key={c} type="button" tabIndex={-1} className={cx('tick', res.rows[c].kind, k === cur && 'cur')} style={{ top: `${(c / total) * 100}%` }} onClick={() => { setCur(k - 1); setTimeout(() => go(1)); }} />)}
        </div>
      </div>
    </div>
  );
}
