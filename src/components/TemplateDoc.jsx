import { FONTS, contentSize, pageSize, fieldLabel, columnLabel, columnAlign, PX_PER_MM } from '../lib/templates';
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
  const cols = tpl.columns.filter((c) => c.print);
  const totalW = cols.reduce((s, c) => s + Math.max(1, num(c.width)), 0) || 1;
  const pct = (c) => (Math.max(1, num(c.width)) / totalW) * 100 + '%';
  const uomInQty = !cols.some((c) => c.key === 'uom' || c.key === 'ctn');
  const bodyMin = st.footerAtBottom ? Math.max(15, H - tpl.headerHeight - tpl.footerHeight - 4) : 0;
  // "Total" goes in the column just before the first quantity column
  const totalLabelAt = Math.max(0, cols.findIndex((c) => QTY_KEYS.includes(c.key)) - 1);
  const framed = st.borders === 'grid' || st.borders === 'columns';

  const cell = (l, key) => (key === 'qty' && uomInQty && l.qty && l.uom ? `${l.qty} ${l.uom}` : l[key]);

  return (
    <div
      className={'tdoc' + (design ? ' design' : '') + (design?.grid ? ' grid' : '')}
      style={{ width: W + 'mm', fontFamily: (FONTS[st.font] || FONTS.system).css, fontSize: num(st.fontSize || 9) + 'pt', '--acc': accent }}
    >
      <Band band="header" height={tpl.headerHeight} tpl={tpl} ctx={ctx} design={design} accent={accent} />
      <div className="tdoc-body" style={{ minHeight: bodyMin ? bodyMin + 'mm' : undefined }}>
        <table className={`tdoc-lines b-${st.borders} h-${st.tableHeader}${st.zebra ? ' zebra' : ''}`}>
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
            {ctx.lineTotals && cols.some((c) => c.key === 'ctn' || c.key === 'pcs') && (
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
        {framed && (
          <div className="tdoc-frame" aria-hidden="true">
            {cols.map((c) => (
              <span key={c.key} style={{ width: pct(c) }} />
            ))}
          </div>
        )}
        {design && <div className="band-tag body">Line items · columns are set in Data Layout › Columns</div>}
      </div>
      <Band band="footer" height={tpl.footerHeight} tpl={tpl} ctx={ctx} design={design} accent={accent} />
      {st.stamps && ctx.stamp && <div className={'tdoc-stamp ' + ctx.stamp.toLowerCase()}>{ctx.stamp}</div>}
    </div>
  );
}

function Band({ band, height, tpl, ctx, design, accent }) {
  const boxes = tpl.boxes.filter((b) => b.band === band && !b.hidden);
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

function Box({ b, tpl, ctx, design, accent }) {
  const v = ctx.values;
  const sel = design?.selectedId === b.id;
  const color = b.color === 'accent' ? accent : b.color || undefined;
  const bg = b.bg === 'accent' ? accent : b.bg || undefined;
  const base = num(tpl.style.fontSize || 9);
  const size = b.size ? num(b.size) : base;

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
              <span>{r.label || fieldLabel(tpl, r.field)}</span>
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

  if (!design && (b.hideEmpty || b.kind === 'logo') && empty) return null;

  const style = {
    left: b.x + 'mm',
    top: b.y + 'mm',
    width: b.w + 'mm',
    height: b.h + 'mm',
    fontSize: b.size ? size + 'pt' : undefined,
    fontWeight: b.bold ? 700 : undefined,
    fontStyle: b.italic ? 'italic' : undefined,
    textAlign: b.align,
    color: b.kind === 'sign' || b.kind === 'line' ? undefined : color,
    background: bg,
  };
  return (
    <div
      className={`tbox k-${b.kind} bd-${b.border} lp-${b.labelPos} th-${tpl.style.tableHeader}` + (sel ? ' sel' : '')}
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
    <div className={'tsheet ' + className} style={{ width: w + 'mm', minHeight: h + 'mm', padding: m + 'mm', zoom: scale }}>
      <TemplateDoc template={template} ctx={ctx} design={design} />
    </div>
  );
}

// fit a page into a box `px` wide
export const fitScale = (template, px) => Math.min(1.25, px / (pageSize(template.page).w * PX_PER_MM));

// @page rule that matches the template's paper (used when printing).
// A receipt roll gets a page about as long as the receipt, so the printer doesn't feed blank paper.
export function PageRule({ template, lines = 0 }) {
  const { w, h } = pageSize(template.page);
  const m = num(template.page.margin ?? 12);
  const len = template.page.size === 'R80' ? Math.min(h * 3, Math.max(90, 2 * m + template.headerHeight + template.footerHeight + 16 + lines * 10)) : h;
  return <style>{`@media print { @page { size: ${w}mm ${Math.round(len)}mm; margin: ${m}mm; } }`}</style>;
}
