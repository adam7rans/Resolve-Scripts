import React from 'react';
import type { MainTab } from '../../lib/constants';
import type { SidebarPanelProps } from './SidebarPanel.types';
import { TabBar } from '../Tabs';
import { LayerToggle, PillToggle } from '../LayerToggle';
import { ProjectBar } from '../ProjectBar';
import { ProjectStatusPanel } from '../ProjectStatusPanel';

export const SidebarHeader: React.FC<Pick<
  SidebarPanelProps,
  | 'projects'
  | 'activeProjectId'
  | 'activeProject'
  | 'projectStatus'
  | 'onSelectProject'
  | 'onCreateProject'
  | 'videoInfo'
  | 'audioInfo'
  | 'audioMode'
  | 'playing'
  | 'togglePlay'
  | 'muted'
  | 'setMuted'
  | 'bgLayerOn'
  | 'setBgLayerOn'
  | 'videoLayerOn'
  | 'setVideoLayerOn'
  | 'captionsLayerOn'
  | 'setCaptionsLayerOn'
  | 'musicLayerOn'
  | 'setMusicLayerOn'
  | 'activeGuide'
  | 'setActiveGuide'
  | 'cropToGuide'
  | 'setCropToGuide'
  | 'availableGuides'
  | 'mainTab'
  | 'setMainTab'
>> = (p) => (
  <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
    <ProjectBar projects={p.projects} activeId={p.activeProjectId} onSelect={p.onSelectProject} onCreate={p.onCreateProject} />
    <ProjectStatusPanel project={p.activeProject} status={p.projectStatus} />

    {(p.videoInfo || p.audioInfo) && (
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 10px', borderBottom: '1px solid #1f1f1f', background: '#0a0a0a' }}>
        <button onClick={p.togglePlay} style={{ background: '#1f6feb', color: '#fff', border: 'none', padding: '4px 12px', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit' }}>
          {p.playing ? 'Pause' : 'Play'}
        </button>
        <button
          onClick={() => p.setMuted((value) => !value)}
          title={p.muted ? 'Unmute' : 'Mute'}
          style={{ background: p.muted ? '#222' : '#1a1a1a', color: p.muted ? '#666' : '#ddd', border: '1px solid #2a2a2a', padding: '4px 8px', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit' }}
        >
          {p.muted ? '🔇' : '🔊'}
        </button>
        <span style={{ color: '#aaa', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {p.videoInfo?.name ?? p.audioInfo?.name}
        </span>
        <span style={{ color: '#666', fontSize: 11, marginLeft: 'auto', flexShrink: 0 }}>
          {p.videoInfo ? `${p.videoInfo.w}×${p.videoInfo.h} · ${p.videoInfo.duration.toFixed(1)}s` : p.audioInfo ? `audio · ${p.audioInfo.duration.toFixed(1)}s` : ''}
        </span>
      </div>
    )}

    <div style={{ display: 'flex', gap: 6, padding: '8px 10px', borderBottom: '1px solid #1f1f1f', background: '#0a0a0a', alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={{ color: '#666', textTransform: 'uppercase', letterSpacing: 1, marginRight: 4 }}>Layers</span>
      <LayerToggle label="Background" on={p.bgLayerOn} onClick={() => p.setBgLayerOn((value) => !value)} />
      {!p.audioMode && <LayerToggle label="Video" on={p.videoLayerOn} onClick={() => p.setVideoLayerOn((value) => !value)} />}
      <LayerToggle label="Captions" on={p.captionsLayerOn} onClick={() => p.setCaptionsLayerOn((value) => !value)} />
      <LayerToggle label="Music" on={p.musicLayerOn} onClick={() => p.setMusicLayerOn((value) => !value)} />
    </div>

    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: '8px 10px', borderBottom: '1px solid #1f1f1f', background: '#0a0a0a', alignItems: 'center' }}>
      <span style={{ color: '#666', textTransform: 'uppercase', letterSpacing: 1, marginRight: 4 }}>Guides</span>
      {p.availableGuides.map((guide) => (
        <PillToggle
          key={guide.key}
          label={guide.label}
          on={p.activeGuide === guide.key}
          onClick={() => p.setActiveGuide((current) => (current === guide.key ? null : guide.key))}
        />
      ))}
      <span style={{ width: 1, alignSelf: 'stretch', background: '#222', margin: '0 4px' }} />
      <PillToggle label="Crop" on={p.cropToGuide} onClick={() => p.setCropToGuide((value) => !value)} activeColor="#eb6f1f" />
    </div>

    <TabBar<MainTab>
      tabs={[
        { value: 'background', label: 'Background' },
        { value: 'video', label: p.audioMode ? 'Source' : 'Video' },
        { value: 'captions', label: 'Captions' },
        { value: 'audio', label: 'Audio' },
        { value: 'editor', label: 'Editor' },
        { value: 'export', label: 'Export' },
      ]}
      value={p.mainTab}
      onChange={p.setMainTab}
      variant="main"
    />
  </div>
);
