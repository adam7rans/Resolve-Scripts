import React from 'react';
import type { SidebarPanelProps } from './SidebarPanel.types';
import { SidebarHeader } from './SidebarHeader';
import { SidebarContent } from './SidebarContent';

export const SidebarPanel: React.FC<SidebarPanelProps> = (props) => (
  <div style={{ borderLeft: '1px solid #1f1f1f', display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, height: '100vh', background: '#0c0c0c' }}>
    <SidebarHeader {...props} />
    <SidebarContent {...props} />
  </div>
);
