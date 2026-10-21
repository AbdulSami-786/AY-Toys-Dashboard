import { useState } from 'react';
import { useStore, useLookups } from '../store/store';
import { useDialog, Modal, Tabs } from '../components/ui';
import { Field, Select, DateInput, MoneyInput } from '../components/inputs';
import Combo from '../components/Combo';
import { listOpts, useOptions } from '../store/options';
import { num } from '../lib/format';
import { today, dueFromTerms } from '../lib/dates';

// Fields of a new customer / vendor (the full form and Quick Add both start here)
const blankName = (isC) => ({
  name: '',
  company: '',
  contact: '',
  phone: '',
  altPhone: '',
  email: '',
  billTo: '',
  shipTo: '',
  address: '',
  city: '',
  type: '',
  terms: isC ? 'Net 30' : 'Net 30',
  priceLevelId: '',
  creditLimit: '',
  taxable: false,
  rep: '',
  ntn: '',
  accountNo: '',
  notes: '',
  active: true,
});

// Tidy a customer / vendor record before saving
function finishName(rec, isC) {
  const r = { ...rec, name: rec.name.trim(), creditLimit: num(rec.creditLimit) };
  if (isC && !r.billTo) r.billTo = [r.company || r.name, r.address, r.city].filter(Boolean).join('\n');
  if (isC && !r.shipTo) r.shipTo = r.billTo;
  return r;
}

