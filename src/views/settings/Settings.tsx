// Settings: general, editor, shortcuts, macros, goals, AI, collaboration, updates, backup, about.
import { useEffect, useState } from 'react';
import { useApp, toast, getState } from '../../app/store';
import { setSettings, refreshLibrary } from '../../app/actions';
import { COMMANDS } from '../../app/commands';
import { DEFAULT_ELEMENT_KEYS, DEFAULT_SHORTCUTS, type AppSettings, type ThemeName, type UiLang } from '../../app/settings';
import { APP_LABEL } from '../../app/version';
import { comboOf } from '../../editor/engine';
import { ALL_ELEMENT_TYPES, type ElementType } from '../../core/model';
import { SCRIPT_LOCALES } from '../../core/format';
import { checkForUpdate } from '../../platform/update';
import { isTauri, openExternal, projectStore, saveFile, pickFile } from '../../platform';
import { serializeProject } from '../../core/migrate';
import { writeZip, readZip } from '../../io/zip';
import { t, relTime } from '../../i18n';
import { Button, Field, Kbd, NumberInput, Segmented, Tabs, Toggle, Spinner } from '../../ui/kit';
import { Icon, Logo } from '../../ui/icons';
import { testAi } from '../ai/ai';
import { SPELL_VARIANTS, type SpellVariant } from '../../spell/spell';

type Tab = 'general' | 'editor' | 'keys' | 'macros' | 'goals' | 'ai' | 'collab' | 'cloud' | 'updates' | 'backup' | 'about';

export function KeyRecorder({ value, onChange }: { value: string; onChange: (combo: string) => void }) {
  const [rec, setRec] = useState(false);
  useEffect(() => {
    if (!rec) return;
    const on = (e: KeyboardEvent) => {
      e.preventDefault(); e.stopPropagation();
      if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;
      if (e.key === 'Escape') { setRec(false); return; }
      if (e.key === 'Backspace' || e.key === 'Delete') { onChange(''); setRec(false); return; }
      onChange(comboOf(e));
      setRec(false);
    };
    window.addEventListener('keydown', on, true);
    return () => window.removeEventListener('keydown', on, true);
  }, [rec, onChange]);
  return (
    <button type="button" className={'keyrec' + (rec ? ' rec' : '')} onClick={() => setRec(true)} title={t('st.keys.record')}>
      {rec ? t('st.keys.press') : value ? <Kbd combo={value} /> : <span className="muted">—</span>}
    </button>
  );
}

function General({ s }: { s: AppSettings }) {
  return (
    <div className="st-sec">
      <Field label={t('st.uiLang')}><Segmented value={s.uiLang} onChange={(v: UiLang) => setSettings({ uiLang: v })} options={[{ value: 'es', label: 'Español' }, { value: 'en', label: 'English' }, { value: 'pt', label: 'Português' }, { value: 'fr', label: 'Français' }, { value: 'it', label: 'Italiano' }]} /></Field>
      <Field label={t('st.theme')}>
        <div className="themes">
          {(['system', 'light', 'dark', 'sepia', 'night'] as ThemeName[]).map((th) => (
            <button key={th} type="button" className={'theme-sw t-' + th + (s.theme === th ? ' on' : '')} onClick={() => setSettings({ theme: th })}><span className="sw" /><span>{t('st.theme.' + th)}</span></button>
          ))}
        </div>
      </Field>
      <div className="grid2">
        <Field label={t('st.defaultLocale')}><select className="select" value={s.defaultLocale} onChange={(e) => setSettings({ defaultLocale: e.target.value as AppSettings['defaultLocale'] })}>{SCRIPT_LOCALES.map((l) => <option key={l} value={l}>{t('loc.' + l)}</option>)}</select></Field>
        <Field label={t('st.defaultPaper')}><Segmented value={s.defaultPaper} onChange={(v: 'letter' | 'a4') => setSettings({ defaultPaper: v })} options={[{ value: 'letter', label: t('paper.letter') }, { value: 'a4', label: t('paper.a4') }]} /></Field>
      </div>
      <Field label={t('st.author')} hint={t('st.author.h')}><input className="input" value={s.author} onChange={(e) => setSettings({ author: e.target.value })} /></Field>
    </div>
  );
}

