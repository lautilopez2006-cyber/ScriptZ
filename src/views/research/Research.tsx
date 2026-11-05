// Research board: images, links and notes tied to scenes, characters and locations.
import { useMemo, useRef, useState, type ClipboardEvent, type DragEvent } from 'react';
import { useApp, openModal, toast } from '../../app/store';
import { getEditor, setView, updateProject } from '../../app/actions';
import { buildScenes, characterStats, locationsOf, type SceneInfo } from '../../core/scenes';
import { CARD_COLORS, nowIso, uid, type CardColor, type ResearchItem, type ResearchKind } from '../../core/model';
import { openExternal } from '../../platform';
import { t, tn } from '../../i18n';
import { Button, COLOR_HEX, Empty, IconBtn, LazyInput, MenuButton, Segmented, cx, type MenuItem } from '../../ui/kit';
import { Icon } from '../../ui/icons';

const MAX_SIDE = 1400;

/** Downscale an image file to a JPEG/PNG data URL so projects stay light. */
export async function imageToDataUrl(file: Blob): Promise<string> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(bmp.width * k));
  c.height = Math.max(1, Math.round(bmp.height * k));
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  const png = file.type === 'image/png' && c.width * c.height < 400_000;
  return c.toDataURL(png ? 'image/png' : 'image/jpeg', 0.82);
}

function newItem(kind: ResearchKind, patch: Partial<ResearchItem> = {}): ResearchItem {
  return { id: uid(), kind, title: '', note: '', url: '', image: '', scenes: [], characters: [], locations: [], color: 'none', createdAt: nowIso(), ...patch };
}

export function addResearch(items: ResearchItem[]): void {
  updateProject((p) => {
    const research = { ...p.research };
    for (const i of items) research[i.id] = i;
    return { ...p, research };
  });
  const size = Object.values(items).reduce((a, i) => a + i.image.length, 0);
  if (size > 6_000_000) toast(t('rs.heavy'), 'info', undefined, 6000);
}

async function filesToItems(files: FileList | File[], link: Partial<ResearchItem> = {}): Promise<ResearchItem[]> {
  const out: ResearchItem[] = [];
  for (const f of Array.from(files)) {
    if (!f.type.startsWith('image/')) continue;
    try { out.push(newItem('image', { title: f.name.replace(/\.[^.]+$/, ''), image: await imageToDataUrl(f), ...link })); }
    catch { toast(t('rs.badImage', { name: f.name }), 'error'); }
  }
  return out;
}

function promptLink(link: Partial<ResearchItem> = {}): void {
  openModal('prompt', {
    title: t('rs.addLink'), label: 'URL',
    onSubmit: (v: string) => {
      const url = v.trim();
      if (!url) return;
      const full = /^[a-z]+:\/\//i.test(url) ? url : 'https://' + url;
      let host = full;
      try { host = new URL(full).hostname.replace(/^www\./, ''); } catch { /* keep */ }
      addResearch([newItem('link', { url: full, title: host, ...link })]);
    },
  });
}

let filterFromEditor: { kind: 'scene' | 'character' | 'location'; value: string } | null = null;
/** Open the board filtered to a scene / character / location. */
export function openResearchFor(kind: 'scene' | 'character' | 'location', value: string): void {
  filterFromEditor = { kind, value };
  setView('research');
}

interface Ctx { scenes: SceneInfo[]; chars: string[]; locs: string[] }
function useCtx(): Ctx {
  const blocks = useApp((s) => s.project!.blocks);
  return useMemo(() => {
    const scenes = buildScenes(blocks);
    return { scenes, chars: characterStats(blocks).map((c) => c.name).sort(), locs: locationsOf(scenes).map((l) => l.name).sort() };
  }, [blocks]);
}

