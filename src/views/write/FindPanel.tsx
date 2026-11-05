// Find & replace with element/character filters, regex and whole-word matching.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp, toast } from '../../app/store';
import { getEditor, updateProject } from '../../app/actions';
import { findAll, buildRegex, replacementFor, type FindOptions, type Match } from '../../core/smart';
import { replaceText } from '../../core/marks';
import { characterStats } from '../../core/scenes';
import { getTemplate } from '../../core/format';
import type { ElementType } from '../../core/model';
import { t, tn } from '../../i18n';
import { Button, IconBtn, Toggle, cx, useDebounced } from '../../ui/kit';

export const findPrefill: { character: string; query: string } = { character: '', query: '' };

export function FindPanel({ replaceMode }: { replaceMode?: boolean }) {
  const project = useApp((s) => s.project)!;
  const [query, setQuery] = useState(findPrefill.query);
  const [rep, setRep] = useState('');
  const [opts, setOpts] = useState({ caseSensitive: false, wholeWord: false, regex: false });
  const [type, setType] = useState<ElementType | ''>('');
  const [character, setCharacter] = useState(findPrefill.character);
  const [cur, setCur] = useState(0);
  const [showReplace, setShowReplace] = useState(!!replaceMode);
  const inputRef = useRef<HTMLInputElement>(null);
  const dq = useDebounced(query, 120);
  useEffect(() => { findPrefill.character = ''; findPrefill.query = ''; setTimeout(() => inputRef.current?.focus(), 30); }, []);
  const o: FindOptions = { query: dq, ...opts, types: type ? [type] : [], character };
  const valid = !dq || !!buildRegex(o);
  const matches: Match[] = useMemo(() => (valid ? findAll(project.blocks, o) : []), [project.blocks, dq, opts, type, character]);
  const chars = useMemo(() => characterStats(project.blocks).map((c) => c.name), [project.blocks]);
  const order = getTemplate(project.template).order;

  useEffect(() => {
    const ed = getEditor();
    if (!ed) return;
    ed.highlight('sz-find', matches.slice(0, 3000).map((m) => ({ a: { id: m.id, off: m.s }, b: { id: m.id, off: m.e } })));
    return () => { ed.highlight('sz-find', []); ed.highlight('sz-find-cur', []); };
  }, [matches]);

  const go = (i: number) => {
    if (!matches.length) return;
    const k = ((i % matches.length) + matches.length) % matches.length;
    setCur(k);
    const m = matches[k];
    const ed = getEditor();
    if (!ed) return;
    ed.scrollToBlock(m.id);
    ed.highlight('sz-find-cur', [{ a: { id: m.id, off: m.s }, b: { id: m.id, off: m.e } }]);
    ed.selectRange({ id: m.id, off: m.s }, { id: m.id, off: m.e }, false);
    setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 0);
  };

  const replaceOne = () => {
    const m = matches[cur];
    if (!m) return;
    updateProject((p) => {
      const blocks = p.blocks.map((b) => (b.id === m.id ? replaceText(b, m.s, m.e, replacementFor(b, m, o, rep)) : b));
      return { ...p, blocks };
    });
  };
  const replaceAll = () => {
    if (!matches.length) return;
    const byBlock = new Map<string, Match[]>();
    for (const m of matches) byBlock.set(m.id, [...(byBlock.get(m.id) ?? []), m]);
    updateProject((p) => ({
      ...p,
      blocks: p.blocks.map((b) => {
        const list = byBlock.get(b.id);
        if (!list) return b;
        let nb = b;
        for (const m of [...list].sort((a, z) => z.s - a.s)) nb = replaceText(nb, m.s, m.e, replacementFor(b, m, o, rep));
        return nb;
      }),
    }));
    toast(tn('fd.replaced', matches.length), 'success');
  };

  return (
    <div className="panel find">
      <div className="find-row">
        <input ref={inputRef} className={cx('input', !valid && 'bad')} placeholder={t('fd.find')} value={query} aria-label={t('fd.find')}
          onChange={(e) => { setQuery(e.target.value); setCur(0); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); go(e.shiftKey ? cur - 1 : cur + (getEditor()?.getSelection() ? 1 : 0)); } if (e.key === 'Escape') getEditor()?.focus(); }} />
        <IconBtn icon="chevronUp" title={t('act.prev')} onClick={() => go(cur - 1)} disabled={!matches.length} small />
        <IconBtn icon="chevronDown" title={t('act.next')} onClick={() => go(cur + 1)} disabled={!matches.length} small />
        <IconBtn icon="replace" title={t('fd.replace')} active={showReplace} onClick={() => setShowReplace(!showReplace)} small />
      </div>
      <div className="find-count muted">{!valid ? t('fd.badRegex') : dq ? (matches.length ? `${cur + 1} / ${tn('fd.results', matches.length)}` : t('fd.none')) : ' '}</div>
      {showReplace ? (
        <>
          <input className="input" placeholder={t('fd.replace')} value={rep} onChange={(e) => setRep(e.target.value)} aria-label={t('fd.replace')} />
          <div className="row gap">
            <Button small onClick={replaceOne} disabled={!matches.length}>{t('fd.replaceOne')}</Button>
            <Button small kind="primary" onClick={replaceAll} disabled={!matches.length}>{t('fd.replaceAll')}</Button>
          </div>
        </>
      ) : null}
      <div className="find-opts">
        <Toggle checked={opts.caseSensitive} onChange={(v) => setOpts({ ...opts, caseSensitive: v })} label={t('fd.case')} />
        <Toggle checked={opts.wholeWord} onChange={(v) => setOpts({ ...opts, wholeWord: v })} label={t('fd.word')} />
        <Toggle checked={opts.regex} onChange={(v) => setOpts({ ...opts, regex: v })} label={t('fd.regex')} />
        <label className="field"><span className="field-l">{t('fd.in')}</span>
          <select className="select" value={type} onChange={(e) => setType(e.target.value as ElementType | '')}>
            <option value="">{t('fd.anyElement')}</option>
            {order.map((ty) => <option key={ty} value={ty}>{t('el.' + ty)}</option>)}
          </select>
        </label>
        <label className="field"><span className="field-l">{t('fd.spokenBy')}</span>
          <select className="select" value={character} onChange={(e) => setCharacter(e.target.value)}>
            <option value="">{t('fd.anyCharacter')}</option>
            {chars.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
      </div>
      <div className="find-results">
        {matches.slice(0, 300).map((m, i) => {
          const b = project.blocks.find((x) => x.id === m.id);
          if (!b) return null;
          const a = Math.max(0, m.s - 30);
          return (
            <button key={i} type="button" className={cx('find-hit', i === cur && 'on')} onClick={() => go(i)}>
              <small>{t('el.' + b.type)}</small>
              <span>{a > 0 ? '…' : ''}{b.text.slice(a, m.s)}<mark>{b.text.slice(m.s, m.e)}</mark>{b.text.slice(m.e, m.e + 40)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
