import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BackgroundRenderer } from '../lib/BackgroundRenderer';
import { VideoRenderer } from '../lib/VideoRenderer';
import { AudioSource, type AudioBands, type LimiterParams, DEFAULT_LIMITER } from '../lib/AudioSource';
import { MusicPlayer, DEFAULT_MUSIC_PARAMS, type MusicParams } from '../lib/MusicPlayer';
import {
  DEFAULT_BACKGROUND, DEFAULT_DITHER, DEFAULT_VIDEO, DEFAULT_EXPORT,
  DEFAULT_CAPTION_STYLE, DEFAULT_AUDIO_REACTIVITY, DEFAULT_CAPTION_SHADER,
  type BackgroundParams, type DitherParams, type VideoShaderParams, type ExportParams, type CaptionStyle,
  type AudioReactivityParams, type CaptionShaderParams, type MicroTimeline,
} from '../lib/types';
import { PreviewTimeline } from './timeline/PreviewTimeline';
import { type CaptionMode, type TranscriptData } from '../lib/transcript';
import {
  type ProjectMeta,
} from '../lib/projectApi';
import {
  type MainTab, type BgSubTab, type VideoSubTab, type AudioSubTab, type CaptionsSubTab,
  type ProjectTaskStatus, type GuideKey,
  GUIDES,
} from '../lib/constants';
import { isVerticalVideo, fitRect, resolveExportRange } from '../lib/layoutUtils';
import { useToasts } from '../hooks/useToasts';
import { useJumpCuts } from '../hooks/useJumpCuts';
import { createExportComposition } from '../hooks/useExporter';
import { createHandleCreateProject, createHandleSelectProject } from '../hooks/useProjectHandlers';
import { createLoadFile, createLoadMusicFile, createHandleClearMusic } from '../hooks/useMediaLoader';
import { useTranscriptHandlers } from '../hooks/useTranscript';
import { createTogglePlay, createHandleSeekPlayhead, usePlaybackKeyboard } from '../hooks/usePlayback';
import { useRenderLoop } from '../hooks/useRenderLoop';
import { usePlayheadTick } from '../hooks/usePlayheadTick';
import { useSSEStream, useAutoSave, useProjectRouting } from '../hooks/useProjectEffects';
import { useAppUndoRedo } from '../hooks/useAppUndoRedo';
import { useClipHandlers } from '../hooks/useClipHandlers';
import { useRefSync, useParamPush } from '../hooks/useParamSync';
import { SidebarPanel } from './panels/SidebarPanel';
import { PreviewArea } from './PreviewArea';

