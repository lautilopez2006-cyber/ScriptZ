// Modal router + generic modals (prompt, confirm, new project, command palette).
import { lazy, Suspense, useMemo, useState } from 'react';
import { useApp, closeModal } from './store';
import { createProject } from './actions';
import { COMMANDS } from './commands';
import { t } from '../i18n';
import { Button, Field, Modal, Spinner, cx, Kbd } from '../ui/kit';
import { Icon } from '../ui/icons';
import { TEMPLATES, SCRIPT_LOCALES, localeTokens } from '../core/format';
import type { PaperSize, ScriptLocale } from '../core/model';

const ExportDialog = lazy(() => import('../io/ExportDialog'));
const TagDialog = lazy(() => import('../views/production/TagDialog'));
const DocumentDialog = lazy(() => import('../views/document/DocumentDialog'));
const Tour = lazy(() => import('../views/Tour'));
const CallSheetModal = lazy(() => import('../views/production/CallSheetModal'));

function Prompt({ title, label, value, onSubmit, multiline }: { title: string; label: string; value?: string; onSubmit: (v: string) => void; multiline?: boolean }) {
  const [v, setV] = useState(value ?? '');
  const submit = () => { closeModal(); onSubmit(v.trim()); };
  return (
    <Modal title={title} onClose={closeModal} size="sm" footer={<><Button onClick={closeModal}>{t('act.cancel')}</Button><Button kind="primary" onClick={submit}>{t('act.ok')}</Button></>}>
      <Field label={label}>
        {multiline ? <textarea className="input" rows={4} value={v} autoFocus onChange={(e) => setV(e.target.value)} /> :
          <input className="input" value={v} autoFocus onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} />}
      </Field>
    </Modal>
  );
}

function Confirm({ title, text, onConfirm, danger, confirmLabel }: { title: string; text?: string; onConfirm: () => void; danger?: boolean; confirmLabel?: string }) {
  return (
    <Modal title={title} onClose={closeModal} size="sm" footer={<><Button onClick={closeModal}>{t('act.cancel')}</Button><Button kind={danger ? 'danger' : 'primary'} onClick={() => { closeModal(); onConfirm(); }}>{confirmLabel ?? (danger ? t('act.delete') : t('act.ok'))}</Button></>}>
      {text ? <p>{text}</p> : null}
    </Modal>
  );
}

const TPL_ICON: Record<string, string> = { feature: 'film', tv: 'layers', multicam: 'users', stage: 'star', audio: 'mic', comic: 'grid', av: 'dual' };

function NewProject() {
  const settings = useApp((s) => s.settings);
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState(settings.author);
  const [template, setTemplate] = useState('feature');
  const [locale, setLocale] = useState<ScriptLocale>(settings.defaultLocale);
  const [paper, setPaper] = useState<PaperSize>(settings.defaultPaper);
  const [show, setShow] = useState('');
  const [season, setSeason] = useState(1);
  const [episode, setEpisode] = useState(1);
  const [episodeTitle, setEpisodeTitle] = useState('');
  const series = template === 'tv' || template === 'multicam';
  const create = () => void createProject({ title: title.trim(), author: author.trim(), template, locale, paper, series: series ? { show, season, episode, episodeTitle } : undefined });
  return (
    <Modal title={t('home.new')} onClose={closeModal} size="lg" footer={<><Button onClick={closeModal}>{t('act.cancel')}</Button><Button kind="primary" icon="plus" onClick={create}>{t('act.create')}</Button></>}>
      <div className="grid2">
        <Field label={t('w.title')}><input className="input" value={title} autoFocus placeholder={t('w.untitled')} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') create(); }} /></Field>
        <Field label={t('w.author')}><input className="input" value={author} onChange={(e) => setAuthor(e.target.value)} /></Field>
      </div>
      <h4 className="mt">{t('np.format')}</h4>
      <div className="tpl-grid" role="radiogroup">
        {TEMPLATES.map((tp) => (
          <button key={tp.id} type="button" role="radio" aria-checked={template === tp.id} className={cx('tpl', template === tp.id && 'on')} onClick={() => setTemplate(tp.id)}>
            <Icon name={TPL_ICON[tp.id] ?? 'file'} size={22} />
            <b>{t(tp.name)}</b>
            <small>{t(tp.description)}</small>
          </button>
        ))}
      </div>
      {series ? (
        <div className="grid4 mt">
          <Field label={t('np.show')}><input className="input" value={show} onChange={(e) => setShow(e.target.value)} /></Field>
          <Field label={t('np.season')}><input className="input" type="number" min={1} value={season} onChange={(e) => setSeason(Number(e.target.value) || 1)} /></Field>
          <Field label={t('np.episode')}><input className="input" type="number" min={1} value={episode} onChange={(e) => setEpisode(Number(e.target.value) || 1)} /></Field>
          <Field label={t('np.episodeTitle')}><input className="input" value={episodeTitle} onChange={(e) => setEpisodeTitle(e.target.value)} /></Field>
        </div>
      ) : null}
      <div className="grid2 mt">
        <Field label={t('np.locale')} hint={t('np.locale.hint', { contd: localeTokens(locale).contd, more: localeTokens(locale).more, tr: localeTokens(locale).transitions[0] })}>
          <select className="select" value={locale} onChange={(e) => { const l = e.target.value as ScriptLocale; setLocale(l); setPaper(localeTokens(l).defaultPaper === 'a4' && l !== 'es-LA' ? 'a4' : paper); }}>
            {SCRIPT_LOCALES.map((l) => <option key={l} value={l}>{t('loc.' + l)}</option>)}
          </select>
        </Field>
        <Field label={t('np.paper')}>
          <select className="select" value={paper} onChange={(e) => setPaper(e.target.value as PaperSize)}>
            <option value="letter">{t('paper.letter')}</option>
            <option value="a4">{t('paper.a4')}</option>
          </select>
        </Field>
      </div>
    </Modal>
  );
}

