import { useEffect, useRef, useState } from 'react';
import { Calendar } from 'lucide-react';
import { dateShortcut, fmtDate, parseTyped } from '../lib/dates';
import { evalAmount, money, qty as fmtQty } from '../lib/format';
import { useStore } from '../store/store';

/** Date field with QuickBooks keys: + - T W K M H Y R [ ] ; ' and Alt+↓ for calendar */
export function DateInput({ value, onChange, className = '', autoFocus, disabled }) {
  const { company } = useStore();
  const style = company?.dateStyle || 'DMY';
  const [text, setText] = useState(fmtDate(value, style));
  const [focused, setFocused] = useState(false);
  const pickerRef = useRef(null);

  useEffect(() => {
    if (!focused) setText(fmtDate(value, style));
  }, [value, style, focused]);

  const commit = () => {
    const iso = parseTyped(text, style);
    if (iso === null) setText(fmtDate(value, style));
    else if (iso !== value) onChange(iso);
  };

  const openPicker = () => {
    try {
      pickerRef.current?.showPicker();
    } catch {
      pickerRef.current?.focus();
    }
  };

  return (
    <div className={'date-input ' + className}>
      <input
        value={text}
        autoFocus={autoFocus}
        disabled={disabled}
        onFocus={(e) => {
          setFocused(true);
          e.target.select();
        }}
        onBlur={() => {
          setFocused(false);
          commit();
        }}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.altKey && e.key === 'ArrowDown') {
            e.preventDefault();
            openPicker();
            return;
          }
          if (e.ctrlKey || e.altKey || e.metaKey) return;
          const base = parseTyped(text, style) || value;
          const next = dateShortcut(e.key, base);
          if (next) {
            e.preventDefault();
            onChange(next);
            setText(fmtDate(next, style));
            requestAnimationFrame(() => e.target.select());
          } else if (e.key === 'Enter') {
            commit();
          }
        }}
      />
      <button type="button" tabIndex={-1} className="date-btn" onClick={openPicker} disabled={disabled}>
        <Calendar size={13} />
      </button>
      <input
        ref={pickerRef}
        type="date"
        tabIndex={-1}
        className="date-native"
        value={value || ''}
        onChange={(e) => e.target.value && onChange(e.target.value)}
      />
    </div>
  );
}

// an entry the calculator can't work out (e.g. "(5"): keep the old value and flash the field
const flashBad = (el) => {
  if (!el) return;
  el.classList.add('bad-entry');
  el.title = 'Not a number — the previous value was kept';
  setTimeout(() => el.classList.remove('bad-entry'), 1200);
};

/** Amount field: shows 1,234.00, accepts arithmetic like 12*450+100 */
export function MoneyInput({ value, onChange, className = '', placeholder, autoFocus, disabled, onEnter, plain }) {
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const show = value === '' || value === undefined || value === null ? '' : plain ? String(value) : money(value);
  return (
    <input
      className={'num ' + className}
      value={focused ? text : show}
      placeholder={placeholder}
      autoFocus={autoFocus}
      disabled={disabled}
      inputMode="decimal"
      onFocus={(e) => {
        setFocused(true);
        setText(value === '' || value === undefined || value === null ? '' : String(value));
        requestAnimationFrame(() => e.target.select());
      }}
      onBlur={(e) => {
        setFocused(false);
        const v = evalAmount(text);
        if (v === null) return flashBad(e.target);
        if (v !== value) onChange(v);
      }}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          const v = evalAmount(text);
          if (v === null) return flashBad(e.target);
          onChange(v);
          setText(String(v));
          onEnter?.();
        }
      }}
    />
  );
}

export function QtyInput(props) {
  const { value } = props;
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  return (
    <input
      className={'num ' + (props.className || '')}
      value={focused ? text : value === '' || value === undefined ? '' : fmtQty(value)}
      disabled={props.disabled}
      inputMode="decimal"
      onFocus={(e) => {
        setFocused(true);
        setText(value === '' || value === undefined ? '' : String(value));
        requestAnimationFrame(() => e.target.select());
      }}
      onBlur={(e) => {
        setFocused(false);
        const v = evalAmount(text);
        if (v === null) return flashBad(e.target);
        if (v !== value) props.onChange(v);
      }}
      onChange={(e) => setText(e.target.value)}
    />
  );
}

export function Field({ label, children, className = '', style }) {
  return (
    <label className={'field ' + className} style={style}>
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}

export function Select({ value, onChange, options, className = '', disabled }) {
  return (
    <select className={className} value={value ?? ''} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) =>
        typeof o === 'string' ? (
          <option key={o} value={o}>
            {o}
          </option>
        ) : (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ),
      )}
    </select>
  );
}
