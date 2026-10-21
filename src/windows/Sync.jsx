import { useEffect, useState } from 'react';
import { Cloud, CloudOff, Copy, RefreshCw, Upload, CheckCircle2, AlertCircle, ExternalLink, KeyRound } from 'lucide-react';
import { useStore, OUTDATED_SCRIPT } from '../store/store';
import { useDialog, Tabs } from '../components/ui';
import { sheets, KEY_MESSAGE, SCRIPT_VERSION } from '../store/sheets';
import { SHEET, SHEET_READY } from '../config';
import CODE from '../../apps-script/Code.gs?raw';
import { copyText } from '../lib/clipboard';

// https://script.google.com/macros/s/AKfycb…xyz/exec → …/s/AKfy…xyz/exec (enough to recognise it)
const shortUrl = (u) => u.replace(/(\/s\/)([\w-]{6})[\w-]+([\w-]{6})(\/exec)$/, '$1$2…$3$4');

export default function SyncWindow({ tab: t0 = 'status' }) {
  const { company, data, settings, setSettings, sync, syncNow, pushAll, keyState, secureSheet, failedUploads, retryFailed, reportSync, publishReports } = useStore();
  const dlg = useDialog();
  const [tab, setTab] = useState(t0);
  const [test, setTest] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (SHEET_READY) secureSheet(SHEET).catch(() => {});
  }, [secureSheet]);

  const doTest = async () => {
    setBusy(true);
    try {
      const r = await sheets.secure(SHEET);
      if (r.state === 'locked') setTest({ ok: false, msg: KEY_MESSAGE });
      else if (r.state === 'legacy') setTest({ ok: false, msg: OUTDATED_SCRIPT });
      else setTest({ ok: true, msg: `Connected to spreadsheet "${r.sheet}"` });
      secureSheet(SHEET).catch(() => {});
    } catch (e) {
      setTest({ ok: false, msg: e.message });
    } finally {
      setBusy(false);
    }
  };

  const run = async (fn, okMsg) => {
    setBusy(true);
    try {
      await fn();
      dlg.toast(okMsg);
    } catch (e) {
      dlg.alert('Sync failed: ' + e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="win">
      <div className="win-title">
        <Cloud size={20} />
        <h1>Google Sheets Sync</h1>
        <span className="sub">{company.name}</span>
      </div>
      <Tabs
        tabs={[
          { id: 'status', label: 'Connection & Status' },
          { id: 'guide', label: 'Setup Guide' },
        ]}
        value={tab}
        onChange={setTab}
      />
      <div className="win-body pad" style={{ maxWidth: 940 }}>
        {tab === 'status' && !SHEET_READY && (
          <div className="note warn">
            <CloudOff size={14} style={{ verticalAlign: -2 }} /> <b>No Google Sheet is set up in this build</b>, so this company is saved on this computer only.
            <div className="mt">
              The sheet is written into the app itself: paste its Web App URL into <code>src/config.js</code> (<code>SHEET_URL</code>) and rebuild the app. See the
              Setup Guide tab. Everything you enter until then uploads to the sheet the first time the app connects.
            </div>
          </div>
        )}
        {tab === 'status' && SHEET_READY && (
          <>
            <div className="note mb">
              Every company is kept in <b>one Google Sheet</b>. It is written into the app, so every computer connects by itself — nothing to paste. AY Toys saves
              everything on this computer instantly and syncs in the background; if the internet goes down you can keep working and pending changes upload when
              you are back online.
            </div>

            <table className="tbl" style={{ maxWidth: 680 }}>
              <tbody>
                <tr>
                  <td style={{ width: 200 }}>Google Sheet</td>
                  <td>
                    <code title={SHEET}>{shortUrl(SHEET)}</code>
                  </td>
                </tr>
                <tr>
                  <td>Protection (owner key)</td>
                  <td>
                    {keyState.state === 'ok' && (
                      <span className="badge ok">
                        <KeyRound size={11} /> Protected
                      </span>
                    )}
                    {keyState.state === 'checking' && <span className="muted small">Checking…</span>}
                    {keyState.state === 'legacy' && <span className="badge warn">Apps Script code out of date</span>}
                    {keyState.state === 'locked' && <span className="badge err">Locked with a different key</span>}
                    {keyState.state === 'error' && <span className="badge err">Can't reach the sheet</span>}
                  </td>
                </tr>
                <tr>
                  <td>State</td>
                  <td>
                    <span className={'badge ' + (sync.status === 'error' ? 'err' : sync.status === 'synced' ? 'ok' : '')}>{sync.status}</span>{' '}
                    {sync.message && <span className="neg small">{sync.message}</span>}
                  </td>
                </tr>
                <tr>
                  <td>Changes waiting to upload</td>
                  <td>{sync.pending || 0}</td>
                </tr>
                <tr>
                  <td>Last sync</td>
                  <td>{sync.last ? new Date(sync.last).toLocaleString() : '—'}</td>
                </tr>
                <tr>
                  <td>Reports tab in the sheet</td>
                  <td>
                    {reportSync.status === 'publishing' && <span className="muted small">Updating…</span>}
                    {reportSync.status === 'live' && <span className="badge ok">Up to date</span>}
                    {reportSync.status === 'error' && <span className="badge err">Not updated</span>}
                    {reportSync.status === 'idle' && <span className="muted small">Updates by itself a few seconds after changes</span>}{' '}
                    {reportSync.last && <span className="muted small">{new Date(reportSync.last).toLocaleString()}</span>}{' '}
                    <button className="btn sm" disabled={reportSync.status === 'publishing'} onClick={() => publishReports(true)}>
                      <RefreshCw size={12} /> Update now
                    </button>
                    {reportSync.message && <div className="neg small">{reportSync.message}</div>}
                  </td>
                </tr>
                <tr>
                  <td>This company's tabs</td>
                  <td>
                    <code>{company.code} | …</code>
                  </td>
                </tr>
              </tbody>
            </table>
            {failedUploads.length > 0 && (
              <div className="note warn mt">
                <b>
                  {failedUploads.length} change{failedUploads.length === 1 ? '' : 's'} could not be uploaded
                </b>{' '}
                — the Google Sheet refused {failedUploads.length === 1 ? 'it' : 'them'}. {failedUploads.length === 1 ? 'It stays' : 'They stay'} safe on this computer; everything else keeps syncing.
                <ul style={{ margin: '6px 0', paddingLeft: 18 }}>
                  {failedUploads.slice(0, 8).map((f) => {
                    const rec = data?.[f.table]?.find((x) => x.id === f.id);
                    const what = rec ? rec.name || [rec.type, rec.num].filter(Boolean).join(' ') : f.id;
                    return (
                      <li key={f.table + f.id}>
                        {f.table} · {what}: <span className="small">{f.error}</span>
                      </li>
                    );
                  })}
                </ul>
                <button className="btn sm" onClick={() => retryFailed(company.id)}>
                  <RefreshCw size={13} /> Try again
                </button>
              </div>
            )}
            {keyState.state === 'locked' && <div className="note warn mt">{KEY_MESSAGE}</div>}
            {keyState.state === 'legacy' && <div className="note warn mt">{OUTDATED_SCRIPT}</div>}
            {keyState.state === 'ok' && keyState.version > 0 && keyState.version < SCRIPT_VERSION && (
              <div className="note warn mt">
                The Google Sheet runs Apps Script code version {keyState.version}; this app needs version {SCRIPT_VERSION} for the Reports tab, shop figures and some fixes.
                Syncing still works. {OUTDATED_SCRIPT}
              </div>
            )}
            {keyState.state === 'error' && <div className="note warn mt">Could not reach the Google Sheet: {keyState.message}</div>}

            <div className="flex mt" style={{ flexWrap: 'wrap' }}>
              <button className="btn primary" disabled={busy} onClick={() => run(syncNow, 'Synced with Google Sheets')}>
                <RefreshCw size={14} /> Sync now (Ctrl+Shift+S)
              </button>
              <button className="btn" onClick={doTest} disabled={busy}>
                Test connection
              </button>
              <button
                className="btn"
                disabled={busy}
                onClick={async () => {
                  const ok = await dlg.confirm('Overwrite this company’s tabs in the Google Sheet with the data on this computer?', { ok: 'Upload all', danger: true });
                  if (ok) run(pushAll, 'All data uploaded to Google Sheets');
                }}
              >
                <Upload size={14} /> Upload all (overwrite sheet)
              </button>
              <label className="check small" style={{ marginLeft: 12 }}>
                <input type="checkbox" checked={settings.autoSync !== false} onChange={(e) => setSettings({ ...settings, autoSync: e.target.checked })} />
                Download latest data when a company is opened
              </label>
            </div>
            {test && (
              <div className={'note mt' + (test.ok ? '' : ' warn')}>
                {test.ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />} {test.msg}
              </div>
            )}
          </>
        )}
        {tab === 'guide' && (
          <>
            <p>The Google Sheet is set once, in the app's code. After that every computer connects to it automatically.</p>
            <ol style={{ lineHeight: 1.9, paddingLeft: 20 }}>
              <li>
                Open{' '}
                <a href="https://sheets.new" target="_blank" rel="noreferrer">
                  sheets.new <ExternalLink size={11} />
                </a>{' '}
                and create a spreadsheet, e.g. <b>AY Toys Database</b>.
              </li>
              <li>
                In the spreadsheet: <b>Extensions › Apps Script</b>. Delete the sample code, paste the code below and click <b>Save</b>.
              </li>
              <li>
                In the toolbar choose the function <b>setup</b> and click <b>Run</b> → allow permissions. It creates every tab, locks the sheet to the
                owner key and adds a <b>Start Here</b> tab. (After reloading the sheet, the <b>AY Toys</b> menu has the same command.)
              </li>
              <li>
                Click <b>Deploy › New deployment</b> → type <b>Web app</b> → Execute as <b>Me</b> → Who has access <b>Anyone</b> → Deploy.
              </li>
              <li>
                Copy the <b>Web app URL</b> (ends with <code>/exec</code>) and paste it into <code>src/config.js</code> as <code>SHEET_URL</code>.
              </li>
              <li>
                Rebuild and redeploy the app (<code>npm run build</code>). Every computer that opens it is connected. The owner key at the top of
                the code must be the same as <code>OWNER_KEY</code> in <code>src/config.js</code> (run <code>npm run sheet-code</code> for a copy with the key filled in; the copy below leaves it empty, so the app locks the sheet to its own key the first time it connects).
              </li>
            </ol>
            <div className="flex mb">
              <b>Code.gs</b>
              <button
                className="btn sm sp"
                onClick={async () => {
                  if (await copyText(CODE)) dlg.toast('Apps Script code copied');
                  else dlg.alert('Copying was blocked by the browser. Click in the code below, press Ctrl+A, then Ctrl+C.');
                }}
              >
                <Copy size={13} /> Copy code
              </button>
            </div>
            <pre className="code">{CODE}</pre>
            <div className="note warn mt">
              After changing the script later: Save, run <b>setup</b> once, then <b>Deploy › Manage deployments › Edit › Version: New version</b> so the
              same URL keeps working (a new deployment gets a new URL, which would then have to go into <code>src/config.js</code> again).
            </div>
          </>
        )}
      </div>
    </div>
  );
}
