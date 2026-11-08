// Item names that were typed but never saved (declined in "Item not found", or a New Item form closed with Cancel).
// They are kept with the company, apart from the real items, so they never show in the item lists on bills and invoices.
import { useStore } from './store';
import { uid } from '../lib/format';

const KEEP = ['type', 'name', 'sku', 'barcode', 'category', 'uom', 'pkg', 'cost', 'price', 'percent', 'description', 'purchaseDescription', 'reorderPoint', 'taxable', 'preferredVendorId'];
const same = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

export function useUnsavedItems() {
  const { company, data, updateCompany } = useStore();
  const list = company.unsavedItems || [];
  const put = (next) => updateCompany(company.id, { unsavedItems: next });

  // draft: the item form as far as it was filled in (or just { name })
  const remember = (draft) => {
    const name = String(draft?.name || '').trim();
    if (!name || data.items.some((i) => same(i.name, name))) return;
    const rec = { name };
    for (const k of KEEP) if (k !== 'name' && draft[k] !== undefined && draft[k] !== '' && draft[k] !== 0 && draft[k] !== null) rec[k] = draft[k];
    const old = list.find((u) => same(u.name, name));
    put(old ? list.map((u) => (u === old ? { ...old, ...rec } : u)) : [...list, { id: uid(), at: new Date().toISOString(), ...rec }]);
  };

  // the item was saved for real (or the entry isn't wanted any more)
  const forget = (nameOrId) => {
    if (list.some((u) => u.id === nameOrId || same(u.name, nameOrId))) put(list.filter((u) => u.id !== nameOrId && !same(u.name, nameOrId)));
  };

  // several at once (Add/Edit Multiple Items saves many): one update, so none undoes another
  const forgetMany = (names = [], ids = []) => {
    const gone = new Set(names.map((n) => String(n || '').trim().toLowerCase()));
    const goneIds = new Set(ids);
    const keep = list.filter((u) => !goneIds.has(u.id) && !gone.has(String(u.name).trim().toLowerCase()));
    if (keep.length !== list.length) put(keep);
  };

  return { list, remember, forget, forgetMany };
}
