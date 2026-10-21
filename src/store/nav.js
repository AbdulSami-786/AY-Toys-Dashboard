import { useCallback, useMemo } from 'react';
import { useWindows } from './windows';
import { useStore } from './store';

export function useNav() {
  const { open, close } = useWindows();
  const { data } = useStore();
  const openTxn = useCallback(
    (idOrTxn) => {
      const t = typeof idOrTxn === 'string' ? (data?.txns || []).find((x) => x.id === idOrTxn) : idOrTxn;
      if (!t) return;
      open(t.type, { txnId: t.id });
    },
    [data, open],
  );
  const report = useCallback((reportId, filter = {}, extra = {}) => open('report', { reportId, filter, ...extra }), [open]);
  return useMemo(() => ({ open, close, openTxn, report }), [open, close, openTxn, report]);
}
