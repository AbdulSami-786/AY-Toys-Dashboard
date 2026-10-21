import { useMemo } from 'react';
import { useStore, useLookups } from './store';
import { ACCOUNT_TYPES } from './defaults';
import { displayBal } from '../lib/ledger';
import { money, qty } from '../lib/format';

const typeOrder = (t) => ACCOUNT_TYPES.indexOf(t);

export function sortAccounts(accounts) {
  // parent before children, by type then number/name
  const byParent = new Map();
  accounts.forEach((a) => {
    const p = a.parentId || '';
    if (!byParent.has(p)) byParent.set(p, []);
    byParent.get(p).push(a);
  });
  const cmp = (a, b) =>
    typeOrder(a.type) - typeOrder(b.type) || String(a.number || '').localeCompare(String(b.number || '')) || a.name.localeCompare(b.name);
  const out = [];
  const walk = (pid, depth) => {
    (byParent.get(pid) || []).sort(cmp).forEach((a) => {
      out.push({ ...a, depth });
      walk(a.id, depth + 1);
    });
  };
  walk('', 0);
  // orphans (parent deleted)
  accounts.forEach((a) => {
    if (!out.find((o) => o.id === a.id)) out.push({ ...a, depth: 0 });
  });
  return out;
}

export function useOptions() {
  const { data, ledger } = useStore();
  const L = useLookups();
  return useMemo(() => {
    const accounts = sortAccounts((data?.accounts || []).filter((a) => a.active !== false));
    const accountOpts = (types) =>
      accounts
        .filter((a) => !types || types.includes(a.type))
        .map((a) => ({
          id: a.id,
          label: L.accountLabel(a.id),
          sub: a.type,
          indent: a.depth,
          search: a.number,
        }));
    const items = (data?.items || []).filter((i) => i.active !== false).sort((a, b) => a.name.localeCompare(b.name));
    const itemOpts = items.map((i) => {
      const s = ledger?.itemStat(i.id);
      return {
        id: i.id,
        label: i.name,
        sub: [i.sku, i.type === 'Inventory Part' ? `${qty(s?.qty || 0)} on hand` : i.type].filter(Boolean).join(' · '),
        right: money(i.price),
        search: (i.sku || '') + ' ' + (i.barcode || '') + ' ' + (i.description || ''),
      };
    });
    const customers = (data?.customers || []).filter((c) => c.active !== false).sort((a, b) => a.name.localeCompare(b.name));
    const customerOpts = customers.map((c) => ({
      id: c.id,
      label: c.name,
      sub: c.city || c.phone || '',
      right: money(ledger?.custBal.get(c.id) || 0),
      search: c.phone + ' ' + c.contact,
    }));
    const vendors = (data?.vendors || []).filter((v) => v.active !== false).sort((a, b) => a.name.localeCompare(b.name));
    const vendorOpts = vendors.map((v) => ({
      id: v.id,
      label: v.name,
      sub: v.city || v.phone || '',
      right: money(ledger?.vendBal.get(v.id) || 0),
      search: v.phone + ' ' + v.contact,
    }));
    const nameOpts = [
      ...customerOpts.map((o) => ({ ...o, sub: 'Customer' })),
      ...vendorOpts.map((o) => ({ ...o, sub: 'Vendor' })),
    ].sort((a, b) => a.label.localeCompare(b.label));
    const bankOpts = accounts
      .filter((a) => a.type === 'Bank' || a.type === 'Credit Card')
      .map((a) => ({
        id: a.id,
        label: L.accountLabel(a.id),
        right: money(displayBal(a, ledger?.acctBal.get(a.id) || 0)),
      }));
    return { accounts, accountOpts, itemOpts, customerOpts, vendorOpts, nameOpts, bankOpts };
  }, [data, ledger, L]);
}

export const listOpts = (arr) => (arr || []).map((s) => ({ id: s, label: s }));
