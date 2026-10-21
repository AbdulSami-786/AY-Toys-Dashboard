// Company records shared through the one Google Sheet: merge what this computer has with the sheet.
import { newCompany, DEFAULT_LISTS } from './defaults';

const BOOL_FIELDS = ['active', 'accountNumbers'];
const normalize = (rec) => {
  const r = { ...rec, id: String(rec.id) };
  for (const f of BOOL_FIELDS) {
    if (r[f] === 'TRUE' || r[f] === 'true') r[f] = true;
    if (r[f] === 'FALSE' || r[f] === 'false') r[f] = false;
  }
  return r;
};

// A company from the sheet, with defaults for the fields the sheet leaves out (empty cells come back missing)
export const fromSheet = (r) => {
  const n = normalize(r);
  return { ...newCompany({ name: n.name }), ...n, lists: { ...DEFAULT_LISTS, ...(n.lists || {}) } };
};

export const newer = (a, b) => String(a?.updatedAt || a?.createdAt || '') > String(b?.updatedAt || b?.createdAt || '');

// Companies on this computer + in the sheet: the most recently changed copy of each wins.
// The sheet copy replaces the local one entirely, so a field cleared on another computer stays cleared.
export function mergeCompanies(local, remote) {
  const map = new Map(local.map((c) => [c.id, c]));
  for (const r of remote) {
    const mine = map.get(String(r.id));
    if (!mine || newer(r, mine)) map.set(String(r.id), fromSheet(r));
  }
  return [...map.values()];
}
