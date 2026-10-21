// Quick lookups by id over a company's lists (used by reports, forms and the sheet reports).
import { emptyData, DEFAULT_LISTS } from '../store/defaults';

export function makeLookups(data, company) {
  const d = data || emptyData();
  const m = (list) => new Map(list.map((r) => [r.id, r]));
  return {
    accounts: d.accounts,
    items: d.items,
    customers: d.customers,
    vendors: d.vendors,
    accountMap: m(d.accounts),
    itemMap: m(d.items),
    customerMap: m(d.customers),
    vendorMap: m(d.vendors),
    lists: { ...DEFAULT_LISTS, ...(company?.lists || {}) },
    nameOf(id) {
      return this.customerMap.get(id)?.name || this.vendorMap.get(id)?.name || '';
    },
    accountLabel(id) {
      const a = this.accountMap.get(id);
      if (!a) return '';
      const parent = a.parentId ? this.accountMap.get(a.parentId) : null;
      const name = parent ? `${parent.name}:${a.name}` : a.name;
      return company?.accountNumbers !== false && a.number ? `${a.number} · ${name}` : name;
    },
  };
}
