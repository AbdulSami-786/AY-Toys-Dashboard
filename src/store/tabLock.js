// Only one browser tab may work on the books at a time. Two tabs each keep their own copy in memory and
// the last one to save would overwrite the other's changes, so a second tab waits (or takes over).
//
// The lock is a small record in localStorage that the owning tab refreshes every couple of seconds.
// A tab that takes over tells the others at once (BroadcastChannel); a crashed tab's lock simply goes stale.

import { useCallback, useEffect, useRef, useState } from 'react';

const KEY = 'ay.tabLock';
const BEAT = 2000;
const STALE = 7000;
const ME = Math.random().toString(36).slice(2) + Date.now().toString(36);

let owner = false; // does this tab hold the lock? (checked before every write)
export const isWriter = () => owner;

const read = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || 'null');
  } catch {
    return null;
  }
};
const write = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify({ id: ME, ts: Date.now() }));
  } catch {
    /* storage unavailable: run without the lock */
  }
};
const freshOther = (l) => !!l && l.id !== ME && Date.now() - l.ts < STALE;

let channel = null;
try {
  channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('ay-toys-tabs') : null;
} catch {
  channel = null;
}

/** state: 'checking' | 'mine' | 'other'; epoch changes every time this tab (re)gains the lock. */
export function useTabLock() {
  const [state, setState] = useState('checking');
  const [epoch, setEpoch] = useState(0);
  const stateRef = useRef(state);
  stateRef.current = state;

  const gain = useCallback(() => {
    write();
    owner = true;
    setEpoch((e) => e + 1);
    setState('mine');
  }, []);
  const lose = useCallback(() => {
    owner = false;
    setState('other');
  }, []);

  // first look: take the lock if nobody (alive) has it — then re-check in case another tab raced us
  useEffect(() => {
    if (freshOther(read())) return lose();
    write();
    const t = setTimeout(() => {
      const l = read();
      if (!l || l.id === ME) gain();
      else lose();
    }, 150);
    return () => clearTimeout(t);
  }, [gain, lose]);

  // heartbeat: keep our lock fresh; notice when someone took over, or when the other tab went away
  useEffect(() => {
    const t = setInterval(() => {
      const l = read();
      if (stateRef.current === 'mine') {
        if (freshOther(l)) lose();
        else write();
      } else if (stateRef.current === 'other' && !freshOther(l)) gain();
    }, BEAT);
    return () => clearInterval(t);
  }, [gain, lose]);

  // instant notice from other tabs
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key !== KEY) return;
      const l = read();
      if (stateRef.current === 'mine' && freshOther(l)) lose();
      if (stateRef.current === 'other' && !freshOther(l)) gain();
    };
    const onMsg = (e) => {
      if (e.data?.type === 'takeover' && e.data.id !== ME && stateRef.current === 'mine') lose();
      if (e.data?.type === 'released' && stateRef.current === 'other') setTimeout(() => !freshOther(read()) && gain(), 50);
    };
    const release = () => {
      if (!owner) return;
      owner = false;
      try {
        if (read()?.id === ME) localStorage.removeItem(KEY);
      } catch {
        /* ignore */
      }
      channel?.postMessage({ type: 'released', id: ME });
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('pagehide', release);
    channel?.addEventListener('message', onMsg);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('pagehide', release);
      channel?.removeEventListener('message', onMsg);
    };
  }, [gain, lose]);

  const takeOver = useCallback(() => {
    write();
    channel?.postMessage({ type: 'takeover', id: ME });
    // give the other tab a moment to stop before this one loads the books
    setTimeout(gain, 300);
  }, [gain]);

  return { state, epoch, takeOver };
}
