// Memorized transactions (Ctrl+M): what a template keeps, and when its reminder is due.
import { addDays, addMonths, today } from './dates';

// Only the reusable parts: no dates, number, links to other documents, payments or received quantities.
// (A memorized bill that received a PO must not receive it again; an old due date would be overdue at once.)
const DROP = ['id', 'num', 'date', 'dueDate', 'shipDate', 'expectedDate', 'createdAt', 'updatedAt', 'voided', 'sourceId', 'closed', 'autoClosed', 'applied', 'credits', 'appliedMap', 'payments'];
const cleanLines = (lines) => (Array.isArray(lines) ? lines.map(({ received, invoiced, key, ...l }) => l) : lines);

export function memoTemplate(txn) {
  const t = { ...(txn || {}) };
  for (const k of DROP) delete t[k];
  for (const k of ['lines', 'itemLines', 'expenseLines', 'otherLines']) if (t[k]) t[k] = cleanLines(t[k]);
  return t;
}

export const FREQUENCIES = ['Never', 'Weekly', 'Monthly', 'Quarterly', 'Yearly'];

export function nextDate(from, frequency) {
  if (!frequency || frequency === 'Never') return '';
  if (frequency === 'Weekly') return addDays(from, 7);
  if (frequency === 'Monthly') return addMonths(from, 1);
  if (frequency === 'Quarterly') return addMonths(from, 3);
  if (frequency === 'Yearly') return addMonths(from, 12);
  return '';
}

// a reminder shows on Home from its next date on (older entries without a next date: right away)
export const isDue = (m, on = today()) => !!m.frequency && m.frequency !== 'Never' && (!m.nextDate || m.nextDate <= on);

// after entering it: the next reminder one period after the later of today and the planned date
export const afterEntered = (m, on = today()) => (m.frequency && m.frequency !== 'Never' ? { ...m, nextDate: nextDate(m.nextDate && m.nextDate > on ? m.nextDate : on, m.frequency) } : m);
