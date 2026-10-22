import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { rankOptions } from '../lib/search';

/**
 * QuickBooks-style type-ahead list field.
 * options: [{ id, label, sub?, right?, indent?, disabled? }]
 * Keys: type to filter, ↑/↓ to move, Enter/Tab to pick, Alt+↓ / F4 / Ctrl+L to open, Esc to close.
 * onNotFound(text): called when a typed name matches nothing (Enter, Tab or leaving the field) — QuickBooks "Quick Add".
 */
export default function Combo({
  value,
  options,
  onChange,
  placeholder = '',
  onAddNew,
  onNotFound,
  addNewLabel = '< Add New >',
  className = '',
  autoFocus,
  disabled,
  allowFree, // allow free text (returns the text as value)
  inputRef: extRef,
  dropWidth,
  title,
}) {
  const selected = options.find((o) => o.id === value);
  const [text, setText] = useState(selected ? selected.label : allowFree ? value || '' : '');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const [filtering, setFiltering] = useState(false);
  const [pos, setPos] = useState(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const handledRef = useRef(false); // Enter / Tab already dealt with the typed text, so leaving the field must not again

  useEffect(() => {
    if (!open) setText(selected ? selected.label : allowFree ? value || '' : '');
  }, [value, selected?.label, open, allowFree]);

  const filtered = useMemo(() => {
    const q = filtering ? text.trim().toLowerCase() : '';
    let list = options.filter((o) => !o.hidden);
    if (q) list = rankOptions(list, q);
    const out = onAddNew ? [{ id: '__add__', label: addNewLabel, add: true }, ...list] : list;
    return out.slice(0, 300);
  }, [options, text, filtering, onAddNew, addNewLabel]);

  const place = () => {
    const el = inputRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const h = Math.min(320, filtered.length * 28 + 6);
    const below = window.innerHeight - r.bottom > h + 8 || r.top < h;
    setPos({ left: r.left, top: below ? r.bottom + 2 : r.top - h - 2, width: Math.max(r.width, dropWidth || 0) });
  };

  useLayoutEffect(() => {
    if (open) place();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, filtered.length]);

  useEffect(() => {
    if (!open) return;
    const onScroll = (e) => {
      if (listRef.current && listRef.current.contains(e.target)) return;
      place();
    };
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', place);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector(`[data-i="${hi}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [hi, open]);

  const pick = (o) => {
    if (!o) return;
    if (o.add) {
      handledRef.current = true;
      setOpen(false);
      setFiltering(false);
      onAddNew?.(text && filtering ? text : '');
      return;
    }
    if (o.disabled) return;
    onChange?.(o.id, o);
    setText(o.label);
    setOpen(false);
    setFiltering(false);
  };

  // typed text that matches no option → hand it to onNotFound and put the field back as it was
  const notFound = (fromBlur) => {
    const name = text.trim();
    handledRef.current = !fromBlur;
    setOpen(false);
    setFiltering(false);
    setText(selected ? selected.label : '');
    onNotFound(name);
  };
  const unmatched = (o) => !o && filtering && !!onNotFound && !!text.trim();

  const openList = () => {
    if (disabled) return;
    const idx = filtered.findIndex((o) => o.id === value);
    setHi(idx >= 0 ? idx : onAddNew && filtered.length > 1 ? 1 : 0);
    setOpen(true);
  };

  const onKeyDown = (e) => {
    if ((e.altKey && e.key === 'ArrowDown') || e.key === 'F4' || (e.ctrlKey && (e.key === 'l' || e.key === 'L'))) {
      e.preventDefault();
      e.stopPropagation();
      setFiltering(false);
      openList();
      return;
    }
    if (!open) {
      // inside a line-item grid (data-gridnav) a closed ↓ moves to the next line instead; Alt+↓ / F4 still open the list
      if (e.key === 'ArrowDown' && !e.target.closest('[data-gridnav]')) {
        e.preventDefault();
        openList();
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHi((h) => Math.min(filtered.length - 1, h + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHi((h) => Math.max(0, h - 1));
    } else if (e.key === 'PageDown') {
      e.preventDefault();
      setHi((h) => Math.min(filtered.length - 1, h + 10));
    } else if (e.key === 'PageUp') {
      e.preventDefault();
      setHi((h) => Math.max(0, h - 10));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      if (unmatched(filtered[hi])) notFound();
      else pick(filtered[hi]);
    } else if (e.key === 'Tab') {
      if (unmatched(filtered[hi])) {
        e.preventDefault(); // the dialog takes focus — moving on as well would pull focus out of it
        notFound();
      } else if (filtering && text) pick(filtered[hi]);
      else setOpen(false);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      setFiltering(false);
      setText(selected ? selected.label : '');
    }
  };

  const onBlur = () => {
    setTimeout(() => {
      if (document.activeElement === inputRef.current) return;
      if (handledRef.current) {
        handledRef.current = false;
        return;
      }
      setOpen(false);
      if (allowFree) {
        if (text !== (selected?.label || value || '')) {
          const exact = options.find((o) => o.label.toLowerCase() === text.toLowerCase());
          onChange?.(exact ? exact.id : text, exact);
        }
      } else if (filtering) {
        const exact = options.find((o) => o.label.toLowerCase() === text.trim().toLowerCase());
        if (exact) onChange?.(exact.id, exact);
        else if (!text.trim()) onChange?.('', null);
        else if (onNotFound) notFound(true);
        else setText(selected ? selected.label : '');
      }
      setFiltering(false);
    }, 120);
  };

  const setRefs = (el) => {
    inputRef.current = el;
    if (typeof extRef === 'function') extRef(el);
    else if (extRef) extRef.current = el;
  };

  return (
    <div className={'combo ' + className} title={title}>
      <input
        ref={setRefs}
        value={text}
        placeholder={placeholder}
        autoFocus={autoFocus}
        disabled={disabled}
        data-combo="1"
        onChange={(e) => {
          setText(e.target.value);
          setFiltering(true);
          setHi(onAddNew ? 1 : 0);
          if (!open) setOpen(true);
        }}
        onKeyDown={onKeyDown}
        onFocus={(e) => {
          handledRef.current = false;
          e.target.select();
        }}
        onBlur={onBlur}
        onDoubleClick={openList}
      />
      <button
        type="button"
        tabIndex={-1}
        className="combo-btn"
        disabled={disabled}
        onMouseDown={(e) => {
          e.preventDefault();
          if (open) setOpen(false);
          else {
            setFiltering(false);
            inputRef.current?.focus();
            openList();
          }
        }}
      >
        <ChevronDown size={14} />
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={listRef}
            className="combo-list"
            style={{ left: pos.left, top: pos.top, minWidth: pos.width }}
            onMouseDown={(e) => e.preventDefault()}
          >
            {filtered.length === 0 && <div className="combo-empty">No matches</div>}
            {filtered.map((o, i) => (
              <div
                key={o.id + '-' + i}
                data-i={i}
                className={
                  'combo-opt' + (i === hi ? ' hi' : '') + (o.add ? ' add' : '') + (o.id === value ? ' sel' : '') + (o.disabled ? ' dis' : '')
                }
                style={o.indent ? { paddingLeft: 10 + o.indent * 14 } : undefined}
                onMouseEnter={() => setHi(i)}
                onClick={() => pick(o)}
              >
                <span className="combo-label">{o.label}</span>
                {o.sub && <span className="combo-sub">{o.sub}</span>}
                {o.right !== undefined && <span className="combo-right">{o.right}</span>}
              </div>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
