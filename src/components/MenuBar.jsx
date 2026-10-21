import { useEffect, useRef, useState } from 'react';
import { ChevronRight, Check } from 'lucide-react';
import { MENUS } from '../lib/commands';
import { useWindows } from '../store/windows';

function Label({ text, letter }) {
  if (!letter) return text;
  const i = text.toLowerCase().indexOf(letter);
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <u>{text[i]}</u>
      {text.slice(i + 1)}
    </>
  );
}

// the menu items this user may use (allow(cmd)); empty submenus and doubled separators are dropped
function expandItems(items, windows, activeId, allow = () => true) {
  const out = [];
  for (const it of items) {
    if (it === '-') {
      if (out.length && out[out.length - 1] !== '-') out.push('-');
    } else if (it.windows) {
      out.push(...windows.map((w, i) => ({ label: `${i + 1}  ${w.title}`, cmd: { action: 'focus', id: w.id }, checked: w.id === activeId })));
    } else if (it.items) {
      const sub = expandItems(it.items, windows, activeId, allow);
      if (sub.some((x) => x !== '-')) out.push({ ...it, items: sub });
    } else if (!it.cmd || allow(it.cmd)) out.push(it);
  }
  while (out.length && out[out.length - 1] === '-') out.pop();
  return out;
}

function Drop({ items, run, close, hi, setHi, depth = 0 }) {
  const [sub, setSub] = useState(null);
  return (
    <div className="menu-drop" onMouseDown={(e) => e.preventDefault()}>
      {items.map((it, i) =>
        it === '-' ? (
          <div key={i} className="menu-sep" />
        ) : (
          <div
            key={i}
            className={'menu-item' + ((depth === 0 ? hi === i : sub === i) ? ' hi' : '')}
            onMouseEnter={() => {
              if (depth === 0) setHi(i);
              setSub(it.items ? i : null);
            }}
            onClick={(e) => {
              e.stopPropagation();
              if (it.items) {
                setSub(i);
                return;
              }
              close();
              run(it.cmd);
            }}
          >
            {it.checked && <Check size={12} className="menu-check" />}
            <span>{it.label}</span>
            {it.key && <span className="menu-key">{it.key}</span>}
            {it.items && <ChevronRight size={13} style={{ marginLeft: 'auto' }} />}
            {it.items && (depth === 0 ? hi === i && sub === i : sub === i) && (
              <Drop items={it.items} run={run} close={close} hi={-1} setHi={() => {}} depth={depth + 1} />
            )}
          </div>
        ),
      )}
    </div>
  );
}

export default function MenuBar({ openIdx, setOpenIdx, run, allowCmd }) {
  const { windows, activeId } = useWindows();
  const [hi, setHi] = useState(-1);
  const ref = useRef(null);
  const open = openIdx !== null && openIdx !== undefined;

  useEffect(() => {
    setHi(-1);
  }, [openIdx]);

  useEffect(() => {
    if (!open) return;
    const items = expandItems(MENUS[openIdx].items, windows, activeId, allowCmd);
    const selectable = items.map((it, i) => (it === '-' ? -1 : i)).filter((i) => i >= 0);
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setOpenIdx(null);
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        e.stopPropagation();
        const dir = e.key === 'ArrowRight' ? 1 : -1;
        // skip menus with nothing this user may use
        let next = openIdx;
        for (let n = 0; n < MENUS.length; n++) {
          next = (next + dir + MENUS.length) % MENUS.length;
          if (expandItems(MENUS[next].items, windows, activeId, allowCmd).length) break;
        }
        setOpenIdx(next);
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        const pos = selectable.indexOf(hi);
        const next = e.key === 'ArrowDown' ? selectable[(pos + 1) % selectable.length] : selectable[(pos - 1 + selectable.length) % selectable.length];
        setHi(next);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        const it = items[hi];
        if (it && !it.items) {
          setOpenIdx(null);
          run(it.cmd);
        }
      } else if (e.key.length === 1 && !e.ctrlKey && !e.altKey) {
        // jump to first item starting with letter
        const k = e.key.toLowerCase();
        const idx = items.findIndex((it, i) => it !== '-' && i > hi && it.label.toLowerCase().startsWith(k));
        const first = idx >= 0 ? idx : items.findIndex((it) => it !== '-' && it.label.toLowerCase().startsWith(k));
        if (first >= 0) {
          e.preventDefault();
          e.stopPropagation();
          setHi(first);
        }
      }
    };
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpenIdx(null);
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('mousedown', onDown);
    };
  }, [open, openIdx, hi, windows, activeId, run, setOpenIdx, allowCmd]);

  return (
    <nav className="menubar" ref={ref} role="menubar">
      {MENUS.map((m, i) => {
        const items = expandItems(m.items, windows, activeId, allowCmd);
        if (!items.length) return null; // nothing in it for this user
        return (
        <div key={m.name} className={'menu-top' + (openIdx === i ? ' open' : '')}>
          <button
            role="menuitem"
            onMouseDown={(e) => {
              e.preventDefault();
              setOpenIdx(openIdx === i ? null : i);
            }}
            onMouseEnter={() => open && setOpenIdx(i)}
          >
            <Label text={m.name} letter={m.key} />
          </button>
          {openIdx === i && <Drop items={items} run={run} close={() => setOpenIdx(null)} hi={hi} setHi={setHi} />}
        </div>
        );
      })}
    </nav>
  );
}