const FONTS = ['SZ Mono', 'SZ Liberation', 'Courier New', 'Cousine', 'Courier', 'Consolas', 'Menlo'];
const FONT_LABEL: Record<string, string> = { 'SZ Mono': 'Courier Prime', 'SZ Liberation': 'Liberation Mono' };

function Editor({ s }: { s: AppSettings }) {
  return (
    <div className="st-sec">
      <Field label={t('st.scriptFont')} hint={t('st.scriptFont.h')}>
        <div className="font-list">
          {FONTS.map((f) => <button key={f} type="button" className={'font-it' + (s.scriptFont === f ? ' on' : '')} onClick={() => setSettings({ scriptFont: f })}><b>{FONT_LABEL[f] ?? f}</b><span style={{ fontFamily: `'${f}', 'SZ Mono'` }}>INT. FARO - NOCHE</span></button>)}
        </div>
      </Field>
      <Field label={t('st.zoom')}><div className="row"><input className="grow" type="range" min={0.5} max={2} step={0.05} value={s.zoom} onChange={(e) => setSettings({ zoom: Number(e.target.value) })} /><span className="muted zoom-pct">{Math.round(s.zoom * 100)}%</span></div></Field>
      <Toggle checked={s.pageView} onChange={(v) => setSettings({ pageView: v })} label={t('ed.pageView')} />
      <Toggle checked={s.typewriter} onChange={(v) => setSettings({ typewriter: v })} label={t('ed.typewriter')} hint={t('ed.typewriter.hint')} />
      <Field label={t('ed.focus')}><Segmented value={s.focusMode} onChange={(v: AppSettings['focusMode']) => setSettings({ focusMode: v })} options={[{ value: 'off', label: t('ed.focus.off') }, { value: 'scene', label: t('ed.focus.scene') }, { value: 'paragraph', label: t('ed.focus.paragraph') }]} /></Field>
      <Toggle checked={s.showSceneNumbers} onChange={(v) => setSettings({ showSceneNumbers: v })} label={t('ed.sceneNumbers')} />
      <Toggle checked={s.showTags} onChange={(v) => setSettings({ showTags: v })} label={t('ed.showTags')} />
      <h3 className="mt">{t('sp.heading')}</h3>
      <Toggle checked={s.spell.enabled} onChange={(v) => setSettings({ spell: { ...s.spell, enabled: v } })} label={t('sp.enabled')} hint={t('sp.enabled.h')} />
      <Field label={t('sp.variant')} hint={t('sp.variant.h')}>
        <select className="select" value={s.spell.variant} disabled={!s.spell.enabled} onChange={(e) => setSettings({ spell: { ...s.spell, variant: e.target.value as SpellVariant } })}>
          {SPELL_VARIANTS.map((v) => <option key={v} value={v}>{t('sp.v.' + v)}</option>)}
        </select>
      </Field>
      {s.spell.personal.length ? (
        <Field label={t('sp.personal', { n: s.spell.personal.length })}>
          <div className="chips-wrap">{s.spell.personal.map((w) => <span key={w} className="chip">{w}<button type="button" aria-label={t('act.delete')} onClick={() => setSettings({ spell: { ...s.spell, personal: s.spell.personal.filter((x) => x !== w) } })}>×</button></span>)}</div>
        </Field>
      ) : null}
    </div>
  );
}

