import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BackgroundRenderer } from '../lib/BackgroundRenderer';
import { VideoRenderer } from '../lib/VideoRenderer';
import { AudioSource, type AudioBands } from '../lib/AudioSource';
import { MusicPlayer, DEFAULT_MUSIC_PARAMS, type MusicParams } from '../lib/MusicPlayer';
import {
  DEFAULT_BACKGROUND, DEFAULT_DITHER, DEFAULT_VIDEO, DEFAULT_EXPORT,
  DEFAULT_CAPTION_STYLE, DEFAULT_AUDIO_REACTIVITY,
  type BackgroundParams, type DitherParams, type VideoShaderParams, type ExportParams, type CaptionStyle,
  type AudioReactivityParams,
} from '../lib/types';
import { PRESETS, VIDEO_PRESETS } from '../lib/presets';
import { canvasToPngBlob, frameNumber, seekVideoTo } from '../lib/exporter';
import { drawCaptionsToCanvas } from '../lib/captionCanvas';
import { Section, Select, Slider, Toggle, ColorInput } from './Controls';
import {
  BackgroundControls, DitherControls,
  VideoLevelsSection, VideoToneSection, VideoColorSection,
  VideoDistortionSection, VideoDitherSection,
} from './ParamControls';
import { ExportPanel } from './ExportPanel';
import { TabBar } from './Tabs';
import { Captions } from './Captions';
import { parseTranscript, type CaptionMode, type TranscriptData } from '../lib/transcript';
import { ProjectBar } from './ProjectBar';
import { StatusToast, type Toast } from './StatusToast';
import {
  listProjects, createProject, getProject, saveSettings,
  uploadVideo, uploadAudio, uploadCaption, uploadMusic,
  getVideoUrl, getAudioUrl, getMusicUrl, getTranscript, openEventStream,
  createProjectExport, uploadExportFrame, finishProjectExport,
  type ProjectMeta,
} from '../lib/projectApi';

type MainTab = 'background' | 'video' | 'reactivity' | 'music' | 'export';
type BgSubTab = 'noise' | 'dither';
type VideoSubTab = 'levels' | 'tone' | 'color' | 'distortion' | 'dither';

const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.m4a', '.flac', '.ogg', '.opus', '.aac'];
function isAudioFile(file: File): boolean {
  if (file.type && file.type.startsWith('audio/')) return true;
  const lower = file.name.toLowerCase();
  return AUDIO_EXTENSIONS.some((ext) => lower.endsWith(ext));
}
type ProjectTaskStatus = {
  kind: 'idle' | 'progress' | 'success' | 'error';
  message: string;
  detail?: string;
  progress?: number;
};

