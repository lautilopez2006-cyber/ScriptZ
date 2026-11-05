// "Share as a page": a presentation (logline, synopsis, characters) plus the script, in a single link.
import { useMemo, useState } from 'react';
import { closeModal, toast, useApp } from '../app/store';
import { updateProject } from '../app/actions';
import { layoutProject } from '../core/layout';
import { toHtml } from '../io/text';
import { saveFile } from '../platform';
import { t } from '../i18n';
import { Button, Field, Modal, NumberInput, Spinner, Toggle } from '../ui/kit';
import { Icon } from '../ui/icons';
import { appBase, encodeShare, HASH, shareStats, shareableProject, standaloneHtml, type Pitch } from './share';

export default function ShareDialog() {
  const p = useApp((s) => s.project)!;
  const [pitch, setPitch] = useState<Pitch>({ logline: p.logline, synopsis: p.synopsis, genre: '', contact: p.titlePage.contact, full: true, sample: 10, allowDownload: true, allowCopy: false });
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const layout = useMemo(() => layoutProject(p), [p]);
  const set = (patch: Partial<Pitch>) => { setPitch((x) => ({ ...x, ...patch })); setLink(''); };
  const pagesSet = () => {
    if (pitch.full) return undefined;
    const ids = new Set<string>();
    for (const pg of layout.pages.slice(0, Math.max(1, pitch.sample))) for (const l of pg.lines) ids.add(l.blockId);
    return ids;
  };
  const make = async () => {
    setBusy(true);
    try {
      // Keep the logline and synopsis in the script too.
      if (pitch.logline !== p.logline || pitch.synopsis !== p.synopsis) updateProject((x) => ({ ...x, logline: pitch.logline, synopsis: pitch.synopsis }));
      const proj = shareableProject(p, pitch, pagesSet());
      const token = await encodeShare({ v: 1, project: proj, pitch, at: new Date().toISOString() });
      setLink(appBase() + HASH + token);
    } catch (e) { toast(t('err.generic', { msg: String((e as Error)?.message ?? e) }), 'error'); }
    setBusy(false);
  };
  const copy = async () => { try { await navigator.clipboard.writeText(link); toast(t('sh.copied'), 'success'); } catch { toast(t('sh.copyFail'), 'error'); } };
  const download = async () => {
    const proj = shareableProject(p, pitch, pagesSet());
    const html = standaloneHtml(proj, pitch, toHtml(proj), shareStats(proj, layoutProject(proj).pages.length));
    await saveFile(`${p.title || 'guion'} - ${t('sh.file')}.html`, html, [{ name: 'HTML', extensions: ['html'] }]);
  };
  const kb = Math.round(link.length / 1024);
  return (
    <Modal title={t('sh.title')} onClose={closeModal} size="lg" footer={<>
      <Button kind="ghost" icon="download" onClick={() => void download()}>{t('sh.html')}</Button>
      <span className="grow" />
      <Button onClick={closeModal}>{t('act.close')}</Button>
      <Button kind="primary" icon="link" onClick={() => void make()} disabled={busy}>{busy ? <Spinner /> : t('sh.make')}</Button>
    </>}>
      <p className="muted small">{t('sh.intro')}</p>
      <Field label={t('sh.logline')} hint={t('sh.logline.h')}><textarea className="input" rows={2} value={pitch.logline} onChange={(e) => set({ logline: e.target.value })} /></Field>
      <Field label={t('sh.synopsis')}><textarea className="input" rows={4} value={pitch.synopsis} onChange={(e) => set({ synopsis: e.target.value })} /></Field>
      <div className="grid2">
        <Field label={t('sh.genre')}><input className="input" value={pitch.genre} placeholder={t('sh.genre.ph')} onChange={(e) => set({ genre: e.target.value })} /></Field>
        <Field label={t('sh.contact')}><input className="input" value={pitch.contact} onChange={(e) => set({ contact: e.target.value })} /></Field>
      </div>
      <Toggle checked={pitch.full} onChange={(v) => set({ full: v })} label={t('sh.full')} hint={t('sh.full.h', { n: layout.pages.length })} />
      {!pitch.full ? <Field label={t('sh.sample')}><NumberInput value={pitch.sample} min={1} max={layout.pages.length} onChange={(v) => set({ sample: v })} /></Field> : null}
      <Toggle checked={pitch.allowDownload} onChange={(v) => set({ allowDownload: v })} label={t('sh.allowPdf')} />
      <Toggle checked={pitch.allowCopy} onChange={(v) => set({ allowCopy: v })} label={t('sh.allowCopy')} hint={t('sh.allowCopy.h')} />
      {link ? (
        <div className="sh-link">
          <div className="row"><Icon name="link" size={16} /><input className="input grow" readOnly value={link} onFocus={(e) => (e.target as HTMLInputElement).select()} /><Button kind="primary" icon="copy" onClick={() => void copy()}>{t('sh.copy')}</Button><Button icon="eye" onClick={() => window.open(link, '_blank')}>{t('sh.open')}</Button></div>
          <small className={kb > 60 ? 'warn' : 'muted'}>{kb > 60 ? t('sh.long', { kb }) : t('sh.size', { kb })}</small>
        </div>
      ) : null}
    </Modal>
  );
}