function Keys({ s }: { s: AppSettings }) {
  const setEl = (type: ElementType, combo: string) => {
    const next: Record<string, ElementType> = {};
    for (const [k, v] of Object.entries(s.elementKeys)) if (v !== type && k !== combo) next[k] = v;
    if (combo) next[combo] = type;
    setSettings({ elementKeys: next });
  };
  const keyOf = (type: ElementType) => Object.entries(s.elementKeys).find(([, v]) => v === type)?.[0] ?? '';
  return (
    <div className="st-sec">
      <h4>{t('st.keys.elements')}</h4>
      <table className="tbl keys"><tbody>
        {ALL_ELEMENT_TYPES.map((type) => <tr key={type}><td>{t('el.' + type)}</td><td><KeyRecorder value={keyOf(type)} onChange={(c) => setEl(type, c)} /></td></tr>)}
      </tbody></table>
      <h4 className="mt">{t('st.keys.commands')}</h4>
      <table className="tbl keys"><tbody>
        {COMMANDS.filter((c) => !c.id.startsWith('view:')).map((c) => (
          <tr key={c.id}><td>{c.label()}</td><td><KeyRecorder value={s.shortcuts[c.id] ?? ''} onChange={(combo) => setSettings({ shortcuts: { ...s.shortcuts, [c.id]: combo } })} /></td></tr>
        ))}
      </tbody></table>
      <p className="muted small">{t('st.keys.fixed')}</p>
      <Button kind="ghost" icon="refresh" onClick={() => setSettings({ elementKeys: DEFAULT_ELEMENT_KEYS, shortcuts: DEFAULT_SHORTCUTS })}>{t('st.keys.reset')}</Button>
    </div>
  );
}

function Macros({ s }: { s: AppSettings }) {
  const list = Object.entries(s.macros);
  const [combo, setCombo] = useState('Alt+1');
  const [text, setText] = useState('');
  const [type, setType] = useState<ElementType | ''>('');
  return (
    <div className="st-sec">
      <p className="muted">{t('st.macros.h')}</p>
      <table className="tbl"><thead><tr><th>{t('st.macros.key')}</th><th>{t('st.macros.text')}</th><th>{t('ed.element')}</th><th /></tr></thead><tbody>
        {list.map(([k, m]) => <tr key={k}><td><Kbd combo={k} /></td><td>{m.text}</td><td>{m.type ? t('el.' + m.type) : t('st.macros.inline')}</td><td><Button small kind="ghost" icon="trash" title={t('act.delete')} onClick={() => { const n = { ...s.macros }; delete n[k]; setSettings({ macros: n }); }} /></td></tr>)}
        <tr>
          <td><KeyRecorder value={combo} onChange={setCombo} /></td>
          <td><input className="input" value={text} placeholder="INT. COCINA - DÍA" onChange={(e) => setText(e.target.value)} /></td>
          <td><select className="select" value={type} onChange={(e) => setType(e.target.value as ElementType | '')}><option value="">{t('st.macros.inline')}</option>{ALL_ELEMENT_TYPES.map((ty) => <option key={ty} value={ty}>{t('el.' + ty)}</option>)}</select></td>
          <td><Button small kind="primary" icon="plus" disabled={!combo || !text} onClick={() => { setSettings({ macros: { ...s.macros, [combo]: { text, type: type || undefined } } }); setText(''); }}>{t('act.add')}</Button></td>
        </tr>
      </tbody></table>
    </div>
  );
}

function Goals({ s }: { s: AppSettings }) {
  return (
    <div className="st-sec grid3">
      <Field label={t('st.goals.words')}><NumberInput value={s.goals.dailyWords} min={0} step={50} onChange={(v) => setSettings({ goals: { ...s.goals, dailyWords: v } })} /></Field>
      <Field label={t('st.goals.pages')}><NumberInput value={s.goals.dailyPages} min={0} step={0.5} onChange={(v) => setSettings({ goals: { ...s.goals, dailyPages: v } })} /></Field>
      <Field label={t('st.goals.sprint')}><NumberInput value={s.sprintMinutes} min={5} max={180} step={5} onChange={(v) => setSettings({ sprintMinutes: v })} /></Field>
    </div>
  );
}

