import { THEME_PRESETS } from '../store/defaults';
import { Sun, Moon } from 'lucide-react';

export default function ThemePicker({ theme, onChange, name = 'Company' }) {
  const t = theme || { preset: 'qb', primary: '#2ca01c', mode: 'light' };
  const mix = (pct, base) => `color-mix(in srgb, ${t.primary} ${pct}%, ${base})`;
  return (
    <div className="flex" style={{ alignItems: 'flex-start', gap: 22, flexWrap: 'wrap' }}>
      <div style={{ flex: 1, minWidth: 260 }}>
        <div className="field-label mb">Color theme</div>
        <div className="swatches">
          {THEME_PRESETS.map((p) => (
            <button
              type="button"
              key={p.id}
              title={p.name}
              className={'swatch' + (t.primary?.toLowerCase() === p.primary.toLowerCase() ? ' on' : '')}
              style={{ background: p.primary }}
              onClick={() => onChange({ ...t, preset: p.id, primary: p.primary })}
            />
          ))}
        </div>
        <div className="flex mt">
          <label className="check">
            Custom color
            <input type="color" value={t.primary} onChange={(e) => onChange({ ...t, preset: 'custom', primary: e.target.value })} />
          </label>
          <code className="muted">{t.primary}</code>
        </div>
        <div className="field-label mt" style={{ marginBottom: 6 }}>
          Appearance
        </div>
        <div className="flex">
          <button type="button" className={'btn sm' + (t.mode !== 'dark' ? ' primary' : '')} onClick={() => onChange({ ...t, mode: 'light' })}>
            <Sun size={13} /> Light
          </button>
          <button type="button" className={'btn sm' + (t.mode === 'dark' ? ' primary' : '')} onClick={() => onChange({ ...t, mode: 'dark' })}>
            <Moon size={13} /> Dark
          </button>
          <span style={{ width: 12 }} />
          <label className="check small">
            <input type="checkbox" checked={t.density === 'compact'} onChange={(e) => onChange({ ...t, density: e.target.checked ? 'compact' : 'normal' })} />
            Compact rows
          </label>
        </div>
      </div>
      <div>
        <div className="field-label mb">Preview</div>
        <div className="theme-preview" style={{ background: t.mode === 'dark' ? '#1a1f24' : '#fff' }}>
          <div className="tp-bar" style={{ background: mix(70, '#000') }}>
            AY Toys · {name}
          </div>
          <div className="tp-body">
            <div className="tp-side" style={{ background: t.mode === 'dark' ? '#0e1215' : '#22303c' }}>
              <div style={{ margin: '10px 0 0', height: 18, borderLeft: `3px solid ${t.primary}`, background: '#2e3e4c' }} />
            </div>
            <div className="tp-main" style={{ background: t.mode === 'dark' ? '#1a1f24' : '#fff' }}>
              <div className="tp-line" style={{ width: '60%', background: mix(26, t.mode === 'dark' ? '#171c21' : '#fff') }} />
              <div className="tp-line" style={{ background: t.mode === 'dark' ? '#323a43' : '#e6e9ed' }} />
              <div className="tp-line" style={{ width: '80%', background: t.mode === 'dark' ? '#323a43' : '#e6e9ed' }} />
              <div className="tp-btn" style={{ background: t.primary }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
