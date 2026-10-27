import { useLayoutEffect, useState } from 'react';
import { FONTS, contentSize, pageSize, isRoll, fieldLabel, columnLabel, columnAlign, PX_PER_MM } from '../lib/templates';
import { num, qty as fmtQty } from '../lib/format';

export const accentOf = (tpl, company) => tpl.style.accent || company?.theme?.primary || '#2ca01c';

const HANDLES = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
const CELL_CLASS = { rate: 'n', amount: 'n', qty: 'q' };
const QTY_KEYS = ['pkg', 'ctn', 'pcs', 'qty'];

/**
 * Renders one printable document from a template.
 * design = { selectedId, onBoxDown(e, box, mode), onBandDown(e, band), grid } turns it into the Layout Designer canvas.
 */
export default function TemplateDoc({ template: tpl, ctx, design }) {
  const st = tpl.style;
  const { w: W, h: H } = contentSize(tpl.page);
  const accent = accentOf(tpl, ctx.company);
  // receipt rolls: everything flows, nothing is clipped
  const flow = !design && W < 100;
  // 58 mm paper has room for item, quantity and amount only (the rate is on the line total anyway)
  const tiny = flow && W < 70;
  // thermal paper prints thin and light, so receipt text is set larger and bold (see .tdoc.roll)
  const boost = flow ? (tiny ? 1.12 : 1.22) : 1;
  const cols = tpl.columns.filter((c) => c.print && !(tiny && c.key === 'rate'));
  const colW = (c) => (tiny ? { item: 40, desc: 40, qty: 22, amount: 38 }[c.key] ?? num(c.width) : num(c.width));
  const totalW = cols.reduce((s, c) => s + Math.max(1, colW(c)), 0) || 1;
  const pct = (c) => (Math.max(1, colW(c)) / totalW) * 100 + '%';
  const uomInQty = !cols.some((c) => c.key === 'uom' || c.key === 'ctn');
  const bodyMin = !flow && st.footerAtBottom ? Math.max(15, H - tpl.headerHeight - tpl.footerHeight - 4) : 0;
  // "Total" goes in the column just before the first quantity column
  const totalLabelAt = Math.max(0, cols.findIndex((c) => QTY_KEYS.includes(c.key)) - 1);
  const framed = st.borders === 'grid' || st.borders === 'columns';

  // carton invoices show the quantities once, on the Total row, not on every item
  const totalRow = !!ctx.lineTotals && cols.some((c) => c.key === 'ctn' || c.key === 'pcs');

  const cell = (l, key) => (totalRow && QTY_KEYS.includes(key) ? '' : key === 'qty' && uomInQty && l.qty && l.uom ? `${l.qty} ${l.uom}` : l[key]);

  return (
    <div
      className={'tdoc' + (design ? ' design' : '') + (design?.grid ? ' grid' : '') + (flow ? ' roll' : '')}
      style={{ width: W + 'mm', fontFamily: (FONTS[st.font] || FONTS.system).css, fontSize: num(st.fontSize || 9) * boost + 'pt', '--acc': accent }}
    >
      <Band band="header" height={tpl.headerHeight} tpl={tpl} ctx={ctx} design={design} accent={accent} flow={flow ? W : 0} boost={boost} />
      <div className="tdoc-body" style={{ minHeight: bodyMin ? bodyMin + 'mm' : undefined }}>
        <table className={`tdoc-lines b-${st.borders} h-${st.tableHeader}${st.zebra ? ' zebra' : ''}${tiny ? ' tiny' : ''}`}>
          <colgroup>
            {cols.map((c) => (
              <col key={c.key} style={{ width: pct(c) }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {cols.map((c) => (
                <th key={c.key} style={{ textAlign: columnAlign(c.key) }}>
                  {c.key === 'qty' && !c.label && cols.some((x) => x.key === 'ctn') ? 'T/Qty' : columnLabel(tpl, c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ctx.lines.map((l, i) => (
              <tr key={i}>
                {cols.map((c) => (
                  <td key={c.key} className={CELL_CLASS[c.key]} style={{ textAlign: columnAlign(c.key) }}>
                    {cell(l, c.key)}
                  </td>
                ))}
              </tr>
            ))}
            {totalRow && (
              <tr className="tdoc-total">
                {cols.map((c, i) => (
                  <td key={c.key} className={CELL_CLASS[c.key]} style={{ textAlign: columnAlign(c.key) }}>
                    {QTY_KEYS.includes(c.key) ? (c.key === 'pkg' ? '' : fmtQty(ctx.lineTotals[c.key])) : i === totalLabelAt ? 'Total' : ''}
                  </td>
                ))}
              </tr>
            )}
            {!ctx.lines.length && (
              <tr>
                <td colSpan={cols.length || 1} className="tdoc-nolines">
                  &nbsp;
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {framed && !flow && (
          <div className="tdoc-frame" aria-hidden="true">
            {cols.map((c) => (
              <span key={c.key} style={{ width: pct(c) }} />
            ))}
          </div>
        )}
        {design && <div className="band-tag body">Line items · columns are set in Data Layout › Columns</div>}
      </div>
      <Band band="footer" height={tpl.footerHeight} tpl={tpl} ctx={ctx} design={design} accent={accent} flow={flow ? W : 0} boost={boost} />
      {st.stamps && ctx.stamp && <div className={'tdoc-stamp ' + ctx.stamp.toLowerCase()}>{ctx.stamp}</div>}
    </div>
  );
}

// boxes that share a horizontal strip of the design become one row, rows stack top to bottom
function flowRows(boxes) {
  const rows = [];
  [...boxes]
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .forEach((b) => {
      const r = rows[rows.length - 1];
      if (r && b.y < r.bottom - 0.5) {
        r.boxes.push(b);
        r.bottom = Math.max(r.bottom, b.y + b.h);
      } else rows.push({ top: b.y, bottom: b.y + b.h, boxes: [b] });
    });
  rows.forEach((r) => r.boxes.sort((a, b) => a.x - b.x));
  return rows;
}

function Band({ band, height, tpl, ctx, design, accent, flow = 0, boost = 1 }) {
  const boxes = tpl.boxes.filter((b) => b.band === band && !b.hidden);
  if (flow) {
    const rows = flowRows(boxes);
    return (
      <div className={'tdoc-band flow ' + band} data-band={band}>
        {rows.map((r, i) => {
          let right = 0;
          return (
            <div key={i} className="tflow-row" style={{ marginTop: i ? Math.min(2.5, Math.max(0, r.top - rows[i - 1].bottom)) + 'mm' : 0 }}>
              {r.boxes.map((b) => {
                const ml = Math.max(0, b.x - right);
                right = b.x + b.w;
                return <Box key={b.id} b={b} tpl={tpl} ctx={ctx} design={design} accent={accent} flow={{ W: flow, ml }} boost={boost} />;
              })}
            </div>
          );
        })}
      </div>
    );
  }
  return (
    <div className={'tdoc-band ' + band} style={{ height: height + 'mm' }} data-band={band}>
      {boxes.map((b) => (
        <Box key={b.id} b={b} tpl={tpl} ctx={ctx} design={design} accent={accent} />
      ))}
      {design && (
        <>
          <div className="band-tag">{band === 'header' ? 'Header' : 'Footer'}</div>
          <div className="band-resize" title="Drag to change the height" onPointerDown={(e) => design.onBandDown(e, band)} />
        </>
      )}
    </div>
  );
}

function Box({ b, tpl, ctx, design, accent, flow, boost = 1 }) {
  const v = ctx.values;
  const sel = design?.selectedId === b.id;
  const color = b.color === 'accent' ? accent : b.color || undefined;
  const bg = b.bg === 'accent' ? accent : b.bg || undefined;
  const base = num(tpl.style.fontSize || 9);
  const size = (b.size ? num(b.size) : base) * boost;

  let label = null;
  let body = null;
  let empty = false;
  if (b.kind === 'field') {
    if (b.field === 'companyBlock') {
      const c = tpl.company;
      const lines = [
        c.address && v.companyAddress,
        c.phone && v.companyPhone && 'Ph: ' + v.companyPhone,
        c.email && v.companyEmail,
        c.website && v.companyWebsite,
        c.ntn && v.companyNtn && 'NTN: ' + v.companyNtn,
      ].filter(Boolean);
      body = (
        <div className="tb-co">
          {c.name && (
            <div className="co-name" style={{ fontSize: size * 1.55 + 'pt' }}>
              {v.companyName}
            </div>
          )}
          {lines.length > 0 && <div className="tb-pre">{lines.join('\n')}</div>}
        </div>
      );
    } else if (b.field === 'totals') {
      body = (
        <div className="tb-totals">
          {ctx.totals.map((r) => (
            <div key={r.field} className={'tt' + (r.strong ? ' strong' : '')}>
              <span>
                {r.label || fieldLabel(tpl, r.field)}
                {r.qty && <span className="tt-qty"> · Qty {r.qty}</span>}
              </span>
              <span>{r.value}</span>
            </div>
          ))}
        </div>
      );
    } else {
      const val = v[b.field] ?? '';
      empty = val === '';
      if (b.labelPos !== 'none') label = <div className="tb-label">{fieldLabel(tpl, b.field)}</div>;
      body = <div className={'tb-val' + (empty && design ? ' ph' : '')}>{empty && design ? '‹' + fieldLabel(tpl, b.field) + '›' : val}</div>;
    }
  } else if (b.kind === 'text') {
    empty = !b.text;
    body = <div className="tb-val">{b.text}</div>;
  } else if (b.kind === 'logo') {
    empty = !ctx.logo;
    const pos = b.align === 'center' ? 'center' : b.align === 'right' ? 'right center' : 'left center';
    body = ctx.logo ? <img src={ctx.logo} alt="" style={{ objectPosition: pos }} /> : design ? <div className="tb-val ph">Logo — upload it in Basic Customization</div> : null;
  } else if (b.kind === 'sign') {
    body = (
      <div className="tb-sign" style={{ borderTopColor: color || '#000' }}>
        {b.text}
      </div>
    );
  } else if (b.kind === 'line') {
    body = <div className="tb-line" style={{ borderTopColor: color || '#000', borderTopWidth: b.bold ? '0.7mm' : '0.3mm' }} />;
  }

  if (!design && (b.hideEmpty || b.kind === 'logo' || (flow && b.kind === 'field' && b.field !== 'totals')) && empty) return null;

  // on a roll the box keeps its width (as a share of the paper) but its height follows the text
  // (a signature's room to sign is the space above its line, so it needs no height of its own below the text)
  const fixedH = b.kind === 'line' || b.kind === 'logo';
  const place = flow
    ? { width: (Math.min(b.w, flow.W) / flow.W) * 100 + '%', minHeight: fixedH ? b.h + 'mm' : undefined, height: b.kind === 'logo' ? b.h + 'mm' : undefined }
    : { left: b.x + 'mm', top: b.y + 'mm', width: b.w + 'mm', height: b.h + 'mm' };
  const style = {
    ...place,
    fontSize: b.size ? size + 'pt' : undefined,
    fontWeight: b.bold ? 700 : undefined,
    fontStyle: b.italic ? 'italic' : undefined,
    textAlign: b.align,
    color: b.kind === 'sign' || b.kind === 'line' ? undefined : color,
    background: bg,
  };
  return (
    <div
      className={`tbox k-${b.kind} bd-${b.border} lp-${b.labelPos} th-${tpl.style.tableHeader}` + (flow ? ' flow' : '') + (sel ? ' sel' : '')}
      style={style}
      data-box={b.id}
      onPointerDown={design ? (e) => design.onBoxDown(e, b, 'move') : undefined}
    >
      {label}
      {body}
      {sel && HANDLES.map((h) => <span key={h} className={'rh rh-' + h} onPointerDown={(e) => design.onBoxDown(e, b, h)} />)}
    </div>
  );
}

// A whole page (paper + margins), optionally scaled down for thumbnails / previews
export function PageSheet({ template, ctx, scale = 1, design, className = '' }) {
  const { w, h } = pageSize(template.page);
  const m = num(template.page.margin ?? 12);
  return (
    <div className={'tsheet ' + className} style={{ width: w + 'mm', minHeight: isRoll(template.page) && !design ? undefined : h + 'mm', padding: m + 'mm', zoom: scale }}>
      <TemplateDoc template={template} ctx={ctx} design={design} />
    </div>
  );
}

// fit a page into a box `px` wide
export const fitScale = (template, px) => Math.min(1.25, px / (pageSize(template.page).w * PX_PER_MM));

// longest single receipt slip (mm); anything longer goes on to the next slip
const ROLL_MAX_MM = 300;

// @page rule that matches the template's paper (used when printing).
// A receipt roll gets a page exactly as long as the printed receipt (measured), so the printer neither cuts the end off
// nor feeds blank paper.
export function PageRule({ template, lines = 0 }) {
  const { w, h } = pageSize(template.page);
  const m = num(template.page.margin ?? 12);
  const roll = isRoll(template.page);
  const [measured, setMeasured] = useState(0);
  useLayoutEffect(() => {
    if (!roll) return;
    const el = document.querySelector('#print-root .tdoc');
    if (el) setMeasured(Math.ceil(el.getBoundingClientRect().height / PX_PER_MM));
  }, [roll, template, lines]);
  const guess = 2 * m + template.headerHeight + template.footerHeight + 16 + lines * 10;
  // A very long bill is not squeezed onto one giant slip (the printer would shrink it to fit): the page length is capped
  // and the item lines continue on the next slip, whole rows only, with the column headings repeated.
  const len = Math.ceil(roll ? Math.min(ROLL_MAX_MM, measured > 0 ? measured + 2 * m + 2 : guess) : h);
  // the desktop program prints a receipt on paper exactly this long (see PrintProvider)
  useLayoutEffect(() => {
    const root = document.getElementById('print-root');
    if (root && roll) root.dataset.page = `${w}x${len}`;
  }, [roll, w, len]);
  return <style>{`@media print { @page { size: ${w}mm ${len}mm; margin: ${m}mm; } }`}</style>;
}
