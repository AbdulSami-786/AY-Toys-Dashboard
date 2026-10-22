// Arrow-key movement between the cells of a line-item grid (put data-gridnav on the wrapper and call this from its onKeyDown).
// ↑/↓ go to the same column in the line above/below; ←/→ go to the neighbouring cell once the caret is at the edge of the text.
// An open Combo list keeps its own ↑/↓ (it has already handled the key), and Combo leaves ↓ for the grid when it is closed.
const CELL = 'input:not([disabled]):not([type="checkbox"])';

const cellInput = (td) => td?.querySelector(CELL);

export function gridArrowNav(e) {
  const { key, target } = e;
  if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
  if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key)) return;
  if (target.tagName !== 'INPUT') return;
  const td = target.closest('td');
  const tr = td?.parentElement;
  if (!tr) return;

  let next = null;
  if (key === 'ArrowUp' || key === 'ArrowDown') {
    const step = key === 'ArrowDown' ? 'nextElementSibling' : 'previousElementSibling';
    for (let r = tr[step]; r && !next; r = r[step]) next = cellInput(r.cells[td.cellIndex]);
  } else {
    const { selectionStart: a, selectionEnd: b, value } = target;
    const atEdge = key === 'ArrowLeft' ? a === 0 && (b === 0 || b === value.length) : b === value.length && (a === value.length || a === 0);
    if (!atEdge || (target.dataset.combo && document.querySelector('.combo-list'))) return;
    const step = key === 'ArrowRight' ? 'nextElementSibling' : 'previousElementSibling';
    for (let c = td[step]; c && !next; c = c[step]) next = cellInput(c);
  }
  if (!next) return;
  e.preventDefault();
  next.focus();
  next.select?.();
}
