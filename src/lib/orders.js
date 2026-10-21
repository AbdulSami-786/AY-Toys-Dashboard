// Purchase orders, sales orders and estimates are filled by later bills / invoices that point at them
// (txn.sourceId). refreshSourceDoc recomputes the order from the documents that still point at it, so
// editing, voiding or deleting a bill or invoice keeps "On P.O." and "On Sales Order" right.

import { num } from './format';

// A close made by filling the order (not by ticking "Closed") is undone when the order is no longer filled
function wasAutoClosed(src) {
  if (!src.closed) return false;
  if (src.autoClosed !== undefined) return !!src.autoClosed;
  // saved before autoClosed existed: a PO closed with everything received was closed by receiving.
  // An older closed sales order / estimate may have been closed by hand, so it is left alone.
  if (src.type === 'purchaseorder') return (src.itemLines || []).every((l) => !l.itemId || num(l.received) >= num(l.qty));
  return false;
}

function closeState(src, filled) {
  const auto = wasAutoClosed(src);
  if (filled) return src.closed && !auto ? {} : { closed: true, autoClosed: true };
  return auto ? { closed: false, autoClosed: false } : {};
}

/** The source order updated to match the documents linked to it, or null when nothing changes. */
export function refreshSourceDoc(src, txns) {
  if (!src) return null;
  const linked = txns.filter((t) => t.sourceId === src.id && t.id !== src.id && !t.voided);
  let next;
  if (src.type === 'purchaseorder') {
    const left = new Map();
    for (const t of linked) {
      if (t.type !== 'bill' && t.type !== 'check') continue;
      for (const l of t.itemLines || []) if (l.itemId) left.set(l.itemId, (left.get(l.itemId) || 0) + num(l.qty));
    }
    const itemLines = (src.itemLines || []).map((l) => {
      if (!l.itemId) return l;
      const avail = left.get(l.itemId) || 0;
      const take = Math.max(0, Math.min(avail, num(l.qty)));
      left.set(l.itemId, avail - take);
      return { ...l, received: take };
    });
    const lines = itemLines.filter((l) => l.itemId && num(l.qty) > 0);
    const filled = lines.length > 0 && lines.every((l) => num(l.received) >= num(l.qty));
    next = { ...src, itemLines, ...closeState(src, filled) };
  } else if (src.type === 'salesorder' || src.type === 'estimate') {
    next = { ...src, ...closeState(src, linked.some((t) => t.type === 'invoice')) };
  } else return null;
  return JSON.stringify(next) === JSON.stringify(src) ? null : next;
}
