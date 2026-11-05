// Table read: a voice per character, narrator for action, rehearsal mode (skips your role), WAV export on Windows.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp, toast } from '../../app/store';
import { getEditor, setSettings } from '../../app/actions';
import { characterName, characterStats } from '../../core/scenes';
import { localeTokens } from '../../core/format';
import type { Block } from '../../core/model';
import { chooseWavPath, isTauri, renderAudio, windowsVoices } from '../../platform';
import { t } from '../../i18n';
import { Button, Field, IconBtn, Segmented, Toggle, cx } from '../../ui/kit';
import { deleteTake, recordingMime, saveTake, startRecording, takesFor, type Take } from './takes';
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
  const [tab, setTab] = useState<'read' | 'voices' | 'record'>('read');
  const [takes, setTakes] = useState<Map<string, Take>>(new Map());
  const audio = useRef<HTMLAudioElement | null>(null);
  useEffect(() => { void takesFor(project.id).then(setTakes); }, [project.id]);
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
  function stopAll() { stopped.current = true; synth?.cancel(); audio.current?.pause(); getEditor()?.markReading(null); setStateL('idle'); setCurrent(''); }
  const speakNext = () => {
    if (stopped.current || !synth) return;
    const cue = queue.current[idx.current];
    if (!cue) { stopAll(); return; }
    getEditor()?.markReading(cue.blockId);
    setCurrent(cue.speaker || t('ra.narratorShort'));
    if (!cue.narrator && myRole && cue.speaker === myRole) { setStateL('myturn'); return; }
    // A recorded take plays instead of the synthetic voice.
    const take = ra.useTakes ? takes.get(cue.blockId) : undefined;
    if (take) {
      const a = new Audio(URL.createObjectURL(take.blob));
      audio.current = a;
      const next = () => { URL.revokeObjectURL(a.src); idx.current++; speakNext(); };
      a.onended = next; a.onerror = next;
      setStateL('playing');
      void a.play().catch(next);
      return;
    }
    const u = new SpeechSynthesisUtterance(cue.text);
    const v = voiceFor(cue.speaker, cue.narrator);
    if (v) u.voice = v;
    u.lang = v?.lang ?? lang;
    const tune = ra.tune[cue.narrator ? '' : cue.speaker];
    u.rate = Math.max(0.5, Math.min(2, ra.rate * (tune?.rate ?? 1)));
    u.pitch = Math.max(0, Math.min(2, tune?.pitch ?? (cue.narrator ? 0.95 : 1)));
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
  const pause = () => {
    if (!synth) return;
    const a = audio.current && !audio.current.ended && !audio.current.paused ? audio.current : null;
    if (state === 'paused') { if (audio.current && audio.current.paused && !audio.current.ended && audio.current.currentTime > 0) void audio.current.play(); else synth.resume(); setStateL('playing'); }
    else { if (a) a.pause(); else synth.pause(); setStateL('paused'); }
  };
  const cont = () => { idx.current++; setStateL('playing'); speakNext(); };
  const skip = () => { if (audio.current && !audio.current.paused) { audio.current.pause(); audio.current.onended?.(new Event('ended')); return; } synth?.cancel(); /* onend → next */ };
  const preview = (speaker: string) => {
    if (!synth) return;
    synth.cancel();
    const line = project.blocks.find((b, i) => b.type === 'dialogue' && project.blocks.slice(0, i).reverse().find((x) => x.type === 'character')?.text && characterName(project.blocks.slice(0, i).reverse().find((x) => x.type === 'character')!.text) === speaker)?.text ?? speaker;
    const u = new SpeechSynthesisUtterance(line.slice(0, 160));
    const v = voiceFor(speaker, !speaker);
    if (v) u.voice = v;
    u.lang = v?.lang ?? lang;
    const tune = ra.tune[speaker];
    u.rate = Math.max(0.5, Math.min(2, ra.rate * (tune?.rate ?? 1)));
    u.pitch = tune?.pitch ?? 1;
    synth.speak(u);
  };
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
      <Segmented value={tab} onChange={setTab} options={[{ value: 'read', label: t('ra.tab.read') }, { value: 'voices', label: t('ra.tab.voices') }, { value: 'record', label: t('ra.tab.record') }]} />
      {tab === 'read' ? (
        <>
          <Field label={t('ra.rate')}><input type="range" min={0.6} max={1.8} step={0.05} value={ra.rate} onChange={(e) => setRa({ rate: Number(e.target.value) })} /></Field>
          <Toggle checked={ra.readActions} onChange={(v) => setRa({ readActions: v })} label={t('ra.readActions')} />
          <Toggle checked={ra.readHeadings} onChange={(v) => setRa({ readHeadings: v })} label={t('ra.readHeadings')} />
          <Toggle checked={ra.readParentheticals} onChange={(v) => setRa({ readParentheticals: v })} label={t('ra.readParens')} />
          <Toggle checked={ra.useTakes} onChange={(v) => setRa({ useTakes: v })} label={t('ra.useTakes')} hint={t('ra.useTakes.h', { n: takes.size })} />
          <Field label={t('ra.myRole')}>
            <select className="select" value={myRole} onChange={(e) => setMyRole(e.target.value)}><option value="">{t('w.none')}</option>{chars.map((c) => <option key={c} value={c}>{c}</option>)}</select>
          </Field>
        </>
      ) : null}
      {tab === 'voices' ? (
        <div className="ra-voices">
          {['', ...chars].map((c) => {
            const tune = ra.tune[c] ?? { pitch: c ? 1 : 0.95, rate: 1 };
            const setTune = (patch: Partial<typeof tune>) => setRa({ tune: { ...ra.tune, [c]: { ...tune, ...patch } } });
            return (
              <article key={c || '_n'} className="ra-voice">
                <header><b>{c || t('ra.narrator')}</b><IconBtn small icon="play" title={t('ra.preview')} onClick={() => preview(c)} /></header>
                <select className="select sm" value={(c ? ra.voices[c] : ra.narrator) ?? ''} onChange={(e) => (c ? setRa({ voices: { ...ra.voices, [c]: e.target.value } }) : setRa({ narrator: e.target.value }))}>
                  <option value="">{t('ra.defaultVoice')}</option>{pool.map((v) => <option key={v.name} value={v.name}>{v.name}</option>)}
                </select>
                <label className="ra-knob"><span>{t('ra.pitch')}</span><input type="range" min={0.5} max={1.6} step={0.05} value={tune.pitch} onChange={(e) => setTune({ pitch: Number(e.target.value) })} /></label>
                <label className="ra-knob"><span>{t('ra.speed')}</span><input type="range" min={0.7} max={1.4} step={0.05} value={tune.rate} onChange={(e) => setTune({ rate: Number(e.target.value) })} /></label>
              </article>
            );
          })}
        </div>
      ) : null}
      {tab === 'record' ? <RecordTab projectId={project.id} blocks={project.blocks} chars={chars} takes={takes} onChange={() => void takesFor(project.id).then(setTakes)} /> : null}
      {isTauri() ? <Button icon="download" onClick={() => void exportWav()}>{t('ra.exportWav')}</Button> : null}
    </div>
  );
}

