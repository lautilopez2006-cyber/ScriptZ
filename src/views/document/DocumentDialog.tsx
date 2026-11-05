// Document settings: title page, format/template & element styles, page header/footer, series info.
import { useState } from 'react';
import { useApp, closeModal, openModal } from '../../app/store';
import { bumpEditor, updateProject } from '../../app/actions';
import { TEMPLATES, getTemplate, resolveStyles, localeTokens, SCRIPT_LOCALES, type ElementStyle } from '../../core/format';
import type { ElementType, Project, ScriptLocale, SceneNumberMode, PaperSize, TitlePage } from '../../core/model';
import { t } from '../../i18n';
import { Button, Field, LazyInput, Modal, NumberInput, Segmented, Tabs, Toggle } from '../../ui/kit';

type Tab = 'title' | 'format' | 'styles' | 'page' | 'series';

function TitleTab({ p }: { p: Project }) {
  const tp = p.titlePage;
  const set = (patch: Partial<TitlePage>) => updateProject((x) => ({ ...x, titlePage: { ...x.titlePage, ...patch } }));
  return (
    <div className="doc-title">
      <div className="tp-form">
        <Toggle checked={tp.enabled} onChange={(v) => set({ enabled: v })} label={t('dc.tp.enabled')} />
        <Field label={t('w.title')}><LazyInput value={tp.title || p.title} onCommit={(v) => { set({ title: v }); if (!p.title) updateProject((x) => ({ ...x, title: v })); }} /></Field>
        <div className="grid2">
          <Field label={t('dc.tp.credit')}><LazyInput value={tp.credit} placeholder={t('dc.tp.credit.ph')} onCommit={(v) => set({ credit: v })} /></Field>
          <Field label={t('dc.tp.authors')}><LazyInput multiline rows={2} value={tp.authors} onCommit={(v) => set({ authors: v })} /></Field>
        </div>
        <Field label={t('dc.tp.source')}><LazyInput value={tp.source} placeholder={t('dc.tp.source.ph')} onCommit={(v) => set({ source: v })} /></Field>
        <div className="grid2">
          <Field label={t('dc.tp.draft')}><LazyInput value={tp.draft} placeholder={t('dc.tp.draft.ph')} onCommit={(v) => set({ draft: v })} /></Field>
          <Field label={t('w.date')}><LazyInput value={tp.date} onCommit={(v) => set({ date: v })} /></Field>
        </div>
        <Field label={t('dc.tp.contact')}><LazyInput multiline rows={3} value={tp.contact} onCommit={(v) => set({ contact: v })} /></Field>
        <Field label={t('dc.tp.copyright')}><LazyInput value={tp.copyright} placeholder="© 2026 · Registro…" onCommit={(v) => set({ copyright: v })} /></Field>
      </div>
      <div className="tp-preview" aria-hidden="true">
        <div className="tp-page">
          <div className="tp-mid">
            <b>{(tp.title || p.title || t('w.untitled')).toUpperCase()}</b>
            {tp.credit ? <span>{tp.credit}</span> : null}
            <span>{tp.authors || p.author}</span>
            {tp.source ? <span className="tp-src">{tp.source}</span> : null}
          </div>
          <div className="tp-bottom"><span>{tp.contact}{tp.copyright ? '\n\n' + tp.copyright : ''}</span><span className="r">{[tp.draft, tp.date].filter(Boolean).join('\n')}</span></div>
        </div>
      </div>
    </div>
  );
}

function FormatTab({ p }: { p: Project }) {
  const tokens = localeTokens(p.locale);
  const setTemplate = (id: string) => {
    if (id === p.template) return;
    openModal('confirm', {
      title: t('dc.changeTemplate'), text: t('dc.changeTemplate.t', { name: t(getTemplate(id).name) }), confirmLabel: t('act.apply'),
      onConfirm: () => { updateProject((x) => ({ ...x, template: id, styleOverrides: {} })); bumpEditor(); setTimeout(() => openModal('document', { tab: 'format' }), 0); },
    });
  };
  return (
    <div className="doc-format">
      <h4>{t('np.format')}</h4>
      <div className="tpl-grid">
        {TEMPLATES.map((tp) => (
          <button key={tp.id} type="button" className={'tpl' + (tp.id === p.template ? ' on' : '')} onClick={() => setTemplate(tp.id)}><b>{t(tp.name)}</b><small>{t(tp.description)}</small></button>
        ))}
      </div>
      <div className="grid2 mt">
        <Field label={t('np.locale')} hint={t('np.locale.hint', { contd: tokens.contd, more: tokens.more, tr: tokens.transitions[0] })}>
          <select className="select" value={p.locale} onChange={(e) => { updateProject((x) => ({ ...x, locale: e.target.value as ScriptLocale })); bumpEditor(); }}>
            {SCRIPT_LOCALES.map((l) => <option key={l} value={l}>{t('loc.' + l)}</option>)}
          </select>
        </Field>
        <Field label={t('np.paper')}>
          <Segmented value={p.page.paper} onChange={(v: PaperSize) => updateProject((x) => ({ ...x, page: { ...x.page, paper: v } }))} options={[{ value: 'letter', label: t('paper.letter') }, { value: 'a4', label: t('paper.a4') }]} />
        </Field>
      </div>
    </div>
  );
}

