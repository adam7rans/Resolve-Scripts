import React from 'react';
import {
  DEFAULT_VIDEO, DEFAULT_VIDEO_GRADIENT, DEFAULT_VIDEO_LEVELS, DEFAULT_VIDEO_TONE,
  DEFAULT_VIDEO_COLOR, DEFAULT_VIDEO_DISTORTION, DEFAULT_VIDEO_DITHER, DEFAULT_VIDEO_REZ,
  DEFAULT_VIDEO_POSITION, normalizeVideoShaderParams, type VideoShaderParams,
} from '../../lib/types';
import { VIDEO_PRESETS } from '../../lib/presets';
import { Section, Select } from '../Controls';
import {
  VideoGradientSection, VideoImageSection, VideoRezSection,
  VideoPositionSection, VideoDistortionSection, VideoDitherSection,
} from '../ParamControls';
import { TabBar } from '../Tabs';
import type { VideoShaderSubTab, VideoSubTab } from '../../lib/constants';

interface Props {
  vid: VideoShaderParams;
  setVid: React.Dispatch<React.SetStateAction<VideoShaderParams>>;
  videoSubTab: VideoSubTab;
  setVideoSubTab: React.Dispatch<React.SetStateAction<VideoSubTab>>;
  videoShaderSubTab: VideoShaderSubTab;
  setVideoShaderSubTab: React.Dispatch<React.SetStateAction<VideoShaderSubTab>>;
  invertFinalOutput: boolean;
  setInvertFinalOutput: (value: boolean) => void;
  videoInfo: { name: string; duration: number; w: number; h: number } | null;
  audioInfo: { name: string; duration: number } | null;
  audioMode: boolean;
  onPickFile: React.ChangeEventHandler<HTMLInputElement>;
  onImportNativeMedia: () => void;
}

export const VideoPanel: React.FC<Props> = ({
  vid, setVid, videoSubTab, setVideoSubTab, videoShaderSubTab, setVideoShaderSubTab, invertFinalOutput, setInvertFinalOutput, videoInfo, audioInfo, audioMode, onPickFile, onImportNativeMedia,
}) => (
  <>
    {!videoInfo && !audioInfo ? (
      <Section title="Import media">
        <div style={{ color: '#aaa', marginBottom: 8 }}>
          Move a video <em>or audio</em> file into this project. Audio files skip the visible
          video layer and unlock the audio-reactive Figure tab. You can still drop a file
          onto the preview if you want to copy it instead.
        </div>
        <button
          onClick={onImportNativeMedia}
          style={{
            display: 'inline-block', padding: '8px 14px', background: '#1f6feb',
            color: '#fff', borderRadius: 3, cursor: 'pointer', border: 'none',
            fontFamily: 'inherit',
          }}
        >
          Move video or audio into project…
        </button>
        <label style={{
          display: 'inline-block', marginLeft: 8, padding: '8px 14px', background: '#222',
          color: '#ddd', borderRadius: 3, cursor: 'pointer',
        }}>
          Copy via browser…
          <input type="file" accept="video/*,audio/*" onChange={onPickFile} style={{ display: 'none' }} />
        </label>
      </Section>
    ) : (
      <>
        <TabBar<VideoSubTab>
          tabs={[
            { value: 'shader', label: 'Shader', disabled: audioMode },
            { value: 'gradient', label: 'Gradient', disabled: audioMode },
            { value: 'settings', label: 'Settings' },
          ]}
          value={audioMode && videoSubTab !== 'settings' ? 'settings' : videoSubTab}
          onChange={setVideoSubTab}
          variant="sub"
        />
        {!audioMode && (
          <>
            {videoSubTab === 'gradient' && (
              <VideoGradientSection value={vid} onChange={setVid} onReset={() => setVid(v => ({ ...v, ...DEFAULT_VIDEO_GRADIENT }))} />
            )}
            {videoSubTab === 'shader' && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
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
                    <div style={{ color: '#888', textTransform: 'uppercase', letterSpacing: 1 }}>
                      Invert colors
                    </div>
                    <button
                      onClick={() => setInvertFinalOutput(!invertFinalOutput)}
                      style={{
                        width: 32, height: 16, borderRadius: 8, border: 'none', padding: 0, cursor: 'pointer',
                        background: invertFinalOutput ? '#1f6feb' : '#333', position: 'relative', transition: 'background 150ms',
                      }}
                    >
                      <span style={{
                        position: 'absolute', top: 2, left: invertFinalOutput ? 16 : 2,
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
                <TabBar<VideoShaderSubTab>
                  tabs={[
                    { value: 'image', label: 'Image' },
                    { value: 'rez', label: 'Rez' },
                    { value: 'distortion', label: 'Distort' },
                    { value: 'dither', label: 'Dither' },
                    { value: 'position', label: 'Position', divider: true },
                  ]}
                  value={videoShaderSubTab}
                  onChange={setVideoShaderSubTab}
                  variant="sub"
                />
                {videoShaderSubTab === 'image' && <VideoImageSection value={vid} onChange={setVid} onReset={() => setVid(v => ({ ...v, ...DEFAULT_VIDEO_LEVELS, ...DEFAULT_VIDEO_TONE, ...DEFAULT_VIDEO_COLOR }))} />}
                {videoShaderSubTab === 'rez' && <VideoRezSection value={vid} onChange={setVid} onReset={() => setVid(v => ({ ...v, ...DEFAULT_VIDEO_REZ }))} />}
                {videoShaderSubTab === 'distortion' && <VideoDistortionSection value={vid} onChange={setVid} onReset={() => setVid(v => ({ ...v, ...DEFAULT_VIDEO_DISTORTION }))} />}
                {videoShaderSubTab === 'dither' && <VideoDitherSection value={vid} onChange={setVid} onReset={() => setVid(v => ({ ...v, ...DEFAULT_VIDEO_DITHER }))} />}
                {videoShaderSubTab === 'position' && <VideoPositionSection value={vid} onChange={setVid} onReset={() => setVid(v => ({ ...v, ...DEFAULT_VIDEO_POSITION }))} />}
              </>
            )}
          </>
        )}
        {videoSubTab === 'settings' && (
          <>
            <Section title="Source">
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ color: '#aaa', minWidth: 0 }}>
                  {videoInfo
                    ? <>{videoInfo.name}<br />{videoInfo.w}×{videoInfo.h} · {videoInfo.duration.toFixed(2)}s</>
                    : <>{audioInfo!.name}<br />audio-only · {audioInfo!.duration.toFixed(2)}s</>}
                </div>
                <button
                  onClick={onImportNativeMedia}
                  style={{
                    flexShrink: 0,
                    display: 'inline-block',
                    padding: '6px 12px',
                    background: '#222',
                    color: '#ddd',
                    borderRadius: 3,
                    cursor: 'pointer',
                    border: 'none',
                    fontFamily: 'inherit',
                  }}
                >
                  Replace by moving file…
                </button>
              </div>
            </Section>
            {!audioMode && (
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
                    if (p) setVid(normalizeVideoShaderParams(p.params));
                  }}
                />
              </Section>
            )}
          </>
        )}
      </>
    )}
  </>
);
