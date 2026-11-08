// QuickBooks-style keyboard movement on data-entry screens.
//  - Enter works like Tab: it goes to the next field (a Combo with its list open first picks the highlighted entry, then moves on).
//  - Enter on the last field of a dialog presses its OK / Save button; on the last field of a transaction form it
//    lands on Save & Close (press Enter again to save), as in QuickBooks.
//  - Text is selected when you arrive in a field with the keyboard, so typing replaces it (a mouse click keeps the caret).
//  - Enter in a text box (memo) is still a new line; Enter on a button still presses it; Ctrl+Enter is left to the form.
// Only inside dialogs (.modal), transaction forms (.txn-paper) and anything marked data-enter-next.
// Put data-no-enter-nav on a field or its wrapper to keep Enter for the field itself.

const SCOPE = '.modal, .txn-paper, [data-enter-next]';
const TEXTY = new Set(['', 'text', 'search', 'tel', 'url', 'email', 'password', 'number']);
const NOT_ENTRY = new Set(['hidden', 'button', 'submit', 'reset', 'file', 'image', 'color', 'range']);

const seen = (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';

// a place the cursor can go with Tab and the user can type or tick in
function isEntry(el, root) {
  if (el.disabled || el.tabIndex < 0 || !seen(el)) return false;
  if (el.tagName === 'SELECT' || el.tagName === 'TEXTAREA') return !el.readOnly;
  if (el.tagName !== 'INPUT' || NOT_ENTRY.has(el.type)) return false;
  if (el.type === 'checkbox') return true;
  if (el.type === 'radio') return el.checked || !el.name || !root.querySelector(`input[type="radio"][name="${CSS.escape(el.name)}"]:checked`);
  return !el.readOnly;
}

const entries = (root) => [...root.querySelectorAll('input, select, textarea')].filter((el) => isEntry(el, root));

function focusEl(el) {
  el.focus();
  if (el.tagName === 'INPUT' && TEXTY.has(el.type)) {
    try {
      el.select();
    } catch {
      /* some input types can't select */
    }
  }
}

/**
 * Move on from `from` the way Enter does. submit: on the last field of a dialog, press its OK button.
 * Returns true when it handled the move.
 */
export function moveNext(from, { submit = true } = {}) {
  if (!(from instanceof HTMLElement) || !from.closest(SCOPE) || from.closest('[data-no-enter-nav]')) return false;
  const modal = from.closest('.modal');
  const root = modal || from.closest('.win') || document.body;
  // a dialog with one box (a name prompt, a password) takes Enter for itself
  if (modal && entries(modal.querySelector('.modal-body') || modal).length <= 1) return false;
  const list = entries(root);
  const i = list.indexOf(from);
  if (i < 0) return false;
  if (i + 1 < list.length && !(modal && !modal.querySelector('.modal-body')?.contains(list[i + 1]))) {
    focusEl(list[i + 1]);
    return true;
  }
  // last field
  if (modal) {
    if (!submit) return true;
    const ok = modal.querySelector('.modal-foot .btn.primary:not([disabled])');
    if (ok) ok.click();
    return !!ok;
  }
  const save = root.querySelector('.txn-actions .btn.primary:not([disabled])');
  if (save) {
    save.focus();
    return true;
  }
  return false;
}

// The first field of the transaction form in the window on show (after Save & New, like opening a new form)
export function focusFirstEntry() {
  setTimeout(() => {
    const root = document.querySelector('.win-host:not([hidden]) .txn-paper');
    if (!root || document.querySelector('.modal-backdrop')) return;
    const first = entries(root)[0];
    if (first) focusEl(first);
  }, 60);
}

export function installEnterNav() {
  let byKeyboard = false;
  const onKeyCapture = () => {
    byKeyboard = true;
  };
  const onMouseCapture = () => {
    byKeyboard = false;
  };
  const onKey = (e) => {
    if (e.key !== 'Enter' || e.defaultPrevented || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey || e.isComposing) return;
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;
    const typing = (t.tagName === 'INPUT' && TEXTY.has(t.type)) || t.tagName === 'SELECT';
    if (!typing || (t.tagName === 'INPUT' && t.readOnly)) return;
    if (moveNext(t)) e.preventDefault();
  };
  const onFocusIn = (e) => {
    const t = e.target;
    if (!byKeyboard || !(t instanceof HTMLInputElement) || !TEXTY.has(t.type) || t.readOnly || !t.closest(SCOPE)) return;
    try {
      t.select();
    } catch {
      /* ignore */
    }
  };
  window.addEventListener('keydown', onKeyCapture, true);
  window.addEventListener('mousedown', onMouseCapture, true);
  window.addEventListener('keydown', onKey);
  window.addEventListener('focusin', onFocusIn);
  return () => {
    window.removeEventListener('keydown', onKeyCapture, true);
    window.removeEventListener('mousedown', onMouseCapture, true);
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('focusin', onFocusIn);
  };
}