function Palette() {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const shortcuts = useApp((s) => s.settings.shortcuts);
  const list = useMemo(() => {
    const f = q.trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
    return COMMANDS.filter((c) => (!c.when || c.when()) && c.id !== 'palette').filter((c) => !f || c.label().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').includes(f));
  }, [q]);
  const run = (i: number) => { const c = list[i]; if (!c) return; closeModal(); setTimeout(() => c.run(), 10); };
  return (
    <div className="modal-back palette-back" onMouseDown={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
      <div className="palette" role="dialog" aria-label={t('pal.title')}>
        <div className="pal-in"><Icon name="command" size={18} />
          <input className="input" autoFocus placeholder={t('pal.placeholder')} value={q} onChange={(e) => { setQ(e.target.value); setActive(0); }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(list.length - 1, a + 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
              if (e.key === 'Enter') { e.preventDefault(); run(active); }
              if (e.key === 'Escape') { e.preventDefault(); closeModal(); }
            }} />
        </div>
        <div className="pal-list" role="listbox">
          {list.length ? list.map((c, i) => (
            <button key={c.id} type="button" role="option" aria-selected={i === active} className={cx('pal-it', i === active && 'on')} onMouseEnter={() => setActive(i)} onClick={() => run(i)}>
              <Icon name={c.icon ?? 'arrowRight'} size={16} /><span>{c.label()}</span>{shortcuts[c.id] ? <Kbd combo={shortcuts[c.id]} /> : null}
            </button>
          )) : <p className="muted pad">{t('pal.none')}</p>}
        </div>
      </div>
    </div>
  );
}

export function Modals() {
  const modal = useApp((s) => s.modal);
  if (!modal) return null;
  const p = (modal.props ?? {}) as Record<string, never>;
  return (
    <Suspense fallback={<div className="modal-back"><Spinner /></div>}>
      {modal.kind === 'prompt' ? <Prompt {...(p as unknown as Parameters<typeof Prompt>[0])} /> : null}
      {modal.kind === 'confirm' ? <Confirm {...(p as unknown as Parameters<typeof Confirm>[0])} /> : null}
      {modal.kind === 'newProject' ? <NewProject /> : null}
      {modal.kind === 'palette' ? <Palette /> : null}
      {modal.kind === 'export' ? <ExportDialog /> : null}
      {modal.kind === 'tag' ? <TagDialog /> : null}
      {modal.kind === 'document' ? <DocumentDialog tab={(p as { tab?: string }).tab ?? 'format'} /> : null}
      {modal.kind === 'tour' ? <Tour /> : null}
      {modal.kind === 'callsheet' ? <CallSheetModal dayId={(p as { dayId?: string }).dayId ?? ''} /> : null}
    </Suspense>
  );
}
