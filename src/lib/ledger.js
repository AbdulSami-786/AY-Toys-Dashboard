// Double-entry posting engine.
// Every transaction is converted into journal lines (amount > 0 = debit, < 0 = credit).
// Inventory uses weighted average cost, processed in date order, so COGS is always derived.

import { round2, num } from './format';
import { DEBIT_NORMAL, TXN_TYPES } from '../store/defaults';

export function sysAccount(accounts, key) {
  return accounts.find((a) => a.sys === key)?.id || '';
}

export function sortTxns(txns) {
  return [...txns].sort((a, b) =>
    a.date === b.date ? String(a.createdAt || '').localeCompare(String(b.createdAt || '')) : a.date < b.date ? -1 : 1,
  );
}

// Compute the sales-form totals (used by the form and by the engine so both always agree)
export function salesTotals(lines, taxRate, items) {
  const itemMap = items instanceof Map ? items : new Map((items || []).map((i) => [i.id, i]));
  let subtotal = 0;
  let taxable = 0;
  const computed = (lines || []).map((l) => {
    const it = itemMap.get(l.itemId);
    let amount = num(l.amount);
    if (it && it.type === 'Discount' && (l.rate === '' || l.rate === undefined || String(l.rate).includes('%'))) {
      const pct = String(l.rate || '').includes('%') ? num(String(l.rate).replace('%', '')) : num(it.percent);
      amount = -round2((subtotal * pct) / 100);
    }
    subtotal = round2(subtotal + amount);
    if (l.taxable) taxable += amount;
    return { ...l, amount };
  });
  const tax = round2((taxable * num(taxRate)) / 100);
  return { lines: computed, subtotal, tax, total: round2(subtotal + tax) };
}

export function purchaseTotal(t) {
  return round2(
    (t.expenseLines || []).reduce((s, l) => s + num(l.amount), 0) + (t.itemLines || []).reduce((s, l) => s + num(l.amount), 0),
  );
}