function Ai({ s }: { s: AppSettings }) {
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<AppSettings['ai']>) => setSettings({ ai: { ...s.ai, ...patch } });
  return (
    <div className="st-sec">
      <div className="note"><Icon name="info" size={16} /><span>{t('st.ai.privacy')}</span></div>
      <Toggle checked={s.ai.enabled} onChange={(v) => set({ enabled: v })} label={t('st.ai.enable')} />
      <Field label={t('st.ai.provider')}><Segmented value={s.ai.provider} onChange={(v: 'anthropic' | 'openai') => set({ provider: v, model: v === 'anthropic' ? 'claude-haiku-5-5' : s.ai.model === 'claude-haiku-5-5' ? 'llama3.1' : s.ai.model })} options={[{ value: 'anthropic', label: 'Anthropic (Claude)' }, { value: 'openai', label: t('st.ai.openai') }]} /></Field>
      {s.ai.provider === 'openai' ? <Field label={t('st.ai.baseUrl')} hint={t('st.ai.baseUrl.h')}><input className="input" value={s.ai.baseUrl} onChange={(e) => set({ baseUrl: e.target.value })} /></Field> : null}
      <div className="grid2">
        <Field label={t('st.ai.key')} hint={s.ai.provider === 'openai' ? t('st.ai.key.optional') : undefined}><input className="input" type="password" value={s.ai.apiKey} autoComplete="off" onChange={(e) => set({ apiKey: e.target.value })} /></Field>
        <Field label={t('st.ai.model')}><input className="input" value={s.ai.model} onChange={(e) => set({ model: e.target.value })} /></Field>
      </div>
      <div className="row"><Button icon="check" disabled={busy || !s.ai.enabled} onClick={async () => { setBusy(true); try { await testAi(); toast(t('st.ai.ok'), 'success'); } catch (e) { toast(String((e as Error).message), 'error'); } setBusy(false); }}>{busy ? <Spinner /> : t('st.ai.test')}</Button></div>
    </div>
  );
}

function Collab({ s }: { s: AppSettings }) {
  const set = (patch: Partial<AppSettings['collab']>) => setSettings({ collab: { ...s.collab, ...patch } });
  return (
    <div className="st-sec">
      <div className="grid3">
        <Field label={t('st.co.name')}><input className="input" value={s.collab.name} placeholder={s.author || t('w.you')} onChange={(e) => set({ name: e.target.value })} /></Field>
        <Field label={t('w.color')}><input className="input" type="color" value={s.collab.color} onChange={(e) => set({ color: e.target.value })} /></Field>
        <Field label={t('st.co.server')}><input className="input" value={s.collab.server} onChange={(e) => set({ server: e.target.value })} /></Field>
      </div>
      <p className="muted">{t('st.co.h')}</p>
      <pre className="code">node server/collab-server.mjs --port 4735</pre>
    </div>
  );
}

