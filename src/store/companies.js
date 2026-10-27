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

const stamp = (x) => String(x?.updatedAt || '');
const templatesSig = (c) =>
  JSON.stringify([
    (c?.templates || []).map((t) => [t.id, stamp(t)]).sort(),
    Object.entries(c?.templatesRemoved || {}).sort(),
  ]);
export const sameTemplates = (a, b) => templatesSig(a) === templatesSig(b);

// Templates are merged one by one — the most recently saved copy of each wins — so a computer with an older copy
// of the shop that changes some other setting can't bring an older template back. Deleted templates are
// remembered (templatesRemoved: id → when) so they don't come back from an older copy either.
// The winner's copy is kept on a tie.
function mergeTemplates(win, lose) {
  const removed = { ...(win.templatesRemoved || {}) };
  Object.entries(lose.templatesRemoved || {}).forEach(([id, at]) => {
    if (!removed[id] || at > removed[id]) removed[id] = at;
  });
  const byId = new Map();
  [...(win.templates || []), ...(lose.templates || [])].forEach((t) => {
    if (t?.id && (!byId.has(t.id) || stamp(t) > stamp(byId.get(t.id)))) byId.set(t.id, t);
  });
  const templates = [...byId.values()].filter((t) => !(removed[t.id] && removed[t.id] >= stamp(t)));
  return { templates, templatesRemoved: removed };
}

// Companies on this computer + in the sheet: the most recently changed copy of each wins.
// The sheet copy replaces the local one entirely (so a field cleared on another computer stays cleared),
// except the templates, which are merged one by one (see mergeTemplates).
export function mergeCompanies(local, remote) {
  const map = new Map(local.map((c) => [c.id, c]));
  for (const r of remote) {
    const id = String(r.id);
    const mine = map.get(id);
    if (!mine) {
      map.set(id, fromSheet(r));
      continue;
    }
    const theirs = fromSheet(r);
    const win = newer(r, mine) ? theirs : mine;
    const lose = win === mine ? theirs : mine;
    if (win === mine && sameTemplates(mine, theirs)) continue; // nothing new: keep the same object
    map.set(id, { ...win, ...mergeTemplates(win, lose) });
  }
  return [...map.values()];
}
