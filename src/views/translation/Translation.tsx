// Bilingual script: the original on the left, the translation on the right, paragraph by paragraph.
// Each translation remembers the original text it was made from, so edits to the original show up as "outdated".
import { useMemo, useState } from 'react';
import { useApp, openModal, toast } from '../../app/store';
import { getEditor, setView, updateProject } from '../../app/actions';
import { isTranslatable, translationProgress } from '../../core/translation';
import { buildScenes } from '../../core/scenes';
import type { Block, Project } from '../../core/model';
import { t } from '../../i18n';
import { Button, Empty, Field, LazyInput, Segmented, Spinner, cx } from '../../ui/kit';
import { Icon } from '../../ui/icons';

export const LANGS: { id: string; name: string }[] = [
  { id: 'en', name: 'English' }, { id: 'es', name: 'Español' }, { id: 'pt', name: 'Português' }, { id: 'fr', name: 'Français' },
  { id: 'it', name: 'Italiano' }, { id: 'de', name: 'Deutsch' }, { id: 'ca', name: 'Català' }, { id: 'ja', name: '日本語' },
  { id: 'zh', name: '中文' }, { id: 'ko', name: '한국어' },
];
const langName = (id: string) => LANGS.find((l) => l.id === id)?.name ?? id.toUpperCase();
const now = () => new Date().toISOString();

function setLine(id: string, text: string, src: string) {
  updateProject((p) => {
    if (!p.translation) return p;
    const blocks = { ...p.translation.blocks };
    if (text.trim()) blocks[id] = { text, src, at: now() }; else delete blocks[id];
    return { ...p, translation: { ...p.translation, blocks } };
  });
}

export default function TranslationView() {
  const p = useApp((s) => s.project)!;
  if (!p.translation) return <Setup p={p} />;
  return <Workspace />;
}

