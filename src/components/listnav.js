import { useEffect, useRef } from 'react';

// Keyboard navigation for list windows: ↑/↓/Home/End/PgUp/PgDn and type-ahead.
export function useListNav(rows, selected, setSelected, { getLabel = (r) => r.name, containerRef } = {}) {
  const buf = useRef({ s: '', t: 0 });
  const idx = rows.findIndex((r) => r.id === selected);

  useEffect(() => {
    if (!containerRef?.current || !selected) return;
    const el = containerRef.current.querySelector(`[data-id="${selected}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [selected, containerRef]);

  const move = (d) => {
    if (!rows.length) return;
    const n = Math.max(0, Math.min(rows.length - 1, (idx < 0 ? -1 : idx) + d));
    setSelected(rows[n].id);
  };
  const keys = {
    arrowdown: () => move(1),
    arrowup: () => move(-1),
    pagedown: () => move(15),
    pageup: () => move(-15),
    'ctrl+home': () => rows.length && setSelected(rows[0].id),
    'ctrl+end': () => rows.length && setSelected(rows[rows.length - 1].id),
  };
  const onTypeAhead = (e) => {
    if (e.ctrlKey || e.altKey || e.metaKey || e.key.length !== 1) return;
    if (e.target.closest('input, textarea, select')) return;
    const now = Date.now();
    buf.current.s = now - buf.current.t > 800 ? e.key.toLowerCase() : buf.current.s + e.key.toLowerCase();
    buf.current.t = now;
    const hit = rows.find((r) => String(getLabel(r)).toLowerCase().startsWith(buf.current.s));
    if (hit) setSelected(hit.id);
  };
  return { keys, onTypeAhead };
}