export function NameModal({ which, initial, onClose, onSaved }) {
  const { data, saveRecord, nextNum } = useStore();
  const L = useLookups();
  const dlg = useDialog();
  const isNew = !initial?.id;
  const isC = which === 'customer';
  const [tab, setTab] = useState('addr');
  const [f, setF] = useState(() => ({
    ...blankName(isC),
    openBal: '',
    openDate: today(),
    ...initial,
  }));
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v?.target ? (v.target.type === 'checkbox' ? v.target.checked : v.target.value) : v }));
  const list = isC ? data.customers : data.vendors;

  const save = async () => {
    const name = f.name.trim();
    if (!name) return dlg.alert(`${isC ? 'Customer' : 'Vendor'} name is required.`);
    if (list.find((x) => x.id !== f.id && x.name.toLowerCase() === name.toLowerCase())) return dlg.alert('This name is already in use.');
    const { openBal, openDate, ...rest } = f;
    const rec = finishName(rest, isC);
    const saved = saveRecord(isC ? 'customers' : 'vendors', rec);
    const amt = num(openBal);
    if (isNew && amt) {
      const obe = data.accounts.find((a) => a.sys === 'obe')?.id;
      const date = openDate || today();
      if (isC) {
        saveRecord('txns', {
          type: 'invoice',
          num: nextNum('invoice', 1001),
          date,
          dueDate: dueFromTerms(date, rec.terms),
          customerId: saved.id,
          terms: rec.terms,
          billTo: rec.billTo,
          lines: [{ description: 'Opening Balance', qty: '', rate: '', amount: amt, accountId: obe }],
          subtotal: amt,
          tax: 0,
          taxRate: 0,
          total: amt,
          memo: 'Opening Balance',
        });
      } else {
        saveRecord('txns', {
          type: 'bill',
          num: 'OPEN',
          date,
          dueDate: dueFromTerms(date, rec.terms),
          vendorId: saved.id,
          terms: rec.terms,
          expenseLines: [{ accountId: obe, amount: amt, memo: 'Opening Balance' }],
          itemLines: [],
          total: amt,
          memo: 'Opening Balance',
        });
      }
    }
    onSaved?.(saved);
    onClose();
  };

  const tabs = [
    { id: 'addr', label: 'Address Info' },
    { id: 'pay', label: 'Payment Settings' },
    { id: 'add', label: 'Additional Info' },
  ];

  return (
    <Modal
      title={`${isNew ? 'New' : 'Edit'} ${isC ? 'Customer' : 'Vendor'}`}
      onClose={onClose}
      width={760}
      footer={
        <>
          {!isNew && (
            <label className="check sp">
              <input type="checkbox" checked={f.active === false} onChange={(e) => set('active')(!e.target.checked)} />
              {isC ? 'Customer' : 'Vendor'} is inactive
            </label>
          )}
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={save}>
            OK
          </button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div className="grid3 mb">
          <Field label={`${isC ? 'Customer' : 'Vendor'} name`} className="span2">
            <input autoFocus value={f.name} onChange={set('name')} />
          </Field>
          {isNew ? (
            <div className="flex" style={{ gap: 6 }}>
              <Field label="Opening balance">
                <MoneyInput value={f.openBal} onChange={set('openBal')} />
              </Field>
              <Field label="as of">
                <DateInput value={f.openDate} onChange={set('openDate')} />
              </Field>
            </div>
          ) : (
            <div />
          )}
        </div>
        <Tabs tabs={tabs} value={tab} onChange={setTab} className="mb" />
        {tab === 'addr' && (
          <div className="grid3">
            <Field label="Company name">
              <input value={f.company} onChange={set('company')} />
            </Field>
            <Field label="Contact person">
              <input value={f.contact} onChange={set('contact')} />
            </Field>
            <Field label="Main phone">
              <input value={f.phone} onChange={set('phone')} />
            </Field>
            <Field label="Alt. phone / WhatsApp">
              <input value={f.altPhone} onChange={set('altPhone')} />
            </Field>
            <Field label="Email">
              <input value={f.email} onChange={set('email')} />
            </Field>
            <Field label="City">
              <input value={f.city} onChange={set('city')} />
            </Field>
            {isC ? (
              <>
                <Field label="Invoice / Bill to" className="span2" style={{ gridColumn: 'span 1' }}>
                  <textarea rows={4} value={f.billTo} onChange={set('billTo')} />
                </Field>
                <Field label="Ship to">
                  <textarea rows={4} value={f.shipTo} onChange={set('shipTo')} />
                </Field>
                <div className="flex" style={{ alignItems: 'center' }}>
                  <button type="button" className="btn sm" onClick={() => set('shipTo')(f.billTo)}>
                    Copy bill-to ››
                  </button>
                </div>
              </>
            ) : (
              <Field label="Address" className="span3">
                <textarea rows={3} value={f.address} onChange={set('address')} />
              </Field>
            )}
          </div>
        )}
        {tab === 'pay' && (
          <div className="grid3">
            <Field label="Payment terms">
              <Combo value={f.terms} onChange={set('terms')} allowFree options={listOpts(L.lists.terms)} />
            </Field>
            <Field label="Credit limit">
              <MoneyInput value={f.creditLimit} onChange={set('creditLimit')} />
            </Field>
            {isC ? (
              <Field label="Price level">
                <Select value={f.priceLevelId} onChange={set('priceLevelId')} options={[{ value: '', label: '(base price)' }, ...L.lists.priceLevels.map((p) => ({ value: p.id, label: p.name }))]} />
              </Field>
            ) : (
              <Field label="Account no. (at vendor)">
                <input value={f.accountNo} onChange={set('accountNo')} />
              </Field>
            )}
            <Field label="NTN / Tax ID">
              <input value={f.ntn} onChange={set('ntn')} />
            </Field>
            {isC && (
              <label className="check" style={{ alignSelf: 'end' }}>
                <input type="checkbox" checked={!!f.taxable} onChange={set('taxable')} /> Charge sales tax
              </label>
            )}
          </div>
        )}
        {tab === 'add' && (
          <div className="grid3">
            <Field label={`${isC ? 'Customer' : 'Vendor'} type`}>
              <Combo value={f.type} allowFree onChange={set('type')} options={listOpts(isC ? L.lists.customerTypes : L.lists.vendorTypes)} />
            </Field>
            {isC && (
              <Field label="Sales rep">
                <Combo value={f.rep} allowFree onChange={set('rep')} options={listOpts(L.lists.reps)} />
              </Field>
            )}
            <Field label="Notes" className="span3">
              <textarea rows={4} value={f.notes} onChange={set('notes')} />
            </Field>
          </div>
        )}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

const KIND_LABEL = { customer: 'Customer', vendor: 'Vendor' };

/**
 * QuickBooks "Quick Add": a typed name that is not in the list can be saved with just its name
 * (Quick Add), opened in the full form (Set Up…), or dropped. kinds: the list(s) it can go in.
 * mode 'new' = the user picked < Add New > in a field that takes either a customer or a vendor.
 */
function QuickAddModal({ name, kinds, mode, onQuickAdd, onSetUp, onClose }) {
  const [kind, setKind] = useState(kinds[0]);
  const either = kinds.length > 1;
  const title = mode === 'new' ? 'Add New Name' : `${either ? 'Name' : KIND_LABEL[kinds[0]]} Not Found`;
  return (
    <Modal
      title={title}
      onClose={onClose}
      width={460}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className={'btn' + (name ? '' : ' primary')} autoFocus={!name} onClick={() => onSetUp(kind)}>
            Set Up…
          </button>
          {name && (
            <button className="btn primary" autoFocus onClick={() => onQuickAdd(kind)}>
              Quick Add
            </button>
          )}
        </>
      }
    >
      {mode !== 'new' && (
        <div className="dlg-msg">
          <b>{name}</b> is not in the {either ? 'Customer or Vendor' : KIND_LABEL[kinds[0]]} list.
        </div>
      )}
      {either && (
        <div
          className={'flex' + (mode !== 'new' ? ' mt' : '')}
          role="radiogroup"
          aria-label="Add as"
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            if (name) onQuickAdd(kind);
            else onSetUp(kind);
          }}
        >
          <span className="small muted">{name && mode === 'new' ? <>Add <b>{name}</b> as</> : 'Add as'}</span>
          {kinds.map((k) => (
            <label key={k} className="check">
              <input type="radio" name="qa-kind" checked={kind === k} onChange={() => setKind(k)} /> {KIND_LABEL[k]}
            </label>
          ))}
        </div>
      )}
      <p className="small muted mt" style={{ marginBottom: 0 }}>
        {name && (
          <>
            <b>Quick Add</b> saves just the name so you can carry on — add the phone, address and terms later in the {either ? 'Customer or Vendor' : KIND_LABEL[kinds[0]]} Center.{' '}
          </>
        )}
        <b>Set Up…</b> opens the full form.
      </p>
    </Modal>
  );
}