/** Each actor records their own lines; the table read then uses those takes instead of synthetic voices. */
function RecordTab({ projectId, blocks, chars, takes, onChange }: { projectId: string; blocks: Block[]; chars: string[]; takes: Map<string, Take>; onChange: () => void }) {
  const [who, setWho] = useState(chars[0] ?? '');
  const [rec, setRec] = useState<{ id: string; stop: () => Promise<Blob>; cancel: () => void; level: () => number } | null>(null);
  const [level, setLevel] = useState(0);
  const playing = useRef<HTMLAudioElement | null>(null);
  const lines = useMemo(() => {
    const out: { b: Block; i: number }[] = [];
    let speaker = '';
    blocks.forEach((b, i) => {
      if (b.type === 'character') speaker = characterName(b.text);
      else if ((b.type === 'dialogue' || b.type === 'lyrics') && speaker === who && b.text.trim()) out.push({ b, i });
      else if (b.type !== 'parenthetical' && b.type !== 'dialogue' && b.type !== 'lyrics') speaker = '';
    });
    return out;
  }, [blocks, who]);
  useEffect(() => {
    if (!rec) return;
    let raf = 0;
    const tick = () => { setLevel(rec.level()); raf = requestAnimationFrame(tick); };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [rec]);
  useEffect(() => () => rec?.cancel(), [rec]);
  if (!recordingMime() || !navigator.mediaDevices?.getUserMedia) return <p className="muted">{t('ra.rec.unsupported')}</p>;
  const start = async (b: Block) => {
    if (rec) await stop();
    try {
      const r = await startRecording();
      setRec({ id: b.id, ...r });
      getEditor()?.markReading(b.id);
    } catch { toast(t('ra.rec.denied'), 'error'); }
  };
  const stop = async () => {
    if (!rec) return;
    const r = rec;
    setRec(null);
    const blob = await r.stop();
    const b = blocks.find((x) => x.id === r.id);
    if (b && blob.size > 800) { await saveTake({ project: projectId, block: b.id, text: b.text, type: blob.type, blob }); onChange(); }
    getEditor()?.markReading(null);
  };
  const play = (tk: Take) => { playing.current?.pause(); const a = new Audio(URL.createObjectURL(tk.blob)); playing.current = a; void a.play(); };
  const done = lines.filter((l) => takes.has(l.b.id)).length;
  return (
    <div className="ra-rec">
      <p className="muted small">{t('ra.rec.intro')}</p>
      <Field label={t('ra.rec.who')}>
        <select className="select" value={who} onChange={(e) => setWho(e.target.value)}>{chars.map((c) => <option key={c} value={c}>{c}</option>)}</select>
      </Field>
      <div className="ra-prog"><div className="bar"><i style={{ width: lines.length ? (done / lines.length) * 100 + '%' : 0 }} /></div><small>{t('ra.rec.progress', { a: done, b: lines.length })}</small></div>
      <div className="ra-lines">
        {lines.map(({ b }) => {
          const tk = takes.get(b.id);
          const on = rec?.id === b.id;
          return (
            <article key={b.id} className={cx('ra-line', on && 'on', tk && 'done')}>
              <button type="button" className="ra-txt" onClick={() => getEditor()?.scrollToBlock(b.id)}>{b.text}</button>
              {on ? <span className="ra-meter" aria-hidden="true"><i style={{ transform: `scaleX(${Math.min(1, level * 2.2)})` }} /></span> : null}
              <div className="row">
                {on ? <Button small kind="primary" icon="stop" onClick={() => void stop()}>{t('ra.rec.stop')}</Button> : <IconBtn small icon="mic" title={tk ? t('ra.rec.redo') : t('ra.rec.start')} onClick={() => void start(b)} />}
                {tk && !on ? <IconBtn small icon="play" title={t('ra.rec.play')} onClick={() => play(tk)} /> : null}
                {tk && !on ? <IconBtn small icon="trash" title={t('act.delete')} onClick={() => void deleteTake(projectId, b.id).then(onChange)} /> : null}
                {tk && tk.text !== b.text ? <small className="ra-stale">{t('ra.rec.stale')}</small> : null}
              </div>
            </article>
          );
        })}
        {!lines.length ? <p className="muted">{t('ra.rec.none')}</p> : null}
      </div>
    </div>
  );
}
