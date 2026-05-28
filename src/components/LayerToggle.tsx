import React from 'react';

export const LayerToggle: React.FC<{ label: string; on: boolean; onClick: () => void }> = ({ label, on, onClick }) => (
  <button
    onClick={onClick}
    title={`Toggle ${label} layer`}
    style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '4px 10px', borderRadius: 999, fontSize: 11, letterSpacing: 1,
      textTransform: 'uppercase', cursor: 'pointer',
      background: on ? '#1f6feb22' : '#1a1a1a',
      color: on ? '#fff' : '#666',
      border: `1px solid ${on ? '#1f6feb' : '#2a2a2a'}`,
      fontFamily: 'inherit',
    }}
  >
    <span style={{
      width: 8, height: 8, borderRadius: '50%',
      background: on ? '#1f6feb' : '#444',
      boxShadow: on ? '0 0 6px #1f6feb' : 'none',
    }} />
    {label}
  </button>
);

export const PillToggle: React.FC<{ label: string; on: boolean; onClick: () => void; activeColor?: string }> = ({ label, on, onClick, activeColor = '#1f6feb' }) => (
  <button
    onClick={onClick}
    style={{
      padding: '3px 8px', fontSize: 10, letterSpacing: 0.5,
      borderRadius: 4, cursor: 'pointer', fontFamily: 'inherit',
      background: on ? `${activeColor}33` : '#1a1a1a',
      color: on ? '#fff' : '#777',
      border: `1px solid ${on ? activeColor : '#2a2a2a'}`,
    }}
  >
    {label}
  </button>
);
