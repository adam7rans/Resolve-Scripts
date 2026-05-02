import React from 'react';

export const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div style={{
    border: '1px solid #222', borderRadius: 4, padding: 10, marginBottom: 10, background: '#141414',
  }}>
    <div style={{ color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>{title}</div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{children}</div>
  </div>
);

export const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label style={{ display: 'grid', gridTemplateColumns: '110px 1fr 60px', alignItems: 'center', gap: 8 }}>
    <span style={{ color: '#aaa' }}>{label}</span>
    {children}
  </label>
);

export const Slider: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  /** Optional tick marks rendered via <datalist>. Browsers draw small notches on the track. */
  ticks?: number[];
  onChange: (v: number) => void;
}> = ({ label, value, min, max, step = 0.01, ticks, onChange }) => {
  const listId = React.useId();
  return (
    <Row label={label}>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        list={ticks && ticks.length ? listId : undefined}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ width: '100%' }}
      />
      {ticks && ticks.length ? (
        <datalist id={listId}>
          {ticks.map((t) => (
            <option key={t} value={t} label={String(t)} />
          ))}
        </datalist>
      ) : null}
      <input
        type="number"
        step={step}
        value={Number.isFinite(value) ? Number(value.toFixed(4)) : 0}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ width: 60, background: '#0a0a0a', color: '#ddd', border: '1px solid #333', padding: '2px 4px' }}
      />
    </Row>
  );
};

export const Toggle: React.FC<{ label: string; value: boolean; onChange: (v: boolean) => void }> = ({ label, value, onChange }) => (
  <Row label={label}>
    <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
    <span />
  </Row>
);

export const ColorInput: React.FC<{ label: string; value: string; onChange: (v: string) => void }> = ({ label, value, onChange }) => (
  <Row label={label}>
    <input type="color" value={value} onChange={(e) => onChange(e.target.value)} style={{ width: '100%', height: 24, background: 'transparent', border: '1px solid #333' }} />
    <input type="text" value={value} onChange={(e) => onChange(e.target.value)} style={{ width: 60, background: '#0a0a0a', color: '#ddd', border: '1px solid #333', padding: '2px 4px' }} />
  </Row>
);

export const Select: React.FC<{
  label: string;
  value: string | number;
  options: { label: string; value: string | number }[];
  onChange: (v: string) => void;
}> = ({ label, value, options, onChange }) => (
  <Row label={label}>
    <select
      value={String(value)}
      onChange={(e) => onChange(e.target.value)}
      style={{ width: '100%', background: '#0a0a0a', color: '#ddd', border: '1px solid #333', padding: '2px 4px' }}
    >
      {options.map((o) => (
        <option key={String(o.value)} value={String(o.value)}>{o.label}</option>
      ))}
    </select>
    <span />
  </Row>
);
