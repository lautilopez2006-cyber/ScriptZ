// What the reader sees when opening a share link: the presentation and the script, read-only.
import { useEffect, useMemo, useState } from 'react';
import { layoutProject } from '../core/layout';
import { toHtml } from '../io/text';
import { t } from '../i18n';
import { Button, Spinner } from '../ui/kit';
import { Icon, Logo } from '../ui/icons';
import { decodeShare, HASH, shareStats, type SharePayload } from './share';

export default function SharePage() {
  const [data, setData] = useState<SharePayload | null>(null);
  const [err, setErr] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const token = location.hash.slice(HASH.length);
    decodeShare(token).then(setData).catch(() => setErr(true));
  }, []);
  const view = useMemo(() => {
    if (!data) return null;
    const p = data.project;
    const pages = layoutProject(p).pages.length;
    return { p, stats: shareStats(p, pages), html: toHtml(p) };
  }, [data]);
  useEffect(() => { if (view) document.title = view.p.title || 'ScriptZ'; }, [view]);
  if (err) return <div className="sp-err"><Logo size={44} /><h1>{t('sh.broken')}</h1><p>{t('sh.broken.h')}</p><a className="btn" href="./">{t('sh.openApp')}</a></div>;
  if (!view || !data) return <div className="sp-err"><Spinner /></div>;
  const { p, stats, html } = view;
  const author = p.titlePage.authors || p.author;
  const pdf = async () => {
    setBusy(true);
    try {
      const { buildExport } = await import('../io/exporters');
      const { data: bytes } = await buildExport(p, 'pdf', { titlePage: true });
      const { saveFile } = await import('../platform');
      await saveFile(`${p.title || 'guion'}.pdf`, bytes, [{ name: 'PDF', extensions: ['pdf'] }]);
    } finally { setBusy(false); }
  };
  const copy = async () => {
    const { adoptProject } = await import('../app/actions');
    const { uid } = await import('../core/model');
    history.replaceState(null, '', location.pathname);
    await adoptProject({ ...p, id: uid(), title: p.title }, { message: t('sh.copiedToLib') });
    location.reload();
  };
  return (
    <div className="sp">
      <header className="sp-bar">
        <a className="sp-brand" href="./"><Logo size={26} />ScriptZ</a>
        <span className="grow" />
        {data.pitch.allowDownload ? <Button small icon="download" onClick={() => void pdf()} disabled={busy}>{busy ? <Spinner /> : t('sh.pdf')}</Button> : null}
        {data.pitch.allowCopy ? <Button small kind="primary" icon="plus" onClick={() => void copy()}>{t('sh.saveCopy')}</Button> : null}
      </header>
      <section className="sp-hero">
        <div className="sp-sheet" aria-hidden="true"><i className="brad a" /><i className="brad b" /></div>
        <div className="sp-txt">
          {data.pitch.genre ? <span className="sp-k">{data.pitch.genre}</span> : null}
          <h1>{p.title || t('w.untitled')}</h1>
          {author ? <p className="sp-by">{p.titlePage.credit || t('sh.by')} {author}</p> : null}
          {data.pitch.logline ? <p className="sp-log">{data.pitch.logline}</p> : null}
          <div className="sp-stats">
            <span><b>{stats.pages}</b>{t('sh.st.pages')}</span><span><b>{stats.scenes}</b>{t('sh.st.scenes')}</span><span><b>{stats.characters}</b>{t('sh.st.chars')}</span>
          </div>
          <a className="btn" href="#guion" onClick={(e) => { e.preventDefault(); document.getElementById('guion')?.scrollIntoView({ behavior: 'smooth' }); }}><Icon name="book" size={17} />{t('sh.read')}</a>
        </div>
      </section>
      <section className="sp-info">
        {data.pitch.synopsis ? <article><h2>{t('sh.synopsis')}</h2><p className="sp-syn">{data.pitch.synopsis}</p></article> : null}
        {stats.cast.length ? (
          <article><h2>{t('sh.cast')}</h2>
            <ul className="sp-cast">{stats.cast.map((c, i) => <li key={c.name} style={{ ['--i' as string]: i }}><b>{c.name}</b>{p.characters[c.name]?.bio ? <span>{p.characters[c.name].bio}</span> : <span className="muted">{t('sh.lines', { n: c.speeches })}</span>}</li>)}</ul>
          </article>
        ) : null}
        {data.pitch.contact ? <article><h2>{t('sh.contact')}</h2><p className="sp-syn">{data.pitch.contact}</p></article> : null}
        {!data.pitch.full ? <p className="sp-note"><Icon name="info" size={15} />{t('sh.partial', { n: stats.pages })}</p> : null}
      </section>
      <section id="guion" className="sp-script">
        <iframe title={p.title} srcDoc={html} onLoad={(e: { currentTarget: HTMLIFrameElement }) => { const f = e.currentTarget; const d = f.contentDocument; if (d) f.style.height = d.documentElement.scrollHeight + 40 + 'px'; }} />
      </section>
      <footer className="sp-foot"><a href="./">{t('sh.madeWith')}</a></footer>
    </div>
  );
}
