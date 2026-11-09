// Paste a script from Google Docs, Word or any text editor: ScriptlZ detects each element and shows a
// preview where any paragraph can be corrected before importing.
import { useMemo, useState, type ClipboardEvent } from 'react';
import { closeModal, getState } from '../app/store';
import { adoptProject } from '../app/actions';
import { getTemplate } from '../core/format';
import type { Block, ElementType, TitlePage } from '../core/model';
import { classifyParagraphs, parasFromHtml, parasFromText, splitTitlePage } from './detect';
import { projectFrom } from './importers';
import { t, tn } from '../i18n';
import { Button, Field, Modal, cx } from '../ui/kit';
import { Icon } from '../ui/icons';

const TYPES: ElementType[] = ['scene', 'action', 'character', 'parenthetical', 'dialogue', 'transition', 'shot', 'centered', 'note'];

export default function PasteImport() {
  const [blocks, setBlocks] = useState<Block[] | null>(null);
  const [title, setTitle] = useState<Partial<TitlePage>>({});
  const [name, setName] = useState('');
  const [from, setFrom] = useState<'docs' | 'text'>('text');
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const b of blocks ?? []) c[b.type] = (c[b.type] ?? 0) + 1;
    return c;
  }, [blocks]);
  const onPaste = (e: ClipboardEvent) => {
    e.preventDefault();
    const html = e.clipboardData.getData('text/html');
    const text = e.clipboardData.getData('text/plain');
    const paras = html ? parasFromHtml(html) : parasFromText(text);
    setFrom(html ? 'docs' : 'text');
    const r = splitTitlePage(paras);
    setTitle(r.title);
    if (r.title.title) setName(r.title.title);
    setBlocks(classifyParagraphs(r.body));
  };
  const setType = (i: number, type: ElementType) => setBlocks((bs) => bs!.map((b, k) => (k === i ? { ...b, type } : b)));
  const go = async () => {
    if (!blocks?.length) return;
    const p = projectFrom((name || t('w.untitled')) + '.txt', blocks, { ...title, title: name || title.title || '' });
    p.locale = getState().settings.defaultLocale;
    closeModal();
    await adoptProject(p, { message: t('home.imported', { title: p.title }) });
  };
  return (
    <Modal title={t('pi.title')} onClose={closeModal} size="xl" footer={<>
      {blocks ? <Button kind="ghost" onClick={() => setBlocks(null)}>{t('pi.again')}</Button> : null}
      <span className="grow" />
      <Button onClick={closeModal}>{t('act.cancel')}</Button>
      <Button kind="primary" icon="upload" disabled={!blocks?.length} onClick={() => void go()}>{t('pi.import')}</Button>
    </>}>
      {!blocks ? (
        <div className="pi-drop" tabIndex={0} contentEditable suppressContentEditableWarning onPaste={onPaste} ref={(el: HTMLDivElement | null) => el?.focus()} aria-label={t('pi.zone')}>
          <div className="pi-art" aria-hidden="true"><i /><i /><i /><i /><i /></div>
          <b>{t('pi.zone')}</b>
          <p>{t('pi.zone.h')}</p>
          <ol className="pi-how">
            <li>{t('pi.step1')}</li>
            <li>{t('pi.step2')}</li>
            <li>{t('pi.step3')}</li>
          </ol>
        </div>
      ) : (
        <>
          <div className="grid2">
            <Field label={t('w.title')}><input className="input" value={name} placeholder={t('w.untitled')} onChange={(e) => setName(e.target.value)} /></Field>
            <div className="pi-sum">
              <Icon name="check" size={16} />
              <span>{tn('pi.found', blocks.length)} · {from === 'docs' ? t('pi.fromDocs') : t('pi.fromText')}</span>
              <small className="muted">{TYPES.filter((ty) => counts[ty]).map((ty) => `${t('el.' + ty)} ${counts[ty]}`).join(' · ')}</small>
            </div>
          </div>
          <p className="muted small">{t('pi.fix')}</p>
          <div className="pi-list">
            {blocks.slice(0, 1500).map((b, i) => (
              <div key={b.id} className={cx('pi-row', 't-' + b.type)}>
                <select className="select sm" value={b.type} onChange={(e) => setType(i, e.target.value as ElementType)} aria-label={t('ed.element')}>
                  {getTemplate('feature').order.concat(TYPES.filter((x) => !getTemplate('feature').order.includes(x))).map((ty) => <option key={ty} value={ty}>{t('el.' + ty)}</option>)}
                </select>
                <span className="pi-text">{b.text}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}