export function buildLedger(data) {
  const { accounts = [], items = [], txns = [] } = data || {};
  const acc = (k) => sysAccount(accounts, k);
  const AR = acc('ar');
  const AP = acc('ap');
  const INV = acc('inventory');
  const COGS = acc('cogs');
  const UF = acc('undeposited');
  const TAX = acc('salestax');
  const SALES = acc('sales');
  const SHRINK = acc('shrink') || COGS;

  const itemMap = new Map(items.map((i) => [i.id, i]));
  const accMap = new Map(accounts.map((a) => [a.id, a]));
  const txnById = new Map(txns.map((t) => [t.id, t]));
  // money applied to a voided or deleted document doesn't count (it becomes a credit again)
  const live = (id) => {
    const x = txnById.get(id);
    return !!x && !x.voided;
  };

  const stats = new Map(); // itemId -> { qty, value, onPO, onSO, sold, purchased }
  const st = (id) => {
    if (!stats.has(id)) stats.set(id, { qty: 0, value: 0, onPO: 0, onSO: 0, soldQty: 0, soldAmt: 0, boughtQty: 0, boughtAmt: 0, cogs: 0 });
    return stats.get(id);
  };
  const avg = (id) => {
    const s = st(id);
    if (s.qty > 0.000001) return s.value / s.qty;
    return num(itemMap.get(id)?.cost);
  };

  const lines = [];
  const open = new Map(); // txnId -> amount still due
  const applied = new Map(); // txnId -> amount paid against a charge (invoice, bill, journal charge)
  const creditUsed = new Map(); // txnId -> amount used of a credit (credit memo, bill credit, overpayment, journal credit)
  const openName = new Map(); // journal / deposit with one customer or vendor on A/R or A/P -> that name
  // a payment / bill payment applies cash + credits to charges; whatever is left over is a credit
  const settle = (t, amt) => {
    let used = 0;
    for (const a of t.applied || []) {
      if (!live(a.txnId)) continue;
      applied.set(a.txnId, round2((applied.get(a.txnId) || 0) + num(a.amount)));
      used += num(a.amount);
    }
    let credits = 0;
    for (const c of t.credits || []) {
      if (!live(c.txnId)) continue;
      creditUsed.set(c.txnId, round2((creditUsed.get(c.txnId) || 0) + num(c.amount)));
      credits += num(c.amount);
    }
    const left = round2(amt + credits - used);
    if (left > 0.005) open.set(t.id, -left);
  };
  const deposited = new Set();
  const cogsByTxn = new Map();
  const truedUp = [];

  const post = (t, accountId, amount, extra = {}) => {
    const amt = round2(amount);
    if (!accountId || Math.abs(amt) < 0.005) return;
    lines.push({
      txnId: t.id,
      type: t.type,
      date: t.date,
      num: t.num || '',
      accountId,
      amount: amt,
      nameId: extra.nameId || t.customerId || t.vendorId || '',
      memo: extra.memo ?? t.memo ?? '',
      itemId: extra.itemId || '',
      qty: extra.qty || 0,
    });
  };

  for (const t of sortTxns(txns)) {
    if (t.voided) continue;
    const type = t.type;

    if (!TXN_TYPES[type]?.posting) {
      // Non-posting documents still influence "on order" quantities
      if (!t.closed) {
        if (type === 'purchaseorder') {
          for (const l of t.itemLines || []) {
            if (!l.itemId) continue;
            st(l.itemId).onPO += num(l.qty) - num(l.received);
          }
        }
        if (type === 'salesorder') {
          for (const l of t.lines || []) if (l.itemId) st(l.itemId).onSO += num(l.qty) - num(l.invoiced);
        }
      }
      continue;
    }

    if (type === 'invoice' || type === 'salesreceipt' || type === 'creditmemo') {
      const sign = type === 'creditmemo' ? -1 : 1;
      const debitAcct = type === 'salesreceipt' ? t.depositTo || UF : AR;
      const calc = salesTotals(t.lines, t.taxRate, itemMap);
      let cogsTotal = 0;
      for (const l of calc.lines) {
        const it = itemMap.get(l.itemId);
        const incomeAcct = l.accountId || it?.incomeAccountId || SALES;
        post(t, incomeAcct, -sign * l.amount, { itemId: l.itemId, memo: l.description, qty: num(l.qty) });
        if (it && it.type === 'Inventory Part') {
          const q = num(l.qty);
          if (q) {
            const s = st(it.id);
            const cost = round2(avg(it.id) * q);
            s.qty -= sign * q;
            s.value = round2(s.value - sign * cost);
            s.soldQty += sign * q;
            s.soldAmt += sign * l.amount;
            s.cogs += sign * cost;
            cogsTotal += sign * cost;
            post(t, it.cogsAccountId || COGS, sign * cost, { itemId: it.id, memo: l.description, qty: q });
            post(t, it.assetAccountId || INV, -sign * cost, { itemId: it.id, memo: l.description, qty: -sign * q });
          }
        } else if (it) {
          const s = st(it.id);
          s.soldQty += sign * num(l.qty);
          s.soldAmt += sign * l.amount;
        }
      }
      cogsByTxn.set(t.id, cogsTotal);
      post(t, TAX, -sign * calc.tax, { memo: 'Sales tax' });
      post(t, debitAcct, sign * calc.total);
      if (type === 'invoice') open.set(t.id, calc.total);
      if (type === 'creditmemo') open.set(t.id, -calc.total);
      continue;
    }

    if (type === 'payment') {
      const amt = num(t.amount);
      post(t, t.depositTo || UF, amt);
      post(t, AR, -amt);
      settle(t, amt);
      continue;
    }

    if (type === 'deposit') {
      let total = 0;
      for (const id of t.payments || []) {
        const p = txnById.get(id);
        if (!p || p.voided) continue;
        const amt = p.type === 'payment' ? num(p.amount) : num(p.total);
        deposited.add(id);
        total += amt;
        post(t, UF, -amt, { nameId: p.customerId, memo: 'Deposit' });
      }
      for (const l of t.otherLines || []) {
        total += num(l.amount);
        post(t, l.accountId, -num(l.amount), { memo: l.memo, nameId: l.nameId });
      }
      post(t, t.accountId, total);
      continue;
    }

    if (type === 'bill' || type === 'check' || type === 'vendorcredit') {
      const sign = type === 'vendorcredit' ? -1 : 1;
      let total = 0;
      for (const l of t.expenseLines || []) {
        const amt = num(l.amount);
        total += amt;
        post(t, l.accountId, sign * amt, { memo: l.memo, nameId: l.customerId || t.vendorId });
      }
      for (const l of t.itemLines || []) {
        const it = itemMap.get(l.itemId);
        const amt = num(l.amount);
        const q = num(l.qty);
        total += amt;
        if (it && it.type === 'Inventory Part') {
          const s = st(it.id);
          if (sign > 0) {
            const was = s.qty;
            s.qty += q;
            s.value = round2(s.value + amt);
            if (was < -0.000001 && q > 0) {
              // stock was sold before it arrived (on hand went below zero, costed at the old cost):
              // value what is left at this purchase's cost and move the difference to cost of goods sold
              const target = round2(s.qty * (amt / q));
              const delta = round2(target - s.value);
              if (Math.abs(delta) >= 0.005) {
                s.value = target;
                s.cogs -= delta;
                truedUp.push({ t, it, delta });
              }
            }
          } else {
            s.qty -= q;
            s.value = round2(s.value - amt);
          }
          s.boughtQty += sign * q;
          s.boughtAmt += sign * amt;
          post(t, it.assetAccountId || INV, sign * amt, { itemId: it.id, memo: l.description, qty: sign * q });
        } else {
          if (it) {
            st(it.id).boughtQty += sign * q;
            st(it.id).boughtAmt += sign * amt;
          }
          post(t, it?.expenseAccountId || it?.cogsAccountId || COGS, sign * amt, { itemId: l.itemId, memo: l.description, qty: q });
        }
      }
      for (const x of truedUp.splice(0)) {
        post(t, x.it.assetAccountId || INV, x.delta, { itemId: x.it.id, memo: 'Cost of stock sold before it arrived', qty: 0 });
        post(t, x.it.cogsAccountId || COGS, -x.delta, { itemId: x.it.id, memo: 'Cost of stock sold before it arrived' });
      }
      if (type === 'check') post(t, t.accountId, -total);
      else post(t, AP, -sign * total);
      if (type === 'bill') open.set(t.id, round2(total));
      if (type === 'vendorcredit') open.set(t.id, -round2(total));
      continue;
    }

    if (type === 'billpayment') {
      const amt = num(t.amount);
      post(t, AP, amt);
      post(t, t.accountId, -amt);
      settle(t, amt);
      continue;
    }

    if (type === 'journal') {
      for (const l of t.lines || []) {
        post(t, l.accountId, num(l.debit) - num(l.credit), { memo: l.memo || t.memo, nameId: l.nameId });
      }
      continue;
    }

    if (type === 'transfer') {
      post(t, t.fromId, -num(t.amount));
      post(t, t.toId, num(t.amount));
      continue;
    }

    if (type === 'invadjust') {
      for (const l of t.lines || []) {
        const it = itemMap.get(l.itemId);
        if (!it) continue;
        const s = st(it.id);
        const dq = num(l.qtyDiff);
        let dv = l.valueDiff !== '' && l.valueDiff !== undefined && l.valueDiff !== null ? num(l.valueDiff) : round2(dq * avg(it.id));
        if (dq && !num(l.valueDiff) && dq > 0 && s.qty <= 0) dv = round2(dq * num(it.cost));
        s.qty += dq;
        s.value = round2(s.value + dv);
        post(t, it.assetAccountId || INV, dv, { itemId: it.id, memo: l.memo || 'Inventory adjustment', qty: dq });
        post(t, t.accountId || SHRINK, -dv, { itemId: it.id, memo: l.memo || 'Inventory adjustment' });
      }
      continue;
    }
  }

  // Journal entries / deposits that put one customer (or one vendor) on A/R (or A/P) are open items too:
  // a charge can be paid like an invoice / bill, a credit used like a credit memo / bill credit.
  const byTxn = new Map();
  for (const l of lines) {
    if (l.type !== 'journal' && l.type !== 'deposit') continue;
    if (l.accountId !== AR && l.accountId !== AP) continue;
    if (!byTxn.has(l.txnId)) byTxn.set(l.txnId, { ar: new Map(), ap: new Map() });
    const m = byTxn.get(l.txnId)[l.accountId === AR ? 'ar' : 'ap'];
    m.set(l.nameId, round2((m.get(l.nameId) || 0) + l.amount));
  }
  for (const [txnId, { ar, ap }] of byTxn) {
    if (ar.size === 1 && !ap.size) {
      const [[name, amt]] = [...ar];
      if (name && Math.abs(amt) >= 0.005) {
        open.set(txnId, amt);
        openName.set(txnId, name);
      }
    } else if (ap.size === 1 && !ar.size) {
      const [[name, amt]] = [...ap];
      if (name && Math.abs(amt) >= 0.005) {
        open.set(txnId, -amt);
        openName.set(txnId, name);
      }
    }
  }

  // Open balances after applications
  for (const [id, total] of open) {
    if (total > 0) open.set(id, round2(total - (applied.get(id) || 0)));
    else if (total < 0) open.set(id, round2(total + (creditUsed.get(id) || 0)));
  }

  // Per-account / per-name balances (all time)
  const acctBal = new Map();
  const custBal = new Map();
  const vendBal = new Map();
  for (const l of lines) {
    acctBal.set(l.accountId, round2((acctBal.get(l.accountId) || 0) + l.amount));
    if (l.accountId === AR) custBal.set(l.nameId, round2((custBal.get(l.nameId) || 0) + l.amount));
    if (l.accountId === AP) vendBal.set(l.nameId, round2((vendBal.get(l.nameId) || 0) - l.amount));
  }

  // Undeposited funds waiting for a deposit
  const undeposited = txns.filter(
    (t) =>
      !t.voided &&
      (t.type === 'payment' || t.type === 'salesreceipt') &&
      (t.depositTo || UF) === UF &&
      !deposited.has(t.id),
  );

  for (const [, s] of stats) {
    s.qty = Math.round(s.qty * 1000) / 1000;
    s.value = round2(s.value);
    s.avgCost = s.qty > 0 ? s.value / s.qty : 0;
  }

  return {
    lines,
    acctBal,
    custBal,
    vendBal,
    open,
    applied,
    creditUsed,
    openName,
    stats,
    undeposited,
    deposited,
    cogsByTxn,
    sys: { AR, AP, INV, COGS, UF, TAX, SALES },
    accMap,
    itemMap,
    txnById,
    itemStat: (id) => stats.get(id) || { qty: 0, value: 0, avgCost: 0, onPO: 0, onSO: 0, soldQty: 0, soldAmt: 0, cogs: 0 },
  };
}

