import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Printer, Settings2 } from 'lucide-react';
import { Modal } from './ui';
import TemplateDoc, { PageSheet, PageRule, fitScale } from './TemplateDoc';
import { buildDocContext, resolveTemplate, templatesFor, getTemplate } from '../lib/templates';

const PrintCtx = createContext(null);
export const usePrint = () => useContext(PrintCtx);

export function PrintProvider({ children }) {
  const [content, setContent] = useState(null);
  useEffect(() => {
    const after = () => setContent(null);
    window.addEventListener('afterprint', after);
    return () => window.removeEventListener('afterprint', after);
  }, []);
  const print = useCallback((node) => {
    setContent(node);
    setTimeout(() => window.print(), 250); // after the page length has been measured (PageRule)
  }, []);
  const root = document.getElementById('print-root');
  return (
    <PrintCtx.Provider value={print}>
      {children}
      {content && root && createPortal(content, root)}
    </PrintCtx.Provider>
  );
}

// Printable transaction, laid out by its form template (Lists › Templates)
export function TxnPrint({ txn, company, L, ledger, template }) {
  const tpl = template || resolveTemplate(company, txn);
  const ctx = buildDocContext({ txn, company, L, ledger, template: tpl });
  return (
    <>
      <PageRule template={tpl} lines={ctx.lines.length} />
      <TemplateDoc template={tpl} ctx={ctx} />
    </>
  );
}

// Print a template with sample (or given) data
export function TemplatePrint({ template, ctx }) {
  return (
    <>
      <PageRule template={template} lines={ctx.lines.length} />
      <TemplateDoc template={template} ctx={ctx} />
    </>
  );
}

/** Print Preview dialog: pick any template of this form and see the page before printing. */
export function PrintPreviewModal({ txn, company, L, ledger, onClose, onCustomize, onUseTemplate }) {
  const print = usePrint();
  const options = templatesFor(company, txn.type);
  const [tplId, setTplId] = useState(() => resolveTemplate(company, txn).id);
  const tpl = getTemplate(company, tplId, txn.type);
  const ctx = useMemo(() => buildDocContext({ txn, company, L, ledger, template: tpl }), [txn, company, L, ledger, tpl]);
  return (
    <Modal
      title="Print Preview"
      onClose={onClose}
      width={900}
      className="preview-modal"
      footer={
        <>
          <label className="flex small">
            Template
            <select value={tplId} onChange={(e) => setTplId(e.target.value)} style={{ width: 230 }}>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
          {onUseTemplate && tplId !== (txn.templateId || resolveTemplate(company, txn).id) && (
            <button className="btn" onClick={() => onUseTemplate(tplId)}>
              Use on this form
            </button>
          )}
          {onCustomize && (
            <button className="btn" onClick={() => onCustomize(tplId)}>
              <Settings2 size={14} /> Customize…
            </button>
          )}
          <span className="sp" />
          <button className="btn" onClick={onClose}>
            Close
          </button>
          <button className="btn primary" autoFocus onClick={() => print(<TxnPrint txn={txn} company={company} L={L} ledger={ledger} template={tpl} />)}>
            <Printer size={14} /> Print
          </button>
        </>
      }
    >
      <div className="preview-stage">
        <PageSheet template={tpl} ctx={ctx} scale={fitScale(tpl, 820)} />
      </div>
    </Modal>
  );
}
