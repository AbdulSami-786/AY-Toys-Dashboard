import { useEffect, useRef, useState } from 'react';
import {
  Type,
  Image as ImageIc,
  PenLine,
  Minus,
  Square,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Grid3x3,
  Magnet,
  Copy,
  Trash2,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Bold,
  Italic,
  Check,
  Plus,
  EyeOff,
} from 'lucide-react';
import { PageSheet } from '../../components/TemplateDoc';
import { useWidth } from '../../components/useWidth';
import { Field } from '../../components/inputs';
import { FIELDS, BOX_KINDS, PX_PER_MM, contentSize, pageSize, fieldsForForm, fieldLabel, defaultFieldLabel, addBox } from '../../lib/templates';
import { num, uid } from '../../lib/format';

const GRID = 1; // mm
const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const GROUPS = ['Company', 'Header', 'Footer', 'Totals'];
const COMPOSITE = new Set(['companyBlock', 'totals', 'title']);
const r1 = (v) => Math.round(v * 10) / 10;

export default function Designer({ t, ctx, sel, setSel, update, setT, pushHistory, setBox, removeBox, setLabel, undo, redo, canUndo, canRedo }) {
  // 0 = fit the page to the canvas width
  const [zoomPick, setZoom] = useState(() => {
    try {
      const z = Number(localStorage.getItem('ay.tplzoom'));
      return ZOOMS.includes(z) ? z : 0;
    } catch {
      return 0;
    }
  });
  const [snap, setSnap] = useState(true);
  const [grid, setGrid] = useState(true);
  const [addBand, setAddBand] = useState('header');
  const canvasRef = useRef(null);
  const textRef = useRef(null);
  const W = contentSize(t.page).w;
  const cw = useWidth(canvasRef);
  const fit = cw ? Math.max(0.4, Math.min(2, Math.floor(((cw - 12) / (pageSize(t.page).w * PX_PER_MM)) * 20) / 20)) : 1;
  const zoom = zoomPick || fit;
  const selBox = t.boxes.find((b) => b.id === sel);

  useEffect(() => {
    try {
      localStorage.setItem('ay.tplzoom', String(zoomPick));
    } catch {
      /* ignore */
    }
  }, [zoomPick]);

  // focus the canvas and bring the selected box into view when the designer opens
  useEffect(() => {
    canvasRef.current?.focus({ preventScroll: true });
    if (sel) canvasRef.current?.querySelector(`[data-box="${sel}"]`)?.scrollIntoView({ block: 'center', inline: 'nearest' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selBox) setAddBand(selBox.band);
  }, [selBox?.band]); // eslint-disable-line react-hooks/exhaustive-deps

  // keep the selected box on screen (e.g. a box just added at the bottom of the footer)
  useEffect(() => {
    if (sel) canvasRef.current?.querySelector(`[data-box="${sel}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [sel]);

  const sn = (v) => (snap ? Math.round(v / GRID) * GRID : r1(v));
  const bandKey = (band) => (band === 'header' ? 'headerHeight' : 'footerHeight');

  // ----- drag to move / resize -----
  const onBoxDown = (e, box, mode) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    setSel(box.id);
    canvasRef.current?.focus({ preventScroll: true });
    const sx = e.clientX;
    const sy = e.clientY;
    const b0 = { ...box };
    let started = false;
    const move = (ev) => {
      const dx = (ev.clientX - sx) / (PX_PER_MM * zoom);
      const dy = (ev.clientY - sy) / (PX_PER_MM * zoom);
      if (!started) {
        if (Math.abs(dx) + Math.abs(dy) < 0.4) return;
        pushHistory();
        started = true;
      }
      let { x, y, w, h } = b0;
      if (mode === 'move') {
        x = sn(b0.x + dx);
        y = sn(b0.y + dy);
      } else {
        if (mode.includes('e')) w = sn(b0.x + b0.w + dx) - b0.x;
        if (mode.includes('s')) h = sn(b0.y + b0.h + dy) - b0.y;
        if (mode.includes('w')) {
          x = Math.min(sn(b0.x + dx), b0.x + b0.w - 2);
          w = b0.x + b0.w - x;
        }
        if (mode.includes('n')) {
          y = Math.min(sn(b0.y + dy), b0.y + b0.h - 1.5);
          h = b0.y + b0.h - y;
        }
      }
      w = Math.max(2, Math.min(w, W));
      h = Math.max(1.5, h);
      x = Math.max(0, Math.min(x, W - w));
      y = Math.max(0, y);
      const key = bandKey(b0.band);
      setT((p) => ({ ...p, boxes: p.boxes.map((b) => (b.id === b0.id ? { ...b, x: r1(x), y: r1(y), w: r1(w), h: r1(h) } : b)), [key]: Math.max(p[key], r1(y + h)) }));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const onBandDown = (e, band) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const key = bandKey(band);
    const sy = e.clientY;
    const h0 = t[key];
    const minH = Math.max(4, ...t.boxes.filter((b) => b.band === band && !b.hidden).map((b) => b.y + b.h));
    let started = false;
    const move = (ev) => {
      const dy = (ev.clientY - sy) / (PX_PER_MM * zoom);
      if (!started) {
        if (Math.abs(dy) < 0.4) return;
        pushHistory();
        started = true;
      }
      const h = Math.max(minH, Math.min(260, sn(h0 + dy)));
      setT((p) => ({ ...p, [key]: r1(h) }));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  // ----- box commands -----
  const patchSel = (patch) => selBox && setBox(selBox.id, patch);
  const duplicate = () => {
    if (!selBox) return;
    const id = uid().slice(0, 8);
    const copy = { ...selBox, id, x: Math.min(W - selBox.w, selBox.x + 3), y: selBox.y + 3 };
    const key = bandKey(copy.band);
    update((p) => ({ ...p, boxes: [...p.boxes, copy], [key]: Math.max(p[key], copy.y + copy.h) }));
    setSel(id);
  };
  const del = () => {
    if (!selBox) return;
    removeBox(selBox.id);
    setSel(null);
  };
  const order = (front) =>
    selBox &&
    update((p) => {
      const rest = p.boxes.filter((b) => b.id !== selBox.id);
      const me = p.boxes.find((b) => b.id === selBox.id);
      return { ...p, boxes: front ? [...rest, me] : [me, ...rest] };
    });
  const add = (preset, extra) => {
    const { _added, ...next } = addBox(t, addBand, preset, extra);
    update(next);
    setSel(_added);
  };
  const addField = (f) => {
    const existing = t.boxes.find((b) => b.kind === 'field' && b.field === f);
    if (existing) {
      if (existing.hidden) setBox(existing.id, { hidden: false });
      setSel(existing.id);
      setTimeout(() => canvasRef.current?.querySelector(`[data-box="${existing.id}"]`)?.scrollIntoView({ block: 'nearest' }), 0);
      return;
    }
    const band = ['Footer', 'Totals'].includes(FIELDS[f].group) ? 'footer' : 'header';
    const { _added, ...next } = addBox(t, band, f);
    update(next);
    setSel(_added);
  };

  const onKey = (e) => {
    if (e.target !== canvasRef.current) return;
    if (e.key === 'Escape') {
      if (!sel) return;
      setSel(null);
    } else if (!selBox) {
      return;
    } else if (e.key.startsWith('Arrow')) {
      const step = e.shiftKey ? 5 : snap ? GRID : 0.5;
      const b = selBox;
      const key = bandKey(b.band);
      let { x, y } = b;
      if (e.key === 'ArrowLeft') x = Math.max(0, x - step);
      if (e.key === 'ArrowRight') x = Math.min(W - b.w, x + step);
      if (e.key === 'ArrowUp') y = Math.max(0, y - step);
      if (e.key === 'ArrowDown') y = y + step;
      update((p) => ({ ...p, boxes: p.boxes.map((o) => (o.id === b.id ? { ...o, x: r1(x), y: r1(y) } : o)), [key]: Math.max(p[key], r1(y + b.h)) }));
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      del();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
      duplicate();
    } else if (e.key === 'Enter' && (selBox.kind === 'text' || selBox.kind === 'sign')) {
      textRef.current?.focus();
    } else return;
    e.preventDefault();
    e.stopPropagation();
  };

  const fieldsByGroup = GROUPS.map((g) => [g, fieldsForForm(t.formType, g)]).filter(([, fs]) => fs.length);
  const zoomStep = (d) => {
    const i = d > 0 ? ZOOMS.findIndex((z) => z > zoom + 0.001) : ZOOMS.findLastIndex((z) => z < zoom - 0.001);
    if (i >= 0) setZoom(ZOOMS[i]);
  };

  return (
    <div className="dz">
      {/* ---------- palette ---------- */}
      <aside className="dz-side">
        <div className="dz-h">Add to</div>
        <div className="seg">
          {['header', 'footer'].map((b) => (
            <button key={b} className={addBand === b ? 'on' : ''} onClick={() => setAddBand(b)}>
              {b === 'header' ? 'Header' : 'Footer'}
            </button>
          ))}
        </div>
        <div className="dz-tools">
          <button className="btn sm" onClick={() => add('text')}>
            <Type size={13} /> Text box
          </button>
          <button className="btn sm" onClick={() => add('logo')}>
            <ImageIc size={13} /> Logo
          </button>
          <button className="btn sm" onClick={() => add('sign')}>
            <PenLine size={13} /> Signature
          </button>
          <button className="btn sm" onClick={() => add('line', { w: W })}>
            <Minus size={13} /> Line
          </button>
          <button className="btn sm" onClick={() => add('rect')}>
            <Square size={13} /> Frame
          </button>
        </div>
        <div className="dz-h">Data fields</div>
        <div className="dz-fields">
          {fieldsByGroup.map(([g, fs]) => (
            <div key={g}>
              <div className="dz-g">{g}</div>
              {fs.map((f) => {
                const bs = t.boxes.filter((b) => b.kind === 'field' && b.field === f);
                const on = bs.some((b) => !b.hidden);
                const isSel = bs.some((b) => b.id === sel);
                return (
                  <button
                    key={f}
                    className={'dz-field' + (on ? ' on' : '') + (isSel ? ' sel' : '')}
                    onClick={() => addField(f)}
                    title={on ? 'On the layout — click to select' : bs.length ? 'Hidden — click to show' : 'Click to add to the layout'}
                  >
                    <span>{fieldLabel(t, f)}</span>
                    {on ? <Check size={12} /> : bs.length ? <EyeOff size={12} /> : <Plus size={12} />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </aside>

      {/* ---------- canvas ---------- */}
      <div className="dz-main">
        <div className="toolbar flat dz-bar">
          <button className="icon-btn" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">
            <Undo2 size={15} />
          </button>
          <button className="icon-btn" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Y)">
            <Redo2 size={15} />
          </button>
          <span className="tb-sep" />
          <button className="icon-btn" onClick={() => zoomStep(-1)} title="Zoom out">
            <ZoomOut size={15} />
          </button>
          <select value={zoomPick} onChange={(e) => setZoom(Number(e.target.value))} style={{ width: 80, height: 26 }} title={`Zoom ${Math.round(zoom * 100)}%`}>
            <option value={0}>Fit</option>
            {ZOOMS.map((z) => (
              <option key={z} value={z}>
                {Math.round(z * 100)}%
              </option>
            ))}
          </select>
          <button className="icon-btn" onClick={() => zoomStep(1)} title="Zoom in">
            <ZoomIn size={15} />
          </button>
          <span className="tb-sep" />
          <button className={'icon-btn' + (grid ? ' on' : '')} onClick={() => setGrid((g) => !g)} title="Show grid">
            <Grid3x3 size={15} />
          </button>
          <button className={'icon-btn' + (snap ? ' on' : '')} onClick={() => setSnap((s) => !s)} title={`Snap to ${GRID} mm grid`}>
            <Magnet size={15} />
          </button>
          <span className="sp muted small">Drag boxes to move · drag handles to resize · arrows nudge (Shift = 5 mm) · Del removes · Ctrl+D duplicates</span>
        </div>
        <div
          className="dz-canvas"
          ref={canvasRef}
          tabIndex={0}
          onKeyDown={onKey}
          onPointerDown={(e) => {
            if (!e.target.closest('[data-box]') && !e.target.closest('.band-resize')) setSel(null);
          }}
          onDoubleClick={(e) => e.target.closest('[data-box]') && textRef.current?.focus()}
        >
          <PageSheet template={t} ctx={ctx} scale={zoom} design={{ selectedId: sel, onBoxDown, onBandDown, grid }} />
        </div>
      </div>

      {/* ---------- properties ---------- */}
      <aside className="dz-side dz-props">
        {selBox ? (
          <BoxProps
            b={selBox}
            t={t}
            W={W}
            patch={patchSel}
            setLabel={setLabel}
            textRef={textRef}
            onDuplicate={duplicate}
            onDelete={del}
            onOrder={order}
            setBandHeight={(band, h) => update((p) => ({ ...p, [bandKey(band)]: Math.max(p[bandKey(band)], h) }))}
          />
        ) : (
          <>
            <div className="dz-h">Layout</div>
            <Field label="Header height (mm)">
              <NumIn value={t.headerHeight} min={4} onChange={(v) => update((p) => ({ ...p, headerHeight: v }))} />
            </Field>
            <Field label="Footer height (mm)">
              <NumIn value={t.footerHeight} min={4} onChange={(v) => update((p) => ({ ...p, footerHeight: v }))} />
            </Field>
            <p className="muted small">
              The <b>header</b> prints above the item lines, the <b>footer</b> below them. The item table grows with the number of lines and continues on the next page when needed.
            </p>
            <p className="muted small">Click a box on the page to change its text, font, colour, border and exact position.</p>
            <p className="muted small">Printable area: {W} mm wide.</p>
          </>
        )}
      </aside>
    </div>
  );
}

function NumIn({ value, onChange, min = 0, max = 400, step = 0.5 }) {
  const [text, setText] = useState(String(value));
  const [focus, setFocus] = useState(false);
  useEffect(() => {
    if (!focus) setText(String(value));
  }, [value, focus]);
  const commit = (s) => {
    const v = Math.max(min, Math.min(max, num(s)));
    if (s !== '' && v !== value) onChange(r1(v));
  };
  return (
    <input
      type="number"
      className="num"
      step={step}
      min={min}
      max={max}
      value={focus ? text : value}
      onFocus={() => {
        setFocus(true);
        setText(String(value));
      }}
      onBlur={() => {
        setFocus(false);
        commit(text);
      }}
      onChange={(e) => {
        setText(e.target.value);
        commit(e.target.value);
      }}
    />
  );
}

function ColorPick({ value, onChange, none }) {
  const mode = !value ? 'none' : value === 'accent' ? 'accent' : 'custom';
  return (
    <div className="flex" style={{ gap: 6 }}>
      <select value={mode} style={{ flex: 1 }} onChange={(e) => onChange(e.target.value === 'none' ? '' : e.target.value === 'accent' ? 'accent' : '#333333')}>
        <option value="none">{none}</option>
        <option value="accent">Template color</option>
        <option value="custom">Custom…</option>
      </select>
      {mode === 'custom' && <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />}
    </div>
  );
}

function BoxProps({ b, t, W, patch, setLabel, textRef, onDuplicate, onDelete, onOrder, setBandHeight }) {
  const isField = b.kind === 'field';
  const hasLabel = isField && !COMPOSITE.has(b.field);
  const hasText = b.kind === 'text' || b.kind === 'sign';
  const showFont = b.kind !== 'line' && b.kind !== 'rect' && b.kind !== 'logo';
  return (
    <>
      <div className="dz-h">{isField ? 'Data field' : BOX_KINDS[b.kind]}</div>
      {isField && (
        <Field label="Shows">
          <select value={b.field} onChange={(e) => patch({ field: e.target.value })}>
            {GROUPS.map((g) => {
              const fs = fieldsForForm(t.formType, g);
              return fs.length ? (
                <optgroup key={g} label={g}>
                  {fs.map((f) => (
                    <option key={f} value={f}>
                      {defaultFieldLabel(f, t.formType)}
                    </option>
                  ))}
                </optgroup>
              ) : null;
            })}
          </select>
        </Field>
      )}
      {hasLabel && (
        <>
          <Field label="Title">
            <input value={t.labels[b.field] ?? ''} placeholder={defaultFieldLabel(b.field, t.formType)} onChange={(e) => setLabel(b.field, e.target.value)} />
          </Field>
          <Field label="Title position">
            <div className="seg">
              {[
                ['top', 'Above'],
                ['left', 'Left'],
                ['none', 'Hidden'],
              ].map(([v, l]) => (
                <button key={v} className={b.labelPos === v ? 'on' : ''} onClick={() => patch({ labelPos: v })}>
                  {l}
                </button>
              ))}
            </div>
          </Field>
        </>
      )}
      {b.kind === 'field' && b.field === 'title' && <p className="muted small">The title text is set in Basic Customization.</p>}
      {hasText && (
        <Field label={b.kind === 'sign' ? 'Caption' : 'Text'}>
          {b.kind === 'text' ? (
            <textarea ref={textRef} rows={4} value={b.text} onChange={(e) => patch({ text: e.target.value })} />
          ) : (
            <input ref={textRef} value={b.text} onChange={(e) => patch({ text: e.target.value })} />
          )}
        </Field>
      )}

      {showFont && (
        <>
          <div className="dz-h">Font</div>
          <div className="flex" style={{ gap: 6 }}>
            <Field label="Size (pt)" style={{ width: 86 }}>
              <input
                type="number"
                className="num"
                min={5}
                max={48}
                step={0.5}
                value={b.size || ''}
                placeholder={String(t.style.fontSize)}
                onChange={(e) => patch({ size: e.target.value === '' ? 0 : Math.max(5, Math.min(48, num(e.target.value))) })}
              />
            </Field>
            <div className="seg icons" style={{ alignSelf: 'flex-end' }}>
              <button className={b.bold ? 'on' : ''} onClick={() => patch({ bold: !b.bold })} title="Bold">
                <Bold size={13} />
              </button>
              <button className={b.italic ? 'on' : ''} onClick={() => patch({ italic: !b.italic })} title="Italic">
                <Italic size={13} />
              </button>
            </div>
          </div>
          <div className="seg icons mt">
            {[
              ['left', AlignLeft],
              ['center', AlignCenter],
              ['right', AlignRight],
            ].map(([a, Ic]) => (
              <button key={a} className={b.align === a ? 'on' : ''} onClick={() => patch({ align: a })} title={'Align ' + a}>
                <Ic size={13} />
              </button>
            ))}
          </div>
        </>
      )}
      {b.kind === 'line' && (
        <label className="check mt">
          <input type="checkbox" checked={!!b.bold} onChange={(e) => patch({ bold: e.target.checked })} /> Thick line
        </label>
      )}

      <div className="dz-h">Look</div>
      {b.kind !== 'rect' && b.kind !== 'logo' && (
        <Field label={b.kind === 'line' || b.kind === 'sign' ? 'Line color' : 'Text color'}>
          <ColorPick value={b.color} onChange={(v) => patch({ color: v })} none="Black" />
        </Field>
      )}
      {b.kind !== 'line' && (
        <>
          <Field label="Background">
            <ColorPick value={b.bg} onChange={(v) => patch({ bg: v })} none="None" />
          </Field>
          <Field label="Border">
            <select value={b.border} onChange={(e) => patch({ border: e.target.value })}>
              <option value="none">None</option>
              <option value="box">Box</option>
              <option value="bottom">Bottom line</option>
              <option value="top">Top line</option>
            </select>
          </Field>
        </>
      )}
      {(isField || b.kind === 'text') && (
        <label className="check mt">
          <input type="checkbox" checked={!!b.hideEmpty} onChange={(e) => patch({ hideEmpty: e.target.checked })} /> Don&apos;t print when empty
        </label>
      )}

      <div className="dz-h">Position (mm)</div>
      <div className="grid2 dz-pos">
        <Field label="Left">
          <NumIn value={b.x} max={W} onChange={(v) => patch({ x: Math.min(v, W - b.w) })} />
        </Field>
        <Field label="Top">
          <NumIn
            value={b.y}
            onChange={(v) => {
              patch({ y: v });
              setBandHeight(b.band, v + b.h);
            }}
          />
        </Field>
        <Field label="Width">
          <NumIn value={b.w} min={2} max={W} onChange={(v) => patch({ w: Math.min(v, W - b.x) })} />
        </Field>
        <Field label="Height">
          <NumIn
            value={b.h}
            min={1.5}
            onChange={(v) => {
              patch({ h: v });
              setBandHeight(b.band, b.y + v);
            }}
          />
        </Field>
      </div>
      <Field label="Section" style={{ marginTop: 8 }}>
        <select
          value={b.band}
          onChange={(e) => {
            patch({ band: e.target.value, y: 0 });
            setBandHeight(e.target.value, b.h);
          }}
        >
          <option value="header">Header (above the lines)</option>
          <option value="footer">Footer (below the lines)</option>
        </select>
      </Field>
      <div className="flex mt" style={{ flexWrap: 'wrap', gap: 6 }}>
        <button className="btn sm" onClick={() => patch({ x: Math.round(((W - b.w) / 2) * 10) / 10 })}>
          Center on page
        </button>
        <button className="btn sm" onClick={() => patch({ x: 0, w: W })}>
          Full width
        </button>
        <button className="btn sm" onClick={() => onOrder(true)}>
          Bring to front
        </button>
        <button className="btn sm" onClick={() => onOrder(false)}>
          Send to back
        </button>
      </div>
      <div className="flex mt" style={{ gap: 6 }}>
        <button className="btn sm" onClick={onDuplicate}>
          <Copy size={13} /> Duplicate
        </button>
        <button className="btn sm danger" onClick={onDelete}>
          <Trash2 size={13} /> Remove
        </button>
      </div>
    </>
  );
}
