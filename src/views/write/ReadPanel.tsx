// Table read: a voice per character, narrator for action, rehearsal mode (skips your role), WAV export on Windows.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp, toast } from '../../app/store';
import { getEditor, setSettings } from '../../app/actions';
import { characterName, characterStats } from '../../core/scenes';
import { localeTokens } from '../../core/format';
import type { Block } from '../../core/model';
import { chooseWavPath, isTauri, renderAudio, windowsVoices } from '../../platform';
import { t } from '../../i18n';
import { Button, Field, Toggle } from '../../ui/kit';
import { Icon } from '../../ui/icons';

interface Cue { blockId: string; speaker: string; text: string; narrator: boolean }

const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;

function buildCues(blocks: Block[], from: number, opts: { readActions: boolean; readHeadings: boolean; readParentheticals: boolean }): Cue[] {
  const out: Cue[] = [];
  let speaker = '';
  for (let i = from; i < blocks.length; i++) {
    const b = blocks[i];
    const text = b.text.trim();
    if (!text || b.type === 'note') continue;
    if (b.type === 'character') { speaker = characterName(b.text); continue; }
    if (b.type === 'dialogue' || b.type === 'lyrics') { out.push({ blockId: b.id, speaker, text, narrator: false }); continue; }
    if (b.type === 'parenthetical') { if (opts.readParentheticals) out.push({ blockId: b.id, speaker: '', text: text.replace(/[()]/g, ''), narrator: true }); continue; }
    speaker = '';
    if (b.type === 'scene' || b.type === 'shot' || b.type === 'act') { if (opts.readHeadings) out.push({ blockId: b.id, speaker: '', text: text.replace(/\bINT\./gi, 'Interior.').replace(/\bEXT\./gi, 'Exterior.').replace(/\s-\s/g, '. '), narrator: true }); continue; }
    if (opts.readActions) out.push({ blockId: b.id, speaker: '', text, narrator: true });
  }
  return out;
}