export default function ResearchView() {
  const items = useApp((s) => s.project!.research);
  const ctx = useCtx();
  const [filter, setFilter] = useState<{ kind: 'all' | 'scene' | 'character' | 'location' | 'unlinked'; value: string }>(() => {
    const f = filterFromEditor;
    filterFromEditor = null;
    return f ?? { kind: 'all', value: '' };
  });
  const [q, setQ] = useState('');
  const [over, setOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const linkForFilter: Partial<ResearchItem> = filter.kind === 'scene' ? { scenes: [filter.value] } : filter.kind === 'character' ? { characters: [filter.value] } : filter.kind === 'location' ? { locations: [filter.value] } : {};
  const list = Object.values(items)
    .filter((i) => filter.kind === 'all' || (filter.kind === 'unlinked' ? !i.scenes.length && !i.characters.length && !i.locations.length : (filter.kind === 'scene' ? i.scenes : filter.kind === 'character' ? i.characters : i.locations).includes(filter.value)))
    .filter((i) => !q.trim() || (i.title + ' ' + i.note + ' ' + i.url).toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const onDrop = async (e: DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setOver(false);
    const files = e.dataTransfer?.files;
    if (files?.length) { addResearch(await filesToItems(files, linkForFilter)); return; }
    const url = e.dataTransfer?.getData('text/uri-list') || e.dataTransfer?.getData('text/plain');
    if (url && /^https?:\/\//.test(url.trim())) addResearch([newItem('link', { url: url.trim(), title: url.trim().replace(/^https?:\/\/(www\.)?/, '').split('/')[0], ...linkForFilter })]);
  };
  const onPaste = async (e: ClipboardEvent) => {
    if ((e.target as HTMLElement).closest('input, textarea')) return;
    const files = [...(e.clipboardData?.files ?? [])];
    if (files.length) { e.preventDefault(); addResearch(await filesToItems(files, linkForFilter)); return; }
    const text = e.clipboardData?.getData('text/plain')?.trim();
    if (text && /^https?:\/\/\S+$/.test(text)) { e.preventDefault(); addResearch([newItem('link', { url: text, title: text.replace(/^https?:\/\/(www\.)?/, '').split('/')[0], ...linkForFilter })]); }
  };
  const filterValue = filter.kind === 'all' || filter.kind === 'unlinked' ? filter.kind : `${filter.kind}:${filter.value}`;
  return (
    <div className={cx('view research', over && 'dropping-here')} onPaste={(e) => void onPaste(e)} onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setOver(true); }} onDragLeave={(e) => { if (e.currentTarget === e.target) setOver(false); }} onDrop={(e) => void onDrop(e)} tabIndex={-1}>
      <header className="view-h">
        <h2>{t('nav.research')}</h2>
        <select className="select sm" value={filterValue} onChange={(e) => {
          const v = e.target.value;
          if (v === 'all' || v === 'unlinked') setFilter({ kind: v, value: '' });
          else { const i = v.indexOf(':'); setFilter({ kind: v.slice(0, i) as 'scene', value: v.slice(i + 1) }); }
        }}>
          <option value="all">{t('rs.all')}</option>
          <option value="unlinked">{t('rs.unlinked')}</option>
          <optgroup label={t('nav.write')}>{ctx.scenes.map((s) => <option key={s.id} value={'scene:' + s.id}>{s.label}. {s.heading}</option>)}</optgroup>
          <optgroup label={t('nav.characters')}>{ctx.chars.map((c) => <option key={c} value={'character:' + c}>{c}</option>)}</optgroup>
          <optgroup label={t('st.location')}>{ctx.locs.map((l) => <option key={l} value={'location:' + l}>{l}</option>)}</optgroup>
        </select>
        <input className="input sm" placeholder={t('act.search')} value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="grow" />
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={async (e) => { if (e.target.files) addResearch(await filesToItems(e.target.files, linkForFilter)); e.target.value = ''; }} />
        <Button icon="upload" onClick={() => fileRef.current?.click()}>{t('rs.addImage')}</Button>
        <Button icon="link" onClick={() => promptLink(linkForFilter)}>{t('rs.addLink')}</Button>
        <Button kind="primary" icon="plus" onClick={() => addResearch([newItem('note', { title: t('rs.newNote'), ...linkForFilter })])}>{t('rs.addNote')}</Button>
      </header>
      <div className="view-b">
        {!list.length ? (
          <Empty icon="pin" title={t('rs.empty')} action={<Button icon="upload" onClick={() => fileRef.current?.click()}>{t('rs.addImage')}</Button>}>{t('rs.empty.h')}</Empty>
        ) : (
          <div className="rs-grid">{list.map((i, k) => <ResearchCard key={i.id} item={i} ctx={ctx} k={k} />)}</div>
        )}
        <p className="muted small rs-hint"><Icon name="info" size={13} /> {t('rs.hint')}</p>
      </div>
    </div>
  );
}

function ResearchCard({ item, ctx, k }: { item: ResearchItem; ctx: Ctx; k: number }) {
  const set = (patch: Partial<ResearchItem>) => updateProject((p) => ({ ...p, research: { ...p.research, [item.id]: { ...p.research[item.id], ...patch } } }));
  const remove = () => updateProject((p) => { const research = { ...p.research }; delete research[item.id]; return { ...p, research }; });
  const sceneLabel = (id: string) => { const s = ctx.scenes.find((x) => x.id === id); return s ? `${s.label}. ${s.heading}` : t('rs.missingScene'); };
  const toggle = (field: 'scenes' | 'characters' | 'locations', v: string) => set({ [field]: item[field].includes(v) ? item[field].filter((x) => x !== v) : [...item[field], v] });
  const linkMenu = (): MenuItem[] => [
    ...ctx.scenes.slice(0, 60).map((s) => ({ label: `${s.label}. ${s.heading}`, icon: 'film' as const, checked: item.scenes.includes(s.id), onClick: () => toggle('scenes', s.id) })),
    { separator: true },
    ...ctx.chars.map((c) => ({ label: c, icon: 'user' as const, checked: item.characters.includes(c), onClick: () => toggle('characters', c) })),
    { separator: true },
    ...ctx.locs.map((l) => ({ label: l, icon: 'map' as const, checked: item.locations.includes(l), onClick: () => toggle('locations', l) })),
  ];
  return (
    <article className={cx('rs-card', 'k-' + item.kind)} style={{ ['--cc' as string]: COLOR_HEX[item.color] ?? 'transparent', ['--i' as string]: Math.min(k, 20) }}>
      {item.kind === 'image' && item.image ? <button type="button" className="rs-img" onClick={() => openModal('image', { src: item.image, title: item.title })}><img src={item.image} alt={item.title} loading="lazy" /></button> : null}
      {item.kind === 'link' ? <button type="button" className="rs-url" onClick={() => void openExternal(item.url)}><Icon name="globe" size={15} /><span>{item.url.replace(/^https?:\/\//, '')}</span></button> : null}
      <LazyInput className="input rs-title" value={item.title} placeholder={t('rs.title')} onCommit={(v) => set({ title: v })} />
      <LazyInput className="input rs-note" multiline value={item.note} placeholder={t('rs.note')} onCommit={(v) => set({ note: v })} />
      <div className="rs-links">
        {item.scenes.map((s) => <button key={s} type="button" className="rs-chip scene" onClick={() => { setView('write'); setTimeout(() => getEditor()?.scrollToBlock(s, { select: true }), 120); }}><Icon name="film" size={12} />{sceneLabel(s)}</button>)}
        {item.characters.map((c) => <span key={c} className="rs-chip char"><Icon name="user" size={12} />{c}</span>)}
        {item.locations.map((l) => <span key={l} className="rs-chip loc"><Icon name="map" size={12} />{l}</span>)}
      </div>
      <footer>
        <MenuButton icon="link" title={t('rs.linkTo')} items={linkMenu}>{t('rs.linkTo')}</MenuButton>
        <span className="grow" />
        <div className="colors mini">{CARD_COLORS.slice(0, 6).map((c) => <button key={c} type="button" title={t('clr.' + c)} aria-label={t('clr.' + c)} className={cx('color', c === 'none' && 'none', item.color === c && 'on')} style={{ background: COLOR_HEX[c] }} onClick={() => set({ color: c as CardColor })} />)}</div>
        <IconBtn small icon="trash" title={t('act.delete')} onClick={remove} />
      </footer>
    </article>
  );
}

/** Editor side panel: references for the scene under the caret, its characters and location. */
export function RefsPanel() {
  const caret = useApp((s) => s.caret);
  const items = useApp((s) => s.project!.research);
  const ctx = useCtx();
  const scene = ctx.scenes.find((s) => s.id === caret?.sceneId);
  const [mode, setMode] = useState<'scene' | 'all'>('scene');
  const rel = Object.values(items).filter((i) => mode === 'all' || (scene && (i.scenes.includes(scene.id) || i.locations.includes(scene.parsed.location) || i.characters.some((c) => scene.speakers.includes(c)))));
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div className="panel refs">
      <Segmented value={mode} onChange={setMode} small options={[{ value: 'scene', label: t('rs.thisScene') }, { value: 'all', label: t('rs.all') }]} />
      {scene ? <p className="muted small">{scene.label}. {scene.heading}</p> : <p className="muted small">{t('sn.noScene')}</p>}
      <div className="row wrap">
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={async (e) => { if (e.target.files) addResearch(await filesToItems(e.target.files, scene ? { scenes: [scene.id] } : {})); e.target.value = ''; }} />
        <Button small icon="upload" onClick={() => fileRef.current?.click()}>{t('rs.addImage')}</Button>
        <Button small icon="link" onClick={() => promptLink(scene ? { scenes: [scene.id] } : {})}>{t('rs.addLink')}</Button>
        {scene ? <Button small kind="ghost" onClick={() => openResearchFor('scene', scene.id)}>{t('rs.openBoard')}</Button> : null}
      </div>
      {!rel.length ? <p className="muted pad">{t('rs.noneHere')}</p> : null}
      <div className="refs-list">
        {rel.map((i) => (
          <button key={i.id} type="button" className="ref" onClick={() => (i.kind === 'image' ? openModal('image', { src: i.image, title: i.title }) : i.kind === 'link' ? void openExternal(i.url) : openResearchFor('scene', scene?.id ?? ''))}>
            {i.kind === 'image' && i.image ? <img src={i.image} alt="" loading="lazy" /> : <span className="ref-ic"><Icon name={i.kind === 'link' ? 'globe' : 'fileText'} size={18} /></span>}
            <span className="ref-t"><b>{i.title || t('rs.untitled')}</b>{i.note ? <small>{i.note.slice(0, 90)}</small> : i.url ? <small>{i.url.replace(/^https?:\/\//, '')}</small> : null}</span>
          </button>
        ))}
      </div>
      <p className="muted small">{tn('rs.count', Object.keys(items).length)}</p>
    </div>
  );
}
