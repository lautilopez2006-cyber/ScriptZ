// Collaboration panel: share the script, join with an invite, see who is online.
import { useState } from 'react';
import { useApp, toast } from '../app/store';
import { setSettings } from '../app/actions';
import { collab, inviteText, parseInvite, shareProject, viewUrl } from './client';
import { openExternal } from '../platform';
import { t } from '../i18n';
import { Button, Field, Spinner, cx } from '../ui/kit';
import { Icon } from '../ui/icons';

function Copy({ label, value }: { label: string; value: string }) {
  return (
    <Field label={label}>
      <div className="row"><input className="input sm grow" readOnly value={value} onFocus={(e) => (e.target as HTMLInputElement).select()} /><Button small icon="copy" title={t('act.copy')} onClick={() => { void navigator.clipboard?.writeText(value); toast(t('co.copied'), 'success', undefined, 1800); }} /></div>
    </Field>
  );
}

export default function CollabPanel() {
  const st = useApp((s) => s.collab);
  const settings = useApp((s) => s.settings);
  const [server, setServer] = useState(settings.collab.server);
  const [invite, setInvite] = useState('');
  const [busy, setBusy] = useState(false);
  const share = async () => {
    setBusy(true);
    try { setSettings({ collab: { ...settings.collab, server } }); await shareProject(server); }
    catch (e) { toast(t('co.serverError', { msg: String((e as Error).message) }), 'error', undefined, 8000); }
    setBusy(false);
  };
  const join = async () => {
    const inv = parseInvite(invite);
    if (!inv) { toast(t('co.badInvite'), 'error'); return; }
    setBusy(true);
    await collab.connect(inv);
    setBusy(false);
  };
  const tokens = collab.tokens;
  const inv = collab.invite;
  return (
    <div className="panel collab">
      {st.state === 'off' ? (
        <>
          <p className="muted small">{t('co.intro')}</p>
          <h4>{t('co.share')}</h4>
          <Field label={t('st.co.server')}><input className="input" value={server} onChange={(e) => setServer(e.target.value)} /></Field>
          <Button kind="primary" icon="share" onClick={() => void share()} disabled={busy}>{busy ? <Spinner /> : t('co.startSharing')}</Button>
          <hr />
          <h4>{t('co.join')}</h4>
          <Field label={t('co.invite')}><input className="input" value={invite} placeholder="ws://192.168.0.10:4735#room=…&token=…" onChange={(e) => setInvite(e.target.value)} /></Field>
          <Button icon="link" onClick={() => void join()} disabled={busy || !invite.trim()}>{t('act.connect')}</Button>
          <hr />
          <p className="muted small">{t('st.co.h')}</p>
          <pre className="code">node server/collab-server.mjs</pre>
        </>
      ) : (
        <>
          <div className={cx('co-state', st.state)}><Icon name={st.state === 'online' ? 'wifi' : 'wifiOff'} size={16} /> <b>{t('co.state.' + st.state)}</b>{st.role ? <span className="chip">{t('co.role.' + st.role)}</span> : null}</div>
          {st.message ? <p className="err small">{st.message}</p> : null}
          <h4>{t('co.people')}</h4>
          <ul className="peers">
            <li><span className="dot" style={{ background: settings.collab.color }} />{settings.collab.name || settings.author || t('w.you')} <small className="muted">({t('w.you')})</small></li>
            {st.peers.map((p) => <li key={p.id}><span className="dot" style={{ background: p.color }} />{p.name}</li>)}
          </ul>
          {inv && tokens.editor ? (
            <>
              <h4>{t('co.invites')}</h4>
              <Copy label={t('co.inviteEditor')} value={inviteText(inv.server, inv.room, tokens.editor)} />
              <Copy label={t('co.inviteViewer')} value={inviteText(inv.server, inv.room, tokens.viewer)} />
              <Copy label={t('co.readLink')} value={viewUrl(inv.server, inv.room, tokens.viewer)} />
              <Button small kind="ghost" icon="globe" onClick={() => void openExternal(viewUrl(inv.server, inv.room, tokens.viewer))}>{t('co.openRead')}</Button>
            </>
          ) : null}
          <Button kind="ghost" icon="logout" onClick={() => collab.disconnect()}>{t('act.disconnect')}</Button>
          <p className="muted small">{t('co.offlineNote')}</p>
        </>
      )}
    </div>
  );
}