export default function ReadPanel() {
  const project = useApp((s) => s.project)!;
  const ra = useApp((s) => s.settings.readAloud);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(() => synth?.getVoices() ?? []);
  const [state, setStateL] = useState<'idle' | 'playing' | 'paused' | 'myturn'>('idle');
  const [myRole, setMyRole] = useState('');
  const [current, setCurrent] = useState('');
  const queue = useRef<Cue[]>([]);
  const idx = useRef(0);
  const stopped = useRef(true);
  const chars = useMemo(() => characterStats(project.blocks).map((c) => c.name), [project.blocks]);
  const lang = localeTokens(project.locale).lang;
  useEffect(() => {
    if (!synth) return;
    const on = () => setVoices(synth.getVoices());
    synth.addEventListener?.('voiceschanged', on);
    on();
    return () => { synth.removeEventListener?.('voiceschanged', on); stopAll(); };
  }, []);
  const langVoices = voices.filter((v) => v.lang.toLowerCase().startsWith(lang.slice(0, 2)));
  const pool = langVoices.length ? langVoices : voices;
  const voiceFor = (speaker: string, narrator: boolean): SpeechSynthesisVoice | undefined => {
    const name = narrator ? ra.narrator : ra.voices[speaker];
    const v = pool.find((x) => x.name === name);
    if (v) return v;
    if (narrator || !pool.length) return pool[0];
    // Distinct default voice per character.
    const i = Math.abs([...speaker].reduce((a, c) => a * 31 + c.charCodeAt(0), 7)) % pool.length;
    return pool[i];
  };
  function stopAll() { stopped.current = true; synth?.cancel(); getEditor()?.markReading(null); setStateL('idle'); setCurrent(''); }
  const speakNext = () => {
    if (stopped.current || !synth) return;
    const cue = queue.current[idx.current];
    if (!cue) { stopAll(); return; }
    getEditor()?.markReading(cue.blockId);
    setCurrent(cue.speaker || t('ra.narratorShort'));
    if (!cue.narrator && myRole && cue.speaker === myRole) { setStateL('myturn'); return; }
    const u = new SpeechSynthesisUtterance(cue.text);
    const v = voiceFor(cue.speaker, cue.narrator);
    if (v) u.voice = v;
    u.lang = v?.lang ?? lang;
    u.rate = Math.max(0.5, Math.min(2, ra.rate));
    if (cue.narrator) u.pitch = 0.95;
    u.onend = () => { idx.current++; speakNext(); };
    u.onerror = () => { idx.current++; speakNext(); };
    setStateL('playing');
    synth.speak(u);
  };
  const play = (fromCaret: boolean) => {
    if (!synth) return;
    synth.cancel();
    const ed = getEditor();
    const sel = ed?.getSelection();
    const from = fromCaret && sel ? Math.max(0, project.blocks.findIndex((b) => b.id === sel.focus.id)) : 0;
    queue.current = buildCues(project.blocks, from, ra);
    idx.current = 0;
    stopped.current = false;
    speakNext();
  };
  const pause = () => { if (!synth) return; if (state === 'paused') { synth.resume(); setStateL('playing'); } else { synth.pause(); setStateL('paused'); } };
  const cont = () => { idx.current++; setStateL('playing'); speakNext(); };
  const skip = () => { synth?.cancel(); /* onend → next */ };
  const exportWav = async () => {
    const path = await chooseWavPath(`${project.title || 'lectura'}.wav`);
    if (!path) return;
    const sapi = await windowsVoices();
    const match = (name: string) => { const n = name.toLowerCase(); return sapi.find((v) => n.includes(v.name.toLowerCase().replace(/^microsoft\s+/, '').split(' ')[0]))?.name ?? ''; };
    const cues = buildCues(project.blocks, 0, ra);
    const map: Record<string, string> = {};
    for (const c of chars) { const v = voiceFor(c, false); if (v) map[c] = match(v.name); }
    const nv = voiceFor('', true);
    map['NARRADOR'] = nv ? match(nv.name) : '';
    try {
      toast(t('w.loading'), 'info');
      const out = await renderAudio(path, cues.map((c) => ({ speaker: c.narrator ? 'NARRADOR' : c.speaker, text: myRole && c.speaker === myRole ? '' : c.text, pause: myRole && c.speaker === myRole ? Math.min(20000, c.text.split(/\s+/).length * 420) : 350 })), map, ra.rate);
      toast(t('ra.exported', { path: out }), 'success');
    } catch (e) { toast(String((e as Error).message ?? e), 'error'); }
  };
  if (!synth) return <div className="panel"><p className="muted">{t('ra.noVoices')}</p></div>;
  const setRa = (patch: Partial<typeof ra>) => setSettings({ readAloud: { ...ra, ...patch } });
  return (
    <div className="panel read">
      <div className="row gap wrap">
        {state === 'idle' ? (
          <>
            <Button kind="primary" icon="play" onClick={() => play(true)}>{t('ra.fromCaret')}</Button>
            <Button icon="skipBack" onClick={() => play(false)}>{t('ra.fromStart')}</Button>
          </>
        ) : (
          <>
            <Button icon={state === 'paused' ? 'play' : 'pause'} onClick={pause} disabled={state === 'myturn'}>{state === 'paused' ? t('act.resume') : t('act.pause')}</Button>
            <Button icon="skipForward" onClick={skip} disabled={state === 'myturn'}>{t('act.next')}</Button>
            <Button kind="ghost" icon="stop" onClick={stopAll}>{t('act.stop')}</Button>
          </>
        )}
      </div>
      {state !== 'idle' ? <p className="reading-now"><Icon name="speaker" size={15} /> {current}</p> : null}
      {state === 'myturn' ? <div className="myturn"><p>{t('ra.myTurn')}</p><Button kind="primary" onClick={cont}>{t('act.resume')}</Button></div> : null}
      {!voices.length ? <p className="muted small">{t('ra.noVoices')}</p> : null}
      <Field label={t('ra.rate')}><input type="range" min={0.6} max={1.8} step={0.05} value={ra.rate} onChange={(e) => setRa({ rate: Number(e.target.value) })} /></Field>
      <Toggle checked={ra.readActions} onChange={(v) => setRa({ readActions: v })} label={t('ra.readActions')} />
      <Toggle checked={ra.readHeadings} onChange={(v) => setRa({ readHeadings: v })} label={t('ra.readHeadings')} />
      <Toggle checked={ra.readParentheticals} onChange={(v) => setRa({ readParentheticals: v })} label={t('ra.readParens')} />
      <Field label={t('ra.myRole')}>
        <select className="select" value={myRole} onChange={(e) => setMyRole(e.target.value)}><option value="">{t('w.none')}</option>{chars.map((c) => <option key={c} value={c}>{c}</option>)}</select>
      </Field>
      <hr />
      <Field label={t('ra.narrator')}>
        <select className="select" value={ra.narrator} onChange={(e) => setRa({ narrator: e.target.value })}><option value="">{t('ra.defaultVoice')}</option>{pool.map((v) => <option key={v.name} value={v.name}>{v.name}</option>)}</select>
      </Field>
      {chars.map((c) => (
        <Field key={c} label={t('ra.voiceFor', { name: c })}>
          <select className="select" value={ra.voices[c] ?? ''} onChange={(e) => setRa({ voices: { ...ra.voices, [c]: e.target.value } })}><option value="">{t('ra.defaultVoice')}</option>{pool.map((v) => <option key={v.name} value={v.name}>{v.name}</option>)}</select>
        </Field>
      ))}
      {isTauri() ? <Button icon="download" onClick={() => void exportWav()}>{t('ra.exportWav')}</Button> : null}
    </div>
  );
}
