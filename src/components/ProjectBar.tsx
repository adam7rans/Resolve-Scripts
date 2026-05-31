import React, { useState } from 'react';
import type { ProjectMeta } from '../lib/projectApi';

interface Props {
  projects: ProjectMeta[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreate: (name: string) => void;
}

export const ProjectBar: React.FC<Props> = ({ projects, activeId, onSelect, onCreate }) => {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');

  const active = projects.find(p => p.id === activeId);

  const submit = () => {
    const n = newName.trim();
    if (!n) return;
    onCreate(n);
    setNewName('');
    setCreating(false);
  };

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '7px 10px', borderBottom: '1px solid #1f1f1f',
      background: 'linear-gradient(180deg, #111 0%, #0c0c0c 100%)',
      flexShrink: 0,
    }}>
      <span style={{ fontSize: 10, color: '#555', textTransform: 'uppercase', letterSpacing: 1, flexShrink: 0 }}>
        Project
      </span>

      {creating ? (
        <>
          <input
            autoFocus
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') submit();
              if (e.key === 'Escape') { setCreating(false); setNewName(''); }
            }}
            placeholder="Project name…"
            style={{
              flex: 1, background: '#161616', border: '1px solid #1f6feb',
              borderRadius: 4, color: '#eee', padding: '3px 8px',
              fontSize: 12, fontFamily: 'inherit', outline: 'none',
            }}
          />
          <button onClick={submit} style={btn('#1f6feb')}>Create</button>
          <button onClick={() => { setCreating(false); setNewName(''); }} style={btn('#222')}>Cancel</button>
        </>
      ) : (
        <>
          {projects.length > 0 ? (
            <select
              value={activeId || ''}
              onChange={e => {
                const val = e.target.value;
                if (val) onSelect(val);
              }}
              style={{
                flex: 1, background: '#161616', border: '1px solid #2a2a2a',
                borderRadius: 4, color: activeId ? '#ddd' : '#666',
                padding: '3px 8px', fontSize: 12, fontFamily: 'inherit',
                cursor: 'pointer', outline: 'none',
              }}
            >
              {!activeId && <option value="">— select project —</option>}
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}{p.hasVideo ? '' : ' (no video)'}</option>
              ))}
            </select>
          ) : (
            <span style={{ flex: 1, fontSize: 12, color: '#555', fontStyle: 'italic' }}>No projects yet</span>
          )}

          {active && (
            <span style={{ fontSize: 10, display: 'flex', gap: 4, flexShrink: 0 }}>
              {active.hasVideo && <Badge color="#1f6feb">VIDEO</Badge>}
              {active.hasTranscript && <Badge color="#22c55e">CAPS</Badge>}
            </span>
          )}

          <button onClick={() => setCreating(true)} style={btn('#1a1a1a', '#2a2a2a')} title="New project">
            + New
          </button>
        </>
      )}
    </div>
  );
};

const Badge: React.FC<{ color: string; children: React.ReactNode }> = ({ color, children }) => (
  <span style={{
    background: `${color}22`, border: `1px solid ${color}66`,
    color, borderRadius: 3, padding: '1px 5px', fontSize: 9, letterSpacing: 0.5,
  }}>{children}</span>
);

function btn(bg: string, border = '#1f6feb') {
  return {
    background: bg, border: `1px solid ${border}`,
    color: border === '#1f6feb' ? '#fff' : '#aaa',
    borderRadius: 4, padding: '3px 10px', fontSize: 11,
    fontFamily: 'inherit', cursor: 'pointer', flexShrink: 0,
  } as React.CSSProperties;
}
