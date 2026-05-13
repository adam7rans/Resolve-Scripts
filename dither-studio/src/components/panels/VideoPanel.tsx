import React from 'react';
import {
  DEFAULT_VIDEO, DEFAULT_VIDEO_GRADIENT, DEFAULT_VIDEO_LEVELS, DEFAULT_VIDEO_TONE,
  DEFAULT_VIDEO_COLOR, DEFAULT_VIDEO_DISTORTION, DEFAULT_VIDEO_DITHER,
  DEFAULT_VIDEO_POSITION, type VideoShaderParams,
} from '../../lib/types';
import { VIDEO_PRESETS } from '../../lib/presets';
import { Section, Select } from '../Controls';
import {
  VideoGradientSection, VideoLevelsSection, VideoToneSection, VideoColorSection,
  VideoPositionSection, VideoDistortionSection, VideoDitherSection,
} from '../ParamControls';
import { TabBar } from '../Tabs';
import type { VideoSubTab } from '../../lib/constants';

interface Props {
  vid: VideoShaderParams;
  setVid: React.Dispatch<React.SetStateAction<VideoShaderParams>>;
  videoSubTab: VideoSubTab;
  setVideoSubTab: React.Dispatch<React.SetStateAction<VideoSubTab>>;
  videoInfo: { name: string; duration: number; w: number; h: number } | null;
  audioInfo: { name: string; duration: number } | null;
  audioMode: boolean;
  onPickFile: React.ChangeEventHandler<HTMLInputElement>;
}

export const VideoPanel: React.FC<Props> = ({
  vid, setVid, videoSubTab, setVideoSubTab, videoInfo, audioInfo, audioMode, onPickFile,
}) => (
  <>
    {!videoInfo && !audioInfo ? (
      <Section title="Import media">
        <div style={{ color: '#aaa', marginBottom: 8 }}>
          Choose a video <em>or audio</em> file. Audio files skip the visible video layer
          and unlock the audio-reactive Figure tab. You can also drop a file onto the preview.
        </div>
        <label style={{
          display: 'inline-block', padding: '8px 14px', background: '#1f6feb',
          color: '#fff', borderRadius: 3, cursor: 'pointer',
        }}>
          Choose video or audio…
          <input type="file" accept="video/*,audio/*" onChange={onPickFile} style={{ display: 'none' }} />
        </label>
      </Section>
    ) : (
      <>
        <Section title="Source">
          <div style={{ color: '#aaa', marginBottom: 6 }}>
            {videoInfo
              ? <>{videoInfo.name}<br />{videoInfo.w}×{videoInfo.h} · {videoInfo.duration.toFixed(2)}s</>
              : <>{audioInfo!.name}<br />audio-only · {audioInfo!.duration.toFixed(2)}s</>}
          </div>
          <label style={{
            display: 'inline-block', padding: '6px 12px', background: '#222',
            color: '#ddd', borderRadius: 3, cursor: 'pointer',
          }}>
            Replace…
            <input type="file" accept="video/*,audio/*" onChange={onPickFile} style={{ display: 'none' }} />
          </label>
        </Section>
        {!audioMode && (
          <>
            <Section title="Preset">
              <Select
                label="load"
                value={''}
                options={[
                  { label: '— pick a preset —', value: '' },
                  ...VIDEO_PRESETS.map((p) => ({ label: p.name, value: p.name })),
                ]}
                onChange={(name) => {
                  const p = VIDEO_PRESETS.find((x) => x.name === name);
                  if (p) setVid(p.params);
                }}
              />
            </Section>
            <VideoGradientSection value={vid} onChange={setVid} onReset={() => setVid(v => ({ ...v, ...DEFAULT_VIDEO_GRADIENT }))} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, opacity: vid.shaderEnabled ? 1 : 0.5, transition: 'opacity 150ms' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ color: '#888', textTransform: 'uppercase', letterSpacing: 1 }}>
                  Shader
                </div>
                <button
                  onClick={() => setVid(v => ({ ...v, shaderEnabled: !v.shaderEnabled }))}
                  style={{
                    width: 32, height: 16, borderRadius: 8, border: 'none', padding: 0, cursor: 'pointer',
                    background: vid.shaderEnabled ? '#1f6feb' : '#333', position: 'relative', transition: 'background 150ms',
                  }}
                >
                  <span style={{
                    position: 'absolute', top: 2, left: vid.shaderEnabled ? 16 : 2,
                    width: 12, height: 12, borderRadius: 6, background: '#fff',
                    transition: 'left 150ms',
                  }} />
                </button>
              </div>
              <button
                onClick={() => setVid(DEFAULT_VIDEO)}
                style={{
                  padding: '2px 8px',
                  background: 'transparent',
                  color: '#666',
                  border: '1px solid #333',
                  borderRadius: 3,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontSize: 10,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#aaa'; e.currentTarget.style.borderColor = '#555'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = '#666'; e.currentTarget.style.borderColor = '#333'; }}
              >
                Restore all
              </button>
            </div>
            <TabBar<VideoSubTab>
              tabs={[
                { value: 'levels', label: 'Levels' },
                { value: 'tone', label: 'Tone' },
                { value: 'color', label: 'Color' },
                { value: 'distortion', label: 'Distort' },
                { value: 'dither', label: 'Dither' },
                { value: 'position', label: 'Position', divider: true },
              ]}
              value={videoSubTab}
              onChange={setVideoSubTab}
              variant="sub"
            />
            {videoSubTab === 'levels' && <VideoLevelsSection value={vid} onChange={setVid} onReset={() => setVid(v => ({ ...v, ...DEFAULT_VIDEO_LEVELS }))} />}
            {videoSubTab === 'tone' && <VideoToneSection value={vid} onChange={setVid} onReset={() => setVid(v => ({ ...v, ...DEFAULT_VIDEO_TONE }))} />}
            {videoSubTab === 'color' && <VideoColorSection value={vid} onChange={setVid} onReset={() => setVid(v => ({ ...v, ...DEFAULT_VIDEO_COLOR }))} />}
            {videoSubTab === 'distortion' && <VideoDistortionSection value={vid} onChange={setVid} onReset={() => setVid(v => ({ ...v, ...DEFAULT_VIDEO_DISTORTION }))} />}
            {videoSubTab === 'dither' && <VideoDitherSection value={vid} onChange={setVid} onReset={() => setVid(v => ({ ...v, ...DEFAULT_VIDEO_DITHER }))} />}
            {videoSubTab === 'position' && <VideoPositionSection value={vid} onChange={setVid} onReset={() => setVid(v => ({ ...v, ...DEFAULT_VIDEO_POSITION }))} />}
          </>
        )}
      </>
    )}
  </>
);
