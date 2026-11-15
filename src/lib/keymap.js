// Customizable keyboard shortcuts.
// Every command that has a key is listed here with its standard key. A user can give a command another key (or none);
// the changes are kept on this device (localStorage). One key belongs to one command only: giving a key to a command
// takes it away from the command that had it, which is then left without a key (e.g. Ctrl+P given to Create Invoices
// leaves Print with no key).
import { useSyncExternalStore } from 'react';
import { GLOBAL_KEYS } from './commands';

const LS_KEY = 'ay.keymap';

// commands that act inside the window that is open (a transaction form, a list…): `handler` is the key name the window listens for
const WINDOW_COMMANDS = [
  { id: 'w.print', label: 'Print', group: 'In forms & lists', def: 'ctrl+p' },
  { id: 'w.save', label: 'Save (stay on the form)', group: 'In forms & lists', def: 'ctrl+s' },
  { id: 'w.saveNew', label: 'Save & New', group: 'In forms & lists', def: 'alt+s' },
  { id: 'w.saveClose', label: 'Save & Close', group: 'In forms & lists', def: 'alt+a' },
  { id: 'w.saveClose2', label: 'Save & Close (second key)', group: 'In forms & lists', def: 'ctrl+enter', handler: 'ctrl+enter' },
  { id: 'w.prev', label: 'Previous transaction', group: 'In forms & lists', def: 'alt+p' },
  { id: 'w.next', label: 'Next transaction', group: 'In forms & lists', def: 'alt+n' },
  { id: 'w.new', label: 'New (transaction / list entry)', group: 'In forms & lists', def: 'ctrl+n' },
  { id: 'w.edit', label: 'Edit selected', group: 'In forms & lists', def: 'ctrl+e' },
  { id: 'w.delete', label: 'Delete', group: 'In forms & lists', def: 'ctrl+d' },
  { id: 'w.memorize', label: 'Memorize transaction', group: 'In forms & lists', def: 'ctrl+m' },
  { id: 'w.history', label: 'Transaction history', group: 'In forms & lists', def: 'ctrl+h' },
  { id: 'w.journal', label: 'Transaction journal', group: 'In forms & lists', def: 'ctrl+y' },
  { id: 'w.quick', label: 'QuickReport for selected', group: 'In forms & lists', def: 'ctrl+q' },
].map((c) => ({ type: 'window', handler: c.def, ...c }));

// names of the commands that open a window / do something anywhere (their keys come from GLOBAL_KEYS)
const GLOBAL_LABELS = {
  'ctrl+i': 'Create Invoices',
  'ctrl+a': 'Chart of Accounts',
  'ctrl+w': 'Write Checks',
  'alt+k': 'Write Checks (second key)',
  'ctrl+j': 'Customer Center',
  'ctrl+f': 'Find transactions',
  'ctrl+r': 'Use Register',
  'ctrl+t': 'Memorized Transaction List',
  'alt+t': 'Memorized Transaction List (second key)',
  'ctrl+o': 'Company List',
  'ctrl+l': 'Item List',
  'ctrl+g': 'Transfer Funds',
  'ctrl+shift+f': 'Advanced Find',
  f1: 'Keyboard Shortcuts',
  f2: 'Product Information',
  'alt+pagedown': 'Next open window',
  'alt+pageup': 'Previous open window',
  'alt+shift+e': 'Create Estimates',
  'alt+shift+o': 'Create Sales Orders',
  'alt+shift+s': 'Enter Sales Receipts',
  'alt+shift+r': 'Receive Payments',
  'alt+shift+c': 'Create Credit Memos / Refunds',
  'alt+shift+v': 'Vendor Center',
  'alt+shift+b': 'Enter Bills',
  'alt+shift+p': 'Pay Bills',
  'alt+shift+u': 'Create Purchase Orders',
  'alt+shift+i': 'Adjust Quantity / Value on Hand',
  'alt+shift+d': 'Make Deposits',
  'alt+shift+j': 'Make General Journal Entries',
  'alt+shift+h': 'Home',
  'alt+shift+x': 'Report Center',
  'ctrl+shift+s': 'Sync with Google Sheets now',
};

const GLOBAL_COMMANDS = Object.entries(GLOBAL_KEYS).map(([def, cmd]) => ({
  type: 'global',
  id: 'g.' + def,
  label: GLOBAL_LABELS[def] || def,
  group: 'Open a window / go to',
  def,
  cmd,
}));

export const KEY_COMMANDS = [...WINDOW_COMMANDS, ...GLOBAL_COMMANDS];

// ---------------------------------------------------------------- storage

let overrides = null; // { [id]: combo | '' }
let version = 0;
const listeners = new Set();

