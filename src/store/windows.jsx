import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

// Multi-window workspace (like QuickBooks' "Open Windows" list).
// A window = { id, type, props, title, nonce }. Single-instance types reuse their window.

const WinCtx = createContext(null);
export const useWindows = () => useContext(WinCtx);

const ThisWinCtx = createContext(null);
export const ThisWindowProvider = ThisWinCtx.Provider;
export const useThisWindow = () => useContext(ThisWinCtx);

// Types that can be opened several times at once (key includes props)
const MULTI = new Set(['report', 'register', 'templateeditor']);

// allow(type, props) → may this user open it? (permissions); onDenied is told when not
export function WindowsProvider({ children, titles, allow, onDenied }) {
  const [windows, setWindows] = useState([{ id: 'home', type: 'home', props: {}, title: 'Home', nonce: 0 }]);
  const [activeId, setActiveId] = useState('home');
  const handlersRef = useRef({}); // windowId -> { combo: fn }
  const history = useRef(['home']);

  const keyFor = (type, props) => {
    if (type === 'report') return `report:${props.reportId}:${JSON.stringify(props.filter || {})}`;
    if (type === 'register') return `register:${props.accountId}`;
    if (type === 'templateeditor') return `templateeditor:${props.draft?.id || props.templateId || props.formType}`;
    return type;
  };

  const open = useCallback(
    (type, props = {}, title) => {
      if (allow && !allow(type, props)) {
        onDenied?.(type, props);
        return null;
      }
      const id = keyFor(type, props);
      setWindows((ws) => {
        const exists = ws.find((w) => w.id === id);
        const t = title || titles(type, props);
        if (exists) {
          if (MULTI.has(type) && !props.force) return ws;
          if (!Object.keys(props).length) return ws; // already open: just bring it forward
          return ws.map((w) => (w.id === id ? { ...w, props, title: t, nonce: w.nonce + 1 } : w));
        }
        return [...ws, { id, type, props, title: t, nonce: 0 }];
      });
      setActiveId(id);
      history.current = [...history.current.filter((h) => h !== id), id];
      return id;
    },
    [titles, allow, onDenied],
  );

  const close = useCallback((id) => {
    setWindows((ws) => {
      const next = ws.filter((w) => w.id !== id);
      return next.length ? next : [{ id: 'home', type: 'home', props: {}, title: 'Home', nonce: 0 }];
    });
    delete handlersRef.current[id];
    history.current = history.current.filter((h) => h !== id);
    setActiveId((cur) => (cur === id ? history.current[history.current.length - 1] || 'home' : cur));
  }, []);

  const focus = useCallback((id) => {
    setActiveId(id);
    history.current = [...history.current.filter((h) => h !== id), id];
  }, []);

  const setTitle = useCallback((id, title) => {
    setWindows((ws) => ws.map((w) => (w.id === id && w.title !== title ? { ...w, title } : w)));
  }, []);

  const closeAll = useCallback(() => {
    setWindows([{ id: 'home', type: 'home', props: {}, title: 'Home', nonce: Date.now() }]);
    handlersRef.current = {};
    history.current = ['home'];
    setActiveId('home');
  }, []);

  const cycle = useCallback(
    (dir) => {
      setActiveId((cur) => {
        const idx = windows.findIndex((w) => w.id === cur);
        const next = windows[(idx + dir + windows.length) % windows.length];
        return next ? next.id : cur;
      });
    },
    [windows],
  );

  return (
    <WinCtx.Provider value={{ windows, activeId, open, close, focus, setTitle, closeAll, cycle, handlersRef }}>
      {children}
    </WinCtx.Provider>
  );
}

// Register keyboard shortcut handlers for the window this component lives in.
// Handlers only fire while that window is the active one.
export function useWindowKeys(handlers) {
  const me = useThisWindow();
  const { handlersRef } = useWindows();
  const ref = useRef(handlers);
  ref.current = handlers;
  useEffect(() => {
    if (!me) return;
    const proxy = new Proxy(
      {},
      {
        get: (_, k) => ref.current[k],
        has: (_, k) => k in ref.current,
      },
    );
    handlersRef.current[me.id] = proxy;
    return () => {
      if (handlersRef.current[me.id] === proxy) delete handlersRef.current[me.id];
    };
  }, [me, handlersRef]);
}
