// Is a customer / vendor / account still used anywhere? Deleting it would leave balances or documents without
// a name or account — so those can only be made inactive. Voided and non-posting documents count too.
const lineArrays = (t) => [t.lines, t.itemLines, t.expenseLines, t.otherLines].filter(Array.isArray).flat().filter(Boolean);

export function nameInUse(data, id) {
  const inTxn = (t) => t.customerId === id || t.vendorId === id || lineArrays(t).some((l) => l.nameId === id || l.customerId === id);
  if ((data.txns || []).some(inTxn)) return 'transactions';
  if ((data.memorized || []).some((m) => m.template && inTxn(m.template))) return 'memorized transactions';
  if ((data.items || []).some((i) => i.preferredVendorId === id)) return 'items (as preferred vendor)';
  return '';
}

export function accountInUse(data, company, id) {
  const inTxn = (t) => ['accountId', 'depositTo', 'fromId', 'toId'].some((f) => t[f] === id) || lineArrays(t).some((l) => l.accountId === id);
  if ((data.txns || []).some(inTxn)) return 'transactions';
  if ((data.memorized || []).some((m) => m.template && inTxn(m.template))) return 'memorized transactions';
  if ((data.items || []).some((i) => [i.incomeAccountId, i.cogsAccountId, i.assetAccountId, i.expenseAccountId].includes(id))) return 'items';
  if (company?.defaultDepositTo === id) return 'Preferences (default deposit account)';
  return '';
}
