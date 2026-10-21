import { useEffect, useMemo, useRef, useState } from 'react';
import { GripVertical, ArrowUp, ArrowDown, Trash2, Plus, Heading, RotateCcw, Search, PanelLeft } from 'lucide-react';
import { Modal, useDialog } from '../components/ui';
import { Field } from '../components/inputs';
import { uid } from '../lib/format';
import { SHORTCUT_CATALOG, SHORTCUT_ICONS, DEFAULT_SHORTCUTS, iconOf, sameCmd, describeCmd } from '../lib/shortcuts';

const withKeys = (list) => list.map((x) => ({ ...x, _k: uid() }));
const strip = (list) => list.map(({ _k, ...x }) => x);

/**
 * Customize Shortcuts (QuickBooks "Customize Icon Bar"): add, rename, re-icon, reorder and remove
 * the left icon bar entries, add section headings, or reset to the default layout.
 * value: current list; onSave(list | null) — null = back to the default layout.
 */
export default function CustomizeShortcuts({ value, focusIndex, startAdding, onSave, onClose }) {
  const dlg = useDialog();
  const [items, setItems] = useState(() => withKeys(value));
  const [sel, setSel] = useState(() => (focusIndex !== undefined ? focusIndex : -1));
  const [adding, setAdding] = useState(!!startAdding);
  const [q, setQ] = useState('');
  const [drag, setDrag] = useState(null); // { from, over }
  const listRef = useRef(null);
  const cur = items[sel];

  useEffect(() => {
    listRef.current?.querySelector(`[data-i="${sel}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  const update = (i, patch) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const move = (from, to) => {
    if (to < 0 || to >= items.length || from === to) return;
    setItems((xs) => {
      const next = [...xs];
      const [it] = next.splice(from, 1);
      next.splice(to, 0, it);
      return next;
    });
    setSel(to);
  };
  const remove = (i) => {
    setItems((xs) => xs.filter((_, j) => j !== i));
    setSel((s) => Math.min(s, items.length - 2));
  };
  const insert = (entry) => {
    const at = sel >= 0 ? sel + 1 : items.length;
    setItems((xs) => [...xs.slice(0, at), { ...entry, id: uid(), _k: uid() }, ...xs.slice(at)]);
    setSel(at);
  };
  const addShortcut = (c) => {
    const at = items.findIndex((x) => x.head === undefined && sameCmd(x.cmd, c.cmd));
    if (at >= 0) {
      // already there: show it instead of adding a duplicate
      setSel(at);
      dlg.toast(`"${items[at].label}" is already on the icon bar`);
    } else insert({ label: c.label, icon: c.icon, cmd: c.cmd });
    setAdding(false);
  };
  const addHeading = () => {
    insert({ head: 'New Section' });
    setAdding(false);
  };

  const onListKey = (e) => {
    if (e.target.closest('input, button:not(.sc-row)')) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const d = e.key === 'ArrowDown' ? 1 : -1;
      if (e.altKey && sel >= 0) move(sel, sel + d);
      else setSel((s) => Math.max(0, Math.min(items.length - 1, s + d)));
    } else if (e.key === 'Delete' && sel >= 0) {
      e.preventDefault();
      remove(sel);
    }
  };

  const catalog = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return SHORTCUT_CATALOG.map((g) => ({
      ...g,
      items: g.items.filter((c) => !ql || (c.label + ' ' + (c.sub || '') + ' ' + g.group).toLowerCase().includes(ql)),
    })).filter((g) => g.items.length);
  }, [q]);

  const save = () => {
    const out = strip(items)
      .map((x) => (x.head !== undefined ? { ...x, head: x.head.trim() || 'Section' } : { ...x, label: x.label.trim() || describeCmd(x.cmd) || 'Shortcut' }))
      // a heading with nothing under it is dropped
      .filter((x, i, all) => x.head === undefined || (all[i + 1] && all[i + 1].head === undefined));
    const isDefault = JSON.stringify(out) === JSON.stringify(DEFAULT_SHORTCUTS);
    onSave(isDefault ? null : out);
  };

  const reset = async () => {
    if (await dlg.confirm('Put the icon bar back to the standard shortcuts?\n\nYour own shortcuts and headings are removed.', { ok: 'Reset' })) {
      setItems(withKeys(DEFAULT_SHORTCUTS));
      setSel(-1);
      setAdding(false);
    }
  };

  return (
    <Modal
      title="Customize Shortcuts"
      icon={<PanelLeft size={16} />}
      onClose={onClose}
      width={860}
      className="sc-modal"
      footer={
        <>
          <button className="btn ghost" onClick={reset}>
            <RotateCcw size={14} /> Reset to Default
          </button>
          <span className="sp" />
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={save}>
            OK
          </button>
        </>
      }
    >
      <div className="sc-ed">
        <div className="sc-left">
          <div className="sc-cap">
            <b>Icon bar</b>
            <span className="muted small">Drag or use ↑ ↓ to reorder · Alt+↑/↓ moves · Del removes</span>
          </div>
          <div className="sc-list" ref={listRef} tabIndex={0} onKeyDown={onListKey} role="listbox" aria-label="Shortcuts">
            {items.map((x, i) => {
              const Icon = iconOf(x.icon);
              return (
                <div
                  key={x._k}
                  data-i={i}
                  role="option"
                  aria-selected={sel === i}
                  className={'sc-row' + (x.head !== undefined ? ' head' : '') + (sel === i ? ' sel' : '') + (drag?.over === i && drag.from !== i ? ' over' : '')}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', String(i));
                    setDrag({ from: i, over: i });
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (drag && drag.over !== i) setDrag({ ...drag, over: i });
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (drag) move(drag.from, i);
                    setDrag(null);
                  }}
                  onDragEnd={() => setDrag(null)}
                  onClick={() => {
                    setSel(i);
                    setAdding(false);
                  }}
                >
                  <GripVertical size={14} className="sc-grip" />
                  {x.head !== undefined ? <span className="sc-head">{x.head || 'Section'}</span> : (
                    <>
                      <Icon size={15} />
                      <span className="sc-label">{x.label}</span>
                    </>
                  )}
                  <span className="sc-acts">
                    <button className="icon-btn" title="Move up" disabled={i === 0} onClick={(e) => (e.stopPropagation(), move(i, i - 1))}>
                      <ArrowUp size={13} />
                    </button>
                    <button className="icon-btn" title="Move down" disabled={i === items.length - 1} onClick={(e) => (e.stopPropagation(), move(i, i + 1))}>
                      <ArrowDown size={13} />
                    </button>
                    <button className="icon-btn" title="Remove" onClick={(e) => (e.stopPropagation(), remove(i))}>
                      <Trash2 size={13} />
                    </button>
                  </span>
                </div>
              );
            })}
            {!items.length && <div className="muted small" style={{ padding: 12 }}>No shortcuts. Add some, or Reset to Default.</div>}
          </div>
        </div>

        <div className="sc-right">
          <div className="flex mb">
            <button className={'btn sm' + (adding ? ' primary' : '')} onClick={() => setAdding(true)}>
              <Plus size={13} /> Add Shortcut
            </button>
            <button className="btn sm" onClick={addHeading}>
              <Heading size={13} /> Add Section Heading
            </button>
          </div>

          {adding ? (
            <div className="sc-pick">
              <div className="sc-search">
                <Search size={14} />
                <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search windows, forms and reports…" aria-label="Search shortcuts to add" />
              </div>
              <div className="sc-cat">
                {catalog.map((g) => (
                  <div key={g.group}>
                    <div className="sc-cat-h">{g.group}</div>
                    {g.items.map((c) => {
                      const Icon = iconOf(c.icon);
                      const has = items.some((x) => !x.head && sameCmd(x.cmd, c.cmd));
                      return (
                        <button key={c.label + JSON.stringify(c.cmd)} className="sc-cat-item" onClick={() => addShortcut(c)} title={has ? 'Already on the icon bar' : 'Add'}>
                          <Icon size={14} />
                          <span>{c.label}</span>
                          {c.sub && <small className="muted">{c.sub}</small>}
                          {has && <small className="badge ok">on bar</small>}
                        </button>
                      );
                    })}
                  </div>
                ))}
                {!catalog.length && <div className="muted small">Nothing matches "{q}".</div>}
              </div>
              <div className="small muted mt">Tip: right-click any open window tab and choose Add to Shortcuts to add that exact window.</div>
            </div>
          ) : !cur ? (
            <div className="note">Select a shortcut on the left to rename it or change its icon, or click <b>Add Shortcut</b>.</div>
          ) : cur.head !== undefined ? (
            <Field label="Section heading">
              <input autoFocus value={cur.head} onChange={(e) => update(sel, { head: e.target.value })} maxLength={30} />
            </Field>
          ) : (
            <>
              <Field label="Label">
                <input autoFocus value={cur.label} onChange={(e) => update(sel, { label: e.target.value })} maxLength={40} />
              </Field>
              <div className="small muted mt">Opens: {describeCmd(cur.cmd) || '—'}</div>
              <div className="field-label mt">Icon</div>
              <div className="sc-icons" role="radiogroup" aria-label="Icon">
                {Object.entries(SHORTCUT_ICONS).map(([name, Icon]) => (
                  <button key={name} role="radio" aria-checked={cur.icon === name} className={'sc-icon' + (cur.icon === name ? ' on' : '')} title={name} onClick={() => update(sel, { icon: name })}>
                    <Icon size={16} />
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
