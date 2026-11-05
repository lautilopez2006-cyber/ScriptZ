// Export dialog: choose a format and its options.
import { useState } from 'react';
import { useApp, closeModal } from '../app/store';
import { exportProject, type ExportFormat } from './exporters';
import { t } from '../i18n';
import { Button, Field, Modal, Segmented, Toggle, cx, Spinner } from '../ui/kit';
import { Icon } from '../ui/icons';

const FORMATS: { id: ExportFormat; icon: string }[] = [
  { id: 'pdf', icon: 'fileText' }, { id: 'fdx', icon: 'film' }, { id: 'docx', icon: 'file' }, { id: 'fountain', icon: 'type' },
  { id: 'html', icon: 'globe' }, { id: 'epub', icon: 'book' }, { id: 'md', icon: 'hash' }, { id: 'txt', icon: 'file' }, { id: 'scriptz', icon: 'download' },
];

function parseRange(s: string, total: number): number[] | undefined {
  const out = new Set<number>();
  for (const part of s.split(',').map((x) => x.trim()).filter(Boolean)) {
    const m = /^(\d+)\s*(?:-\s*(\d+))?$/.exec(part);
    if (!m) continue;
    const a = Number(m[1]), b = m[2] ? Number(m[2]) : a;
    for (let i = Math.max(1, a); i <= Math.min(total, b); i++) out.add(i - 1);
  }
  return out.size ? [...out].sort((x, y) => x - y) : undefined;
}

export default function ExportDialog() {
  const project = useApp((s) => s.project)!;
  const pages = useApp((s) => s.pages);
  const [format, setFormat] = useState<ExportFormat>('pdf');
  const [titlePage, setTitlePage] = useState(project.titlePage.enabled);
  const [watermark, setWatermark] = useState(project.page.watermark.enabled ? project.page.watermark.text : '');
  const [range, setRange] = useState('');
  const [docxMode, setDocxMode] = useState<'flow' | 'exact'>('flow');
  const [notes, setNotes] = useState(false);
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    const ok = await exportProject(project, format, { titlePage, watermark: format === 'pdf' ? watermark : undefined, pages: format === 'pdf' && range ? parseRange(range, pages) : undefined, docxMode, includeNotes: notes });
    setBusy(false);
    if (ok) closeModal();
  };
  return (
    <Modal title={t('act.export')} onClose={closeModal} size="lg" footer={<><Button onClick={closeModal}>{t('act.cancel')}</Button><Button kind="primary" icon="download" onClick={go} disabled={busy}>{busy ? <Spinner /> : t('ex.go', { f: t('ex.f.' + format) })}</Button></>}>
      <div className="fmt-grid" role="radiogroup">
        {FORMATS.map((f) => (
          <button key={f.id} type="button" role="radio" aria-checked={format === f.id} className={cx('fmt', format === f.id && 'on')} onClick={() => setFormat(f.id)}>
            <Icon name={f.icon} size={20} /><b>{t('ex.f.' + f.id)}</b><small>{t('ex.d.' + f.id)}</small>
          </button>
        ))}
      </div>
      <div className="ex-opts">
        {format !== 'scriptz' && format !== 'md' ? <Toggle checked={titlePage} onChange={setTitlePage} label={t('ex.titlePage')} /> : null}
        {format === 'pdf' ? (
          <div className="grid2">
            <Field label={t('ex.watermark')} hint={t('ex.watermark.h')}><input className="input" value={watermark} placeholder={t('ex.watermark.ph')} onChange={(e) => setWatermark(e.target.value)} /></Field>
            <Field label={t('ex.pages')} hint={t('ex.pages.h', { n: pages })}><input className="input" value={range} placeholder="1-5, 8" onChange={(e) => setRange(e.target.value)} /></Field>
          </div>
        ) : null}
        {format === 'docx' ? <Field label={t('ex.docxMode')}><Segmented value={docxMode} onChange={setDocxMode} options={[{ value: 'flow', label: t('ex.docx.flow') }, { value: 'exact', label: t('ex.docx.exact') }]} /></Field> : null}
        {format === 'fdx' || format === 'fountain' ? <Toggle checked={notes} onChange={setNotes} label={t('ex.notes')} /> : null}
        <p className="muted small">{t('ex.h.' + format)}</p>
      </div>
    </Modal>
  );
}
