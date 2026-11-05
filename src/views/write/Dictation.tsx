// Voice dictation with the Web Speech API when available; otherwise explains system dictation.
import { useEffect, useRef, useState } from 'react';
import { useApp, toast } from '../../app/store';
import { getEditor } from '../../app/actions';
import { localeTokens } from '../../core/format';
import { t } from '../../i18n';
import { IconBtn } from '../../ui/kit';

interface Rec { lang: string; continuous: boolean; interimResults: boolean; start(): void; stop(): void; onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null; onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null }

function recognizer(): (new () => Rec) | null {
  const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function DictationButton() {
  const project = useApp((s) => s.project);
  const [on, setOn] = useState(false);
  const rec = useRef<Rec | null>(null);
  useEffect(() => () => rec.current?.stop(), []);
  const toggle = () => {
    const R = recognizer();
    if (!R) { toast(t('dc.unavailable', { win: 'Win + H' }), 'info', undefined, 9000); getEditor()?.focus(); return; }
    if (on) { rec.current?.stop(); setOn(false); return; }
    const r = new R();
    r.lang = localeTokens(project?.locale ?? 'es-LA').lang;
    r.continuous = true;
    r.interimResults = false;
    r.onresult = (e) => {
      let text = '';
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) text += e.results[i][0].transcript;
      text = text.trim();
      if (!text) return;
      const ed = getEditor();
      if (!ed) return;
      const sel = ed.getSelection();
      const b = sel ? ed.getBlocks().find((x) => x.id === sel.focus.id) : null;
      const needsSpace = b && sel && sel.focus.off > 0 && !/\s$/.test(b.text.slice(0, sel.focus.off));
      ed.insertText((needsSpace ? ' ' : '') + text.charAt(0).toUpperCase() + text.slice(1));
    };
    r.onerror = (e) => { if (e.error !== 'no-speech') toast(t('dc.unavailable', { win: 'Win + H' }) + ` (${e.error})`, 'info', undefined, 8000); setOn(false); };
    r.onend = () => setOn(false);
    try { r.start(); rec.current = r; setOn(true); toast(t('dc.listening'), 'info', undefined, 2500); getEditor()?.focus(); } catch { setOn(false); }
  };
  return <IconBtn icon="mic" title={on ? t('dc.stop') : t('dc.start')} active={on} onClick={toggle} />;
}
