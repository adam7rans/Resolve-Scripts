import React, { useState } from 'react';
import { getProject, type ProjectMeta } from '../lib/projectApi';
import {
  DEFAULT_CAPTION_STYLE, DEFAULT_CAPTION_SHADER,
  type BackgroundParams, type DitherParams, type VideoShaderParams,
  type CaptionStyle, type CaptionShaderParams,
} from '../lib/types';
import { DEFAULT_LIMITER, type LimiterParams } from '../lib/AudioSource';
import { DEFAULT_MUSIC_PARAMS, type MusicParams } from '../lib/MusicPlayer';
import type { CaptionMode } from '../lib/transcript';
import { Section } from './Controls';

export interface ImportPresetProps {
  projects: ProjectMeta[];
  activeProjectId: string | null;
  setBg: React.Dispatch<React.SetStateAction<BackgroundParams>>;
  setBgDither: React.Dispatch<React.SetStateAction<DitherParams>>;
  setVid: React.Dispatch<React.SetStateAction<VideoShaderParams>>;
  setCaptionMode: React.Dispatch<React.SetStateAction<CaptionMode>>;
  setCaptionStyle: React.Dispatch<React.SetStateAction<CaptionStyle>>;
  setCaptionShader: React.Dispatch<React.SetStateAction<CaptionShaderParams>>;
  setLimiter: React.Dispatch<React.SetStateAction<LimiterParams>>;
  setMusic: React.Dispatch<React.SetStateAction<MusicParams>>;
  addToast: (message: string, type?: 'info' | 'success' | 'error') => number;
}

export const ImportPresetPanel: React.FC<ImportPresetProps> = ({
  projects, activeProjectId,
  setBg, setBgDither, setVid,
  setCaptionMode, setCaptionStyle, setCaptionShader,
  setLimiter, setMusic, addToast,
}) => {
  const [sourceId, setSourceId] = useState('');
  const [importing, setImporting] = useState(false);

  const otherProjects = projects.filter(p => p.id !== activeProjectId);

  const handleImport = async () => {
    if (!sourceId) return;
    setImporting(true);
    try {
      const proj = await getProject(sourceId);

      // Background: noise params + dither
      if (proj.background) setBg(proj.background);
      if (proj.backgroundDither) setBgDither(proj.backgroundDither);

      // Video shader: levels, tone, color, distort, dither
      if (proj.video) setVid(proj.video);

      // Captions: mode, font/style, shader
      if (proj.captionMode) setCaptionMode(proj.captionMode);
      if (proj.captionStyle) setCaptionStyle({ ...DEFAULT_CAPTION_STYLE, ...proj.captionStyle });
      if (proj.captionShader) setCaptionShader({ ...DEFAULT_CAPTION_SHADER, ...proj.captionShader });

      // Audio: limiter + sidechain ducking (preserve current volume/mute)
      if (proj.limiter) setLimiter({ ...DEFAULT_LIMITER, ...proj.limiter });
      if (proj.music?.sidechain) {
        setMusic(prev => ({
          ...prev,
          sidechain: { ...DEFAULT_MUSIC_PARAMS.sidechain, ...proj.music.sidechain },
        }));
      }

      const sourceName = otherProjects.find(p => p.id === sourceId)?.name ?? sourceId;
      addToast(`Imported settings from "${sourceName}"`, 'success');
    } catch {
      addToast('Failed to import settings', 'error');
    } finally {
      setImporting(false);
    }
  };

  if (!activeProjectId || otherProjects.length === 0) return null;

  return (
    <Section title="Import Preset">
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <select
          value={sourceId}
          onChange={e => setSourceId(e.target.value)}
          style={{
            flex: 1,
            background: '#0a0a0a',
            color: '#ddd',
            border: '1px solid #333',
            padding: '4px 6px',
            borderRadius: 3,
            fontFamily: 'inherit',
            fontSize: 12,
          }}
        >
          <option value="">Select project...</option>
          {otherProjects.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <button
          onClick={handleImport}
          disabled={!sourceId || importing}
          style={{
            padding: '4px 12px',
            background: sourceId && !importing ? '#1f6feb' : '#222',
            color: sourceId && !importing ? '#fff' : '#666',
            border: 'none',
            borderRadius: 3,
            cursor: sourceId && !importing ? 'pointer' : 'not-allowed',
            fontFamily: 'inherit',
            fontSize: 12,
            flexShrink: 0,
          }}
        >
          {importing ? 'Importing...' : 'Import'}
        </button>
      </div>
      <div style={{ color: '#555', fontSize: 11, marginTop: 4, lineHeight: 1.4 }}>
        Applies background, video, caption, and audio settings from another project.
      </div>
    </Section>
  );
};
