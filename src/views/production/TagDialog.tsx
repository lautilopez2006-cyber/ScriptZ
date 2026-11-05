// Tag the selected text as a breakdown element (props, wardrobe, extras…).
import { useMemo, useState } from 'react';
import { useApp, closeModal, toast } from '../../app/store';
import { getEditor, updateProject } from '../../app/actions';
import { BREAKDOWN_CATEGORIES, uid, type BreakdownCategory } from '../../core/model';
import { CATEGORY_HEX } from '../../core/production';
import { t } from '../../i18n';
import { Button, Field, Modal, cx } from '../../ui/kit';

let lastCategory: BreakdownCategory = 'props';

export default function TagDialog() {
  const p = useApp((s) => s.project)!;
  const ed = getEditor();
  const text = (ed?.selectedText() ?? '').trim();
  const [cat, setCat] = useState<BreakdownCategory>(lastCategory);
  const [name, setName] = useState(text.replace(/\s+/g, ' ').slice(0, 80));
  const existing = useMemo(() => Object.values(p.breakdown.elements).filter((e) => e.category === cat), [p.breakdown.elements, cat]);
  const match = existing.find((e) => e.name.toLowerCase() === name.trim().toLowerCase());
  if (!text) {
    return (
      <Modal title={t('ed.tag')} onClose={closeModal} size="sm" footer={<Button kind="primary" onClick={closeModal}>{t('act.ok')}</Button>}>
        <p>{t('ed.tag.needSel')}</p>
      </Modal>
    );
  }
  const apply = () => {
    lastCategory = cat;
    const id = match?.id ?? uid();
    if (!match) updateProject((x) => ({ ...x, breakdown: { elements: { ...x.breakdown.elements, [id]: { id, category: cat, name: name.trim() || text, notes: '' } } } }));
    closeModal();
    setTimeout(() => {
      getEditor()?.setValuedMark('tag', id);
      toast(t('ed.tag.done', { name: name.trim() || text, cat: t('pd.cat.' + cat) }), 'success');
    }, 0);
  };
  return (
    <Modal title={t('ed.tag')} onClose={closeModal} footer={<><Button onClick={closeModal}>{t('act.cancel')}</Button><Button kind="primary" icon="tag" onClick={apply}>{t('pd.tag.apply')}</Button></>}>
      <p className="muted small">“{text.slice(0, 120)}”</p>
      <div className="cat-grid" role="radiogroup">
        {BREAKDOWN_CATEGORIES.map((c) => (
          <button key={c} type="button" role="radio" aria-checked={cat === c} className={cx('cat', cat === c && 'on')} style={{ ['--cat' as string]: CATEGORY_HEX[c] }} onClick={() => setCat(c)}>
            <i />{t('pd.cat.' + c)}
          </button>
        ))}
      </div>
      <Field label={t('pd.tag.name')} hint={match ? t('pd.tag.existing') : t('pd.tag.new')}>
        <input className="input" list="tag-existing" value={name} autoFocus onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') apply(); }} />
        <datalist id="tag-existing">{existing.map((e) => <option key={e.id} value={e.name} />)}</datalist>
      </Field>
    </Modal>
  );
}
