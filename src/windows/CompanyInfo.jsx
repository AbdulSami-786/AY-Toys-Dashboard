import { useRef, useState } from 'react';
import { Building2, Save, Upload, Trash2, Files } from 'lucide-react';
import { useStore } from '../store/store';
import { useDialog, Tabs } from '../components/ui';
import { Field, Select } from '../components/inputs';
import ThemePicker from '../components/ThemePicker';
import { useWindowKeys, useWindows } from '../store/windows';
import { readLogo } from '../store/templates';
import DataImport from './DataImport';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function CompanyInfo({ tab: initialTab = 'info', winId }) {
  const { company, updateCompany, data } = useStore();
  const { close, open } = useWindows();
  const logoRef = useRef(null);
  const pickLogo = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const logo = await readLogo(file);
      setF((x) => ({ ...x, logo }));
      updateCompany(company.id, { logo });
      dlg.toast('Logo saved — turn it on per template in Lists › Templates');
    } catch (err) {
      dlg.alert(err.message);
    }
  };
  const dlg = useDialog();
  const [tab, setTab] = useState(initialTab);
  const [f, setF] = useState(company);
  const set = (k) => (e) => setF({ ...f, [k]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e });
  const save = (andClose) => {
    // these are saved by their own screens; don't overwrite them with this window's older copy
    const { templates, templateDefaults, templatesRemoved, lists, logo, theme, shortcuts, memorizedReports, ...rest } = f;
    updateCompany(company.id, { ...rest, taxRate: Number(f.taxRate) || 0, fyMonth: Number(f.fyMonth) || 1 });
    dlg.toast('Company settings saved');
    if (andClose) close(winId);
  };
  useWindowKeys({ 'alt+a': () => save(true), 'alt+s': () => save(false), 'ctrl+s': () => save(false) });
  const banks = data.accounts.filter((a) => a.type === 'Bank' || a.sys === 'undeposited');

  return (
    <div className="win">
      <div className="win-title">
        <Building2 size={20} />
        <h1>{f.name}</h1>
        <span className="sub">Company Information & Preferences</span>
      </div>
      <Tabs
        tabs={[
          { id: 'info', label: 'Company Information' },
          { id: 'prefs', label: 'Preferences' },
          { id: 'theme', label: 'Theme & Appearance' },
          { id: 'data', label: 'Import Data File' },
        ]}
        value={tab}
        onChange={setTab}
      />
      <div className="win-body pad" style={{ maxWidth: 900 }}>
        {tab === 'info' && (
          <div className="grid2">
            <Field label="Company name">
              <input value={f.name} onChange={set('name')} />
            </Field>
            <Field label="Legal name (printed on forms)">
              <input value={f.legalName || ''} onChange={set('legalName')} />
            </Field>
            <Field label="Address">
              <input value={f.address || ''} onChange={set('address')} />
            </Field>
            <Field label="City / Country">
              <input value={f.city || ''} onChange={set('city')} />
            </Field>
            <Field label="Phone">
              <input value={f.phone || ''} onChange={set('phone')} />
            </Field>
            <Field label="Email">
              <input value={f.email || ''} onChange={set('email')} />
            </Field>
            <Field label="Website">
              <input value={f.website || ''} onChange={set('website')} />
            </Field>
            <Field label="NTN / STRN / Tax ID">
              <input value={f.ntn || ''} onChange={set('ntn')} />
            </Field>
            <Field label="Company code (Google Sheet tab prefix)">
              <input value={f.code} disabled />
            </Field>
            <Field label="Logo (printed on forms)" className="span2">
              <div className="logo-row">
                <div className="logo-thumb">{f.logo ? <img src={f.logo} alt="Company logo" /> : <span className="muted small">No logo</span>}</div>
                <div className="flex" style={{ flexWrap: 'wrap' }}>
                  <button type="button" className="btn sm" onClick={() => logoRef.current?.click()}>
                    <Upload size={13} /> {f.logo ? 'Change…' : 'Upload…'}
                  </button>
                  {f.logo && (
                    <button
                      type="button"
                      className="btn sm"
                      onClick={() => {
                        setF((x) => ({ ...x, logo: '' }));
                        updateCompany(company.id, { logo: '' });
                      }}
                    >
                      <Trash2 size={13} /> Remove
                    </button>
                  )}
                  <button type="button" className="btn sm" onClick={() => open('templates', { n: Date.now() })}>
                    <Files size={13} /> Form templates…
                  </button>
                </div>
              </div>
              <input ref={logoRef} type="file" accept="image/*" hidden onChange={pickLogo} />
            </Field>
          </div>
        )}
        {tab === 'prefs' && (
          <>
            <div className="section-title" style={{ marginTop: 0 }}>
              General
            </div>
            <div className="grid3">
              <Field label="Currency symbol">
                <input value={f.currency || ''} onChange={set('currency')} />
              </Field>
              <Field label="Date format">
                <Select
                  value={f.dateStyle || 'DMY'}
                  onChange={set('dateStyle')}
                  options={[
                    { value: 'DMY', label: 'DD/MM/YYYY' },
                    { value: 'MDY', label: 'MM/DD/YYYY' },
                  ]}
                />
              </Field>
              <Field label="First month of fiscal year">
                <Select value={String(f.fyMonth || 1)} onChange={set('fyMonth')} options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))} />
              </Field>
            </div>
            <div className="section-title">Accounting</div>
            <label className="check">
              <input type="checkbox" checked={f.accountNumbers !== false} onChange={set('accountNumbers')} />
              Use account numbers
            </label>
            <div className="section-title">Sales Tax</div>
            <div className="grid3">
              <Field label="Tax name">
                <input value={f.taxName || ''} onChange={set('taxName')} placeholder="GST / Sales Tax" />
              </Field>
              <Field label="Default rate %">
                <input className="num" value={f.taxRate ?? 0} onChange={set('taxRate')} />
              </Field>
            </div>
            <div className="section-title">Sales & Customers</div>
            <div className="grid3">
              <Field label="Payments deposit to by default">
                <Select
                  value={f.defaultDepositTo || ''}
                  onChange={set('defaultDepositTo')}
                  options={[{ value: '', label: 'Undeposited Funds' }, ...banks.filter((b) => b.sys !== 'undeposited').map((b) => ({ value: b.id, label: b.name }))]}
                />
              </Field>
              <Field label="Default invoice message" className="span2">
                <input value={f.defaultMessage || ''} onChange={set('defaultMessage')} />
              </Field>
            </div>
            <div className="flex mt">
              <label className="check">
                <input type="checkbox" checked={f.warnNegativeStock !== false} onChange={set('warnNegativeStock')} />
                Warn when selling more than quantity on hand
              </label>
            </div>
            <div className="flex mt">
              <label className="check">
                <input type="checkbox" checked={f.warnCreditLimit !== false} onChange={set('warnCreditLimit')} />
                Warn when a customer goes over their credit limit
              </label>
            </div>
            <div className="flex mt">
              <label className="check">
                <input type="checkbox" checked={f.warnDuplicateNum !== false} onChange={set('warnDuplicateNum')} />
                Warn about duplicate invoice / check numbers
              </label>
            </div>
          </>
        )}
        {tab === 'data' && <DataImport />}
        {tab === 'theme' && (
          <>
            <p className="muted">Every company can have its own color. Switch companies and the whole interface changes to that company's theme.</p>
            <ThemePicker
              theme={f.theme}
              name={f.name}
              onChange={(theme) => {
                setF({ ...f, theme });
                updateCompany(company.id, { theme });
              }}
            />
          </>
        )}
      </div>
      <div className="txn-actions">
        <span className="muted small">Alt+A Save &amp; Close · Alt+S Save</span>
        <span className="sp" />
        <button className="btn" onClick={() => save(false)}>
          <Save size={14} /> Save
        </button>
        <button className="btn primary" onClick={() => save(true)}>
          Save &amp; Close
        </button>
      </div>
    </div>
  );
}