function Setup({ p }: { p: Project }) {
  const src = p.locale.startsWith('en') ? 'en' : p.locale.startsWith('pt') ? 'pt' : 'es';
  const [lang, setLang] = useState(src === 'en' ? 'es' : 'en');
  return (
    <div className="view translation">
      <div className="tr-setup">
        <div className="tr-art" aria-hidden="true"><i className="pg a">{t('tr.art.a')}</i><i className="pg b">{t('tr.art.b')}</i></div>
        <h1>{t('tr.title')}</h1>
        <p className="muted">{t('tr.intro')}</p>
        <Field label={t('tr.lang')}>
          <select className="input" value={lang} onChange={(e) => setLang(e.target.value)}>
            {LANGS.filter((l) => l.id !== src).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </Field>
        <Button kind="primary" icon="globe" onClick={() => updateProject((x) => ({ ...x, translation: { lang, blocks: {} } }), { history: true })}>{t('tr.start')}</Button>
      </div>
    </div>
  );
}

type Filter = 'all' | 'todo' | 'stale';

function Workspace() {
  const p = useApp((s) => s.project)!;
  const tr = p.translation!;
  const ai = useApp((s) => s.settings.ai.enabled);
  const [filter, setFilter] = useState<Filter>('all');
  const [busy, setBusy] = useState<string | null>(null);
  const prog = translationProgress(p);
  const scenes = useMemo(() => buildScenes(p.blocks), [p.blocks]);
  // Paragraphs grouped by scene (anything before the first heading goes in a leading group).
  const groups = useMemo(() => {
    const out: { id: string; label: string; heading: string; blocks: Block[] }[] = [];
    const first = scenes[0]?.start ?? p.blocks.length;
    if (first > 0) out.push({ id: '_pre', label: '', heading: '', blocks: p.blocks.slice(0, first) });
    for (const s of scenes) out.push({ id: s.id, label: s.label, heading: s.heading, blocks: p.blocks.slice(s.start, s.end) });
    return out;
  }, [p.blocks, scenes]);
  const show = (b: Block) => {
    if (!isTranslatable(b)) return false;
    const x = tr.blocks[b.id];
    if (filter === 'todo') return !x?.text.trim() && b.type !== 'character';
    if (filter === 'stale') return !!x && x.src !== b.text;
    return true;
  };
  const pct = prog.total ? Math.round((prog.done / prog.total) * 100) : 0;

  const translateScene = async (blocks: Block[], key: string) => {
    const todo = blocks.filter((b) => isTranslatable(b) && b.type !== 'character' && (!tr.blocks[b.id]?.text.trim() || tr.blocks[b.id].src !== b.text));
    if (!todo.length) { toast(t('tr.nothing')); return; }
    setBusy(key);
    try {
      const { askAi } = await import('../ai/ai');
      const input = todo.map((b, i) => `${i + 1}\t[${b.type}]\t${b.text.replace(/\n/g, ' ⏎ ')}`).join('\n');
      const out = await askAi({
        system: `You translate screenplays into ${langName(tr.lang)}. Keep the screenplay register: scene headings and character cues in capitals, natural spoken dialogue, the writer's tone and subtext. Character names stay as they are unless they are common nouns. Reply ONLY with the same numbered lines, as "number<TAB>translation", one per input line, keeping " ⏎ " line breaks.`,
        user: input, maxTokens: 4000,
      });
      const map = new Map<number, string>();
      for (const line of out.split('\n')) { const m = /^\s*(\d+)\s*[\t.:)-]\s*(.*)$/.exec(line); if (m) map.set(Number(m[1]), m[2].replace(/^\[[a-z]+\]\s*/i, '').replace(/ ?⏎ ?/g, '\n').trim()); }
      updateProject((x) => {
        if (!x.translation) return x;
        const bl = { ...x.translation.blocks };
        todo.forEach((b, i) => { const v = map.get(i + 1); if (v) bl[b.id] = { text: v, src: b.text, at: now() }; });
        return { ...x, translation: { ...x.translation, blocks: bl } };
      }, { history: true });
      toast(t('tr.aiDone', { n: map.size }), 'success');
    } catch (e) {
      toast(t('err.generic', { msg: String((e as Error)?.message ?? e) }), 'error');
    } finally { setBusy(null); }
  };

  return (
    <div className="view translation">
      <header className="tr-head">
        <div>
          <small className="muted">{t('tr.kicker')}</small>
          <h1>{langName(p.locale.slice(0, 2))} <Icon name="arrowRight" size={18} /> {langName(tr.lang)}</h1>
        </div>
        <div className="tr-prog" title={t('tr.progress', { a: prog.done, b: prog.total })}>
          <div className="bar"><i style={{ width: pct + '%' }} /></div>
          <small><b>{pct}%</b> · {t('tr.progress', { a: prog.done, b: prog.total })}{prog.stale ? <> · <span className="tr-stale-n">{t('tr.staleN', { n: prog.stale })}</span></> : null}</small>
        </div>
        <span className="grow" />
        <Segmented small value={filter} onChange={setFilter} options={[{ value: 'all', label: t('tr.f.all') }, { value: 'todo', label: t('tr.f.todo') }, { value: 'stale', label: t('tr.f.stale') }]} />
        <Button small icon="download" onClick={() => openModal('export')}>{t('act.export')}</Button>
        <Button small kind="ghost" icon="trash" onClick={() => openModal('confirm', { title: t('tr.remove'), text: t('tr.remove.h'), danger: true, onConfirm: () => updateProject((x) => ({ ...x, translation: null }), { history: true }) })}>{t('tr.remove')}</Button>
      </header>
      <div className="tr-cols-h" aria-hidden="true"><span>{t('tr.original')}</span><span>{t('tr.translation')} · {langName(tr.lang)}</span></div>
      <div className="tr-body">
        {groups.map((g) => {
          const rows = g.blocks.filter(show);
          if (!rows.length) return null;
          return (
            <section key={g.id} className="tr-scene">
              {g.label || ai ? (
                <div className="tr-scene-h">
                  {g.label ? <span className="tr-num">{g.label}</span> : null}
                  <span className="grow" />
                  {ai ? <Button small kind="ghost" icon="sparkles" disabled={!!busy} onClick={() => translateScene(g.blocks, g.id)}>{busy === g.id ? <Spinner /> : t('tr.ai')}</Button> : null}
                </div>
              ) : null}
              {rows.map((b) => <Row key={b.id} b={b} />)}
            </section>
          );
        })}
        {filter !== 'all' && !groups.some((g) => g.blocks.some(show)) ? <Empty icon="check" title={filter === 'stale' ? t('tr.noStale') : t('tr.allDone')} /> : null}
      </div>
    </div>
  );
}

function Row({ b }: { b: Block }) {
  const x = useApp((s) => s.project!.translation?.blocks[b.id]);
  const stale = !!x && x.src !== b.text;
  const go = () => { setView('write'); setTimeout(() => getEditor()?.scrollToBlock(b.id, { select: true }), 60); };
  return (
    <div className={cx('tr-row', 't-' + b.type, stale && 'stale', !x && 'todo')}>
      <button type="button" className="tr-src" onClick={go} title={t('tr.goto')}>{b.text}</button>
      <div className="tr-dst">
        <LazyInput multiline rows={1} value={x?.text ?? ''} upper={b.type === 'scene' || b.type === 'character' || b.type === 'transition'}
          placeholder={b.type === 'character' ? b.text : t('tr.ph')} ariaLabel={t('tr.translation')} onCommit={(v) => setLine(b.id, v, b.text)} />
        {stale ? (
          <div className="tr-stale">
            <Icon name="alert" size={13} /><span>{t('tr.stale')}</span>
            <del>{x!.src}</del>
            <button type="button" onClick={() => setLine(b.id, x!.text, b.text)}>{t('tr.keep')}</button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