const IN = (cols: number) => Math.round(cols) / 10;

function StylesTab({ p }: { p: Project }) {
  const styles = resolveStyles(p);
  const tpl = getTemplate(p.template);
  const base = resolveStyles({ ...p, styleOverrides: {} });
  const order = tpl.order;
  const set = (type: ElementType, patch: Partial<ElementStyle>) => {
    updateProject((x) => {
      const cur = { ...(x.styleOverrides[type] ?? {}), ...patch };
      // Keep only real differences from the template.
      for (const k of Object.keys(cur) as (keyof ElementStyle)[]) if (cur[k] === base[type][k]) delete cur[k];
      const all = { ...x.styleOverrides };
      if (Object.keys(cur).length) all[type] = cur; else delete all[type];
      return { ...x, styleOverrides: all };
    });
  };
  return (
    <div className="doc-styles">
      <p className="muted">{t('dc.styles.h')}</p>
      <div className="tbl-wrap">
        <table className="tbl styles-tbl">
          <thead><tr><th>{t('ed.element')}</th><th>{t('dc.st.indent')}</th><th>{t('dc.st.width')}</th><th>{t('dc.st.align')}</th><th>{t('dc.st.before')}</th><th>{t('dc.st.spacing')}</th><th>{t('dc.st.format')}</th><th>{t('dc.st.enter')}</th><th>{t('dc.st.tab')}</th><th /></tr></thead>
          <tbody>
            {order.map((type) => {
              const st = styles[type];
              const changed = !!p.styleOverrides[type];
              return (
                <tr key={type} className={changed ? 'changed' : ''}>
                  <td><b>{t('el.' + type)}</b></td>
                  <td><NumberInput value={IN(st.indent)} step={0.1} min={0} max={5.5} onChange={(v) => set(type, { indent: Math.round(v * 10) })} ariaLabel={t('dc.st.indent')} /></td>
                  <td><NumberInput value={IN(st.width)} step={0.1} min={1} max={6} onChange={(v) => set(type, { width: Math.round(v * 10) })} ariaLabel={t('dc.st.width')} /></td>
                  <td><select className="select sm" value={st.align} onChange={(e) => set(type, { align: e.target.value as ElementStyle['align'] })}><option value="left">{t('w.left')}</option><option value="center">{t('w.center')}</option><option value="right">{t('w.right')}</option></select></td>
                  <td><NumberInput value={st.spaceBefore} min={0} max={4} onChange={(v) => set(type, { spaceBefore: Math.round(v) })} ariaLabel={t('dc.st.before')} /></td>
                  <td><select className="select sm" value={st.lineSpacing} onChange={(e) => set(type, { lineSpacing: Number(e.target.value) as 1 | 2 })}><option value={1}>1</option><option value={2}>2</option></select></td>
                  <td className="fmt-cell">
                    {(['upper', 'bold', 'italic', 'underline'] as const).map((k) => (
                      <button key={k} type="button" className={'ibtn sm' + (st[k] ? ' on' : '')} title={t('dc.st.' + k)} onClick={() => set(type, { [k]: !st[k] } as Partial<ElementStyle>)}>{k === 'upper' ? 'AA' : k === 'bold' ? <b>B</b> : k === 'italic' ? <i>I</i> : <u>U</u>}</button>
                    ))}
                  </td>
                  <td><select className="select sm" value={st.enter} onChange={(e) => set(type, { enter: e.target.value as ElementType })}>{order.map((o) => <option key={o} value={o}>{t('el.' + o)}</option>)}</select></td>
                  <td><select className="select sm" value={st.tab} onChange={(e) => set(type, { tab: e.target.value as ElementType })}>{order.map((o) => <option key={o} value={o}>{t('el.' + o)}</option>)}</select></td>
                  <td>{changed ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => updateProject((x) => { const all = { ...x.styleOverrides }; delete all[type]; return { ...x, styleOverrides: all }; })}>{t('act.reset')}</button> : null}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {Object.keys(p.styleOverrides).length ? <Button kind="ghost" icon="refresh" onClick={() => updateProject((x) => ({ ...x, styleOverrides: {} }))}>{t('dc.st.resetAll')}</Button> : null}
    </div>
  );
}

function HF({ label, value, onChange }: { label: string; value: { left: string; center: string; right: string }; onChange: (v: { left: string; center: string; right: string }) => void }) {
  return (
    <Field label={label}>
      <div className="grid3">
        {(['left', 'center', 'right'] as const).map((k) => <LazyInput key={k} value={value[k]} placeholder={t('w.' + k)} onCommit={(v) => onChange({ ...value, [k]: v })} />)}
      </div>
    </Field>
  );
}

function PageTab({ p }: { p: Project }) {
  const pg = p.page;
  const set = (patch: Partial<Project['page']>) => updateProject((x) => ({ ...x, page: { ...x.page, ...patch } }));
  return (
    <div className="doc-page">
      <Field label={t('dc.pg.sceneNumbers')}>
        <Segmented value={pg.sceneNumbers} onChange={(v: SceneNumberMode) => set({ sceneNumbers: v })} options={[{ value: 'none', label: t('w.none') }, { value: 'left', label: t('w.left') }, { value: 'right', label: t('w.right') }, { value: 'both', label: t('w.both') }]} />
      </Field>
      <HF label={t('dc.pg.header')} value={pg.header} onChange={(v) => set({ header: v })} />
      <HF label={t('dc.pg.footer')} value={pg.footer} onChange={(v) => set({ footer: v })} />
      <p className="muted small">{t('dc.pg.tokens')}</p>
      <Toggle checked={pg.firstPageHeader} onChange={(v) => set({ firstPageHeader: v })} label={t('dc.pg.firstPage')} />
      <Toggle checked={pg.moreContd} onChange={(v) => set({ moreContd: v })} label={t('dc.pg.moreContd')} hint={t('dc.pg.moreContd.h', { more: localeTokens(p.locale).more, contd: localeTokens(p.locale).contd })} />
      <Toggle checked={pg.autoContd} onChange={(v) => set({ autoContd: v })} label={t('dc.pg.autoContd')} hint={t('dc.pg.autoContd.h')} />
      <div className="grid2">
        <Field label={t('dc.pg.watermark')}>
          <div className="row"><Toggle checked={pg.watermark.enabled} onChange={(v) => set({ watermark: { ...pg.watermark, enabled: v } })} /><LazyInput value={pg.watermark.text} placeholder={t('ex.watermark.ph')} onCommit={(v) => set({ watermark: { ...pg.watermark, text: v, enabled: !!v || pg.watermark.enabled } })} /></div>
        </Field>
        <Field label={t('dc.pg.minutes')} hint={t('dc.pg.minutes.h')}><NumberInput value={pg.minutesPerPage} step={0.1} min={0.3} max={3} onChange={(v) => set({ minutesPerPage: v })} /></Field>
      </div>
      <Toggle checked={pg.revisionColorPages} onChange={(v) => set({ revisionColorPages: v })} label={t('dc.pg.revColor')} hint={t('dc.pg.revColor.h')} />
    </div>
  );
}

function SeriesTab({ p }: { p: Project }) {
  const s = p.series ?? { show: '', season: 1, episode: 1, episodeTitle: '' };
  const set = (patch: Partial<typeof s>) => updateProject((x) => ({ ...x, series: { ...s, ...patch } }));
  return (
    <div className="grid4">
      <Field label={t('np.show')}><LazyInput value={s.show} onCommit={(v) => set({ show: v })} /></Field>
      <Field label={t('np.season')}><NumberInput value={s.season} min={1} onChange={(v) => set({ season: v })} /></Field>
      <Field label={t('np.episode')}><NumberInput value={s.episode} min={1} onChange={(v) => set({ episode: v })} /></Field>
      <Field label={t('np.episodeTitle')}><LazyInput value={s.episodeTitle} onCommit={(v) => set({ episodeTitle: v })} /></Field>
    </div>
  );
}

export default function DocumentDialog({ tab: initial }: { tab: string }) {
  const p = useApp((s) => s.project)!;
  const [tab, setTab] = useState<Tab>((['title', 'format', 'styles', 'page', 'series'].includes(initial) ? initial : 'format') as Tab);
  const tabs: { value: Tab; label: string }[] = [
    { value: 'title', label: t('ed.titlePage') }, { value: 'format', label: t('np.format') }, { value: 'styles', label: t('dc.styles') }, { value: 'page', label: t('dc.page') },
    ...(p.template === 'tv' || p.template === 'multicam' || p.series ? [{ value: 'series' as Tab, label: t('np.show') }] : []),
  ];
  return (
    <Modal title={t('ed.format')} onClose={closeModal} size="xl" footer={<Button kind="primary" onClick={closeModal}>{t('act.done')}</Button>}>
      <Tabs value={tab} onChange={setTab} tabs={tabs} />
      <div className="doc-body">
        {tab === 'title' ? <TitleTab p={p} /> : null}
        {tab === 'format' ? <FormatTab p={p} /> : null}
        {tab === 'styles' ? <StylesTab p={p} /> : null}
        {tab === 'page' ? <PageTab p={p} /> : null}
        {tab === 'series' ? <SeriesTab p={p} /> : null}
      </div>
    </Modal>
  );
}