export const App: React.FC = () => {
  // ---------- shared state ----------
  const [mainTab, setMainTab] = useState<MainTab>('background');
  const [bgSubTab, setBgSubTab] = useState<BgSubTab>('noise');
  const [videoSubTab, setVideoSubTab] = useState<VideoSubTab>('levels');
  const [audioSubTab, setAudioSubTab] = useState<AudioSubTab>('music');
  const [captionsSubTab, setCaptionsSubTab] = useState<CaptionsSubTab>('captions');
  const [outroVolume, setOutroVolume] = useState(0.5);
  const [outroAudio] = useState(() => {
    const a = new Audio('audio/bassnoise.wav');
    a.loop = false;
    return a;
  });
  const outroAudioRef = useRef<HTMLAudioElement>(outroAudio);

  useEffect(() => {
    outroAudio.volume = outroVolume;
  }, [outroVolume, outroAudio]);

  // visible layers — both can be on at once (video composites over background
  // wherever the video shader's alpha < 1)
  const [bgLayerOn, setBgLayerOn] = useState(true);
  const [bgOffMode, setBgOffMode] = useState<'grid' | 'color'>('grid');
  const [bgOffColor, setBgOffColor] = useState('#000000');
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
  const [captionShader, setCaptionShader] = useState<CaptionShaderParams>(DEFAULT_CAPTION_SHADER);

  // jump cuts
  const jumpCuts = useJumpCuts(transcript);
  const {
    jumpCutsEnabled, setJumpCutsEnabled,
    jumpCutGapMs, setJumpCutGapMs,
    jumpCutPaddingMs, setJumpCutPaddingMs,
    customCutPaddingMs, setCustomCutPaddingMs,
    showSilenceGaps, setShowSilenceGaps,
    showFillerCuts, setShowFillerCuts,
    jumpCutGapOverrides,
    jumpCutGapDisabled,
    selectedGapKey,
    jumpCutGaps,
    jumpCutGapsEffective,
    jumpCutsEnabledRef,
    jumpCutGapListRef,
    customCuts, setCustomCuts,
    handleAdjustGap,
    handleResetGap,
    handleResetAllGaps,
    handleAddCustomCuts,
    handleClearCustomCuts,
    handleToggleGapDisabled,
    handleSelectGap,
  } = jumpCuts;

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
  // Media time (ms) at which the current playback run started. Used by captions
  // to suppress retroactive hold+fade for captions that ended before playback began.
  const [playbackStartMs, setPlaybackStartMs] = useState<number | undefined>(undefined);
  const [microTimelines, setMicroTimelines] = useState<MicroTimeline[]>([]);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [pendingClipStart, setPendingClipStart] = useState<number | null>(null);
  const [muted, setMuted] = useState(false);
  // Volume for the main video/audio element (the "video" track in the Mixer).
  const [mediaVolume, setMediaVolume] = useState(1);
  // Limiter / boost on the main media element's audio path.
  const [limiter, setLimiter] = useState<LimiterParams>(DEFAULT_LIMITER);
  const limiterReductionRef = useRef(0);

  // ---------- project management ----------
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [projectStatus, setProjectStatus] = useState<ProjectTaskStatus>({ kind: 'idle', message: 'Create or select a project' });
  const activeProjectIdRef = useRef<string | null>(null);
  useEffect(() => { activeProjectIdRef.current = activeProjectId; }, [activeProjectId]);

  // Derived state
  const baseExportParams = videoInfo ? vidExport : bgExport;
  const setBaseExportParams = videoInfo ? setVidExport : setBgExport;
  const selectedClip = microTimelines.find(mt => mt.id === selectedClipId) ?? null;
  const activeExportParams = selectedClip
    ? {
        ...baseExportParams,
        startSecond: selectedClip.startSecond,
        endSecond: selectedClip.endSecond,
        filenamePrefix: selectedClip.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || baseExportParams.filenamePrefix,
      }
    : baseExportParams;
  const setActiveExportParams = setBaseExportParams;
  const mediaDuration = videoInfo?.duration ?? audioInfo?.duration ?? activeExportParams.duration ?? 10;
  const timelineDuration = mediaDuration + (activeExportParams.outroEnabled ? 5 : 0);
  const timelineRange = resolveExportRange(activeExportParams, mediaDuration);
  const verticalVideo = isVerticalVideo(videoInfo);
  const availableGuides = verticalVideo ? GUIDES.filter((g) => g.key !== '1920x1080') : GUIDES;
  const previewFrame = videoInfo
    ? fitRect(previewSize.w, previewSize.h, videoInfo.w, videoInfo.h)
    : { x: 0, y: 0, w: previewSize.w, h: previewSize.h };

  // mirror state into refs the raf loop reads
  const bgLayerOnRef = useRef(bgLayerOn);
  const videoLayerOnRef = useRef(videoLayerOn);
  const audioReactivityRef = useRef(audioReactivity);
  const musicRef = useRef(music);
  const playingRef = useRef(playing);
  const playingInClipRef = useRef(false);
  const playheadRef = useRef(playheadSecond);
  const activeExportParamsRef = useRef(activeExportParams);
  const timelineDurationRef = useRef(timelineDuration);
  const selectedClipRef = useRef(selectedClip);

  useRefSync(
    { bgLayerOnRef, videoLayerOnRef, audioReactivityRef, musicRef, playingRef, playheadRef, activeExportParamsRef, timelineDurationRef, selectedClipRef, activeProjectIdRef },
    { bgLayerOn, videoLayerOn, audioReactivity, music, playing, playheadSecond, activeExportParams, timelineDuration, selectedClip, activeProjectId },
  );

  // ---------- toasts ----------
  const { toasts, addToast, updateToast, dismissToast } = useToasts();

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

  // ---------- init renderers once ----------
  useRenderLoop(
    {
      previewWrapRef, bgCanvasRef, videoCanvasRef,
      bgRendererRef, videoRendererRef,
      audioSourceRef, musicPlayerRef,
      videoBlobUrlRef, audioBlobUrlRef,
      rafRef, startRef, exportingRef,
      lastBandsRef, speechRmsRef, musicDuckGainRef, limiterReductionRef,
      bgLayerOnRef, videoLayerOnRef, audioReactivityRef, musicRef,
      playheadRef, activeExportParamsRef, timelineDurationRef,
    },
    bg, bgDither, vid, setPreviewSize,
  );


  // Push parameter updates to renderers, audio sources, and media elements
  useParamPush(
    { bgRendererRef, videoRendererRef, videoElRef, audioElRef, audioSourceRef, musicPlayerRef, musicDuckGainRef, exportingRef },
    { bg, bgDither, vid, muted, mediaVolume, limiter, music, musicLayerOn, videoInfo, audioInfo, previewFrameW: previewFrame.w, previewFrameH: previewFrame.h, verticalVideo, activeGuide, setActiveGuide, setCropToGuide },
  );
  // Playhead tick: keeps playhead in sync with media, handles jump-cuts, clips, and outro.
  usePlayheadTick(
    { mediaElRef, audioSourceRef, musicPlayerRef, outroAudioRef, playingRef, playheadRef, playingInClipRef, selectedClipRef, activeExportParamsRef, jumpCutsEnabledRef, jumpCutGapListRef },
    videoInfo, audioInfo, outroVolume, setPlaying, setPlayheadSecond,
  );

  const activeProject = projects.find((p) => p.id === activeProjectId);

  // ---------- auto-save settings to active project ----------
  useAutoSave(activeProjectId, {
    bg, bgDither, vid, audioReactivity, music, limiter,
    captionMode, captionStyle, captionShader,
    bgLayerOn, bgOffMode, bgOffColor, videoLayerOn, captionsLayerOn, musicLayerOn,
    activeGuide, cropToGuide, bgExport, vidExport,
    microTimelines, selectedClipId,
    customCuts, jumpCutsEnabled, jumpCutGapMs, jumpCutPaddingMs, customCutPaddingMs,
    showSilenceGaps, showFillerCuts,
    mainTab, bgSubTab, videoSubTab, audioSubTab, muted, mediaVolume, outroVolume,
    projectHasVideo: !!activeProject?.hasVideo,
    projectHasAudio: !!activeProject?.hasAudio,
    videoInfoLoaded: !!videoInfo,
    audioInfoLoaded: !!audioInfo,
  });

  // ---------- undo / redo (Cmd+Z / Cmd+Shift+Z) ----------
  useAppUndoRedo(
    {
      bg, bgDither, vid, audioReactivity, music, limiter,
      captionMode, captionStyle, captionShader,
      bgLayerOn, bgOffMode, bgOffColor, videoLayerOn, captionsLayerOn, musicLayerOn,
      activeGuide, cropToGuide, bgExport, vidExport,
      microTimelines, selectedClipId, customCuts,
      jumpCutsEnabled, jumpCutGapMs, jumpCutPaddingMs, customCutPaddingMs,
      showSilenceGaps, showFillerCuts, muted, mediaVolume, outroVolume,
    },
    {
      setBg, setBgDither, setVid, setAudioReactivity, setMusic, setLimiter,
      setCaptionMode, setCaptionStyle, setCaptionShader,
      setBgLayerOn, setBgOffMode, setBgOffColor, setVideoLayerOn, setCaptionsLayerOn, setMusicLayerOn,
      setActiveGuide, setCropToGuide, setBgExport, setVidExport,
      setMicroTimelines, setSelectedClipId, setCustomCuts,
      setJumpCutsEnabled, setJumpCutGapMs, setJumpCutPaddingMs, setCustomCutPaddingMs,
      setShowSilenceGaps, setShowFillerCuts, setMuted, setMediaVolume, setOutroVolume,
    },
    activeProjectId,
  );

  // ---------- SSE stream for transcription progress ----------
  useSSEStream({
    activeProjectId, activeProjectIdRef,
    setProjectStatus, setTranscript, setTranscriptName, setProjects,
    addToast, updateToast,
  });

  // ---------- project handlers ----------
  const projectRefs = { mediaElRef, videoElRef, audioElRef, audioSourceRef, videoRendererRef, musicElRef, musicPlayerRef };
  const projectSetters = {
    setProjects, setActiveProjectId, setProjectStatus,
    setMainTab, setBgSubTab, setVideoSubTab, setAudioSubTab,
    setBg, setBgDither, setVid, setBgExport, setVidExport,
    setActiveGuide, setCropToGuide, setBgLayerOn, setBgOffMode, setBgOffColor, setVideoLayerOn, setCaptionsLayerOn, setMusicLayerOn,
    setCaptionMode, setCaptionStyle, setCaptionShader,
    setMuted, setMediaVolume, setOutroVolume,
    setVideoInfo, setAudioInfo, setPlayheadSecond, setTranscript, setTranscriptName, setPlaying,
    setAudioReactivity, setMusicInfo, setMusic, setLimiter,
    setMicroTimelines, setSelectedClipId, setPendingClipStart,
    setCustomCuts, setJumpCutsEnabled, setJumpCutGapMs, setJumpCutPaddingMs, setCustomCutPaddingMs,
    setShowSilenceGaps, setShowFillerCuts,
    addToast,
  };
  const handleCreateProject = createHandleCreateProject(projectRefs, projectSetters);
  const handleSelectProject = createHandleSelectProject(projectRefs, projectSetters);

  // ---------- load project list on mount + URL routing ----------
  useProjectRouting(activeProjectIdRef, activeProjectId, setProjects, handleSelectProject);

  // ---------- media file load (video or audio, auto-detected) ----------
  const mediaLoaderRefs = { mediaElRef, videoElRef, audioElRef, audioSourceRef, videoRendererRef, musicElRef, musicPlayerRef, videoBlobUrlRef, audioBlobUrlRef, activeProjectIdRef };
  const mediaLoaderSetters = {
    setProjects, setProjectStatus, setMainTab, setAudioSubTab,
    setPlaying, setVideoInfo, setAudioInfo, setPlayheadSecond,
    setTranscript, setTranscriptName, setVidExport, setBgExport,
    setMusicInfo, setMusicLayerOn, addToast, updateToast,
  };
  const loadFile = createLoadFile(mediaLoaderRefs, mediaLoaderSetters);
  const loadMusicFile = createLoadMusicFile(mediaLoaderRefs, mediaLoaderSetters);
  const handleClearMusic = createHandleClearMusic(mediaLoaderRefs, mediaLoaderSetters);
  const onPickFile: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const f = e.target.files?.[0];
    if (f) loadFile(f);
  };
  const onDrop: React.DragEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) loadFile(f);
  };
  const playbackRefs = { mediaElRef, audioSourceRef, musicElRef, musicPlayerRef, playingInClipRef };
  const playbackState = { music, musicLayerOn, videoInfo, audioInfo, selectedClip };
  const playbackSetters = { setPlaying, setPlayheadSecond, setPlaybackStartMs, setMuted };
  const togglePlay = createTogglePlay(playbackRefs, playbackState, playbackSetters);
  const togglePlayRef = useRef(togglePlay);
  useEffect(() => { togglePlayRef.current = togglePlay; });
  const handleSeekPlayhead = createHandleSeekPlayhead(playbackRefs, playbackState, playbackSetters);
  usePlaybackKeyboard(mediaElRef, togglePlayRef, setMuted);

  // ---------- transcript file load & save ----------
  const { handleEditorUpdateTranscript, onPickTranscript } = useTranscriptHandlers({
    activeProjectIdRef, setProjects, setProjectStatus, setTranscript, setTranscriptName, addToast,
  });

  // ---------- export ----------
  const fitPreviewBack = () => {
    const w = Math.max(1, Math.floor(previewFrame.w));
    const h = Math.max(1, Math.floor(previewFrame.h));
    bgRendererRef.current?.setSize(w, h);
    videoRendererRef.current?.setSize(w, h);
  };

  const exportComposition = createExportComposition(
    { activeProjectIdRef, bgRendererRef, videoRendererRef, videoElRef, audioElRef, audioSourceRef, activeExportParamsRef, exportingRef, startRef, jumpCutGapListRef },
    { bgLayerOn, bgOffMode, bgOffColor, videoLayerOn, captionsLayerOn, jumpCutsEnabled, audioReactivity, captionMode, captionStyle, captionShader, transcript, videoInfo, audioInfo, cropToGuide, activeGuide, availableGuides, previewFrame },
    { setPlaying, setProjectStatus, addToast, updateToast, fitPreviewBack },
  );

  // ---------- layout ----------
  const exportLayerSummary = [
    bgLayerOn ? 'background' : null,
    videoLayerOn ? 'video' : null,
    captionsLayerOn ? 'captions' : null,
  ].filter(Boolean).join(' + ') || 'none';

  const exportGuide = cropToGuide ? GUIDES.find((g) => g.key === activeGuide) : null;
  const isExporting = projectStatus.kind === 'progress' && projectStatus.message.includes('Exporting');
  
  const frameStyle: React.CSSProperties = useMemo(() => {
    if (!videoInfo) return { position: 'absolute', inset: 0, width: '100%', height: '100%' };

    if (isExporting && exportGuide) {
      // During export, fit the export dimensions (e.g. square) into the container
      const r = fitRect(previewSize.w, previewSize.h, exportGuide.w, exportGuide.h);
      return {
        position: 'absolute',
        left: r.x,
        top: r.y,
        width: r.w,
        height: r.h,
      };
    }

    // Normal preview: fit the source video dimensions into the container
    return {
      position: 'absolute',
      left: previewFrame.x,
      top: previewFrame.y,
      width: previewFrame.w,
      height: previewFrame.h,
    };
  }, [isExporting, exportGuide, videoInfo, previewSize, previewFrame]);

  const audioMode = !!audioInfo && !videoInfo;

  const {
    handleClipRangeChange, handleAddClipStart, handleAddClipEnd,
    handleDeleteClip, handleRenameClip, handleTimelineSeek, handleToggleOutro,
  } = useClipHandlers({
    microTimelines, setMicroTimelines, selectedClipId, setSelectedClipId,
    pendingClipStart, setPendingClipStart, playheadSecond, setPlayheadSecond,
    mediaElRef, handleSeekPlayhead, setBaseExportParams: setBaseExportParams,
  });

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 460px', height: '100vh', minHeight: 0, overflow: 'hidden', gap: 0 }}>
      {/* left column: preview on top, dedicated timeline at the bottom */}
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, height: '100vh' }}>
      <PreviewArea
        previewWrapRef={previewWrapRef}
        bgCanvasRef={bgCanvasRef}
        videoCanvasRef={videoCanvasRef}
        frameStyle={frameStyle}
        bgLayerOn={bgLayerOn}
        bgOffMode={bgOffMode}
        bgOffColor={bgOffColor}
        videoLayerOn={videoLayerOn}
        vid={vid}
        setVid={setVid}
        captionsLayerOn={captionsLayerOn}
        audioMode={audioMode}
        activeGuide={activeGuide}
        cropToGuide={cropToGuide}
        availableGuides={availableGuides}
        previewFrame={previewFrame}
        videoInfo={videoInfo}
        audioInfo={audioInfo}
        transcript={transcript}
        captionMode={captionMode}
        captionStyle={captionStyle}
        captionShader={captionShader}
        mediaElRef={mediaElRef}
        playheadSecond={playheadSecond}
        playbackStartMs={playbackStartMs}
        activeExportParams={activeExportParams}
        toasts={toasts}
        onDismissToast={dismissToast}
        onDrop={onDrop}
      />

      {/* dedicated preview-bottom timeline (range handles + zoom + scroll) */}
      <PreviewTimeline
        duration={mediaDuration}
        playhead={playheadSecond}
        onPlayheadChange={handleTimelineSeek}
        outroEnabled={activeExportParams.outroEnabled}
        onToggleOutro={handleToggleOutro}
        microTimelines={microTimelines}
        selectedId={selectedClipId}
        pendingClipStart={pendingClipStart}
        onSelectClip={setSelectedClipId}
        onClipRangeChange={handleClipRangeChange}
        onAddStart={handleAddClipStart}
        onAddEnd={handleAddClipEnd}
        onCancelPending={() => setPendingClipStart(null)}
        onDeleteClip={handleDeleteClip}
        onRenameClip={handleRenameClip}
        skipGapsEnabled={jumpCutsEnabled}
        skipGaps={jumpCutGaps}
        skipGapsEffective={jumpCutGapsEffective}
        skipGapOverrides={jumpCutGapOverrides}
        skipGapDisabled={jumpCutGapDisabled}
        selectedGapKey={selectedGapKey}
        onSelectGap={handleSelectGap}
        onToggleGapDisabled={handleToggleGapDisabled}
        onAdjustSkipGap={handleAdjustGap}
        onResetSkipGap={handleResetGap}
        onResetAllSkipGaps={handleResetAllGaps}
      />
      </div>

      <SidebarPanel
        projects={projects} activeProjectId={activeProjectId} activeProject={activeProject} projectStatus={projectStatus}
        onSelectProject={handleSelectProject} onCreateProject={handleCreateProject}
        videoInfo={videoInfo} audioInfo={audioInfo} audioMode={audioMode}
        playing={playing} togglePlay={togglePlay} muted={muted} setMuted={setMuted}
        transcript={transcript} transcriptName={transcriptName}
        jumpCutsEnabled={jumpCutsEnabled} setJumpCutsEnabled={setJumpCutsEnabled}
        jumpCutGapMs={jumpCutGapMs} setJumpCutGapMs={setJumpCutGapMs}
        jumpCutPaddingMs={jumpCutPaddingMs} setJumpCutPaddingMs={setJumpCutPaddingMs}
        customCuts={customCuts}
        customCutPaddingMs={customCutPaddingMs}
        setCustomCutPaddingMs={setCustomCutPaddingMs}
        showSilenceGaps={showSilenceGaps}
        setShowSilenceGaps={setShowSilenceGaps}
        showFillerCuts={showFillerCuts}
        setShowFillerCuts={setShowFillerCuts}
        onAddCustomCuts={handleAddCustomCuts}
        onClearCustomCuts={handleClearCustomCuts}
        bgLayerOn={bgLayerOn} setBgLayerOn={setBgLayerOn}
        bgOffMode={bgOffMode} setBgOffMode={setBgOffMode}
        bgOffColor={bgOffColor} setBgOffColor={setBgOffColor}
        videoLayerOn={videoLayerOn} setVideoLayerOn={setVideoLayerOn}
        captionsLayerOn={captionsLayerOn} setCaptionsLayerOn={setCaptionsLayerOn}
        musicLayerOn={musicLayerOn} setMusicLayerOn={setMusicLayerOn}
        activeGuide={activeGuide} setActiveGuide={setActiveGuide}
        cropToGuide={cropToGuide} setCropToGuide={setCropToGuide}
        availableGuides={availableGuides}
        mainTab={mainTab} setMainTab={setMainTab}
        bg={bg} setBg={setBg} bgDither={bgDither} setBgDither={setBgDither}
        bgSubTab={bgSubTab} setBgSubTab={setBgSubTab}
        vid={vid} setVid={setVid} videoSubTab={videoSubTab} setVideoSubTab={setVideoSubTab}
        onPickFile={onPickFile}
        captionsSubTab={captionsSubTab} setCaptionsSubTab={setCaptionsSubTab}
        captionMode={captionMode} setCaptionMode={setCaptionMode}
        captionStyle={captionStyle} setCaptionStyle={setCaptionStyle}
        captionShader={captionShader} setCaptionShader={setCaptionShader}
        onPickTranscript={onPickTranscript} onEditorUpdate={handleEditorUpdateTranscript}
        audioSubTab={audioSubTab} setAudioSubTab={setAudioSubTab}
        audioReactivity={audioReactivity} setAudioReactivity={setAudioReactivity}
        lastBandsRef={lastBandsRef}
        music={music} setMusic={setMusic} musicInfo={musicInfo}
        onPickMusicFile={(f) => {
          if (activeProjectIdRef.current) loadMusicFile(f, activeProjectIdRef.current);
          else addToast('Select project first', 'error');
        }}
        onClearMusic={handleClearMusic}
        musicDuckGainRef={musicDuckGainRef} speechRmsRef={speechRmsRef}
        mediaVolume={mediaVolume} setMediaVolume={setMediaVolume}
        limiter={limiter} setLimiter={setLimiter} limiterReductionRef={limiterReductionRef}
        outroVolume={outroVolume} setOutroVolume={setOutroVolume}
        activeExportParams={activeExportParams} setActiveExportParams={setActiveExportParams}
        exportComposition={exportComposition} exportLayerSummary={exportLayerSummary}
        selectedClipName={selectedClip?.name}
        addToast={addToast}
      />
    </div>
  );
};