const GUIDES = [
  { key: '1080x1350', w: 1080, h: 1350, label: '1080×1350' },
  { key: '1080x1080', w: 1080, h: 1080, label: '1080×1080' },
  { key: '1920x1080', w: 1920, h: 1080, label: '1920×1080' },
  { key: '1080x1920', w: 1080, h: 1920, label: '1080×1920' },
] as const;
type GuideKey = (typeof GUIDES)[number]['key'];
const CAPTION_FONT_OPTIONS = [
  { label: 'Source Code Pro', value: '"Source Code Pro", ui-monospace, "SF Mono", Menlo, Consolas, monospace' },
  { label: 'System mono', value: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace' },
  { label: 'System sans', value: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  { label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Impact', value: 'Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif' },
];

function isVerticalVideo(info: { w: number; h: number } | null) {
  return !!info && info.h > info.w;
}

function fitRect(pw: number, ph: number, gw: number, gh: number) {
  if (pw <= 0 || ph <= 0) return { x: 0, y: 0, w: 0, h: 0 };
  const scale = Math.min(pw / gw, ph / gh);
  const w = gw * scale;
  const h = gh * scale;
  return { x: (pw - w) / 2, y: (ph - h) / 2, w, h };
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

function resolveExportRange(params: ExportParams, totalDuration: number | null) {
  const total = Math.max(0.01, totalDuration ?? (params.endSecond ?? params.duration ?? 10));
  const minGap = 0.01;
  const start = clamp(params.startSecond ?? 0, 0, Math.max(0, total - minGap));
  const fallbackEnd = params.endSecond ?? Math.min(total, start + Math.max(minGap, params.duration || minGap));
  const end = clamp(fallbackEnd, start + minGap, total);
  return { start, end, total, duration: end - start };
}

function guideRectInVideoFrame(
  frame: { x: number; y: number; w: number; h: number },
  video: { w: number; h: number } | null,
  guide: { w: number; h: number },
) {
  if (!video) return fitRect(frame.w, frame.h, guide.w, guide.h);
  const scale = video.h > video.w
    ? frame.w / video.w
    : Math.min(frame.w / guide.w, frame.h / guide.h);
  const w = guide.w * scale;
  const h = guide.h * scale;
  return {
    x: frame.x + (frame.w - w) / 2,
    y: frame.y + (frame.h - h) / 2,
    w,
    h,
  };
}

const LayerToggle: React.FC<{ label: string; on: boolean; onClick: () => void }> = ({ label, on, onClick }) => (
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

const PillToggle: React.FC<{ label: string; on: boolean; onClick: () => void; activeColor?: string }> = ({ label, on, onClick, activeColor = '#1f6feb' }) => (
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

const ProjectStatusPanel: React.FC<{ project: ProjectMeta | undefined; status: ProjectTaskStatus }> = ({ project, status }) => {
  const color = status.kind === 'success' ? '#22c55e' : status.kind === 'error' ? '#ef4444' : status.kind === 'progress' ? '#4a90d9' : '#666';
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
      {project && (
        <div style={{ color: '#555', fontSize: 10, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {status.detail ?? `Folder: projects/${project.id}`}
        </div>
      )}
    </div>
  );
};
const CaptionFontControls: React.FC<{ value: CaptionStyle; onChange: (v: CaptionStyle) => void }> = ({ value, onChange }) => {
  const set = (patch: Partial<CaptionStyle>) => onChange({ ...value, ...patch });
  return (
    <Section title="Caption font">
      <Select
        label="family"
        value={value.fontFamily}
        options={CAPTION_FONT_OPTIONS}
        onChange={(fontFamily) => set({ fontFamily })}
      />
      <Slider label="line size" value={value.lineFontSize} min={12} max={96} step={1} onChange={(v) => set({ lineFontSize: Math.round(v) })} />
      <Slider label="word size" value={value.wordFontSize} min={16} max={160} step={1} onChange={(v) => set({ wordFontSize: Math.round(v) })} />
      <Slider label="weight" value={value.fontWeight} min={300} max={900} step={100} onChange={(v) => set({ fontWeight: Math.round(v / 100) * 100 })} />
      <Slider label="tracking" value={value.letterSpacing} min={0} max={0.2} step={0.005} onChange={(v) => set({ letterSpacing: v })} />
      <Slider label="line height" value={value.lineHeight} min={0.9} max={2.2} step={0.05} onChange={(v) => set({ lineHeight: v })} />
      <Slider label="line width %" value={value.lineMaxWidth} min={10} max={100} step={1} onChange={(v) => set({ lineMaxWidth: Math.round(v) })} />
      <Slider label="horizontal pos" value={value.horizontalPosition} min={0} max={100} step={1} onChange={(v) => set({ horizontalPosition: Math.round(v) })} />
      <Slider label="vertical pos" value={value.verticalPosition} min={0} max={100} step={1} onChange={(v) => set({ verticalPosition: Math.round(v) })} />
      <Select
        label="justify"
        value={value.textAlign}
        options={[
          { label: 'left', value: 'left' },
          { label: 'center', value: 'center' },
          { label: 'right', value: 'right' },
        ]}
        onChange={(textAlign) => set({ textAlign: textAlign as CaptionStyle['textAlign'] })}
      />
      <Select
        label="underline"
        value={value.underlineMode ?? (value.underlineEnabled === false ? 'off' : 'draw')}
        options={[
          { label: 'off', value: 'off' },
          { label: 'draw', value: 'draw' },
          { label: 'fade', value: 'fade' },
        ]}
        onChange={(underlineMode) => set({ underlineMode: underlineMode as CaptionStyle['underlineMode'] })}
      />
      <Slider
        label="fade ms"
        value={value.underlineFadeMs ?? 150}
        min={0}
        max={300}
        step={10}
        ticks={[100, 200]}
        onChange={(underlineFadeMs) => set({ underlineFadeMs: Math.round(underlineFadeMs) })}
      />
      <Toggle label="word highlight" value={value.wordHighlightEnabled} onChange={(wordHighlightEnabled) => set({ wordHighlightEnabled })} />
      <Select
        label="line split"
        value={value.lineSplitMode ?? 'sentence'}
        options={[
          { label: 'sentence (.!?)',  value: 'sentence' },
          { label: 'balanced',        value: 'balanced' },
          { label: 'max words',       value: 'words' },
          { label: 'max chars',       value: 'chars' },
          { label: 'max seconds',     value: 'duration' },
        ]}
        onChange={(lineSplitMode) => set({ lineSplitMode: lineSplitMode as CaptionStyle['lineSplitMode'] })}
      />
      {value.lineSplitMode === 'balanced' && (
        <Slider
          label="target words"
          value={value.lineTargetWords ?? 6}
          min={2} max={15} step={1}
          ticks={[4, 6, 8]}
          onChange={(lineTargetWords) => set({ lineTargetWords: Math.max(1, Math.round(lineTargetWords)) })}
        />
      )}
      {value.lineSplitMode === 'words' && (
        <Slider
          label="max words"
          value={value.lineMaxWords ?? 8}
          min={1} max={20} step={1}
          onChange={(lineMaxWords) => set({ lineMaxWords: Math.max(1, Math.round(lineMaxWords)) })}
        />
      )}
      {value.lineSplitMode === 'chars' && (
        <Slider
          label="max chars"
          value={value.lineMaxChars ?? 60}
          min={10} max={140} step={1}
          ticks={[40, 60, 80]}
          onChange={(lineMaxChars) => set({ lineMaxChars: Math.max(1, Math.round(lineMaxChars)) })}
        />
      )}
      {value.lineSplitMode === 'duration' && (
        <Slider
          label="max seconds"
          value={value.lineMaxSeconds ?? 3}
          min={0.5} max={10} step={0.1}
          ticks={[1, 2, 3, 5]}
          onChange={(lineMaxSeconds) => set({ lineMaxSeconds: Math.max(0.1, lineMaxSeconds) })}
        />
      )}
    </Section>
  );
};


const ReactivityControls: React.FC<{
  value: AudioReactivityParams;
  onChange: (v: AudioReactivityParams) => void;
  hasAudio: boolean;
  bandsRef: React.MutableRefObject<AudioBands>;
}> = ({ value, onChange, hasAudio, bandsRef }) => {
  const set = (patch: Partial<AudioReactivityParams>) => onChange({ ...value, ...patch });

  // Live band display — re-render at ~30fps so the user can see what the
  // signal is doing while they tweak gains.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!hasAudio) return;
    const id = setInterval(() => setTick((n) => n + 1), 33);
    return () => clearInterval(id);
  }, [hasAudio]);
  const b = bandsRef.current;

  return (
    <>
      {!hasAudio && (
        <div style={{ color: '#aaa', fontSize: 11, padding: '4px 0 8px', borderBottom: '1px solid #1f1f1f', marginBottom: 8 }}>
          Load an audio file (Video tab → Choose video or audio…) to enable audio-reactive modulation.
        </div>
      )}
      <Section title="Live levels">
        <BandMeter label="rms"  value={b.rms}  />
        <BandMeter label="low"  value={b.low}  />
        <BandMeter label="mid"  value={b.mid}  />
        <BandMeter label="high" value={b.high} />
      </Section>
      <Section title="Reactivity">
        <Toggle label="enabled" value={value.enabled} onChange={(enabled) => set({ enabled })} />
        <Slider label="gain"    value={value.gain}    min={0} max={4} step={0.05} onChange={(gain) => set({ gain })} />
        <Slider label="attack"  value={value.attack}  min={0} max={1} step={0.01} onChange={(attack) => set({ attack })} />
        <Slider label="release" value={value.release} min={0} max={1} step={0.01} onChange={(release) => set({ release })} />
      </Section>
      <Section title="Background → audio">
        <Slider label="speed (rms)"      value={value.modSpeed}      min={0} max={2} step={0.01} onChange={(modSpeed) => set({ modSpeed })} />
        <Slider label="brightness (rms)" value={value.modBrightness} min={0} max={2} step={0.01} onChange={(modBrightness) => set({ modBrightness })} />
      </Section>
    </>
  );
};

const BandMeter: React.FC<{ label: string; value: number }> = ({ label, value }) => {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
      <span style={{ width: 36, color: '#888', fontSize: 11 }}>{label}</span>
      <div style={{ flex: 1, height: 8, background: '#1a1a1a', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${pct.toFixed(1)}%`, height: '100%', background: '#1f6feb', transition: 'width 60ms linear' }} />
      </div>
      <span style={{ width: 36, color: '#666', fontSize: 10, textAlign: 'right' }}>{value.toFixed(2)}</span>
    </div>
  );
};

const MusicControls: React.FC<{
  value: MusicParams;
  onChange: (v: MusicParams) => void;
  hasMusic: boolean;
  musicName: string | null;
  onPickFile: (file: File) => void;
  onClear: () => void;
  /** Live duck gain (0..1) for the meter. */
  duckGainRef: React.MutableRefObject<number>;
  /** Live speech RMS (0..1) for the meter. */
  speechRmsRef: React.MutableRefObject<number>;
}> = ({ value, onChange, hasMusic, musicName, onPickFile, onClear, duckGainRef, speechRmsRef }) => {
  const set = (patch: Partial<MusicParams>) => onChange({ ...value, ...patch });
  const setSc = (patch: Partial<MusicParams['sidechain']>) =>
    onChange({ ...value, sidechain: { ...value.sidechain, ...patch } });
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Re-render at ~30fps so the live meters update.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 33);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      <Section title="File">
        <input
          ref={fileInputRef}
          type="file"
          accept={AUDIO_EXTENSIONS.join(',') + ',audio/*'}
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onPickFile(f);
            if (fileInputRef.current) fileInputRef.current.value = '';
          }}
        />
        {hasMusic ? (
          <>
            <div style={{ color: '#aaa', fontSize: 11, marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              ♪ {musicName ?? 'music'}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={() => fileInputRef.current?.click()}
                style={{ flex: 1, background: '#1a1a1a', color: '#ddd', border: '1px solid #2a2a2a', padding: '6px 10px', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Replace music…
              </button>
              <button
                onClick={onClear}
                style={{ background: '#1a1a1a', color: '#aaa', border: '1px solid #2a2a2a', padding: '6px 10px', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Remove
              </button>
            </div>
          </>
        ) : (
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{ width: '100%', background: '#1f6feb', color: '#fff', border: 'none', padding: '6px 10px', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Upload music…
          </button>
        )}
      </Section>

      <Section title="Mix">
        <Slider
          label="volume"
          value={value.volume}
          min={0} max={1} step={0.01}
          onChange={(volume) => set({ volume })}
        />
        <Toggle label="muted" value={value.muted} onChange={(muted) => set({ muted })} />
      </Section>

      <Section title="Sidechain (speech ducks music)">
        <Toggle label="enabled" value={value.sidechain.enabled} onChange={(enabled) => setSc({ enabled })} />
        <Slider
          label="threshold"
          value={value.sidechain.threshold}
          min={0} max={1} step={0.01}
          onChange={(threshold) => setSc({ threshold })}
        />
        <Slider
          label="amount"
          value={value.sidechain.amount}
          min={0} max={1} step={0.01}
          onChange={(amount) => setSc({ amount })}
        />
        <Slider
          label="attack ms"
          value={value.sidechain.attackMs}
          min={5} max={500} step={5}
          ticks={[50, 100, 200]}
          onChange={(attackMs) => setSc({ attackMs: Math.round(attackMs) })}
        />
        <Slider
          label="release ms"
          value={value.sidechain.releaseMs}
          min={20} max={2000} step={10}
          ticks={[200, 500, 1000]}
          onChange={(releaseMs) => setSc({ releaseMs: Math.round(releaseMs) })}
        />
        <BandMeter label="speech" value={speechRmsRef.current} />
        {/* duck gain is 0..1 where 1 = no ducking; show as inverted "ducking %" */}
        <BandMeter label="duck" value={1 - duckGainRef.current} />
      </Section>
    </>
  );
};

export const App: React.FC = () => {
  // ---------- shared state ----------
  const [mainTab, setMainTab] = useState<MainTab>('background');
  const [bgSubTab, setBgSubTab] = useState<BgSubTab>('noise');
  const [videoSubTab, setVideoSubTab] = useState<VideoSubTab>('levels');

  // visible layers — both can be on at once (video composites over background
  // wherever the video shader's alpha < 1)
  const [bgLayerOn, setBgLayerOn] = useState(true);
  const [videoLayerOn, setVideoLayerOn] = useState(true);
  const [captionsLayerOn, setCaptionsLayerOn] = useState(true);

  // audio-only mode state (parallel to videoInfo)
  const [audioInfo, setAudioInfo] = useState<{ name: string; duration: number } | null>(null);
  const [audioReactivity, setAudioReactivity] = useState<AudioReactivityParams>(DEFAULT_AUDIO_REACTIVITY);

  // backing music (separate audio stream)
  const [music, setMusic] = useState<MusicParams>(DEFAULT_MUSIC_PARAMS);
  const [musicLayerOn, setMusicLayerOn] = useState(true);
  const [musicInfo, setMusicInfo] = useState<{ name: string } | null>(null);

  // transcript / captions
  const [transcript, setTranscript] = useState<TranscriptData | null>(null);
  const [transcriptName, setTranscriptName] = useState<string | null>(null);
  const [captionMode, setCaptionMode] = useState<CaptionMode>('line');
  const [captionStyle, setCaptionStyle] = useState<CaptionStyle>(DEFAULT_CAPTION_STYLE);

  // composition guides — only one can be active at a time
  const [activeGuide, setActiveGuide] = useState<GuideKey | null>(null);
  const [cropToGuide, setCropToGuide] = useState(false);
  const [previewSize, setPreviewSize] = useState({ w: 0, h: 0 });

  // background params
  const [bg, setBg] = useState<BackgroundParams>(DEFAULT_BACKGROUND);
  const [bgDither, setBgDither] = useState<DitherParams>(DEFAULT_DITHER);
  const [bgExport, setBgExport] = useState<ExportParams>({ ...DEFAULT_EXPORT, filenamePrefix: 'bg' });

  // video params (single combined shader — see src/shaders/videoShader.ts)
  const [vid, setVid] = useState<VideoShaderParams>(DEFAULT_VIDEO);
  const [vidExport, setVidExport] = useState<ExportParams>({ ...DEFAULT_EXPORT, filenamePrefix: 'talking' });
  const [videoInfo, setVideoInfo] = useState<{ name: string; duration: number; w: number; h: number } | null>(null);
  const [playing, setPlaying] = useState(false);
  const [playheadSecond, setPlayheadSecond] = useState(0);
  const [muted, setMuted] = useState(false);

  // ---------- project management ----------
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [projectStatus, setProjectStatus] = useState<ProjectTaskStatus>({ kind: 'idle', message: 'Create or select a project' });
  const activeProjectIdRef = useRef<string | null>(null);
  useEffect(() => { activeProjectIdRef.current = activeProjectId; }, [activeProjectId]);

  // ---------- toasts ----------
  const toastCounter = useRef(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const addToast = useCallback((message: string, type: Toast['type'] = 'info', sticky = false) => {
    const id = ++toastCounter.current;
    setToasts(t => [...t.slice(-4), { id, message, type, sticky }]);
    return id;
  }, []);
  const updateToast = useCallback((id: number, message: string, type: Toast['type']) => {
    setToasts(t => t.map(x => x.id === id ? { ...x, message, type, sticky: false } : x));
  }, []);
  const dismissToast = useCallback((id: number) => setToasts(t => t.filter(x => x.id !== id)), []);

  // ---------- DOM / WebGL refs ----------
  const previewWrapRef = useRef<HTMLDivElement | null>(null);
  const bgCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const bgRendererRef = useRef<BackgroundRenderer | null>(null);
  const videoRendererRef = useRef<VideoRenderer | null>(null);
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const audioSourceRef = useRef<AudioSource | null>(null);
  const mediaElRef = useRef<HTMLMediaElement | null>(null);
  const videoBlobUrlRef = useRef<string | null>(null);
  const audioBlobUrlRef = useRef<string | null>(null);
  // music
  const musicElRef = useRef<HTMLAudioElement | null>(null);
  const musicPlayerRef = useRef<MusicPlayer | null>(null);
  const musicDuckGainRef = useRef<number>(1);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef(performance.now());
  const exportingRef = useRef(false);
  const lastBandsRef = useRef<AudioBands>({ rms: 0, low: 0, mid: 0, high: 0 });
  const speechRmsRef = useRef<number>(0);
  const previewFrame = videoInfo
    ? fitRect(previewSize.w, previewSize.h, videoInfo.w, videoInfo.h)
    : { x: 0, y: 0, w: previewSize.w, h: previewSize.h };
  const verticalVideo = isVerticalVideo(videoInfo);
  const availableGuides = verticalVideo ? GUIDES.filter((g) => g.key !== '1920x1080') : GUIDES;

  // ---------- init renderers once ----------
  useEffect(() => {
    bgRendererRef.current = new BackgroundRenderer(bgCanvasRef.current!, bg, bgDither);
    videoRendererRef.current = new VideoRenderer(videoCanvasRef.current!, vid);

    const fit = () => {
      const el = previewWrapRef.current;
      if (!el) return;
      const w = Math.max(1, el.clientWidth);
      const h = Math.max(1, el.clientHeight);
      setPreviewSize({ w, h });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(previewWrapRef.current!);

    const loop = () => {
      if (!exportingRef.current) {
        const t = (performance.now() - startRef.current) / 1000;

        // Read audio bands once per frame (live AnalyserNode).
        const audio = audioSourceRef.current;
        const ar = audioReactivityRef.current;
        const bands: AudioBands = audio
          ? audio.getBands(ar.attack, ar.release)
          : { rms: 0, low: 0, mid: 0, high: 0 };
        lastBandsRef.current = bands;
        const g = ar.gain;

        if (bgLayerOnRef.current && bgRendererRef.current) {
          if (audio && ar.enabled) {
            bgRendererRef.current.setModulation({
              speed: bands.rms * g * ar.modSpeed * 1.5,
              brightness: bands.rms * g * ar.modBrightness,
            });
          } else {
            bgRendererRef.current.setModulation({ speed: 0, brightness: 0 });
          }
          bgRendererRef.current.renderFrame(t);
        }
        if (videoLayerOnRef.current) {
          videoRendererRef.current?.renderFrame();
        }

        // Sidechain: read latest speech RMS (already smoothed) and apply to
        // the music player's duckGain. Always update so the duck releases back
        // to 1.0 even when speech is silent.
        const player = musicPlayerRef.current;
        if (player) {
          const m = musicRef.current;
          const rms = bands.rms;
          speechRmsRef.current = rms;
          musicDuckGainRef.current = player.applySidechain(rms, m.sidechain);
        }
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      if (videoBlobUrlRef.current) URL.revokeObjectURL(videoBlobUrlRef.current);
      if (audioBlobUrlRef.current) URL.revokeObjectURL(audioBlobUrlRef.current);
      audioSourceRef.current?.dispose();
      bgRendererRef.current?.dispose();
      videoRendererRef.current?.dispose();
      bgRendererRef.current = null;
      videoRendererRef.current = null;
      audioSourceRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // mirror state into refs the raf loop reads
  const bgLayerOnRef = useRef(bgLayerOn);
  const videoLayerOnRef = useRef(videoLayerOn);
  const audioReactivityRef = useRef(audioReactivity);
  const musicRef = useRef(music);
  useEffect(() => { bgLayerOnRef.current = bgLayerOn; }, [bgLayerOn]);
  useEffect(() => { videoLayerOnRef.current = videoLayerOn; }, [videoLayerOn]);
  useEffect(() => { audioReactivityRef.current = audioReactivity; }, [audioReactivity]);
  useEffect(() => { musicRef.current = music; }, [music]);
  const playheadRef = useRef(playheadSecond);
  useEffect(() => { playheadRef.current = playheadSecond; }, [playheadSecond]);

  // Push music volume/mute into the player whenever they change. Sidechain
  // params are picked up live each frame from musicRef.
  useEffect(() => {
    musicPlayerRef.current?.setVolume(music.volume, music.muted || !musicLayerOn);
    if (!music.sidechain.enabled) {
      musicPlayerRef.current?.resetDuck();
      musicDuckGainRef.current = 1;
    }
  }, [music.volume, music.muted, music.sidechain.enabled, musicLayerOn]);

  // push parameter updates
  useEffect(() => { bgRendererRef.current?.setParams(bg); }, [bg]);
  useEffect(() => { bgRendererRef.current?.setDitherParams(bgDither); }, [bgDither]);
  useEffect(() => { videoRendererRef.current?.setParams(vid); }, [vid]);
  useEffect(() => {
    if (videoElRef.current) videoElRef.current.muted = muted;
    if (audioElRef.current) audioElRef.current.muted = muted;
    audioSourceRef.current?.setMuted(muted);
  }, [muted]);
  useEffect(() => {
    const w = Math.max(1, Math.floor(previewFrame.w));
    const h = Math.max(1, Math.floor(previewFrame.h));
    bgRendererRef.current?.setSize(w, h);
    videoRendererRef.current?.setSize(w, h);
  }, [previewFrame.w, previewFrame.h]);
  useEffect(() => {
    if (!verticalVideo || activeGuide !== '1920x1080') return;
    setActiveGuide(null);
    setCropToGuide(false);
  }, [verticalVideo, activeGuide]);
  useEffect(() => {
    const v = mediaElRef.current;
    const totalDuration = videoInfo?.duration ?? audioInfo?.duration ?? null;
    const params = videoInfo ? vidExport : bgExport;
    if (!v || !totalDuration) return;
    const { start, end } = resolveExportRange(params, totalDuration);
    const clamped = clamp(v.currentTime || 0, start, end);
    if (Math.abs((v.currentTime || 0) - clamped) > 0.001) {
      v.currentTime = clamped;
    }
    setPlayheadSecond(clamped);
  }, [videoInfo, audioInfo, vidExport.startSecond, vidExport.endSecond, vidExport.duration, bgExport.startSecond, bgExport.endSecond, bgExport.duration]);
  useEffect(() => {
    const v = mediaElRef.current;
    const totalDuration = videoInfo?.duration ?? audioInfo?.duration ?? null;
    const params = videoInfo ? vidExport : bgExport;
    if (!v || !totalDuration) return;
    let raf: number | null = null;
    const tick = () => {
      const { end } = resolveExportRange(params, totalDuration);
      const current = v.currentTime || 0;
      if (!v.paused && current >= end) {
        v.currentTime = end;
        v.pause();
        setPlaying(false);
      }
      if (Math.abs(current - playheadRef.current) > 0.02) {
        setPlayheadSecond(current);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      if (raf) cancelAnimationFrame(raf);
    };
  }, [videoInfo, audioInfo, vidExport.startSecond, vidExport.endSecond, vidExport.duration, bgExport.startSecond, bgExport.endSecond, bgExport.duration]);

  // ---------- auto-save settings to active project ----------
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!activeProjectId) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveSettings(activeProjectId, {
        background: bg, backgroundDither: bgDither, video: vid,
        audioReactivity,
        captionMode, captionStyle,
        layers: { background: bgLayerOn, video: videoLayerOn, captions: captionsLayerOn },
        activeGuide, cropToGuide, exportBackground: bgExport, exportVideo: vidExport,
        ui: { mainTab, bgSubTab, videoSubTab, muted },
      }).catch(() => { });
    }, 800);
  }, [activeProjectId, bg, bgDither, vid, audioReactivity, captionMode, captionStyle, bgLayerOn, videoLayerOn, captionsLayerOn, activeGuide, cropToGuide, bgExport, vidExport, mainTab, bgSubTab, videoSubTab, muted]);

  // ---------- SSE stream for transcription progress ----------
  useEffect(() => {
    if (!activeProjectId) return;
    let progressToastId: number | null = null;
    const close = openEventStream(activeProjectId, (event) => {
      const statusKind: ProjectTaskStatus['kind'] =
        event.type === 'done' || event.type === 'caption_saved' ? 'success' :
          event.type === 'error' ? 'error' :
            event.type === 'video_saved' || event.type === 'audio_extracted' ? 'success' : 'progress';
      setProjectStatus({
        kind: statusKind,
        message: event.message,
        detail: event.type === 'polling' && event.status ? `AssemblyAI status: ${event.status}` : undefined,
      });

      if (event.type === 'video_saved') {
        addToast(event.message, 'info');
      } else if (event.type === 'audio_extracting') {
        progressToastId = addToast(event.message, 'progress', true);
      } else if (event.type === 'audio_extracted') {
        if (progressToastId) updateToast(progressToastId, event.message, 'info');
        progressToastId = null;
      } else if (event.type === 'uploading' || event.type === 'submitted') {
        if (progressToastId) updateToast(progressToastId, event.message, 'progress');
        else progressToastId = addToast(event.message, 'progress', true);
      } else if (event.type === 'polling') {
        if (progressToastId) updateToast(progressToastId, event.message, 'progress');
        else progressToastId = addToast(event.message, 'progress', true);
      } else if (event.type === 'done') {
        if (progressToastId) updateToast(progressToastId, event.message, 'success');
        else addToast(event.message, 'success');
        progressToastId = null;
        // auto-load transcript
        const pid = activeProjectIdRef.current;
        if (pid) getTranscript(pid).then(data => {
          if (data) {
            try { setTranscript(parseTranscript(data)); setTranscriptName('caption.json'); } catch { }
          }
        });
        // refresh project list
        listProjects().then(setProjects);
      } else if (event.type === 'caption_saved') {
        addToast(event.message, 'success');
      } else if (event.type === 'error') {
        if (progressToastId) updateToast(progressToastId, `Error: ${event.message}`, 'error');
        else addToast(`Error: ${event.message}`, 'error');
        progressToastId = null;
      }
    });
    return close;
  }, [activeProjectId]);

  // ---------- load project list on mount ----------
  useEffect(() => { listProjects().then(setProjects); }, []);

  // ---------- project handlers ----------
  const handleCreateProject = async (name: string) => {
    try {
      const p = await createProject(name);
      const updated = await listProjects();
      setProjects(updated);
      setActiveProjectId(p.id);
      setMainTab('video');
      setBgSubTab('noise');
      setVideoSubTab('levels');
      setBg(DEFAULT_BACKGROUND);
      setBgDither(DEFAULT_DITHER);
      setVid(DEFAULT_VIDEO);
      setBgExport({ ...DEFAULT_EXPORT, filenamePrefix: 'bg' });
      setVidExport({ ...DEFAULT_EXPORT, filenamePrefix: 'talking' });
      setActiveGuide(null);
      setCropToGuide(false);
      setBgLayerOn(true);
      setVideoLayerOn(true);
      setCaptionsLayerOn(true);
      setCaptionMode('line');
      setCaptionStyle(DEFAULT_CAPTION_STYLE);
      setMuted(false);
      setVideoInfo(null);
      setAudioInfo(null);
      setPlayheadSecond(0);
      setTranscript(null);
      setTranscriptName(null);
      setPlaying(false);
      mediaElRef.current?.pause();
      videoElRef.current = null;
      audioElRef.current = null;
      mediaElRef.current = null;
      audioSourceRef.current?.dispose();
      audioSourceRef.current = null;
      videoRendererRef.current?.setVideo(null);
      setAudioReactivity(DEFAULT_AUDIO_REACTIVITY);
      setProjectStatus({ kind: 'success', message: `Project "${p.name}" created`, detail: `Folder: projects/${p.id}` });
      addToast(`Project "${p.name}" created`, 'success');
    } catch { addToast('Failed to create project', 'error'); }
  };

  const handleSelectProject = async (id: string) => {
    try {
      const proj = await getProject(id);
      setActiveProjectId(id);
      setPlaying(false);
      mediaElRef.current?.pause();
      videoElRef.current = null;
      audioElRef.current = null;
      mediaElRef.current = null;
      audioSourceRef.current?.dispose();
      audioSourceRef.current = null;
      videoRendererRef.current?.setVideo(null);
      setVideoInfo(null);
      setAudioInfo(null);
      setPlayheadSecond(0);
      setTranscript(null);
      setTranscriptName(null);
      if (proj.background) setBg(proj.background);
      if (proj.backgroundDither) setBgDither(proj.backgroundDither);
      if (proj.video) setVid(proj.video);
      if (proj.audioReactivity) setAudioReactivity({ ...DEFAULT_AUDIO_REACTIVITY, ...proj.audioReactivity });
      else setAudioReactivity(DEFAULT_AUDIO_REACTIVITY);
      if (proj.captionMode) setCaptionMode(proj.captionMode);
      if (proj.captionStyle) setCaptionStyle({ ...DEFAULT_CAPTION_STYLE, ...proj.captionStyle });
      if (proj.ui) {
        if (proj.ui.mainTab) setMainTab(proj.ui.mainTab);
        if (proj.ui.bgSubTab) setBgSubTab(proj.ui.bgSubTab);
        if (proj.ui.videoSubTab) setVideoSubTab(proj.ui.videoSubTab);
        if (typeof proj.ui.muted === 'boolean') setMuted(proj.ui.muted);
      }
      if (proj.layers) {
        setBgLayerOn(proj.layers.background ?? true);
        setVideoLayerOn(proj.layers.video ?? true);
        setCaptionsLayerOn(proj.layers.captions ?? true);
      }
      if (proj.activeGuide !== undefined) {
        setActiveGuide(proj.activeGuide as GuideKey | null);
      } else if (proj.guides) {
        // migrate old multi-select format → first selected key
        const first = (Object.entries(proj.guides) as [GuideKey, boolean][])
          .find(([, on]) => on)?.[0] ?? null;
        setActiveGuide(first);
      } else {
        setActiveGuide(null);
      }
      if (proj.cropToGuide !== undefined) setCropToGuide(proj.cropToGuide);
      if (proj.exportBackground) setBgExport(proj.exportBackground);
      if (proj.exportVideo) setVidExport(proj.exportVideo);
      // load video if present
      if (proj.hasVideo) {
        const url = getVideoUrl(id);
        const v = document.createElement('video');
        v.src = url;
        v.muted = false; v.volume = 1; v.playsInline = true; v.preload = 'auto';
        v.addEventListener('loadedmetadata', () => {
          setVideoInfo({ name: proj.videoFile || 'video', duration: v.duration, w: v.videoWidth, h: v.videoHeight });
          setVidExport((p) => {
            const nextEnd = p.endSecond === undefined ? v.duration : Math.min(v.duration, p.endSecond);
            const nextStart = Math.min(p.startSecond, Math.max(0, nextEnd - 0.01));
            return {
              ...p,
              width: v.videoWidth,
              height: v.videoHeight,
              startSecond: nextStart,
              endSecond: nextEnd,
              duration: Math.max(0.01, nextEnd - nextStart),
            };
          });
          videoRendererRef.current?.setVideo(v);
          videoElRef.current = v;
          mediaElRef.current = v;
          const src = new AudioSource({ element: v, url });
          audioSourceRef.current = src;
          v.currentTime = 0;
        });
      }
      // load audio if present
      if (proj.hasAudio && !proj.hasVideo) {
        const url = getAudioUrl(id);
        const a = document.createElement('audio');
        a.src = url;
        a.crossOrigin = 'anonymous';
        a.preload = 'auto';
        a.addEventListener('loadedmetadata', () => {
          const duration = a.duration;
          setAudioInfo({ name: proj.audioFile || 'audio', duration });
          setBgExport((p) => {
            const nextEnd = p.endSecond === undefined ? duration : Math.min(duration, p.endSecond);
            const nextStart = Math.min(p.startSecond, Math.max(0, nextEnd - 0.01));
            return { ...p, startSecond: nextStart, endSecond: nextEnd, duration: Math.max(0.01, nextEnd - nextStart) };
          });
          audioElRef.current = a;
          mediaElRef.current = a;
          const src = new AudioSource({ element: a, url });
          audioSourceRef.current = src;
          a.currentTime = 0;
        });
      }
      // load music if present
      if (proj.hasMusic) {
        const url = getMusicUrl(id);
        const m = document.createElement('audio');
        m.src = url;
        m.crossOrigin = 'anonymous';
        m.preload = 'auto';
        m.loop = true;
        m.addEventListener('loadedmetadata', () => {
          setMusicInfo({ name: proj.originalMusicName || 'music' });
          musicElRef.current = m;
          musicPlayerRef.current = new MusicPlayer(m);
        });
      }
      // load transcript if present
      if (proj.hasTranscript) {
        const data = await getTranscript(id);
        if (data) try { setTranscript(parseTranscript(data)); setTranscriptName('caption.json'); } catch { }
      }
      setProjectStatus({
        kind: 'success',
        message: `Loaded "${proj.name}"`,
        detail: proj.hasTranscript ? 'Caption JSON is ready' : proj.hasVideo ? 'Video imported; captions not ready yet' : `Folder: projects/${id}`,
      });
      addToast(`Loaded "${proj.name}"`, 'success');
    } catch { addToast('Failed to load project', 'error'); }
  };

  // ---------- media file load (video or audio, auto-detected) ----------
  const loadVideoFile = (file: File, pid: string) => {
    if (videoBlobUrlRef.current) URL.revokeObjectURL(videoBlobUrlRef.current);
    if (audioBlobUrlRef.current) URL.revokeObjectURL(audioBlobUrlRef.current);
    setPlaying(false);
    mediaElRef.current?.pause();
    audioSourceRef.current?.dispose();
    audioSourceRef.current = null;
    audioElRef.current = null;
    mediaElRef.current = null;
    setAudioInfo(null);
    setTranscript(null);
    setTranscriptName(null);
    setPlayheadSecond(0);
    setProjectStatus({ kind: 'progress', message: 'Importing video into project folder', progress: 0, detail: `Folder: projects/${pid}` });

    // Show immediately in preview via blob URL
    const url = URL.createObjectURL(file);
    videoBlobUrlRef.current = url;
    const v = document.createElement('video');
    v.src = url;
    v.muted = false; v.volume = 1; v.playsInline = true; v.preload = 'auto';
    v.addEventListener('loadedmetadata', () => {
      setVideoInfo({ name: file.name, duration: v.duration, w: v.videoWidth, h: v.videoHeight });
      setVidExport((p) => {
        const nextEnd = p.endSecond === undefined ? v.duration : Math.min(v.duration, p.endSecond);
        const nextStart = Math.min(p.startSecond, Math.max(0, nextEnd - 0.01));
        return {
          ...p,
          width: v.videoWidth,
          height: v.videoHeight,
          startSecond: nextStart,
          endSecond: nextEnd,
          duration: Math.max(0.01, nextEnd - nextStart),
        };
      });
      videoRendererRef.current?.setVideo(v);
      videoElRef.current = v;
      mediaElRef.current = v;
      const src = new AudioSource({ element: v, url });
      audioSourceRef.current = src;
      v.currentTime = 0;
    });
    const uploadId = addToast('Importing video into project folder…', 'progress', true);
    uploadVideo(pid, file, (pct) => {
      setProjectStatus({ kind: 'progress', message: 'Importing video into project folder', progress: pct, detail: `Folder: projects/${pid}` });
      updateToast(uploadId, `Importing… ${pct}%`, 'progress');
    }).then(() => {
      setProjectStatus({ kind: 'progress', message: 'Video imported; starting transcription', detail: `Folder: projects/${pid}` });
      updateToast(uploadId, 'Video imported — starting transcription…', 'info');
      listProjects().then(setProjects);
    }).catch(err => {
      setProjectStatus({ kind: 'error', message: `Import failed: ${err.message}` });
      updateToast(uploadId, `Import failed: ${err.message}`, 'error');
    });
  };

  const loadAudioFile = (file: File, pid: string) => {
    if (videoBlobUrlRef.current) URL.revokeObjectURL(videoBlobUrlRef.current);
    if (audioBlobUrlRef.current) URL.revokeObjectURL(audioBlobUrlRef.current);
    setPlaying(false);
    mediaElRef.current?.pause();
    videoRendererRef.current?.setVideo(null);
    videoElRef.current = null;
    audioSourceRef.current?.dispose();
    audioSourceRef.current = null;
    audioElRef.current = null;
    mediaElRef.current = null;
    setVideoInfo(null);
    setAudioInfo(null);
    setTranscript(null);
    setTranscriptName(null);
    setPlayheadSecond(0);
    setProjectStatus({ kind: 'progress', message: 'Importing audio into project folder', progress: 0, detail: `Folder: projects/${pid}` });

    const url = URL.createObjectURL(file);
    audioBlobUrlRef.current = url;
    const a = document.createElement('audio');
    a.src = url;
    a.crossOrigin = 'anonymous';
    a.preload = 'auto';
    a.addEventListener('loadedmetadata', () => {
      const duration = a.duration;
      setAudioInfo({ name: file.name, duration });
      setBgExport((p) => {
        const nextEnd = p.endSecond === undefined ? duration : Math.min(duration, p.endSecond);
        const nextStart = Math.min(p.startSecond, Math.max(0, nextEnd - 0.01));
        return { ...p, startSecond: nextStart, endSecond: nextEnd, duration: Math.max(0.01, nextEnd - nextStart) };
      });
      audioElRef.current = a;
      mediaElRef.current = a;
      const src = new AudioSource({ element: a, url });
      audioSourceRef.current = src;
      a.currentTime = 0;
    });

    // Switch to reactivity tab to show the new audio-reactive UI
    setMainTab('reactivity');

    const uploadId = addToast('Importing audio into project folder…', 'progress', true);
    uploadAudio(pid, file, (pct) => {
      setProjectStatus({ kind: 'progress', message: 'Importing audio into project folder', progress: pct, detail: `Folder: projects/${pid}` });
      updateToast(uploadId, `Importing… ${pct}%`, 'progress');
    }).then(() => {
      setProjectStatus({ kind: 'progress', message: 'Audio imported; starting transcription', detail: `Folder: projects/${pid}` });
      updateToast(uploadId, 'Audio imported — starting transcription…', 'info');
      listProjects().then(setProjects);
    }).catch(err => {
      setProjectStatus({ kind: 'error', message: `Import failed: ${err.message}` });
      updateToast(uploadId, `Import failed: ${err.message}`, 'error');
    });
  };

  const loadMusicFile = (file: File, pid: string) => {
    setPlaying(false);
    mediaElRef.current?.pause();
    musicElRef.current?.pause();
    musicPlayerRef.current?.dispose();
    musicPlayerRef.current = null;
    musicElRef.current = null;
    setMusicInfo(null);
    setProjectStatus({ kind: 'progress', message: 'Importing music into project folder', progress: 0, detail: `Folder: projects/${pid}` });

    const url = URL.createObjectURL(file);
    const m = document.createElement('audio');
    m.src = url;
    m.crossOrigin = 'anonymous';
    m.preload = 'auto';
    m.loop = true;
    m.addEventListener('loadedmetadata', () => {
      setMusicInfo({ name: file.name });
      musicElRef.current = m;
      musicPlayerRef.current = new MusicPlayer(m);
    });

    const uploadId = addToast('Importing music into project folder…', 'progress', true);
    uploadMusic(pid, file, (pct) => {
      setProjectStatus({ kind: 'progress', message: 'Importing music into project folder', progress: pct, detail: `Folder: projects/${pid}` });
      updateToast(uploadId, `Importing… ${pct}%`, 'progress');
    }).then(() => {
      setProjectStatus({ kind: 'success', message: 'Music imported', detail: `Folder: projects/${pid}` });
      updateToast(uploadId, 'Music imported successfully', 'success');
      listProjects().then(setProjects);
    }).catch(err => {
      setProjectStatus({ kind: 'error', message: `Import failed: ${err.message}` });
      updateToast(uploadId, `Import failed: ${err.message}`, 'error');
    });
  };

  const handleClearMusic = () => {
    musicElRef.current?.pause();
    musicPlayerRef.current?.dispose();
    musicPlayerRef.current = null;
    musicElRef.current = null;
    setMusicInfo(null);
    setMusicLayerOn(false);
  };

  const loadFile = (file: File) => {
    const pid = activeProjectIdRef.current;
    if (!pid) {
      setProjectStatus({ kind: 'error', message: 'Create or select a project before importing media' });
      addToast('Create or select a project before importing media', 'error');
      return;
    }
    if (isAudioFile(file)) {
      loadAudioFile(file, pid);
    } else {
      loadVideoFile(file, pid);
    }
  };
  const onPickFile: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const f = e.target.files?.[0];
    if (f) loadFile(f);
  };
  const onDrop: React.DragEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) loadFile(f);
  };
  const togglePlay = () => {
    const v = mediaElRef.current;
    if (!v) {
      // No speech media — play music standalone if loaded.
      const m = musicElRef.current;
      if (m) {
        if (m.paused) {
          musicPlayerRef.current?.ensureGraph();
          musicPlayerRef.current?.resume();
          musicPlayerRef.current?.setVolume(music.volume, music.muted || !musicLayerOn);
          m.play().catch(() => {});
          setPlaying(true);
        } else {
          m.pause();
          setPlaying(false);
        }
      }
      return;
    }
    const totalDuration = videoInfo?.duration ?? audioInfo?.duration ?? v.duration;
    const params = videoInfo ? vidExport : bgExport;
    const { start, end } = resolveExportRange(params, totalDuration);
    if (v.paused) {
      // Audio Web Audio context needs to be resumed from a user gesture.
      audioSourceRef.current?.ensureGraph();
      audioSourceRef.current?.resume();
      // Same for the music graph.
      musicPlayerRef.current?.ensureGraph();
      musicPlayerRef.current?.resume();
      musicPlayerRef.current?.setVolume(music.volume, music.muted || !musicLayerOn);
      const cur = v.currentTime || 0;
      let target = clamp(cur, start, end);
      if (cur >= end - 0.001 || cur < start) target = start;
      setPlayheadSecond(target);
      const startPlayback = () => {
        const p = v.play();
        if (p && typeof p.catch === 'function') p.catch(() => setPlaying(false));
        // Start music alongside speech (its own free-running time, looped).
        const mEl = musicElRef.current;
        if (mEl && musicLayerOn) {
          mEl.play().catch(() => {});
        }
        setPlaying(true);
      };
      if (Math.abs((v.currentTime || 0) - target) > 0.001) {
        const onSeeked = () => { v.removeEventListener('seeked', onSeeked); startPlayback(); };
        v.addEventListener('seeked', onSeeked);
        v.currentTime = target;
      } else {
        startPlayback();
      }
    } else {
      v.pause();
      musicElRef.current?.pause();
      setPlaying(false);
    }
  };
  const togglePlayRef = useRef(togglePlay);
  useEffect(() => { togglePlayRef.current = togglePlay; });
  const handleSeekPlayhead = (second: number) => {
    const v = mediaElRef.current;
    if (!v) return;
    const totalDuration = videoInfo?.duration ?? audioInfo?.duration ?? v.duration;
    const params = videoInfo ? vidExport : bgExport;
    const { start, end } = resolveExportRange(params, totalDuration);
    const target = clamp(second, start, end);
    v.currentTime = target;
    setPlayheadSecond(target);
  };

  // ---------- keyboard shortcuts: space = play/pause, m = mute/unmute ----------
  useEffect(() => {
    const isEditableTarget = (el: EventTarget | null) => {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
      if (el.isContentEditable) return true;
      return false;
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isEditableTarget(e.target)) return;
      if (e.code === 'Space') {
        if (!mediaElRef.current) return;
        e.preventDefault();
        togglePlayRef.current();
      } else if (e.key === 'm' || e.key === 'M') {
        if (!mediaElRef.current) return;
        e.preventDefault();
        setMuted((m) => !m);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ---------- transcript file load ----------
  const loadTranscriptFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const raw = JSON.parse(String(reader.result));
        const data = parseTranscript(raw);
        setTranscript(data);
        setTranscriptName('caption.json');
        const pid = activeProjectIdRef.current;
        if (pid) {
          setProjectStatus({ kind: 'progress', message: 'Saving caption JSON to project folder', detail: `Folder: projects/${pid}` });
          uploadCaption(pid, raw)
            .then(() => {
              setProjectStatus({ kind: 'success', message: 'Caption JSON saved to project folder', detail: `Folder: projects/${pid}/caption.json` });
              listProjects().then(setProjects);
            })
            .catch((err) => {
              setProjectStatus({ kind: 'error', message: `Caption save failed: ${err.message}` });
              addToast(`Caption save failed: ${err.message}`, 'error');
            });
        } else {
          addToast('Caption loaded for preview only; select a project to save it', 'info');
        }
      } catch (e) {
        console.error('Failed to parse transcript JSON', e);
        alert('Could not parse transcript JSON: ' + (e as Error).message);
      }
    };
    reader.readAsText(file);
  };
  const onPickTranscript: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const f = e.target.files?.[0];
    if (f) loadTranscriptFile(f);
  };

  // ---------- export ----------
  const fitPreviewBack = () => {
    const w = Math.max(1, Math.floor(previewFrame.w));
    const h = Math.max(1, Math.floor(previewFrame.h));
    bgRendererRef.current?.setSize(w, h);
    videoRendererRef.current?.setSize(w, h);
  };

  const exportComposition = async (
    onProgress: (done: number, total: number) => void,
    signal: AbortSignal,
  ) => {
    const projectId = activeProjectIdRef.current;
    if (!projectId) throw new Error('Create or select a project before exporting.');
    if (!bgLayerOn && !videoLayerOn && !captionsLayerOn) throw new Error('Turn on at least one layer before exporting.');
    const throwIfAborted = () => {
      if (signal.aborted) {
        const err = new Error('Export cancelled');
        err.name = 'AbortError';
        throw err;
      }
    };

    const bgRenderer = bgRendererRef.current;
    const videoRenderer = videoRendererRef.current;
    const video = videoElRef.current;
    const audio = audioSourceRef.current;
    const params = videoInfo ? vidExport : bgExport;
    const sourceDuration = videoInfo?.duration ?? audioInfo?.duration ?? null;
    const range = resolveExportRange(params, sourceDuration);
    if (videoLayerOn && (!videoRenderer || !video)) throw new Error('Load a video before exporting the video layer.');

    // Pre-compute deterministic per-frame audio bands when audio is loaded.
    if (audio && audioReactivity.enabled) {
      try { await audio.preloadEnvelope(); } catch (e) { console.warn('Audio envelope preload failed', e); }
    }

    const width = Math.max(1, Math.floor(params.width));
    const height = Math.max(1, Math.floor(params.height));
    const duration = range.duration;
    const total = Math.max(1, Math.ceil(duration * params.fps));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not create export canvas.');

    exportingRef.current = true;
    const mediaEl = video ?? audioElRef.current;
    if (mediaEl) { mediaEl.pause(); setPlaying(false); }
    const toastId = addToast('Creating project export folder…', 'progress', true);

    try {
      bgRenderer?.setSize(width, height);
      videoRenderer?.setSize(width, height);
      const created = await createProjectExport(projectId, {
        prefix: params.filenamePrefix,
        width,
        height,
        fps: params.fps,
        totalFrames: total,
        layers: {
          background: bgLayerOn,
          video: videoLayerOn,
          captions: captionsLayerOn,
        },
      });
      setProjectStatus({ kind: 'progress', message: 'Exporting PNG sequence', detail: created.folder, progress: 0 });
      updateToast(toastId, `Exporting to ${created.folder}`, 'progress');

      for (let i = 0; i < total; i++) {
        throwIfAborted();
        const t = range.start + i / params.fps;
        ctx.clearRect(0, 0, width, height);

        // Deterministic bands for this frame (zeros if no audio loaded).
        const bands = audio && audioReactivity.enabled
          ? audio.getDeterministicBands(t)
          : { rms: 0, low: 0, mid: 0, high: 0 };
        const g = audioReactivity.gain;

        if (bgLayerOn && bgRenderer) {
          bgRenderer.setModulation(audio && audioReactivity.enabled ? {
            speed: bands.rms * g * audioReactivity.modSpeed * 1.5,
            brightness: bands.rms * g * audioReactivity.modBrightness,
          } : { speed: 0, brightness: 0 });
          bgRenderer.renderFrame(t);
          ctx.drawImage(bgRenderer.renderer.domElement as HTMLCanvasElement, 0, 0, width, height);
        }

        if (videoLayerOn && videoRenderer && video) {
          if (t > video.duration) break;
          await seekVideoTo(video, t);
          throwIfAborted();
          videoRenderer.renderFrame();
          ctx.drawImage(videoRenderer.renderer.domElement as HTMLCanvasElement, 0, 0, width, height);
        }

        if (captionsLayerOn && transcript) {
          drawCaptionsToCanvas(ctx, transcript, captionMode, t * 1000, width, height, captionStyle);
        }

        const blob = await canvasToPngBlob(canvas);
        throwIfAborted();
        await uploadExportFrame(projectId, created.exportId, `${params.filenamePrefix}_${frameNumber(i)}.png`, blob);
        onProgress(i + 1, total);
        if (i % 2 === 0) {
          const pct = Math.round(((i + 1) / total) * 100);
          setProjectStatus({ kind: 'progress', message: 'Exporting PNG sequence', detail: created.folder, progress: pct });
          await new Promise((res) => setTimeout(res, 0));
        }
      }

      const finished = await finishProjectExport(projectId, created.exportId);
      setProjectStatus({ kind: 'success', message: 'PNG sequence exported', detail: finished.folder });
      updateToast(toastId, `Export complete: ${finished.folder}`, 'success');
      return finished.folder;
    } catch (error: any) {
      if (error?.name === 'AbortError' || signal.aborted) {
        updateToast(toastId, 'Export cancelled', 'info');
        setProjectStatus({ kind: 'idle', message: 'Export cancelled', detail: `Folder: projects/${projectId}` });
      } else {
        updateToast(toastId, `Export failed: ${error?.message ?? error}`, 'error');
        setProjectStatus({ kind: 'error', message: `Export failed: ${error?.message ?? error}` });
      }
      throw error;
    } finally {
      fitPreviewBack();
      startRef.current = performance.now();
      exportingRef.current = false;
    }
  };

  // ---------- layout ----------
  const activeProject = projects.find((p) => p.id === activeProjectId);
  const activeExportParams = videoInfo ? vidExport : bgExport;
  const setActiveExportParams = videoInfo ? setVidExport : setBgExport;
  const exportLayerSummary = [
    bgLayerOn ? 'background' : null,
    videoLayerOn ? 'video' : null,
    captionsLayerOn ? 'captions' : null,
  ].filter(Boolean).join(' + ') || 'none';
  const frameStyle: React.CSSProperties = videoInfo
    ? { position: 'absolute', left: previewFrame.x, top: previewFrame.y, width: previewFrame.w, height: previewFrame.h }
    : { position: 'absolute', inset: 0, width: '100%', height: '100%' };
  const audioMode = !!audioInfo && !videoInfo;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', height: '100vh', minHeight: 0, overflow: 'hidden', gap: 0 }}>
      {/* preview (left) — both layers stacked, toggles control visibility */}
      <div
        ref={previewWrapRef}
        style={{
          position: 'relative',
          // checkerboard whenever video layer is on (so transparency is visible).
          // when bg layer is also on, the background covers it but the video
          // composites on top.
          background: videoInfo
            ? '#000'
            : videoLayerOn
              ? `repeating-conic-gradient(#1a1a1a 0 25%, #2a2a2a 0 50%) 50% / 20px 20px`
              : '#000',
          overflow: 'hidden',
          minHeight: 0,
        }}
      >
        <canvas
          ref={bgCanvasRef}
          style={{ ...frameStyle, display: bgLayerOn ? 'block' : 'none' }}
        />
        <canvas
          ref={videoCanvasRef}
          style={{ ...frameStyle, display: videoLayerOn && !audioMode ? 'block' : 'none' }}
        />

        {/* composition guide outline (only the active one) */}
        {(() => {
          const g = availableGuides.find((x) => x.key === activeGuide);
          if (!g) return null;
          const r = guideRectInVideoFrame(previewFrame, videoInfo, g);
          return (
            <div
              key={g.key}
              style={{
                position: 'absolute', left: r.x, top: r.y, width: r.w, height: r.h,
                border: '1px solid #1f6feb', boxShadow: '0 0 0 1px rgba(0,0,0,0.5)',
                pointerEvents: 'none',
              }}
            >
              <div style={{
                position: 'absolute', top: -18, left: 0,
                fontSize: 10, color: '#1f6feb', background: 'rgba(0,0,0,0.6)',
                padding: '1px 5px', borderRadius: 2, letterSpacing: 0.5,
              }}>{g.label}</div>
            </div>
          );
        })()}

        {/* crop mask: black-out everything outside the active guide */}
        {cropToGuide && (() => {
          const active = availableGuides.find((g) => g.key === activeGuide);
          if (!active) return null;
          const r = guideRectInVideoFrame(previewFrame, videoInfo, active);
          const mask = '#000';
          return (
            <>
              <div style={{ position: 'absolute', left: 0, top: 0, right: 0, height: r.y, background: mask, pointerEvents: 'none' }} />
              <div style={{ position: 'absolute', left: 0, top: r.y + r.h, right: 0, bottom: 0, background: mask, pointerEvents: 'none' }} />
              <div style={{ position: 'absolute', left: 0, top: r.y, width: r.x, height: r.h, background: mask, pointerEvents: 'none' }} />
              <div style={{ position: 'absolute', left: r.x + r.w, top: r.y, right: 0, height: r.h, background: mask, pointerEvents: 'none' }} />
            </>
          );
        })()}

        {/* captions overlay — when crop is on, constrain captions to the active guide rect */}
        {captionsLayerOn && transcript && (() => {
          const guide = cropToGuide
            ? availableGuides.find((g) => g.key === activeGuide)
            : undefined;
          const captionFrame = guide
            ? guideRectInVideoFrame(previewFrame, videoInfo, guide)
            : previewFrame;
          return (
            <Captions
              transcript={transcript}
              mode={captionMode}
              style={captionStyle}
              frame={captionFrame}
              timeSourceRef={mediaElRef}
            />
          );
        })()}

        {/* status toasts */}
        <StatusToast toasts={toasts} onDismiss={dismissToast} />

        {!videoInfo && !audioInfo && (
          <div
            onDrop={onDrop}
            onDragOver={(e) => e.preventDefault()}
            style={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#888', flexDirection: 'column', gap: 12,
              background: 'rgba(0,0,0,0.35)',
            }}
          >
            <div>No media loaded.</div>
            <div style={{ fontSize: 11 }}>Drop a video or audio file here or use the panel on the right.</div>
          </div>
        )}
      </div>

      {/* right panel */}
      <div style={{ borderLeft: '1px solid #1f1f1f', display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, height: '100vh', background: '#0c0c0c' }}>
        {/* fixed header: project bar through main tab row */}
        <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
        <ProjectBar
          projects={projects}
          activeId={activeProjectId}
          onSelect={handleSelectProject}
          onCreate={handleCreateProject}
        />
        <ProjectStatusPanel project={activeProject} status={projectStatus} />
        {/* media transport (when a video or audio file is loaded) */}
        {(videoInfo || audioInfo) && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 10px', borderBottom: '1px solid #1f1f1f', background: '#0a0a0a' }}>
            <button
              onClick={togglePlay}
              style={{ background: '#1f6feb', color: '#fff', border: 'none', padding: '4px 12px', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              {playing ? 'Pause' : 'Play'}
            </button>
            <button
              onClick={() => setMuted((m) => !m)}
              title={muted ? 'Unmute' : 'Mute'}
              style={{ background: muted ? '#222' : '#1a1a1a', color: muted ? '#666' : '#ddd', border: '1px solid #2a2a2a', padding: '4px 8px', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              {muted ? '🔇' : '🔊'}
            </button>
            <span style={{ color: '#aaa', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {videoInfo?.name ?? audioInfo?.name}
            </span>
            <span style={{ color: '#666', fontSize: 11, marginLeft: 'auto', flexShrink: 0 }}>
              {videoInfo
                ? `${videoInfo.w}×${videoInfo.h} · ${videoInfo.duration.toFixed(1)}s`
                : audioInfo
                  ? `audio · ${audioInfo.duration.toFixed(1)}s`
                  : ''}
            </span>
          </div>
        )}

        {/* layer toggles */}
        <div style={{ display: 'flex', gap: 6, padding: '8px 10px', borderBottom: '1px solid #1f1f1f', background: '#0a0a0a', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ color: '#666', textTransform: 'uppercase', letterSpacing: 1, marginRight: 4 }}>Layers</span>
          <LayerToggle label="Background" on={bgLayerOn} onClick={() => setBgLayerOn((v) => !v)} />
          {!audioMode && <LayerToggle label="Video" on={videoLayerOn} onClick={() => setVideoLayerOn((v) => !v)} />}
          <LayerToggle label="Captions" on={captionsLayerOn} onClick={() => setCaptionsLayerOn((v) => !v)} />
          <LayerToggle label="Music" on={musicLayerOn} onClick={() => setMusicLayerOn((v) => !v)} />
        </div>

        {/* guides */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: '8px 10px', borderBottom: '1px solid #1f1f1f', background: '#0a0a0a', alignItems: 'center' }}>
          <span style={{ color: '#666', textTransform: 'uppercase', letterSpacing: 1, marginRight: 4 }}>Guides</span>
          {availableGuides.map((g) => (
            <PillToggle
              key={g.key}
              label={g.label}
              on={activeGuide === g.key}
              onClick={() => setActiveGuide((curr) => (curr === g.key ? null : g.key))}
            />
          ))}
          <span style={{ width: 1, alignSelf: 'stretch', background: '#222', margin: '0 4px' }} />
          <PillToggle
            label="Crop"
            on={cropToGuide}
            onClick={() => setCropToGuide((v) => !v)}
            activeColor="#eb6f1f"
          />
        </div>

        <TabBar<MainTab>
          tabs={[
            { value: 'background', label: 'Background' },
            { value: 'video',      label: audioMode ? 'Audio' : 'Video' },
            { value: 'reactivity', label: 'Reactivity' },
            { value: 'music',      label: 'Music' },
            { value: 'export',     label: 'Export' },
          ]}
          value={mainTab}
          onChange={setMainTab}
          variant="main"
        />
        </div>
        {/* scrollable tab content */}
        <div style={{ overflowY: 'auto', padding: 10, flex: '1 1 0', minHeight: 0 }}>
          {mainTab === 'background' && (
            <>
              <Section title="Preset">
                <Select
                  label="load"
                  value={''}
                  options={[
                    { label: '— pick a preset —', value: '' },
                    ...PRESETS.map((p) => ({ label: p.name, value: p.name })),
                  ]}
                  onChange={(name) => {
                    const p = PRESETS.find((x) => x.name === name);
                    if (p) { setBg(p.background); setBgDither(p.dither); }
                  }}
                />
                <button
                  onClick={() => {
                    setBg(DEFAULT_BACKGROUND);
                    setBgDither(DEFAULT_DITHER);
                    addToast('Background reset to defaults', 'success');
                  }}
                  style={{
                    alignSelf: 'flex-start',
                    padding: '6px 10px',
                    background: '#222',
                    color: '#ddd',
                    border: '1px solid #333',
                    borderRadius: 3,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    fontSize: 12,
                  }}
                >
                  Reset to defaults
                </button>
              </Section>
              <TabBar<BgSubTab>
                tabs={[
                  { value: 'noise', label: 'Noise' },
                  { value: 'dither', label: 'Dither' },
                ]}
                value={bgSubTab}
                onChange={setBgSubTab}
                variant="sub"
              />
              {bgSubTab === 'noise' && <BackgroundControls value={bg} onChange={setBg} />}
              {bgSubTab === 'dither' && <DitherControls value={bgDither} onChange={setBgDither} />}
            </>
          )}

          {mainTab === 'video' && (
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
                  <Section title="Captions">
                    {transcript ? (
                      <>
                        <div style={{ color: '#aaa', marginBottom: 6 }}>
                          {transcriptName}<br />
                          {transcript.utterances.length} utterance{transcript.utterances.length === 1 ? '' : 's'}
                        </div>
                        <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                          <PillToggle label="Line mode" on={captionMode === 'line'} onClick={() => setCaptionMode('line')} />
                          <PillToggle label="Word mode" on={captionMode === 'word'} onClick={() => setCaptionMode('word')} />
                        </div>
                        <label style={{
                          display: 'inline-block', padding: '4px 10px', background: '#222',
                          color: '#ddd', borderRadius: 3, cursor: 'pointer', fontSize: 11,
                        }}>
                          Replace caption JSON…
                          <input type="file" accept="application/json,.json" onChange={onPickTranscript} style={{ display: 'none' }} />
                        </label>
                      </>
                    ) : (
                      <>
                        <div style={{ color: '#aaa', marginBottom: 8 }}>
                          Load a caption JSON (word-level timestamps in ms — same format as
                          <code> w3rk17/src/content/talk-transcript-trimmed.json</code>).
                        </div>
                        <label style={{
                          display: 'inline-block', padding: '6px 12px', background: '#1f6feb',
                          color: '#fff', borderRadius: 3, cursor: 'pointer',
                        }}>
                          Choose caption JSON…
                          <input type="file" accept="application/json,.json" onChange={onPickTranscript} style={{ display: 'none' }} />
                        </label>
                      </>
                    )}
                  </Section>
                  <CaptionFontControls value={captionStyle} onChange={setCaptionStyle} />
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
                      <div style={{ color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
                        Shader
                      </div>
                      <TabBar<VideoSubTab>
                        tabs={[
                          { value: 'levels', label: 'Levels' },
                          { value: 'tone', label: 'Tone' },
                          { value: 'color', label: 'Color' },
                          { value: 'distortion', label: 'Distort' },
                          { value: 'dither', label: 'Dither' },
                        ]}
                        value={videoSubTab}
                        onChange={setVideoSubTab}
                        variant="sub"
                      />
                      {videoSubTab === 'levels' && <VideoLevelsSection value={vid} onChange={setVid} />}
                      {videoSubTab === 'tone' && <VideoToneSection value={vid} onChange={setVid} />}
                      {videoSubTab === 'color' && <VideoColorSection value={vid} onChange={setVid} />}
                      {videoSubTab === 'distortion' && <VideoDistortionSection value={vid} onChange={setVid} />}
                      {videoSubTab === 'dither' && <VideoDitherSection value={vid} onChange={setVid} />}
                    </>
                  )}
                </>
              )}
            </>
          )}

          {mainTab === 'reactivity' && (
            <ReactivityControls
              value={audioReactivity}
              onChange={setAudioReactivity}
              hasAudio={!!audioInfo}
              bandsRef={lastBandsRef}
            />
          )}

          {mainTab === 'music' && (
            <MusicControls
              value={music}
              onChange={setMusic}
              hasMusic={!!musicInfo}
              musicName={musicInfo?.name ?? null}
              onPickFile={(f) => {
                if (activeProjectIdRef.current) loadMusicFile(f, activeProjectIdRef.current);
                else addToast('Select project first', 'error');
              }}
              onClear={handleClearMusic}
              duckGainRef={musicDuckGainRef}
              speechRmsRef={speechRmsRef}
            />
          )}

          {mainTab === 'export' && (
            <ExportPanel
              params={activeExportParams}
              onChange={setActiveExportParams}
              onExport={exportComposition}
              lockedDuration={videoInfo?.duration ?? audioInfo?.duration}
              playheadSecond={(videoInfo || audioInfo) ? playheadSecond : undefined}
              onSeekPlayhead={(videoInfo || audioInfo) ? handleSeekPlayhead : undefined}
              layerSummary={exportLayerSummary}
            />
          )}
        </div>
      </div>
    </div>
  );
};
