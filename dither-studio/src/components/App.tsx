import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BackgroundRenderer } from '../lib/BackgroundRenderer';
import { VideoRenderer } from '../lib/VideoRenderer';
import {
  DEFAULT_BACKGROUND, DEFAULT_DITHER, DEFAULT_VIDEO, DEFAULT_EXPORT,
  DEFAULT_CAPTION_STYLE,
  type BackgroundParams, type DitherParams, type VideoShaderParams, type ExportParams, type CaptionStyle,
} from '../lib/types';
import { PRESETS, VIDEO_PRESETS } from '../lib/presets';
import { canvasToPngBlob, frameNumber, seekVideoTo, writePng } from '../lib/exporter';
import { Section, Select, Slider, Toggle } from './Controls';
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
  uploadVideo, uploadCaption, getVideoUrl, getTranscript, openEventStream,
  type ProjectMeta,
} from '../lib/projectApi';

type MainTab = 'background' | 'video' | 'export';
type BgSubTab = 'noise' | 'dither';
type VideoSubTab = 'levels' | 'tone' | 'color' | 'distortion' | 'dither';
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
      <Toggle label="underline anim" value={value.underlineEnabled} onChange={(underlineEnabled) => set({ underlineEnabled })} />
      <Toggle label="word highlight" value={value.wordHighlightEnabled} onChange={(wordHighlightEnabled) => set({ wordHighlightEnabled })} />
    </Section>
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

  // transcript / captions
  const [transcript, setTranscript] = useState<TranscriptData | null>(null);
  const [transcriptName, setTranscriptName] = useState<string | null>(null);
  const [captionMode, setCaptionMode] = useState<CaptionMode>('line');
  const [captionStyle, setCaptionStyle] = useState<CaptionStyle>(DEFAULT_CAPTION_STYLE);

  // composition guides (overlay rectangles at fixed pixel sizes)
  const [guidesOn, setGuidesOn] = useState<Record<GuideKey, boolean>>({
    '1080x1350': false, '1080x1080': false, '1920x1080': false, '1080x1920': false,
  });
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
  const [muted, setMuted] = useState(false);

  // export source picker (defaults to whichever was last viewed)
  const [exportSource, setExportSource] = useState<'background' | 'video'>('background');

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
  const videoBlobUrlRef = useRef<string | null>(null);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef(performance.now());
  const exportingRef = useRef(false);
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
        if (bgLayerOnRef.current) {
          const t = (performance.now() - startRef.current) / 1000;
          bgRendererRef.current?.renderFrame(t);
        }
        if (videoLayerOnRef.current) {
          videoRendererRef.current?.renderFrame();
        }
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      if (videoBlobUrlRef.current) URL.revokeObjectURL(videoBlobUrlRef.current);
      bgRendererRef.current?.dispose();
      videoRendererRef.current?.dispose();
      bgRendererRef.current = null;
      videoRendererRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // mirror state into refs the raf loop reads
  const mainTabRef = useRef(mainTab);
  const exportSourceRef = useRef(exportSource);
  const bgLayerOnRef = useRef(bgLayerOn);
  const videoLayerOnRef = useRef(videoLayerOn);
  useEffect(() => { mainTabRef.current = mainTab; }, [mainTab]);
  useEffect(() => { exportSourceRef.current = exportSource; }, [exportSource]);
  useEffect(() => { bgLayerOnRef.current = bgLayerOn; }, [bgLayerOn]);
  useEffect(() => { videoLayerOnRef.current = videoLayerOn; }, [videoLayerOn]);

  // push parameter updates
  useEffect(() => { bgRendererRef.current?.setParams(bg); }, [bg]);
  useEffect(() => { bgRendererRef.current?.setDitherParams(bgDither); }, [bgDither]);
  useEffect(() => { videoRendererRef.current?.setParams(vid); }, [vid]);
  useEffect(() => { if (videoElRef.current) videoElRef.current.muted = muted; }, [muted]);
  useEffect(() => {
    const w = Math.max(1, Math.floor(previewFrame.w));
    const h = Math.max(1, Math.floor(previewFrame.h));
    bgRendererRef.current?.setSize(w, h);
    videoRendererRef.current?.setSize(w, h);
  }, [previewFrame.w, previewFrame.h]);
  useEffect(() => {
    if (!verticalVideo || !guidesOn['1920x1080']) return;
    setGuidesOn((s) => ({ ...s, '1920x1080': false }));
    setCropToGuide(false);
  }, [verticalVideo, guidesOn]);

  // ---------- auto-save settings to active project ----------
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!activeProjectId) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveSettings(activeProjectId, {
        background: bg, backgroundDither: bgDither, video: vid,
        captionMode, captionStyle, layers: { background: bgLayerOn, video: videoLayerOn, captions: captionsLayerOn },
        guides: guidesOn, cropToGuide, exportBackground: bgExport, exportVideo: vidExport,
        ui: { mainTab, bgSubTab, videoSubTab, exportSource, muted },
      }).catch(() => { });
    }, 800);
  }, [activeProjectId, bg, bgDither, vid, captionMode, captionStyle, bgLayerOn, videoLayerOn, captionsLayerOn, guidesOn, cropToGuide, bgExport, vidExport, mainTab, bgSubTab, videoSubTab, exportSource, muted]);

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
      setExportSource('video');
      setBg(DEFAULT_BACKGROUND);
      setBgDither(DEFAULT_DITHER);
      setVid(DEFAULT_VIDEO);
      setBgExport({ ...DEFAULT_EXPORT, filenamePrefix: 'bg' });
      setVidExport({ ...DEFAULT_EXPORT, filenamePrefix: 'talking' });
      setGuidesOn({ '1080x1350': false, '1080x1080': false, '1920x1080': false, '1080x1920': false });
      setCropToGuide(false);
      setBgLayerOn(true);
      setVideoLayerOn(true);
      setCaptionsLayerOn(true);
      setCaptionMode('line');
      setCaptionStyle(DEFAULT_CAPTION_STYLE);
      setMuted(false);
      setVideoInfo(null);
      setTranscript(null);
      setTranscriptName(null);
      setPlaying(false);
      videoElRef.current?.pause();
      videoElRef.current = null;
      videoRendererRef.current?.setVideo(null);
      setProjectStatus({ kind: 'success', message: `Project "${p.name}" created`, detail: `Folder: projects/${p.id}` });
      addToast(`Project "${p.name}" created`, 'success');
    } catch { addToast('Failed to create project', 'error'); }
  };

  const handleSelectProject = async (id: string) => {
    try {
      const proj = await getProject(id);
      setActiveProjectId(id);
      setPlaying(false);
      videoElRef.current?.pause();
      videoElRef.current = null;
      videoRendererRef.current?.setVideo(null);
      setVideoInfo(null);
      setTranscript(null);
      setTranscriptName(null);
      if (proj.background) setBg(proj.background);
      if (proj.backgroundDither) setBgDither(proj.backgroundDither);
      if (proj.video) setVid(proj.video);
      if (proj.captionMode) setCaptionMode(proj.captionMode);
      if (proj.captionStyle) setCaptionStyle({ ...DEFAULT_CAPTION_STYLE, ...proj.captionStyle });
      if (proj.ui) {
        if (proj.ui.mainTab) setMainTab(proj.ui.mainTab);
        if (proj.ui.bgSubTab) setBgSubTab(proj.ui.bgSubTab);
        if (proj.ui.videoSubTab) setVideoSubTab(proj.ui.videoSubTab);
        if (proj.ui.exportSource) setExportSource(proj.ui.exportSource);
        if (typeof proj.ui.muted === 'boolean') setMuted(proj.ui.muted);
      }
      if (proj.layers) {
        setBgLayerOn(proj.layers.background ?? true);
        setVideoLayerOn(proj.layers.video ?? true);
        setCaptionsLayerOn(proj.layers.captions ?? true);
      }
      if (proj.guides) setGuidesOn(proj.guides);
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
          setVidExport(p => ({ ...p, width: v.videoWidth, height: v.videoHeight, duration: v.duration }));
          videoRendererRef.current?.setVideo(v);
          videoElRef.current = v;
          v.currentTime = 0;
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

  // ---------- video file load ----------
  const loadFile = (file: File) => {
    const pid = activeProjectIdRef.current;
    if (!pid) {
      setProjectStatus({ kind: 'error', message: 'Create or select a project before importing video' });
      addToast('Create or select a project before importing video', 'error');
      return;
    }

    if (videoBlobUrlRef.current) URL.revokeObjectURL(videoBlobUrlRef.current);
    setTranscript(null);
    setTranscriptName(null);
    setProjectStatus({ kind: 'progress', message: 'Importing video into project folder', progress: 0, detail: `Folder: projects/${pid}` });

    // Show immediately in preview via blob URL
    const url = URL.createObjectURL(file);
    videoBlobUrlRef.current = url;
    const v = document.createElement('video');
    v.src = url;
    v.muted = false; v.volume = 1; v.playsInline = true; v.preload = 'auto';
    v.addEventListener('loadedmetadata', () => {
      setVideoInfo({ name: file.name, duration: v.duration, w: v.videoWidth, h: v.videoHeight });
      setVidExport((p) => ({ ...p, width: v.videoWidth, height: v.videoHeight, duration: v.duration }));
      videoRendererRef.current?.setVideo(v);
      videoElRef.current = v;
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
    const v = videoElRef.current;
    if (!v) return;
    if (v.paused) { v.play(); setPlaying(true); }
    else { v.pause(); setPlaying(false); }
  };

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

  const exportBackground = async (
    dir: FileSystemDirectoryHandle,
    onProgress: (done: number, total: number) => void
  ) => {
    const r = bgRendererRef.current;
    if (!r) return;
    exportingRef.current = true;
    try {
      r.setSize(bgExport.width, bgExport.height);
      const total = Math.max(1, Math.ceil(bgExport.duration * bgExport.fps));
      for (let i = 0; i < total; i++) {
        const t = bgExport.startSecond + i / bgExport.fps;
        r.renderFrame(t);
        const blob = await canvasToPngBlob(r.renderer.domElement as HTMLCanvasElement);
        await writePng(dir, `${bgExport.filenamePrefix}_${frameNumber(i)}.png`, blob);
        onProgress(i + 1, total);
        if (i % 4 === 0) await new Promise((res) => setTimeout(res, 0));
      }
    } finally {
      fitPreviewBack();
      startRef.current = performance.now();
      exportingRef.current = false;
    }
  };

  const exportVideo = async (
    dir: FileSystemDirectoryHandle,
    onProgress: (done: number, total: number) => void
  ) => {
    const r = videoRendererRef.current;
    const v = videoElRef.current;
    if (!r || !v) return;
    exportingRef.current = true;
    v.pause(); setPlaying(false);
    try {
      r.setSize(vidExport.width, vidExport.height);
      const total = Math.max(1, Math.ceil(vidExport.duration * vidExport.fps));
      for (let i = 0; i < total; i++) {
        const t = vidExport.startSecond + i / vidExport.fps;
        if (t > v.duration) break;
        await seekVideoTo(v, t);
        r.renderFrame();
        const blob = await canvasToPngBlob(r.renderer.domElement as HTMLCanvasElement);
        await writePng(dir, `${vidExport.filenamePrefix}_${frameNumber(i)}.png`, blob);
        onProgress(i + 1, total);
        if (i % 2 === 0) await new Promise((res) => setTimeout(res, 0));
      }
    } finally {
      fitPreviewBack();
      exportingRef.current = false;
    }
  };

  // ---------- layout ----------
  const activeProject = projects.find((p) => p.id === activeProjectId);
  const frameStyle: React.CSSProperties = videoInfo
    ? { position: 'absolute', left: previewFrame.x, top: previewFrame.y, width: previewFrame.w, height: previewFrame.h }
    : { position: 'absolute', inset: 0, width: '100%', height: '100%' };

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
          style={{ ...frameStyle, display: videoLayerOn ? 'block' : 'none' }}
        />

        {/* composition guides (outlines) */}
        {availableGuides.map((g) => {
          if (!guidesOn[g.key]) return null;
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
        })}

        {/* crop mask: black-out everything outside the active guide */}
        {cropToGuide && (() => {
          const active = availableGuides.find((g) => guidesOn[g.key]);
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

        {/* captions overlay */}
        {captionsLayerOn && transcript && (
          <Captions transcript={transcript} mode={captionMode} style={captionStyle} frame={previewFrame} timeSourceRef={videoElRef} />
        )}

        {/* status toasts */}
        <StatusToast toasts={toasts} onDismiss={dismissToast} />

        {videoLayerOn && !videoInfo && (
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
            <div>No video loaded.</div>
            <div style={{ fontSize: 11 }}>Drop a video here or use the panel on the right.</div>
          </div>
        )}
      </div>

      {/* right panel */}
      <div style={{ borderLeft: '1px solid #1f1f1f', display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, background: '#0c0c0c' }}>
        <ProjectBar
          projects={projects}
          activeId={activeProjectId}
          onSelect={handleSelectProject}
          onCreate={handleCreateProject}
        />
        <ProjectStatusPanel project={activeProject} status={projectStatus} />
        {/* video transport (when a video is loaded) */}
        {videoInfo && (
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
              {videoInfo.name}
            </span>
            <span style={{ color: '#666', fontSize: 11, marginLeft: 'auto', flexShrink: 0 }}>
              {videoInfo.w}×{videoInfo.h} · {videoInfo.duration.toFixed(1)}s
            </span>
          </div>
        )}

        {/* layer toggles */}
        <div style={{ display: 'flex', gap: 6, padding: '8px 10px', borderBottom: '1px solid #1f1f1f', background: '#0a0a0a', alignItems: 'center' }}>
          <span style={{ color: '#666', textTransform: 'uppercase', letterSpacing: 1, marginRight: 4 }}>Layers</span>
          <LayerToggle label="Background" on={bgLayerOn} onClick={() => setBgLayerOn((v) => !v)} />
          <LayerToggle label="Video" on={videoLayerOn} onClick={() => setVideoLayerOn((v) => !v)} />
          <LayerToggle label="Captions" on={captionsLayerOn} onClick={() => setCaptionsLayerOn((v) => !v)} />
        </div>

        {/* guides */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: '8px 10px', borderBottom: '1px solid #1f1f1f', background: '#0a0a0a', alignItems: 'center' }}>
          <span style={{ color: '#666', textTransform: 'uppercase', letterSpacing: 1, marginRight: 4 }}>Guides</span>
          {availableGuides.map((g) => (
            <PillToggle
              key={g.key}
              label={g.label}
              on={guidesOn[g.key]}
              onClick={() => setGuidesOn((s) => ({ ...s, [g.key]: !s[g.key] }))}
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
            { value: 'video', label: 'Video' },
            { value: 'export', label: 'Export' },
          ]}
          value={mainTab}
          onChange={setMainTab}
          variant="main"
        />
        <div style={{ overflowY: 'auto', padding: 10, flex: 1, minHeight: 0 }}>
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
              {!videoInfo ? (
                <Section title="Import video">
                  <div style={{ color: '#aaa', marginBottom: 8 }}>
                    Choose a video file to process. You can also drop one onto the preview.
                  </div>
                  <label style={{
                    display: 'inline-block', padding: '8px 14px', background: '#1f6feb',
                    color: '#fff', borderRadius: 3, cursor: 'pointer',
                  }}>
                    Choose video…
                    <input type="file" accept="video/*" onChange={onPickFile} style={{ display: 'none' }} />
                  </label>
                </Section>
              ) : (
                <>
                  <Section title="Source">
                    <div style={{ color: '#aaa', marginBottom: 6 }}>
                      {videoInfo.name}<br />
                      {videoInfo.w}×{videoInfo.h} · {videoInfo.duration.toFixed(2)}s
                    </div>
                    <label style={{
                      display: 'inline-block', padding: '6px 12px', background: '#222',
                      color: '#ddd', borderRadius: 3, cursor: 'pointer',
                    }}>
                      Replace…
                      <input type="file" accept="video/*" onChange={onPickFile} style={{ display: 'none' }} />
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

          {mainTab === 'export' && (
            <>
              <Section title="Source">
                <Select
                  label="export from"
                  value={exportSource}
                  options={[
                    { label: 'Background', value: 'background' },
                    { label: 'Video', value: 'video' },
                  ]}
                  onChange={(v) => setExportSource(v as 'background' | 'video')}
                />
              </Section>
              {exportSource === 'background' ? (
                <ExportPanel params={bgExport} onChange={setBgExport} onExport={exportBackground} />
              ) : !videoInfo ? (
                <Section title="Export">
                  <div style={{ color: '#ff6b6b' }}>Load a video on the Video tab first.</div>
                </Section>
              ) : (
                <ExportPanel
                  params={vidExport}
                  onChange={setVidExport}
                  onExport={exportVideo}
                  lockedDuration={videoInfo.duration}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
