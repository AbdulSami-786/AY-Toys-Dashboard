import { useEffect, useState } from 'react';
import { Share2, Copy, ExternalLink, RefreshCw, KeyRound, Link2, Link2Off, MessageCircle, CheckCircle2, AlertCircle, Lock } from 'lucide-react';
import { useStore, OUTDATED_SCRIPT } from '../store/store';
import { useNav } from '../store/nav';
import { Modal, useDialog } from '../components/ui';
import { isShared, shareLink, newShareToken, newSharePassword, MIN_PASSWORD } from '../lib/share';
import { copyText } from '../lib/clipboard';

// WhatsApp wants an international number without "+" — local Pakistani numbers (03xx…) get 92 in front
function waNumber(phone) {
  let d = String(phone || '').replace(/[^\d+]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  else if (d.startsWith('00')) d = d.slice(2);
  else if (d.startsWith('0') && d.length === 11) d = '92' + d.slice(1);
  return d.replace(/\D/g, '');
}

const copy = async (text, dlg, what) => {
  if (await copyText(text)) dlg.toast(`${what} copied`);
  else dlg.alert(text, { title: `Copy the ${what.toLowerCase()}` });
};

/** Share Ledger: a private link + password that lets a customer / vendor view (never edit) their ledger. */
export function ShareLedgerModal({ which, partyId, onClose }) {
  const { data, company, sheetUrl, saveRecord, keyState, secureSheet, shareSync, unpublishShare, publishShares } = useStore();
  const nav = useNav();
  const dlg = useDialog();
  const isC = which === 'customer';
  const table = isC ? 'customers' : 'vendors';
  const party = (isC ? data.customers : data.vendors).find((x) => x.id === partyId);
  const share = party?.share || {};
  const on = isShared(party);
  const [pass, setPass] = useState(() => share.pass || newSharePassword());
  const [check, setCheck] = useState(null);

  useEffect(() => {
    if (!sheetUrl) return;
    let live = true;
    secureSheet(sheetUrl)
      .then((r) => live && setCheck(r.state))
      .catch((e) => live && setCheck('error:' + e.message));
    return () => {
      live = false;
    };
  }, [sheetUrl, secureSheet]);

  if (!party) return null;
  const who = isC ? 'customer' : 'vendor';
  const link = on ? shareLink(sheetUrl, share.token) : '';
  const cleanPass = pass.trim();
  const passChanged = on && cleanPass !== share.pass;
  const ready = !!sheetUrl && check === 'ok';
  const live = on && shareSync.published?.[share.token] && shareSync.status !== 'publishing';

  const save = (patch) => saveRecord(table, { ...party, share: { ...share, ...patch, updatedAt: new Date().toISOString() } });

  const validPass = () => {
    if (cleanPass.length < MIN_PASSWORD) {
      dlg.alert(`The password must be at least ${MIN_PASSWORD} characters.`);
      return false;
    }
    return true;
  };

  const start = () => {
    if (!validPass()) return;
    save({ on: true, token: share.token || newShareToken(), pass: cleanPass, createdAt: new Date().toISOString() });
    dlg.toast('Share link created — publishing to your Google Sheet…');
  };

  const savePass = () => {
    if (!validPass()) return;
    save({ pass: cleanPass });
    dlg.toast('Password changed. The old password no longer works.');
  };

  const newLink = async () => {
    const ok = await dlg.confirm(`Make a new link for "${party.name}"?\n\nThe current link stops working. Send the new link to the ${who}.`, { ok: 'New link' });
    if (!ok) return;
    unpublishShare(share.token);
    save({ token: newShareToken() });
  };

  const stop = async () => {
    const ok = await dlg.confirm(`Stop sharing the ledger with "${party.name}"?\n\nThe link stops working right away. You can share again later (with a new link).`, {
      ok: 'Stop sharing',
      danger: true,
    });
    if (!ok) return;
    unpublishShare(share.token);
    save({ on: false, token: '' });
    dlg.toast('Sharing stopped');
  };

  const message = [
    `Dear ${party.name},`,
    '',
    `You can view your account ledger with ${company.legalName || company.name} (all ${isC ? 'invoices' : 'bills'}, payments and your balance) here:`,
    link,
    '',
    `Password: ${share.pass || ''}`,
    '',
    'This link is view-only.',
  ].join('\n');

  const whatsapp = () => {
    const num = waNumber(party.altPhone || party.phone);
    window.open(`https://wa.me/${num}?text=${encodeURIComponent(message)}`, '_blank', 'noopener');
  };

  let status = null;
  if (on) {
    if (shareSync.status === 'error')
      status = (
        <div className="note warn mt">
          <AlertCircle size={14} /> Not published yet: {shareSync.message}
        </div>
      );
    else if (live)
      status = (
        <div className="small mt" style={{ color: 'var(--ok)' }}>
          <CheckCircle2 size={13} style={{ verticalAlign: -2 }} /> Live — the {who} sees the latest data. It updates by itself a few seconds after you change anything.
        </div>
      );
    else
      status = (
        <div className="small muted mt">
          <RefreshCw size={13} className="spin" style={{ verticalAlign: -2 }} /> Publishing to your Google Sheet…
        </div>
      );
  }

  let blocker = null;
  if (!sheetUrl)
    blocker = (
      <div className="note warn">
        The shared ledger page is served by the Google Sheet, and no sheet is set up in this build yet (src/config.js).
        <div className="mt">
          <button className="btn sm primary" onClick={() => (onClose(), nav.open('sync', { tab: 'guide' }))}>
            Open Google Sheets Sync
          </button>
        </div>
      </div>
    );
  else if (check === null || check === 'checking')
    blocker = (
      <div className="small muted">
        <RefreshCw size={13} className="spin" style={{ verticalAlign: -2 }} /> Checking your Google Sheet…
      </div>
    );
  else if (check === 'legacy')
    blocker = (
      <div className="note warn">
        {OUTDATED_SCRIPT}
        <div className="mt">
          <button className="btn sm primary" onClick={() => (onClose(), nav.open('sync', { tab: 'guide' }))}>
            Show the new code
          </button>
        </div>
      </div>
    );
  else if (check !== 'ok')
    blocker = (
      <div className="note warn">
        Could not reach your Google Sheet: {String(check).replace(/^error:/, '')}
        <div className="small muted mt">Check the internet connection and try again.</div>
      </div>
    );

  return (
    <Modal
      title={`Share Ledger — ${party.name}`}
      icon={<Share2 size={16} />}
      onClose={onClose}
      width={640}
      footer={
        <>
          {on && ready && (
            <>
              <button className="btn ghost" onClick={stop} title="The link stops working">
                <Link2Off size={14} /> Stop sharing
              </button>
              <button className="btn ghost" onClick={newLink} title="Replace the link — the old one stops working">
                <RefreshCw size={14} /> New link
              </button>
            </>
          )}
          <span className="sp" />
          <button className="btn" onClick={onClose}>
            Close
          </button>
          {!on && ready && (
            <button className="btn primary" onClick={start}>
              <Link2 size={14} /> Create share link
            </button>
          )}
        </>
      }
    >
      <div className="note mb">
        <Lock size={13} style={{ verticalAlign: -2 }} /> Give <b>{party.name}</b> a private link to their ledger: every {isC ? 'invoice, sales receipt, credit memo' : 'bill, bill credit'} and
        payment, with line items and the running balance. It is <b>view-only</b>: nothing can be edited or deleted from the link, and they see only their own
        account. The page opens on any phone or computer.
      </div>

      {blocker || (
        <>
          {on && (
            <div className="share-row">
              <span className="field-label">Ledger link</span>
              <div className="flex">
                <input readOnly value={link} onFocus={(e) => e.target.select()} style={{ flex: 1 }} aria-label="Ledger link" />
                <button className="btn" onClick={() => copy(link, dlg, 'Link')}>
                  <Copy size={14} /> Copy
                </button>
                <a className="btn" href={link} target="_blank" rel="noreferrer" title="Open the page the party sees">
                  <ExternalLink size={14} />
                </a>
              </div>
            </div>
          )}
          <div className="share-row">
            <span className="field-label">Password</span>
            <div className="flex">
              <input
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                spellCheck={false}
                autoComplete="off"
                style={{ flex: 1, fontFamily: 'ui-monospace, Consolas, monospace', letterSpacing: '0.05em' }}
                aria-label="Ledger password"
              />
              <button className="btn" onClick={() => setPass(newSharePassword())} title="Make a new random password">
                <KeyRound size={14} /> Generate
              </button>
              {on && (
                <button className="btn" onClick={() => copy(share.pass, dlg, 'Password')} disabled={passChanged}>
                  <Copy size={14} /> Copy
                </button>
              )}
              {passChanged && (
                <button className="btn primary" onClick={savePass}>
                  Save password
                </button>
              )}
            </div>
            <span className="small muted">
              {on ? 'Changing the password logs the ' + who + ' out — send them the new one.' : `At least ${MIN_PASSWORD} characters. You can change it any time.`}
            </span>
          </div>

          {on && (
            <>
              <div className="flex mt" style={{ flexWrap: 'wrap' }}>
                <button className="btn primary" onClick={whatsapp} disabled={passChanged}>
                  <MessageCircle size={14} /> Send on WhatsApp
                </button>
                <button className="btn" onClick={() => copy(message, dlg, 'Message')} disabled={passChanged}>
                  <Copy size={14} /> Copy link &amp; password
                </button>
                {shareSync.status === 'error' && (
                  <button className="btn" onClick={() => publishShares()}>
                    <RefreshCw size={14} /> Try again
                  </button>
                )}
              </div>
              {status}
            </>
          )}
        </>
      )}
    </Modal>
  );
}
