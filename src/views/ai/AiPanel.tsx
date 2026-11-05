// AI assistant panel (optional, opt-in).
import { useState } from 'react';
import { useApp, setState } from '../../app/store';
import { getEditor, patchProject, updateProject } from '../../app/actions';
import { buildScenes } from '../../core/scenes';
import { askAi, PROMPTS, scriptForAi } from './ai';
import { t, fmtNum } from '../../i18n';
import { Button, Segmented, Spinner } from '../../ui/kit';
import { Icon } from '../../ui/icons';

type Mode = 'logline' | 'summaries' | 'continuity' | 'rewrite' | 'ask';

export default function AiPanel() {
  const project = useApp((s) => s.project)!;
  const ai = useApp((s) => s.settings.ai);
  const [mode, setMode] = useState<Mode>('logline');
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState('');
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [instr, setInstr] = useState('');
  const [sel, setSel] = useState('');
  if (!ai.enabled) {
    return (
      <div className="panel">
        <div className="empty"><div className="empty-ic"><Icon name="sparkles" size={26} /></div><h3>{t('ai.off')}</h3><p>{t('ai.off.h')}</p>
          <Button kind="primary" onClick={() => setState({ view: 'settings' })}>{t('ai.configure')}</Button></div>
      </div>
    );
  }
  const run = async (fn: () => Promise<void>) => { setBusy(true); setErr(''); setOut(''); try { await fn(); } catch (e) { setErr(String((e as Error).message)); } setBusy(false); };
  const size = scriptForAi(project);
  const scenes = buildScenes(project.blocks);

  const doLogline = () => run(async () => setOut(await askAi(PROMPTS.logline(project))));
  const doContinuity = () => run(async () => setOut(await askAi(PROMPTS.continuity(project))));
  const doAsk = () => run(async () => setOut(await askAi(PROMPTS.ask(project, q))));
  const doSummaries = () => run(async () => {
    const list = scenes.filter((s) => !project.scenes[s.id]?.summary).slice(0, 60).map((s) => ({ label: s.label, heading: s.heading, text: project.blocks.slice(s.start + 1, s.end).map((b) => b.text).join('\n').slice(0, 2500) }));
    if (!list.length) { setOut(t('ai.sum.none')); return; }
    const res = await askAi(PROMPTS.summaries(project, list));
    const found: Record<string, string> = {};
    for (const line of res.split('\n')) { const m = /^\s*([0-9A-Z]+)\s*[:.)-]\s*(.+)$/.exec(line); if (m) found[m[1]] = m[2].trim(); }
    let n = 0;
    updateProject((p) => {
      const sc = { ...p.scenes };
      for (const s of scenes) if (found[s.label] && !sc[s.id]?.summary) { sc[s.id] = { ...(sc[s.id] ?? {}), summary: found[s.label] }; n++; }
      return { ...p, scenes: sc };
    });
    setOut(t('ai.sum.done', { n }) + '\n\n' + res);
  });
  const grabSelection = () => setSel(getEditor()?.selectedText() ?? '');
  const doRewrite = () => run(async () => {
    const ed = getEditor();
    const cur = project.blocks.findIndex((b) => b.id === ed?.getSelection()?.focus.id);
    const ctx = project.blocks.slice(Math.max(0, cur - 12), cur + 12).map((b) => b.text).join('\n');
    setOut(await askAi(PROMPTS.rewrite(project, sel, instr, ctx)));
  });
  const applyRewrite = () => {
    const ed = getEditor();
    if (!ed || !out) return;
    ed.insertText(out.replace(/\n+/g, ' ').trim());
    setOut('');
  };

  return (
    <div className="panel ai">
      <Segmented small value={mode} onChange={(m) => { setMode(m); setOut(''); setErr(''); if (m === 'rewrite') grabSelection(); }} options={[
        { value: 'logline', label: t('ai.m.logline') }, { value: 'summaries', label: t('ai.m.summaries') }, { value: 'continuity', label: t('ai.m.continuity') }, { value: 'rewrite', label: t('ai.m.rewrite') }, { value: 'ask', label: t('ai.m.ask') },
      ]} />
      <p className="muted small">{t('ai.sends', { n: fmtNum(size.text.length), provider: ai.provider === 'anthropic' ? 'Anthropic' : ai.baseUrl })}{size.truncated ? ' ' + t('ai.truncated') : ''}</p>
      {mode === 'logline' ? <Button kind="primary" icon="sparkles" onClick={doLogline} disabled={busy}>{t('ai.logline.go')}</Button> : null}
      {mode === 'summaries' ? <><p className="small">{t('ai.sum.h')}</p><Button kind="primary" icon="sparkles" onClick={doSummaries} disabled={busy}>{t('ai.sum.go')}</Button></> : null}
      {mode === 'continuity' ? <Button kind="primary" icon="sparkles" onClick={doContinuity} disabled={busy}>{t('ai.cont.go')}</Button> : null}
      {mode === 'rewrite' ? (
        <>
          <div className="row between"><small className="muted">{t('ai.rw.sel')}</small><Button small kind="ghost" icon="refresh" onClick={grabSelection}>{t('ai.rw.grab')}</Button></div>
          <blockquote className="quote">{sel || t('ai.rw.none')}</blockquote>
          <input className="input" value={instr} placeholder={t('ai.rw.ph')} onChange={(e) => setInstr(e.target.value)} />
          <Button kind="primary" icon="wand" onClick={doRewrite} disabled={busy || !sel}>{t('ai.rw.go')}</Button>
        </>
      ) : null}
      {mode === 'ask' ? <><textarea className="input" rows={3} value={q} placeholder={t('ai.ask.ph')} onChange={(e) => setQ(e.target.value)} /><Button kind="primary" icon="send" onClick={doAsk} disabled={busy || !q.trim()}>{t('act.sendMessage')}</Button></> : null}
      {busy ? <div className="row"><Spinner /><span className="muted">{t('ai.thinking')}</span></div> : null}
      {err ? <p className="err">{err}</p> : null}
      {out ? (
        <div className="ai-out">
          <pre>{out}</pre>
          <div className="row gap">
            <Button small icon="copy" onClick={() => void navigator.clipboard?.writeText(out)}>{t('act.copy')}</Button>
            {mode === 'logline' ? <Button small onClick={() => { const m = /LOGLINES?:\s*\n\s*1\.\s*(.+)/i.exec(out); const s = /SYNOPSIS:\s*\n?([\s\S]+)$/i.exec(out); patchProject({ ...(m ? { logline: m[1].trim() } : {}), ...(s ? { synopsis: s[1].trim() } : {}) }); }}>{t('ai.use')}</Button> : null}
            {mode === 'rewrite' ? <Button small kind="primary" onClick={applyRewrite}>{t('ai.rw.apply')}</Button> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
