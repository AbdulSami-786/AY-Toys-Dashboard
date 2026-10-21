// Type-ahead matching for list fields (Combo): best match first.
// label starts with it → the name (after "6000 · ") starts with it → a word of the label starts with it →
// the extra search text starts with it → it appears anywhere in the label → anywhere at all (incl. the sub text).
// So "Rent" finds "6000 · Rent Expense", not an account whose *type* is "Other Current Asset".
export function rankOptions(options, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return options;
  const rank = (o) => {
    const label = String(o.label || '').toLowerCase();
    if (label.startsWith(q)) return 0;
    if (label.replace(/^\S+ · /, '').startsWith(q)) return 1;
    if (label.split(/[\s:·&/(),.-]+/).some((w) => w.startsWith(q))) return 2;
    if (String(o.search || '').toLowerCase().split(/\s+/).some((w) => w.startsWith(q))) return 3;
    if (label.includes(q)) return 4;
    if ((String(o.sub || '') + ' ' + String(o.search || '')).toLowerCase().includes(q)) return 5;
    return -1;
  };
  const buckets = [[], [], [], [], [], []];
  for (const o of options) {
    const r = rank(o);
    if (r >= 0) buckets[r].push(o);
  }
  return buckets.flat();
}