/**
 * Customer / vendor field for forms: type-ahead list with < Add New > and Quick Add.
 * which: 'customer' | 'vendor' | 'name' (either; prefer = the type offered first). onChange(id, record).
 */
export function NameCombo({ which, prefer = 'customer', value, onChange, options, ...rest }) {
  const { data, saveRecord } = useStore();
  const O = useOptions();
  const dlg = useDialog();
  const [ask, setAsk] = useState(null); // { name, mode }
  const [setup, setSetup] = useState(null); // { kind, name }
  const kinds = which === 'name' ? (prefer === 'vendor' ? ['vendor', 'customer'] : ['customer', 'vendor']) : [which];
  const table = (k) => (k === 'customer' ? 'customers' : 'vendors');
  const opts = options || (which === 'customer' ? O.customerOpts : which === 'vendor' ? O.vendorOpts : O.nameOpts);
  const recordOf = (id) => data.customers.find((c) => c.id === id) || data.vendors.find((v) => v.id === id) || null;

  const notFound = async (name) => {
    // the name may already exist but be inactive (inactive names are not in the list)
    for (const k of kinds) {
      const rec = data[table(k)].find((x) => x.name.trim().toLowerCase() === name.toLowerCase());
      if (!rec) continue;
      if (rec.active !== false) return onChange(rec.id, rec);
      if (await dlg.confirm(`"${rec.name}" is an inactive ${k}.\n\nMake it active and use it here?`, { ok: 'Make Active' })) {
        const saved = saveRecord(table(k), { ...rec, active: true });
        onChange(saved.id, saved);
      }
      return;
    }
    setAsk({ name, mode: 'notfound' });
  };

  const quickAdd = (kind) => {
    const isC = kind === 'customer';
    const rec = saveRecord(table(kind), finishName({ ...blankName(isC), name: ask.name }, isC));
    setAsk(null);
    onChange(rec.id, rec);
    dlg.toast(`${KIND_LABEL[kind]} "${rec.name}" added — fill in the details any time in the ${KIND_LABEL[kind]} Center`);
  };

  const setUp = (kind) => {
    setSetup({ kind, name: ask.name });
    setAsk(null);
  };

  return (
    <>
      <Combo
        value={value}
        options={opts}
        onChange={(id) => onChange(id, recordOf(id))}
        onAddNew={(name) => (kinds.length > 1 ? setAsk({ name: name.trim(), mode: 'new' }) : setSetup({ kind: kinds[0], name }))}
        onNotFound={notFound}
        {...rest}
      />
      {ask && <QuickAddModal name={ask.name} kinds={kinds} mode={ask.mode} onQuickAdd={quickAdd} onSetUp={setUp} onClose={() => setAsk(null)} />}
      {setup && <NameModal which={setup.kind} initial={{ name: setup.name }} onClose={() => setSetup(null)} onSaved={(rec) => onChange(rec.id, rec)} />}
    </>
  );
}
