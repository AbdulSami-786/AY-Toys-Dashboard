// Customize Keyboard Shortcuts: give any command another key. A key belongs to one command only — the one that had it is left empty.
import { useEffect, useMemo, useState } from 'react';
import { Keyboard, RotateCcw, Search, X } from 'lucide-react';
import { Kbd, useDialog } from '../components/ui';
import { comboFromEvent } from '../lib/commands';
import { KEY_COMMANDS, comboOf, isChanged, prettyCombo, comboProblem, setCombo, clearCombo, resetCombo, resetAll, useKeymap } from '../lib/keymap';

export default function KeyMap() {
  const ver = useKeymap();
  const dlg = useDialog();
  const [q, setQ] = useState('');
  const [capture, setCapture] = useState(null); // id of the command waiting for its new key
  const [msg, setMsg] = useState('');

  // while a command waits for its key, the next key combination goes to it (before the rest of the program sees it)
  useEffect(() => {
    if (!capture) return undefined;
    const onKey = (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      const combo = comboFromEvent(e);
      if (!combo) return; // only Ctrl / Alt / Shift so far
      if (combo === 'esc') {
        setCapture(null);
        setMsg('');
        return;
      }
      const why = comboProblem(combo);
      if (why) return setMsg(`${prettyCombo(combo)}: ${why}`);
      const cmd = KEY_COMMANDS.find((c) => c.id === capture);
      const left = setCombo(capture, combo);
      setCapture(null);
      setMsg('');
      dlg.toast(left.length ? `${prettyCombo(combo)} now ${cmd.label}. ${left.map((c) => c.label).join(', ')} has no key now.` : `${cmd.label}: ${prettyCombo(combo)}`);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [capture, dlg]);

  const groups = useMemo(() => {
    const t = q.trim().toLowerCase();
    const out = [];
    KEY_COMMANDS.forEach((c) => {
      if (t && !c.label.toLowerCase().includes(t) && !prettyCombo(comboOf(c)).toLowerCase().includes(t)) return;
      let g = out.find((x) => x.name === c.group);
      if (!g) out.push((g = { name: c.group, rows: [] }));
      g.rows.push(c);
    });
    return out;
  }, [q, ver]);

  const changed = KEY_COMMANDS.filter(isChanged).length;
  const askReset = async () => {
    if (await dlg.confirm('Put every shortcut back to its standard key?', { ok: 'Reset all' })) {
      resetAll();
      dlg.toast('All shortcuts are back to the standard keys');
    }
  };
  const doReset = (c) => {
    const left = resetCombo(c.id);
    if (left.length) dlg.toast(`${prettyCombo(c.def)} is back on ${c.label}. ${left.map((x) => x.label).join(', ')} has no key now.`);
  };

  return (
    <div className="win">
      <div className="win-title">
        <Keyboard size={20} />
        <h1>Customize Keyboard Shortcuts</h1>
        <span className="sub">Click Change, then press the new keys</span>
      </div>
      <div className="win-body pad">
        <div className="note mb">
          Click <b>Change</b> on a command and press the keys you want (for example <Kbd>Ctrl+K</Kbd>). A key can belong to one command only: if you give <Kbd>Ctrl+P</Kbd> to another
          command, <b>Print</b> is left without a key until you give it a new one. These choices are kept on this device.
        </div>
        <div className="flex mb" style={{ gap: 8, flexWrap: 'wrap' }}>
          <label className="flex" style={{ gap: 6 }}>
            <Search size={14} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a command or key" style={{ width: 240 }} />
          </label>
          <span className="sp" />
          <button className="btn" onClick={askReset} disabled={!changed}>
            <RotateCcw size={14} /> Reset all{changed ? ` (${changed} changed)` : ''}
          </button>
        </div>
        {msg && <div className="note warn mb">{msg}</div>}
        {groups.map((g) => (
          <div key={g.name} className="mb">
            <h3 style={{ margin: '8px 0 4px' }}>{g.name}</h3>
            <table className="tbl" style={{ maxWidth: 760 }}>
              <tbody>
                {g.rows.map((c) => {
                  const k = comboOf(c);
                  const waiting = capture === c.id;
                  return (
                    <tr key={c.id}>
                      <td>
                        {c.label}
                        {isChanged(c) && <span className="muted small"> · standard key {prettyCombo(c.def)}</span>}
                      </td>
                      <td style={{ width: 190 }}>
                        {waiting ? <span className="b">Press the new keys… (Esc cancels)</span> : k ? <Kbd>{prettyCombo(k)}</Kbd> : <span className="muted">— no key —</span>}
                      </td>
                      <td style={{ width: 230, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button
                          className={'btn sm' + (waiting ? ' primary' : '')}
                          onClick={() => {
                            setMsg('');
                            setCapture(waiting ? null : c.id);
                          }}
                        >
                          {waiting ? 'Cancel' : 'Change'}
                        </button>{' '}
                        <button className="btn sm" onClick={() => clearCombo(c.id)} disabled={!k} title="Leave this command without a key">
                          <X size={12} /> Clear
                        </button>{' '}
                        <button className="btn sm" onClick={() => doReset(c)} disabled={!isChanged(c)} title="Back to the standard key">
                          <RotateCcw size={12} /> Standard
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
        {!groups.length && <p className="muted">No command matches “{q}”.</p>}
      </div>
    </div>
  );
}