// Display sign: debit-normal accounts show debit balance as positive, others show credit balance as positive
export function displayBal(account, raw) {
  if (!account) return raw;
  return DEBIT_NORMAL.has(account.type) ? raw : -raw;
}

export function sumLines(lines, filter) {
  let s = 0;
  for (const l of lines) if (filter(l)) s += l.amount;
  return round2(s);
}

export function inRange(date, from, to) {
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

// Balance of every account over a date window (from/to inclusive; omit from = as-of)
export function balancesFor(ledger, from, to) {
  const m = new Map();
  for (const l of ledger.lines) {
    if (!inRange(l.date, from, to)) continue;
    m.set(l.accountId, round2((m.get(l.accountId) || 0) + l.amount));
  }
  return m;
}

export function txnTotal(t, ledger) {
  if (!t) return 0;
  if (['payment', 'billpayment', 'transfer'].includes(t.type)) return num(t.amount);
  if (t.type === 'journal') return round2((t.lines || []).reduce((s, l) => s + num(l.debit), 0));
  if (t.type === 'deposit') {
    const lines = ledger?.lines.filter((l) => l.txnId === t.id && l.accountId === t.accountId) || [];
    return round2(lines.reduce((s, l) => s + l.amount, 0)) || num(t.total);
  }
  if (t.type === 'invadjust') {
    return round2(
      (ledger?.lines || []).filter((l) => l.txnId === t.id && l.accountId === ledger.sys.INV).reduce((s, l) => s + l.amount, 0),
    );
  }
  return num(t.total);
}
