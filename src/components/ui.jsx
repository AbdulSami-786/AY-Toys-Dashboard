import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, CheckCircle2, AlertTriangle, Info } from 'lucide-react';

// ---------- Modal ----------
let openModals = 0;
const modalStack = [];
export const modalIsOpen = () => openModals > 0;

export function Modal({ title, onClose, children, footer, width = 560, className = '', icon }) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    openModals++;
    const token = {};
    modalStack.push(token);
    const prev = document.activeElement;
    requestAnimationFrame(() => {
      const el = ref.current?.querySelector('[autofocus], input:not([type=hidden]):not([tabindex="-1"]), select, textarea, button.primary');
      if (el) el.focus();
      else ref.current?.focus();
    });
    // Esc closes the top-most dialog even when focus is outside it
    const onKey = (e) => {
      if (e.key !== 'Escape' || modalStack[modalStack.length - 1] !== token || e.defaultPrevented) return;
      if (ref.current?.contains(e.target)) return; // handled by onKeyDown below
      e.preventDefault();
      closeRef.current?.();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      openModals--;
      modalStack.splice(modalStack.indexOf(token), 1);
      window.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, []);
  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        ref={ref}
        tabIndex={-1}
        className={'modal ' + className}
        style={{ width, outline: 'none' }}
        role="dialog"
        aria-modal="true"
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            onClose?.();
          }
        }}
      >
        <div className="modal-head">
          {icon}
          <span>{title}</span>
          <button className="icon-btn" onClick={onClose} title="Close (Esc)">
            <X size={16} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

// ---------- Confirm ----------
const DialogCtx = createContext(null);
export const useDialog = () => useContext(DialogCtx);

export function DialogProvider({ children }) {
  const [dlg, setDlg] = useState(null);
  const [toasts, setToasts] = useState([]);

  const confirm = useCallback(
    (message, { title = 'AY Toys', ok = 'OK', cancel = 'Cancel', danger = false } = {}) =>
      new Promise((resolve) => setDlg({ message, title, ok, cancel, danger, resolve })),
    [],
  );
  const alert = useCallback(
    (message, { title = 'AY Toys' } = {}) => new Promise((resolve) => setDlg({ message, title, ok: 'OK', resolve, alertOnly: true })),
    [],
  );
  const toast = useCallback((message, kind = 'ok') => {
    const id = Math.random();
    setToasts((t) => [...t, { id, message, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);

  const done = (v) => {
    dlg?.resolve(v);
    setDlg(null);
  };

  return (
    <DialogCtx.Provider value={{ confirm, alert, toast }}>
      {children}
      {dlg && (
        <Modal
          title={dlg.title}
          onClose={() => done(false)}
          width={420}
          icon={dlg.danger ? <AlertTriangle size={16} className="warn-ic" /> : <Info size={16} />}
          footer={
            <>
              {!dlg.alertOnly && (
                <button className="btn" onClick={() => done(false)}>
                  {dlg.cancel}
                </button>
              )}
              <button className={'btn primary' + (dlg.danger ? ' danger' : '')} autoFocus onClick={() => done(true)}>
                {dlg.ok}
              </button>
            </>
          }
        >
          <div className="dlg-msg">{dlg.message}</div>
        </Modal>
      )}
      {createPortal(
        <div className="toasts">
          {toasts.map((t) => (
            <div key={t.id} className={'toast ' + t.kind}>
              {t.kind === 'err' ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />}
              {t.message}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </DialogCtx.Provider>
  );
}

// ---------- small bits ----------
export function Tabs({ tabs, value, onChange, className = '' }) {
  return (
    <div className={'tabs ' + className} role="tablist">
      {tabs.map((t) => {
        const id = typeof t === 'string' ? t : t.id;
        const label = typeof t === 'string' ? t : t.label;
        return (
          <button key={id} type="button" role="tab" aria-selected={value === id} className={'tab' + (value === id ? ' on' : '')} onClick={() => onChange(id)}>
            {label}
          </button>
        );
      })}
    </div>
  );
}

export function Empty({ children, icon }) {
  return (
    <div className="empty">
      {icon}
      <div>{children}</div>
    </div>
  );
}

export function Kbd({ children }) {
  return <kbd className="kbd">{children}</kbd>;
}

// Right-click context menu
export function useContextMenu() {
  const [menu, setMenu] = useState(null);
  const ref = useRef(null);
  // keep the menu fully on screen: a menu opened near the right or bottom edge (the user button!) slides back in
  useLayoutEffect(() => {
    const el = ref.current;
    if (!menu || !el) return;
    const m = 8;
    const r = el.getBoundingClientRect();
    const left = Math.max(m, Math.min(menu.x, window.innerWidth - r.width - m));
    const top = menu.y + r.height > window.innerHeight - m ? Math.max(m, window.innerHeight - r.height - m) : menu.y;
    el.style.left = left + 'px';
    el.style.top = top + 'px';
  }, [menu]);
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener('mousedown', close);
    window.addEventListener('blur', close);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('blur', close);
    };
  }, [menu]);
  const show = (e, items) => {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, items });
  };
  const node = menu
    ? createPortal(
        <div className="ctx-menu" ref={ref} style={{ left: menu.x, top: menu.y }} onMouseDown={(e) => e.stopPropagation()}>
          {menu.items.map((it, i) =>
            it === '-' ? (
              <div key={i} className="menu-sep" />
            ) : (
              <div
                key={i}
                className={'menu-item' + (it.disabled ? ' dis' : '')}
                onClick={() => {
                  if (it.disabled) return;
                  setMenu(null);
                  it.onClick();
                }}
              >
                <span>{it.label}</span>
                {it.key && <span className="menu-key">{it.key}</span>}
              </div>
            ),
          )}
        </div>,
        document.body,
      )
    : null;
  return { show, node };
}
