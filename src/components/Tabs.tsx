import React from 'react';

export interface TabDef<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
  /** Render a vertical divider before this tab. */
  divider?: boolean;
}

export function TabBar<T extends string>({
  tabs, value, onChange, variant = 'main',
}: {
  tabs: TabDef<T>[];
  value: T;
  onChange: (v: T) => void;
  variant?: 'main' | 'sub';
}) {
  const isMain = variant === 'main';
  return (
    <div style={{
      display: 'flex',
      borderBottom: '1px solid #1f1f1f',
      background: isMain ? '#0a0a0a' : 'transparent',
      marginBottom: isMain ? 0 : 8,
    }}>
      {tabs.map((t) => {
        const active = t.value === value;
        return (
          <React.Fragment key={t.value}>
            {t.divider && <span style={{ width: 1, alignSelf: 'stretch', background: '#333', margin: '4px 2px' }} />}
            <button
              disabled={t.disabled}
              onClick={() => onChange(t.value)}
              style={{
                padding: isMain ? '10px 14px' : '6px 10px',
                background: active ? (isMain ? '#1f1f1f' : '#181818') : 'transparent',
                color: t.disabled ? '#444' : active ? '#fff' : '#888',
                border: 'none',
                borderBottom: active ? '2px solid #1f6feb' : '2px solid transparent',
                cursor: t.disabled ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
                fontSize: isMain ? 12 : 11,
                textTransform: 'uppercase',
                letterSpacing: 1,
              }}
            >
              {t.label}
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
}