function Cloud({ s }: { s: AppSettings }) {
  const st = useApp((x) => x.cloud);
  const [mod, setMod] = useState<typeof import('../../cloud/cloud') | null>(null);
  useEffect(() => { void import('../../cloud/cloud').then(setMod); }, []);
  const c = s.cloud;
  const card = (id: 'dropbox' | 'gdrive', name: string, note: string, enabled: boolean) => (
    <article className={'cl-card' + (c.provider === id ? ' on' : '')}>
      <div className={'cl-logo ' + id} aria-hidden="true" />
      <div className="grow">
        <b>{name}</b>
        <p className="muted small">{note}</p>
      </div>
      {c.provider === id ? <Button small kind="ghost" onClick={() => mod?.disconnect()}>{t('cl.disconnect')}</Button>
        : <Button small kind="primary" disabled={!enabled || !mod || !!c.provider} onClick={() => void mod?.connect(id)}>{t('cl.connect')}</Button>}
    </article>
  );
  return (
    <div className="st-sec">
      <p className="muted">{t('cl.intro')}</p>
      {card('dropbox', 'Dropbox', t('cl.dropbox.h'), true)}
      {card('gdrive', 'Google Drive', mod && !mod.googleAvailable() ? t('cl.gdrive.desktop') : t('cl.gdrive.h'), !!mod?.googleAvailable())}
      {c.provider ? (
        <div className="cl-status">
          <span className={'cl-dot ' + st.state} />
          <span className="grow">{st.state === 'syncing' ? (st.total ? t('cl.syncingN', { a: st.done, b: st.total }) : t('cl.syncing')) : st.state === 'error' ? (st.error === 'auth' ? t('cl.reconnect') : t('cl.error', { msg: st.error })) : st.last ? t('cl.last', { when: relTime(st.last) }) : t('cl.never')}</span>
          {st.state === 'error' && st.error === 'auth' ? <Button small onClick={() => void mod?.connect(c.provider as 'dropbox' | 'gdrive')}>{t('cl.connect')}</Button> : null}
          <Button small icon="refresh" disabled={st.state === 'syncing'} onClick={() => void mod?.syncNow()}>{t('cl.now')}</Button>
        </div>
      ) : null}
      <Toggle checked={c.auto} onChange={(v) => setSettings({ cloud: { ...c, auto: v } })} label={t('cl.auto')} hint={t('cl.auto.h')} />
      <details className="st-adv">
        <summary>{t('cl.adv')}</summary>
        <p className="muted small">{t('cl.adv.h')}</p>
        <Field label={t('cl.dropboxKey')}><input className="input" value={c.dropboxKey} placeholder={t('cl.builtin')} onChange={(e) => setSettings({ cloud: { ...c, dropboxKey: e.target.value.trim() } })} /></Field>
        <Field label={t('cl.googleId')}><input className="input" value={c.googleClientId} placeholder={t('cl.builtin')} onChange={(e) => setSettings({ cloud: { ...c, googleClientId: e.target.value.trim() } })} /></Field>
      </details>
    </div>
  );
}

function Updates({ s }: { s: AppSettings }) {
  const [state, setStateL] = useState<string>('');
  const check = async () => {
    setStateL('…');
    try {
      const u = await checkForUpdate(s.update.repo);
      setSettings({ update: { ...s.update, lastCheck: Date.now() } });
      setStateL(u.available ? t('st.up.available', { v: u.version }) : t('st.up.latest'));
      if (u.available) toast(t('st.up.available', { v: u.version }), 'info', { label: t('act.download'), run: () => void openExternal(u.url) }, 12000);
    } catch (e) { setStateL(t('err.network') + ' ' + String((e as Error).message)); }
  };
  return (
    <div className="st-sec">
      <p>{t('st.up.current', { v: APP_LABEL })}</p>
      <Field label={t('st.up.repo')} hint={t('st.up.repo.h')}><input className="input" value={s.update.repo} placeholder="usuario/scriptz" onChange={(e) => setSettings({ update: { ...s.update, repo: e.target.value.trim() } })} /></Field>
      <Toggle checked={s.update.auto} onChange={(v) => setSettings({ update: { ...s.update, auto: v } })} label={t('st.up.auto')} />
      <div className="row"><Button icon="refresh" onClick={check} disabled={!s.update.repo}>{t('st.up.check')}</Button><span className="muted">{state}</span></div>
    </div>
  );
}

