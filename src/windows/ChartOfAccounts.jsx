import { useMemo, useRef, useState } from 'react';
import { BookOpen, Plus, Pencil, Trash2, FileBarChart, List, ChevronDown } from 'lucide-react';
import { useStore, useLookups } from '../store/store';
import { useWindowKeys } from '../store/windows';
import { useNav } from '../store/nav';
import { useDialog, Modal, useContextMenu } from '../components/ui';
import { Field, Select, DateInput, MoneyInput } from '../components/inputs';
import Combo from '../components/Combo';
import { ACCOUNT_TYPES, isPL } from '../store/defaults';
import { displayBal } from '../lib/ledger';
import { money, num, uid } from '../lib/format';
import { today } from '../lib/dates';
import { sortAccounts } from '../store/options';
import { useListNav } from '../components/listnav';
import { accountInUse } from '../lib/usage';

export function AccountModal({ initial, onClose, onSaved, defaultType }) {
  const { data, saveRecord, nextNum, ledger } = useStore();
  const L = useLookups();
  const dlg = useDialog();
  const isNew = !initial?.id;
  const [f, setF] = useState(
    initial?.id
      ? { ...initial }
      : { type: defaultType || 'Expense', number: '', name: initial?.name || '', parentId: '', description: '', active: true, opening: '', openingDate: today() },
  );
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v?.target ? (v.target.type === 'checkbox' ? v.target.checked : v.target.value) : v }));
  const parents = data.accounts.filter((a) => a.type === f.type && a.id !== f.id && a.active !== false);
  const used = !isNew && ledger.lines.some((l) => l.accountId === f.id);

  const save = async () => {
    if (!f.name.trim()) return dlg.alert('Account name is required.');
    const dup = data.accounts.find((a) => a.id !== f.id && a.name.toLowerCase() === f.name.trim().toLowerCase() && (a.parentId || '') === (f.parentId || ''));
    if (dup) return dlg.alert('An account with this name already exists.');
    if (f.number && data.accounts.find((a) => a.id !== f.id && a.number && a.number === f.number)) return dlg.alert('This account number is already used.');
    const { opening, openingDate, ...rec } = f;
    rec.name = rec.name.trim();
    const saved = saveRecord('accounts', rec.id ? rec : { ...rec, id: 'acc-' + uid() });
    if (isNew && num(opening) && !isPL(f.type)) {
      const obe = data.accounts.find((a) => a.sys === 'obe')?.id;
      const amt = num(opening);
      const debitNormal = ['Bank', 'Accounts Receivable', 'Other Current Asset', 'Fixed Asset', 'Other Asset'].includes(f.type);
      saveRecord('txns', {
        type: 'journal',
        num: nextNum('journal', 1),
        date: openingDate || today(),
        memo: 'Opening balance',
        lines: [
          { accountId: saved.id, debit: debitNormal ? amt : 0, credit: debitNormal ? 0 : amt, memo: 'Opening balance' },
          { accountId: obe, debit: debitNormal ? 0 : amt, credit: debitNormal ? amt : 0, memo: 'Opening balance' },
        ],
      });
    }
    onSaved?.(saved);
    onClose();
  };

  return (
    <Modal
      title={isNew ? 'Add New Account' : 'Edit Account'}
      onClose={onClose}
      width={560}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={save}>
            Save &amp; Close
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
        <div className="grid2">
          <Field label="Account type">
            <Select value={f.type} onChange={set('type')} options={ACCOUNT_TYPES} disabled={!!f.sys || used} />
          </Field>
          <Field label="Number">
            <input value={f.number || ''} onChange={set('number')} />
          </Field>
          <Field label="Account name" className="span2">
            <input autoFocus value={f.name} onChange={set('name')} />
          </Field>
          <Field label="Subaccount of" className="span2">
            <Combo
              value={f.parentId}
              onChange={set('parentId')}
              placeholder="(none — top-level account)"
              options={[{ id: '', label: '(none)' }, ...parents.map((a) => ({ id: a.id, label: L.accountLabel(a.id) }))]}
            />
          </Field>
          <Field label="Description" className="span2">
            <input value={f.description || ''} onChange={set('description')} />
          </Field>
          {isNew && !isPL(f.type) && (
            <>
              <Field label="Opening balance">
                <MoneyInput value={f.opening} onChange={set('opening')} />
              </Field>
              <Field label="as of">
                <DateInput value={f.openingDate} onChange={set('openingDate')} />
              </Field>
            </>
          )}
        </div>
        {!isNew && (
          <label className="check mt">
            <input type="checkbox" checked={f.active === false} onChange={(e) => set('active')(!e.target.checked)} disabled={!!f.sys} />
            Account is inactive
          </label>
        )}
        {f.sys && <p className="muted small">This is a system account used by AY Toys; its type can't be changed and it can't be deleted.</p>}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

export default function ChartOfAccounts() {
  const { data, ledger, deleteRecord, saveRecord, company } = useStore();
  const L = useLookups();
  const nav = useNav();
  const dlg = useDialog();
  const ctx = useContextMenu();
  const [sel, setSel] = useState(null);
  const [showInactive, setShowInactive] = useState(false);
  const [q, setQ] = useState('');
  const [modal, setModal] = useState(null);
  const [drop, setDrop] = useState(null);
  const ref = useRef(null);

  const rows = useMemo(() => {
    const all = sortAccounts(data.accounts).filter((a) => showInactive || a.active !== false);
    const ql = q.trim().toLowerCase();
    // balance includes sub-accounts (QuickBooks shows rolled-up totals)
    const kids = new Map();
    data.accounts.forEach((a) => {
      if (a.parentId) {
        if (!kids.has(a.parentId)) kids.set(a.parentId, []);
        kids.get(a.parentId).push(a.id);
      }
    });
    const total = (id) => (ledger.acctBal.get(id) || 0) + (kids.get(id) || []).reduce((s, k) => s + total(k), 0);
    return all
      .filter((a) => !ql || a.name.toLowerCase().includes(ql) || String(a.number || '').includes(ql) || a.type.toLowerCase().includes(ql))
      .map((a) => ({ ...a, bal: displayBal(a, total(a.id)) }));
  }, [data.accounts, ledger, showInactive, q]);

  const selected = rows.find((r) => r.id === sel);
  const { keys, onTypeAhead } = useListNav(rows, sel, setSel, { containerRef: ref });

  const openAcct = (a) => {
    if (!a) return;
    if (isPL(a.type)) nav.report('quickreport', { accountId: a.id });
    else nav.open('register', { accountId: a.id }, 'Register: ' + a.name);
  };
  const del = async (a) => {
    if (!a) return;
    if (a.sys) return dlg.alert('System accounts cannot be deleted.');
    const used = accountInUse(data, company, a.id);
    if (used) {
      const ok = await dlg.confirm(`"${a.name}" is used in ${used}, so it can't be deleted.\n\nMake it inactive instead?`, { ok: 'Make Inactive' });
      if (ok) saveRecord('accounts', { ...a, bal: undefined, depth: undefined, active: false });
      return;
    }
    if (data.accounts.some((x) => x.parentId === a.id)) return dlg.alert('Delete or move its subaccounts first.');
    if (await dlg.confirm(`Delete account "${a.name}"?`, { ok: 'Delete', danger: true })) deleteRecord('accounts', a.id);
  };
  const clean = (a) => {
    const { bal, depth, ...rest } = a;
    return rest;
  };

  useWindowKeys({
    ...keys,
    enter: () => openAcct(selected),
    'ctrl+n': () => setModal({}),
    'ctrl+e': () => selected && setModal(clean(selected)),
    'ctrl+d': () => del(selected),
    'ctrl+q': () => selected && nav.report('quickreport', { accountId: selected.id }),
    'ctrl+r': () => selected && !isPL(selected.type) && nav.open('register', { accountId: selected.id }, 'Register: ' + selected.name),
  });

  const menu = (a) => [
    { label: 'New Account', key: 'Ctrl+N', onClick: () => setModal({}) },
    { label: 'Edit Account', key: 'Ctrl+E', onClick: () => setModal(clean(a)) },
    { label: 'Delete Account', key: 'Ctrl+D', onClick: () => del(a) },
    { label: a.active === false ? 'Make Active' : 'Make Inactive', disabled: !!a.sys, onClick: () => saveRecord('accounts', { ...clean(a), active: a.active === false }) },
    '-',
    { label: 'Use Register', key: 'Ctrl+R', disabled: isPL(a.type), onClick: () => nav.open('register', { accountId: a.id }, 'Register: ' + a.name) },
    { label: 'QuickReport: ' + a.name, key: 'Ctrl+Q', onClick: () => nav.report('quickreport', { accountId: a.id }) },
    '-',
    { label: 'Make General Journal Entries', onClick: () => nav.open('journal') },
    { label: 'Write Checks', onClick: () => nav.open('check') },
    { label: 'Make Deposits', onClick: () => nav.open('deposit') },
    { label: 'Transfer Funds', onClick: () => nav.open('transfer') },
  ];

  return (
    <div className="win" onKeyDown={onTypeAhead}>
      <div className="win-title">
        <BookOpen size={20} />
        <h1>Chart of Accounts</h1>
        <span className="sub">{rows.length} accounts</span>
      </div>
      <div className="toolbar flat">
        <div style={{ position: 'relative' }}>
          <button className="btn sm" onClick={() => setDrop(drop === 'acct' ? null : 'acct')} onBlur={() => setTimeout(() => setDrop(null), 150)}>
            Account <ChevronDown size={12} />
          </button>
          {drop === 'acct' && (
            <div className="menu-drop" style={{ top: 28 }}>
              {(selected ? menu(selected) : [{ label: 'New Account', key: 'Ctrl+N', onClick: () => setModal({}) }]).map((it, i) =>
                it === '-' ? (
                  <div className="menu-sep" key={i} />
                ) : (
                  <div key={i} className={'menu-item' + (it.disabled ? ' dis' : '')} onMouseDown={() => !it.disabled && it.onClick()}>
                    <span>{it.label}</span>
                    {it.key && <span className="menu-key">{it.key}</span>}
                  </div>
                ),
              )}
            </div>
          )}
        </div>
        <button className="btn sm" onClick={() => setModal({})}>
          <Plus size={13} /> New
        </button>
        <button className="btn sm" disabled={!selected} onClick={() => setModal(clean(selected))}>
          <Pencil size={13} /> Edit
        </button>
        <button className="btn sm" disabled={!selected} onClick={() => del(selected)}>
          <Trash2 size={13} /> Delete
        </button>
        <button className="btn sm" disabled={!selected} onClick={() => nav.report('quickreport', { accountId: selected.id })}>
          <FileBarChart size={13} /> QuickReport
        </button>
        <button className="btn sm" disabled={!selected || isPL(selected?.type)} onClick={() => openAcct(selected)}>
          <List size={13} /> Register
        </button>
        <input className="sp" placeholder="Look for account…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 220 }} />
        <label className="check small">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Include inactive
        </label>
      </div>
      <div className="win-body tbl-wrap" ref={ref} tabIndex={-1}>
        <table className="tbl">
          <thead>
            <tr>
              <th style={{ width: 90 }}>Number</th>
              <th>Name</th>
              <th style={{ width: 200 }}>Type</th>
              <th className="r" style={{ width: 160 }}>
                Balance Total
              </th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr
                key={a.id}
                data-id={a.id}
                className={(a.id === sel ? 'sel ' : '') + (a.active === false ? 'inactive' : '')}
                onClick={() => setSel(a.id)}
                onDoubleClick={() => openAcct(a)}
                onContextMenu={(e) => {
                  setSel(a.id);
                  ctx.show(e, menu(a));
                }}
              >
                <td>{a.number}</td>
                <td style={{ paddingLeft: 8 + a.depth * 18 }}>
                  {a.depth ? '◦ ' : ''}
                  {a.name}
                  {a.sys && (
                    <span className="badge" style={{ marginLeft: 6 }}>
                      system
                    </span>
                  )}
                </td>
                <td>{a.type}</td>
                <td className={'r' + (a.bal < 0 ? ' neg' : '')}>{isPL(a.type) ? '' : money(a.bal)}</td>
                <td className="muted">{a.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {modal && <AccountModal initial={modal} onClose={() => setModal(null)} onSaved={(a) => setSel(a.id)} />}
      {ctx.node}
    </div>
  );
}
