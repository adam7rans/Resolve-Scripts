import React from 'react';
import type { ProjectTaskStatus } from '../lib/constants';
import type { ProjectMeta } from '../lib/projectApi';

export const ProjectStatusPanel: React.FC<{ project: ProjectMeta | undefined; status: ProjectTaskStatus }> = ({ project, status }) => {
  // Only show the panel for actionable states — hide once a load/save succeeds
  if (status.kind === 'success') return null;
  const color = status.kind === 'error' ? '#ef4444' : status.kind === 'progress' ? '#4a90d9' : '#666';
  return (
    <div style={{ padding: '8px 10px', borderBottom: '1px solid #1f1f1f', background: '#0a0a0a' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, boxShadow: status.kind === 'progress' ? `0 0 8px ${color}` : 'none', flexShrink: 0 }} />
        <span style={{ color: '#aaa', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {project ? status.message : 'No project selected'}
        </span>
        {typeof status.progress === 'number' && (
          <span style={{ color: '#666', fontSize: 11, marginLeft: 'auto', flexShrink: 0 }}>{status.progress}%</span>
        )}
      </div>
      {project && status.detail && (
        <div style={{ color: '#555', fontSize: 10, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {status.detail}
        </div>
      )}
    </div>
  );
};
