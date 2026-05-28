import type React from 'react';
import { PreviewArea } from '../PreviewArea';
import { SidebarPanel } from '../panels/SidebarPanel';
import { PreviewTimeline } from '../timeline/PreviewTimeline';

interface Props {
  previewAreaProps: React.ComponentProps<typeof PreviewArea>;
  timelineProps: React.ComponentProps<typeof PreviewTimeline>;
  sidebarProps: React.ComponentProps<typeof SidebarPanel>;
}

export const AppLayout: React.FC<Props> = ({ previewAreaProps, timelineProps, sidebarProps }) => (
  <div style={{ display: 'grid', gridTemplateColumns: '1fr 460px', height: '100vh', minHeight: 0, overflow: 'hidden', gap: 0 }}>
    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, height: '100vh' }}>
      <PreviewArea {...previewAreaProps} />
      <PreviewTimeline {...timelineProps} />
    </div>
    <SidebarPanel {...sidebarProps} />
  </div>
);