function Backup() {
  const [busy, setBusy] = useState(false);
  const exportAll = async () => {
    setBusy(true);
    try {
      const st = projectStore();
      const list = await st.list();
      const entries = [];
      for (const s of list) { const p = await st.load(s.id); entries.push({ name: `${(p.title || p.id).replace(/[\\/:*?"<>|]+/g, '_')}-${p.id.slice(0, 8)}.scriptz`, data: serializeProject(p) }); }
      const zip = await writeZip(entries);
      await saveFile(`ScriptlZ-respaldo-${new Date().toISOString().slice(0, 10)}.zip`, zip, [{ name: 'ZIP', extensions: ['zip'] }]);
    } catch (e) { toast(String((e as Error).message), 'error'); }
    setBusy(false);
  };
  const importAll = async () => {
    const f = await pickFile([{ name: 'ZIP', extensions: ['zip'] }]);
    if (!f) return;
    setBusy(true);
    try {
      const files = await readZip(f.bytes);
      const { loadProject } = await import('../../core/migrate');
      let n = 0;
      const existing = new Set(getState().library.map((x) => x.id));
      for (const [name, data] of files) {
        if (!name.endsWith('.scriptz')) continue;
        const p = loadProject(new TextDecoder().decode(data));
        if (existing.has(p.id)) continue;
        await projectStore().save(p);
        n++;
      }
      await refreshLibrary();
      toast(t('st.bk.imported', { n }), 'success');
    } catch (e) { toast(String((e as Error).message), 'error'); }
    setBusy(false);
  };
  return (
    <div className="st-sec">
      <p>{t(isTauri() ? 'st.bk.desktop' : 'st.bk.web')}</p>
      <div className="note"><Icon name="cloud" size={16} /><span>{t('st.bk.cloud')}</span></div>
      <div className="row"><Button icon="download" onClick={exportAll} disabled={busy}>{t('st.bk.exportAll')}</Button><Button icon="upload" onClick={importAll} disabled={busy}>{t('st.bk.importAll')}</Button>{busy ? <Spinner /> : null}</div>
    </div>
  );
}

function About() {
  return (
    <div className="st-sec about">
      <div className="row"><Logo size={48} /><div><h2>ScriptlZ {APP_LABEL}</h2><p className="muted">{t('app.tagline')}</p></div></div>
      <p>{t('st.ab.free')}</p>
      <h4>{t('st.ab.licenses')}</h4>
      <ul className="small">
        <li>Liberation Mono — SIL Open Font License 1.1 (Red Hat, Google)</li>
        <li>DejaVu Sans Mono — Bitstream Vera License / dominio público</li>
        <li>React — MIT · Tauri — MIT/Apache-2.0 · pdf.js — Apache-2.0</li>
      </ul>
    </div>
  );
}

export default function SettingsView() {
  const s = useApp((st) => st.settings);
  const [tab, setTab] = useState<Tab>('general');
  const tabs: { value: Tab; label: string; icon: string }[] = [
    { value: 'general', label: t('st.t.general'), icon: 'sliders' }, { value: 'editor', label: t('st.t.editor'), icon: 'pen' }, { value: 'keys', label: t('st.t.keys'), icon: 'keyboard' },
    { value: 'macros', label: t('ed.macros'), icon: 'wand' }, { value: 'goals', label: t('st.t.goals'), icon: 'target' }, { value: 'ai', label: t('st.t.ai'), icon: 'sparkles' },
    { value: 'collab', label: t('ed.collab'), icon: 'users' }, { value: 'cloud', label: t('cl.tab'), icon: 'cloud' }, { value: 'updates', label: t('st.t.updates'), icon: 'refresh' }, { value: 'backup', label: t('st.t.backup'), icon: 'cloud' }, { value: 'about', label: t('st.t.about'), icon: 'info' },
  ];
  return (
    <div className="view settings">
      <header className="view-h"><h2>{t('nav.settings')}</h2></header>
      <div className="settings-body">
        <nav className="st-nav">{tabs.map((tb) => <button key={tb.value} type="button" className={'st-tab' + (tab === tb.value ? ' on' : '')} onClick={() => setTab(tb.value)}><Icon name={tb.icon} size={16} />{tb.label}</button>)}</nav>
        <div className="st-content">
          {tab === 'general' ? <General s={s} /> : null}
          {tab === 'editor' ? <Editor s={s} /> : null}
          {tab === 'keys' ? <Keys s={s} /> : null}
          {tab === 'macros' ? <Macros s={s} /> : null}
          {tab === 'goals' ? <Goals s={s} /> : null}
          {tab === 'ai' ? <Ai s={s} /> : null}
          {tab === 'collab' ? <Collab s={s} /> : null}
          {tab === 'cloud' ? <Cloud s={s} /> : null}
          {tab === 'updates' ? <Updates s={s} /> : null}
          {tab === 'backup' ? <Backup /> : null}
          {tab === 'about' ? <About /> : null}
        </div>
      </div>
    </div>
  );
}

export { Tabs };