const read = () => {
  try {
    const v = JSON.parse(localStorage.getItem(LS_KEY));
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
};
const get = () => (overrides ||= read());
const commit = (next) => {
  overrides = next;
  version++;
  cache = null;
  try {
    if (Object.keys(next).length) localStorage.setItem(LS_KEY, JSON.stringify(next));
    else localStorage.removeItem(LS_KEY);
  } catch {
    /* kept for this session only */
  }
  listeners.forEach((l) => l());
};
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== LS_KEY) return;
    overrides = null;
    version++;
    cache = null;
    listeners.forEach((l) => l());
  });
}
const subscribe = (l) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
/** re-render when a shortcut changes */
export const useKeymap = () => useSyncExternalStore(subscribe, () => version);

/** the key a command has now ('' = none) */
export const comboOf = (cmd) => {
  const o = get()[cmd.id];
  return o === undefined ? cmd.def : o;
};
export const isChanged = (cmd) => get()[cmd.id] !== undefined;

// ---------------------------------------------------------------- lookup used by the keyboard handler

let cache = null;
/** { byCombo: key → command, windowDefaults: standard keys of the in-window commands } */
export function keymap() {
  if (cache) return cache;
  const byCombo = {};
  const o = get();
  KEY_COMMANDS.forEach((c) => {
    const k = comboOf(c);
    if (k) byCombo[k] = { ...c, moved: o[c.id] !== undefined && o[c.id] !== '' };
  });
  cache = { byCombo, windowDefaults: new Set(WINDOW_COMMANDS.map((c) => c.def)) };
  return cache;
}

// ---------------------------------------------------------------- showing a key

const NAMES = { pagedown: 'PgDn', pageup: 'PgUp', insert: 'Ins', delete: 'Del', esc: 'Esc', enter: 'Enter', space: 'Space', arrowup: '↑', arrowdown: '↓', arrowleft: '←', arrowright: '→' };
export function prettyCombo(combo) {
  if (!combo) return '';
  return combo
    .split('+')
    .map((p) => NAMES[p] || (p.length === 1 ? p.toUpperCase() : p.toUpperCase() === p ? p : p[0].toUpperCase() + p.slice(1)))
    .join('+');
}

const sameCmd = (a, b) => !!a && !!b && a.open === b.open && a.action === b.action && JSON.stringify(a.props || null) === JSON.stringify(b.props || null);

/** The key to show next to a menu item: the current key of its command (empty when it has none); the menu's own text when the command is not customizable. */
export function menuKeyText(item) {
  const cmd = item?.cmd;
  if (!cmd) return item?.key;
  const matches = cmd.key ? KEY_COMMANDS.filter((c) => c.type === 'window' && c.handler === cmd.key) : KEY_COMMANDS.filter((c) => c.type === 'global' && sameCmd(c.cmd, cmd));
  if (!matches.length) return item.key;
  if (matches.every((c) => !isChanged(c))) return item.key; // nothing customized: the menu's own text
  const own = matches.map(comboOf).find(Boolean);
  return own ? prettyCombo(own) : '';
}

// ---------------------------------------------------------------- changing a key

const MENU_LETTERS = 'fevlcuobrwh';
const BARE_RESERVED = new Set(['esc', 'enter', 'tab', 'backspace', 'delete', 'insert', 'space', 'home', 'end', 'pageup', 'pagedown', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright']);
const TAKEN = new Set(['ctrl+c', 'ctrl+v', 'ctrl+x', 'ctrl+z', 'ctrl+shift+i', 'f5', 'f11', 'f12', 'alt+f4']);

/** '' when the key can be used, else why not */
export function comboProblem(combo) {
  if (!combo) return 'Press a key together with Ctrl or Alt.';
  const parts = combo.split('+');
  const key = parts[parts.length - 1];
  const mods = parts.slice(0, -1);
  if (!key || key === '' || combo.endsWith('++')) return 'That key cannot be used.';
  if (BARE_RESERVED.has(key) && !mods.length) return 'That key is needed by the program itself.';
  if (TAKEN.has(combo)) return 'That key is used by Windows / the browser (copy, paste, full screen…).';
  if (mods.length === 1 && mods[0] === 'alt' && MENU_LETTERS.includes(key) && key.length === 1) return 'Alt + this letter opens a menu.';
  const isF = /^f([1-9]|1[0-2])$/.test(key);
  if (!isF && !mods.includes('ctrl') && !mods.includes('alt')) return 'Use Ctrl or Alt together with the key (a plain letter would be typed into the field).';
  return '';
}

/** Give a command this key. Whoever had it loses it. → the commands left without a key */
export function setCombo(id, combo) {
  const next = { ...get() };
  const left = [];
  KEY_COMMANDS.forEach((c) => {
    if (c.id !== id && comboOf(c) === combo) {
      next[c.id] = '';
      left.push(c);
    }
  });
  const me = KEY_COMMANDS.find((c) => c.id === id);
  if (combo === me.def) delete next[id];
  else next[id] = combo;
  commit(next);
  return left;
}
/** leave a command without a key */
export function clearCombo(id) {
  commit({ ...get(), [id]: '' });
}
/** back to the standard key (it is taken back from whoever has it now) */
export function resetCombo(id) {
  const me = KEY_COMMANDS.find((c) => c.id === id);
  return setCombo(id, me.def);
}
export function resetAll() {
  commit({});
}
