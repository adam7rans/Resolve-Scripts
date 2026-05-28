import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BackgroundRenderer } from '../lib/BackgroundRenderer';
import { VideoRenderer } from '../lib/VideoRenderer';
import { AudioSource, type AudioBands, type LimiterParams, DEFAULT_LIMITER } from '../lib/AudioSource';
import { MusicPlayer, DEFAULT_MUSIC_PARAMS, type MusicParams } from '../lib/MusicPlayer';
import {
  DEFAULT_BACKGROUND, DEFAULT_DITHER, DEFAULT_VIDEO, DEFAULT_EXPORT, normalizeVideoShaderParams,
  DEFAULT_CAPTION_STYLE, DEFAULT_AUDIO_REACTIVITY, DEFAULT_CAPTION_SHADER,
  MICRO_TIMELINE_COLORS,
  type BackgroundParams, type DitherParams, type VideoShaderParams, type ExportParams, type CaptionStyle,
  type AudioReactivityParams, type CaptionShaderParams, type MicroTimeline, type MusicAsset, type MusicTimelineClip,
} from '../lib/types';
import { PreviewTimeline } from './timeline/PreviewTimeline';
import { applyClipCaptionEdits, type CaptionMode, type TranscriptData, type ClipCaptionEdits } from '../lib/transcript';
import {
  listProjects,
  type ProjectMeta,
  deleteMusicAsset,
  getMusicAssetUrl,
  uploadMusicFiles,
} from '../lib/projectApi';
import {
  type MainTab, type BgSubTab, type VideoSubTab, type VideoShaderSubTab, type AudioSubTab, type CaptionsSubTab, type EditorSubTab, type EditorMode,
  type ProjectTaskStatus, type GuideKey,
  GUIDES,
} from '../lib/constants';
import { isVerticalVideo, fitRect, resolveExportRange } from '../lib/layoutUtils';
import { mergeTimeGaps, outputToSourceTime, sourceToOutputTime } from '../lib/timeMapping';
import { useToasts } from '../hooks/useToasts';
import { useJumpCuts } from '../hooks/useJumpCuts';
import { createExportComposition } from '../hooks/useExporter';
import { createHandleCreateProject, createHandleSelectProject } from '../hooks/useProjectHandlers';
import { createLoadFile, createLoadMusicFile, createHandleClearMusic, createImportNativeMedia } from '../hooks/useMediaLoader';
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
import { isCustomKey } from '../hooks/useJumpCuts';

const FULL_EXPORT_CHUNK_SECONDS = 300;
const MUSIC_TRACK_COUNT = 2;
const MUSIC_DEFAULT_OVERLAP_SECONDS = 10;

function sanitizeExportPrefix(name: string, fallback: string) {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || fallback;
}

function clampMusicFade(value: number, duration: number) {
  return Math.max(0, Math.min(value, Math.max(0, duration - 0.01)));
}

function musicClipEnd(clip: MusicTimelineClip) {
  return clip.startSecond + clip.durationSecond;
}

function musicFadeGainAtTime(clip: MusicTimelineClip, t: number) {
  if (t < clip.startSecond || t > musicClipEnd(clip)) return 0;
  const local = t - clip.startSecond;
  const remaining = musicClipEnd(clip) - t;
  const fadeIn = clip.fadeInSecond > 0 ? Math.min(1, local / clip.fadeInSecond) : 1;
  const fadeOut = clip.fadeOutSecond > 0 ? Math.min(1, remaining / clip.fadeOutSecond) : 1;
  return Math.max(0, Math.min(1, fadeIn, fadeOut));
}

async function readLocalAudioDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = document.createElement('audio');
    audio.preload = 'metadata';
    audio.src = url;
    audio.addEventListener('loadedmetadata', () => {
      const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
      URL.revokeObjectURL(url);
      resolve(duration);
    }, { once: true });
    audio.addEventListener('error', () => {
      URL.revokeObjectURL(url);
      resolve(0);
    }, { once: true });
  });
}

export const App: React.FC = () => {
  // ---------- shared state ----------
  const [mainTab, setMainTab] = useState<MainTab>('background');
  const [bgSubTab, setBgSubTab] = useState<BgSubTab>('noise');
  const [videoSubTab, setVideoSubTab] = useState<VideoSubTab>('shader');
  const [videoShaderSubTab, setVideoShaderSubTab] = useState<VideoShaderSubTab>('image');
  const [audioSubTab, setAudioSubTab] = useState<AudioSubTab>('music');
  const [captionsSubTab, setCaptionsSubTab] = useState<CaptionsSubTab>('editor');
  const [editorSubTab, setEditorSubTab] = useState<EditorSubTab>('edits');
  const [editorMode, setEditorMode] = useState<EditorMode>('clips');
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
  const [musicLibrary, setMusicLibrary] = useState<MusicAsset[]>([]);
  const [musicAssetDurations, setMusicAssetDurations] = useState<Record<string, number>>({});
  const [selectedMusicAssetIds, setSelectedMusicAssetIds] = useState<string[]>([]);
  const [musicTimelineClips, setMusicTimelineClips] = useState<MusicTimelineClip[]>([]);
  const [selectedMusicClipId, setSelectedMusicClipId] = useState<string | null>(null);
  const [showAudioTracks, setShowAudioTracks] = useState(true);

  // transcript / captions
  const [transcript, setTranscript] = useState<TranscriptData | null>(null);
  const [transcriptName, setTranscriptName] = useState<string | null>(null);
  const [captionClipEdits, setCaptionClipEdits] = useState<Record<string, ClipCaptionEdits>>({});
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
    showManualCuts, setShowManualCuts,
    jumpCutGapOverrides,
    setJumpCutGapOverrides,
    jumpCutGapDisabled,
    setJumpCutGapDisabled,
    selectedGapKey,
    setSelectedGapKey,
    jumpCutGaps,
    jumpCutGapsEffective,
    jumpCutsEnabledRef,
    jumpCutGapListRef,
    customCuts, setCustomCuts,
    pendingCustomCutStartMs,
    handleAdjustGap,
    handleResetGap,
    handleResetAllGaps,
    handleAddCustomCuts,
    handleClearCustomCuts,
    handleStartCustomCut,
    handleCancelPendingCustomCut,
    handleFinishCustomCut,
    handleRemoveCustomCut,
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
  const [selectedFullSegmentId, setSelectedFullSegmentId] = useState<string | null>(null);
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
  const selectedProjectClip = microTimelines.find(mt => mt.id === selectedClipId) ?? null;
  const mediaDuration = videoInfo?.duration ?? audioInfo?.duration ?? baseExportParams.duration ?? 10;
  const fullExportChunks = useMemo<MicroTimeline[]>(() => {
    if (!Number.isFinite(mediaDuration) || mediaDuration <= 0) return [];
    const chunks: MicroTimeline[] = [];
    let start = 0;
    let index = 0;
    while (start < mediaDuration - 0.001) {
      const end = Math.min(mediaDuration, start + FULL_EXPORT_CHUNK_SECONDS);
      chunks.push({
        id: `full-chunk-${index + 1}`,
        name: `Full ${index + 1}`,
        startSecond: start,
        endSecond: end,
        color: MICRO_TIMELINE_COLORS[index % MICRO_TIMELINE_COLORS.length],
      });
      start = end;
      index += 1;
    }
    return chunks;
  }, [mediaDuration]);
  const selectedFullSegment = fullExportChunks.find((chunk) => chunk.id === selectedFullSegmentId) ?? null;
  const timelineSegments = editorMode === 'clips' ? microTimelines : fullExportChunks;
  const selectedTimelineSegment = editorMode === 'clips' ? selectedProjectClip : selectedFullSegment;
  const selectedMusicClip = musicTimelineClips.find((clip) => clip.id === selectedMusicClipId) ?? null;
  const musicClipLabels = useMemo(
    () =>
      Object.fromEntries(
        musicTimelineClips.map((clip) => [clip.id, musicLibrary.find((asset) => asset.id === clip.assetId)?.originalName ?? `Track ${clip.trackIndex + 1}`]),
      ),
    [musicLibrary, musicTimelineClips],
  );
  const activeSkipTimeGaps = useMemo(
    () => mergeTimeGaps(
      jumpCutsEnabled
        ? jumpCutGapsEffective
            .filter((gap) => !jumpCutGapDisabled[gap.key])
            .map((gap) => ({ start: gap.startMs / 1000, end: gap.endMs / 1000 }))
        : [],
    ),
    [jumpCutsEnabled, jumpCutGapDisabled, jumpCutGapsEffective],
  );
  const selectedGap = jumpCutGaps.find((gap) => gap.key === selectedGapKey) ?? null;
  const effectiveTranscript = useMemo(
    () => (transcript && editorMode === 'clips' && selectedProjectClip ? applyClipCaptionEdits(transcript, captionClipEdits[selectedProjectClip.id]) : transcript),
    [transcript, editorMode, selectedProjectClip, captionClipEdits],
  );
  const activeExportParams = useMemo(() => {
    if (selectedTimelineSegment) {
      const isLastFullChunk =
        editorMode === 'full' &&
        selectedTimelineSegment.id === fullExportChunks[fullExportChunks.length - 1]?.id;
      return {
        ...baseExportParams,
        startSecond: selectedTimelineSegment.startSecond,
        endSecond: selectedTimelineSegment.endSecond,
        duration: Math.max(0.01, selectedTimelineSegment.endSecond - selectedTimelineSegment.startSecond),
        outroEnabled: editorMode === 'full' ? (isLastFullChunk ? baseExportParams.outroEnabled : false) : baseExportParams.outroEnabled,
        filenamePrefix: sanitizeExportPrefix(selectedTimelineSegment.name, baseExportParams.filenamePrefix),
      };
    }
    if (editorMode === 'full') {
      return {
        ...baseExportParams,
        startSecond: 0,
        endSecond: mediaDuration,
        duration: Math.max(0.01, mediaDuration),
        filenamePrefix: sanitizeExportPrefix(`${baseExportParams.filenamePrefix}-full`, baseExportParams.filenamePrefix),
      };
    }
    return baseExportParams;
  }, [selectedTimelineSegment, editorMode, fullExportChunks, baseExportParams, mediaDuration]);
  const setActiveExportParams = setBaseExportParams;
  const timelineDuration = mediaDuration + (activeExportParams.outroEnabled ? 5 : 0);
  const musicTimelineDuration = useMemo(
    () => sourceToOutputTime(mediaDuration, activeSkipTimeGaps) + (activeExportParams.outroEnabled ? 5 : 0),
    [mediaDuration, activeExportParams.outroEnabled, activeSkipTimeGaps],
  );
  const musicPlayheadSecond = useMemo(
    () => sourceToOutputTime(playheadSecond, activeSkipTimeGaps),
    [playheadSecond, activeSkipTimeGaps],
  );
  const timelineRange = resolveExportRange(activeExportParams, mediaDuration);
  const verticalVideo = isVerticalVideo(videoInfo);
  const availableGuides = verticalVideo ? GUIDES.filter((g) => g.key !== '1920x1080') : GUIDES;
  const previewFrame = videoInfo
    ? fitRect(previewSize.w, previewSize.h, videoInfo.w, videoInfo.h)
    : { x: 0, y: 0, w: previewSize.w, h: previewSize.h };

  const previousEditorModeRef = useRef<EditorMode>(editorMode);
  useEffect(() => {
    const prevMode = previousEditorModeRef.current;
    previousEditorModeRef.current = editorMode;
    if (editorMode !== 'full') return;
    if (fullExportChunks.length === 0) {
      if (selectedFullSegmentId !== null) setSelectedFullSegmentId(null);
      return;
    }
    if (selectedFullSegmentId && fullExportChunks.some((chunk) => chunk.id === selectedFullSegmentId)) return;
    if (prevMode !== 'full') {
      setSelectedFullSegmentId(fullExportChunks[0].id);
    }
  }, [editorMode, fullExportChunks, selectedFullSegmentId]);

  useEffect(() => {
    if (!activeProjectId) return;
    const pending = musicLibrary.filter((asset) => musicAssetDurations[asset.id] === undefined);
    if (pending.length === 0) return;
    let cancelled = false;
    pending.forEach((asset) => {
      const audio = document.createElement('audio');
      audio.preload = 'metadata';
      audio.src = getMusicAssetUrl(activeProjectId, asset.id);
      audio.addEventListener('loadedmetadata', () => {
        if (cancelled) return;
        const duration = audio.duration;
        if (Number.isFinite(duration) && duration > 0) {
          setMusicAssetDurations((prev) => (prev[asset.id] === undefined ? { ...prev, [asset.id]: duration } : prev));
        }
      }, { once: true });
    });
    return () => { cancelled = true; };
  }, [activeProjectId, musicLibrary, musicAssetDurations]);

  const musicLaneAudioRefs = useRef<Array<HTMLAudioElement | null>>([null, null]);
  const musicLaneAssetIdsRef = useRef<Array<string | null>>([null, null]);

  useEffect(() => {
    return () => {
      musicLaneAudioRefs.current.forEach((audio) => {
        try { audio?.pause(); } catch {}
      });
      musicLaneAudioRefs.current = [null, null];
      musicLaneAssetIdsRef.current = [null, null];
    };
  }, []);

  useEffect(() => {
    const shouldPreviewTimelineMusic = musicTimelineClips.length > 0 && !!activeProjectId;
    if (!shouldPreviewTimelineMusic) {
      musicLaneAudioRefs.current.forEach((audio) => audio?.pause());
      return;
    }
    musicElRef.current?.pause();
    for (let lane = 0; lane < MUSIC_TRACK_COUNT; lane += 1) {
      const activeClip = musicTimelineClips
        .filter((clip) => clip.trackIndex === lane)
        .find((clip) => musicPlayheadSecond >= clip.startSecond && musicPlayheadSecond < musicClipEnd(clip));
      const audio = musicLaneAudioRefs.current[lane];
      if (!activeClip || !activeProjectId) {
        if (audio) audio.pause();
        continue;
      }
      const asset = musicLibrary.find((item) => item.id === activeClip.assetId);
      if (!asset) {
        if (audio) audio.pause();
        continue;
      }
      let laneAudio = audio;
      if (!laneAudio || musicLaneAssetIdsRef.current[lane] !== asset.id) {
        if (laneAudio) laneAudio.pause();
        laneAudio = document.createElement('audio');
        laneAudio.preload = 'auto';
        laneAudio.crossOrigin = 'anonymous';
        laneAudio.src = getMusicAssetUrl(activeProjectId, asset.id);
        musicLaneAudioRefs.current[lane] = laneAudio;
        musicLaneAssetIdsRef.current[lane] = asset.id;
      }

      const targetTime = Math.max(0, Math.min(
        (musicAssetDurations[asset.id] ?? activeClip.durationSecond) - 0.01,
        activeClip.sourceOffsetSecond + (musicPlayheadSecond - activeClip.startSecond),
      ));
      const gain = musicFadeGainAtTime(activeClip, musicPlayheadSecond);
      const duck = music.sidechain.enabled ? musicDuckGainRef.current : 1;
      laneAudio.volume = (music.muted || !musicLayerOn || muted) ? 0 : Math.max(0, Math.min(1, music.volume * gain * duck));
      if (Math.abs((laneAudio.currentTime || 0) - targetTime) > 0.15) {
        try { laneAudio.currentTime = targetTime; } catch {}
      }
      if (playing) {
        laneAudio.play().catch(() => {});
      } else {
        laneAudio.pause();
      }
    }
  }, [activeProjectId, music.muted, music.volume, music.sidechain.enabled, musicAssetDurations, musicLibrary, musicLayerOn, musicTimelineClips, muted, musicPlayheadSecond, playing]);

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
  const selectedClipRef = useRef(selectedTimelineSegment);

  useRefSync(
    { bgLayerOnRef, videoLayerOnRef, audioReactivityRef, musicRef, playingRef, playheadRef, activeExportParamsRef, timelineDurationRef, selectedClipRef, activeProjectIdRef },
    { bgLayerOn, videoLayerOn, audioReactivity, music, playing, playheadSecond, activeExportParams, timelineDuration, selectedClip: selectedTimelineSegment, activeProjectId },
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
    bg, bgDither, vid, audioReactivity, music, musicLibraryDurations: musicAssetDurations, musicTimelineClips, limiter,
    captionMode, captionStyle, captionShader,
    bgLayerOn, bgOffMode, bgOffColor, videoLayerOn, captionsLayerOn, musicLayerOn,
    activeGuide, cropToGuide, bgExport, vidExport,
    microTimelines, selectedClipId,
    customCuts, jumpCutGapOverrides, jumpCutGapDisabled, jumpCutsEnabled, jumpCutGapMs, jumpCutPaddingMs, customCutPaddingMs,
    showSilenceGaps, showFillerCuts, showManualCuts,
    mainTab, bgSubTab, videoSubTab, audioSubTab, captionsSubTab, editorSubTab, editorMode, selectedFullSegmentId, showAudioTracks, muted, mediaVolume, outroVolume,
    videoShaderSubTab,
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
      microTimelines, selectedClipId, musicTimelineClips, selectedMusicClipId, showAudioTracks, customCuts, jumpCutGapOverrides, jumpCutGapDisabled,
      jumpCutsEnabled, jumpCutGapMs, jumpCutPaddingMs, customCutPaddingMs,
      showSilenceGaps, showFillerCuts, showManualCuts, muted, mediaVolume, outroVolume,
    },
    {
      setBg, setBgDither, setVid, setAudioReactivity, setMusic, setLimiter,
      setCaptionMode, setCaptionStyle, setCaptionShader,
      setBgLayerOn, setBgOffMode, setBgOffColor, setVideoLayerOn, setCaptionsLayerOn, setMusicLayerOn,
      setActiveGuide, setCropToGuide, setBgExport, setVidExport,
      setMicroTimelines, setSelectedClipId, setMusicTimelineClips, setSelectedMusicClipId, setShowAudioTracks, setCustomCuts, setJumpCutGapOverrides, setJumpCutGapDisabled,
      setJumpCutsEnabled, setJumpCutGapMs, setJumpCutPaddingMs, setCustomCutPaddingMs,
      setShowSilenceGaps, setShowFillerCuts, setShowManualCuts, setMuted, setMediaVolume, setOutroVolume,
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
      setVideoShaderSubTab, setCaptionsSubTab, setEditorSubTab, setEditorMode,
      setBg, setBgDither, setVid, setBgExport, setVidExport,
      setActiveGuide, setCropToGuide, setBgLayerOn, setBgOffMode, setBgOffColor, setVideoLayerOn, setCaptionsLayerOn, setMusicLayerOn,
      setCaptionMode, setCaptionStyle, setCaptionShader,
      setMuted, setMediaVolume, setOutroVolume,
      setVideoInfo, setAudioInfo, setPlayheadSecond, setTranscript, setTranscriptName, setCaptionClipEdits, setPlaying,
      setAudioReactivity, setMusicInfo, setMusic, setMusicLibrary, setMusicAssetDurations, setSelectedMusicAssetIds, setMusicTimelineClips, setSelectedMusicClipId, setLimiter,
      setMicroTimelines, setSelectedClipId, setSelectedFullSegmentId, setPendingClipStart,
      setCustomCuts, setJumpCutGapOverrides, setJumpCutGapDisabled, setSelectedGapKey, setJumpCutsEnabled, setJumpCutGapMs, setJumpCutPaddingMs, setCustomCutPaddingMs,
      setShowSilenceGaps, setShowFillerCuts, setShowManualCuts, setShowAudioTracks,
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
  const importNativeFile = createImportNativeMedia(mediaLoaderRefs, mediaLoaderSetters);
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
  const playbackState = { music, musicLayerOn, hasTimelineMusic: musicTimelineClips.length > 0, videoInfo, audioInfo, selectedClip: selectedTimelineSegment };
  const playbackSetters = { setPlaying, setPlayheadSecond, setPlaybackStartMs, setMuted };
  const togglePlay = createTogglePlay(playbackRefs, playbackState, playbackSetters);
  const togglePlayRef = useRef(togglePlay);
  useEffect(() => { togglePlayRef.current = togglePlay; });
  const handleSeekPlayhead = createHandleSeekPlayhead(playbackRefs, playbackState, playbackSetters);
  usePlaybackKeyboard(mediaElRef, previewWrapRef, togglePlayRef, setMuted);
  const handleMusicTimelineSeek = (second: number) => {
    handleTimelineSeek(outputToSourceTime(second, activeSkipTimeGaps, mediaDuration));
  };

  // ---------- transcript file load & save ----------
  const { handleEditorUpdateTranscript, onPickTranscript } = useTranscriptHandlers({
    activeProjectIdRef, setProjects, setProjectStatus, setTranscript, setTranscriptName, addToast,
  });

  // ---------- music library / arrangement ----------
  const handlePickMusicFiles = async (files: File[]) => {
    const pid = activeProjectIdRef.current;
    if (!pid || files.length === 0) return;
    const durations = await Promise.all(files.map((file) => readLocalAudioDuration(file)));
    const uploadId = addToast('Importing music files…', 'progress', true);
    try {
      const result = await uploadMusicFiles(pid, files, (pct) => updateToast(uploadId, `Importing music… ${pct}%`, 'progress'));
      updateToast(uploadId, `${result.assets.length} music file${result.assets.length === 1 ? '' : 's'} imported`, 'success');
      setMusicLibrary((prev) => [...prev, ...result.assets]);
      setSelectedMusicAssetIds((prev) => [...new Set([...prev, ...result.assets.map((asset) => asset.id)])]);
      setMusicAssetDurations((prev) => {
        const next = { ...prev };
        result.assets.forEach((asset, index) => {
          const duration = durations[index];
          if (Number.isFinite(duration) && duration > 0) next[asset.id] = duration;
        });
        return next;
      });
      listProjects().then(setProjects);
    } catch (error: any) {
      updateToast(uploadId, `Music import failed: ${error?.message ?? error}`, 'error');
    }
  };

  const handleDeleteMusicAsset = async (assetId: string) => {
    const pid = activeProjectIdRef.current;
    if (!pid) return;
    try {
      await deleteMusicAsset(pid, assetId);
      setMusicLibrary((prev) => prev.filter((asset) => asset.id !== assetId));
      setSelectedMusicAssetIds((prev) => prev.filter((id) => id !== assetId));
      setMusicTimelineClips((prev) => prev.filter((clip) => clip.assetId !== assetId));
      if (selectedMusicClipId && musicTimelineClips.find((clip) => clip.id === selectedMusicClipId)?.assetId === assetId) {
        setSelectedMusicClipId(null);
      }
      setMusicAssetDurations((prev) => {
        const next = { ...prev };
        delete next[assetId];
        return next;
      });
      listProjects().then(setProjects);
    } catch (error: any) {
      addToast(`Failed to remove music: ${error?.message ?? error}`, 'error');
    }
  };

  const handleAutoArrangeSelectedMusic = () => {
    const chosenAssets = musicLibrary.filter((asset) => selectedMusicAssetIds.includes(asset.id));
    if (chosenAssets.length === 0) {
      addToast('Select at least one music file first', 'error');
      return;
    }
    let cursor = musicTimelineClips.length > 0
      ? Math.max(...musicTimelineClips.map((clip) => musicClipEnd(clip))) - MUSIC_DEFAULT_OVERLAP_SECONDS
      : 0;
    const baseIndex = musicTimelineClips.length;
    const newClips: MusicTimelineClip[] = chosenAssets.map((asset, index) => {
      const durationSecond = Math.max(0.01, musicAssetDurations[asset.id] ?? 30);
      const trackIndex = ((baseIndex + index) % MUSIC_TRACK_COUNT) as 0 | 1;
      const startSecond = Math.max(0, index === 0 ? cursor : cursor);
      const fade = clampMusicFade(Math.min(5, MUSIC_DEFAULT_OVERLAP_SECONDS / 2, durationSecond / 3), durationSecond);
      const clip: MusicTimelineClip = {
        id: crypto.randomUUID(),
        assetId: asset.id,
        trackIndex,
        startSecond,
        durationSecond,
        sourceOffsetSecond: 0,
        fadeInSecond: index === 0 && musicTimelineClips.length === 0 ? 0 : fade,
        fadeOutSecond: fade,
        color: MICRO_TIMELINE_COLORS[(baseIndex + index) % MICRO_TIMELINE_COLORS.length],
      };
      cursor = startSecond + durationSecond - MUSIC_DEFAULT_OVERLAP_SECONDS;
      return clip;
    });
    setMusicTimelineClips((prev) => [...prev, ...newClips]);
    setSelectedMusicClipId(newClips[0]?.id ?? null);
    setShowAudioTracks(true);
    setMainTab('audio');
    setAudioSubTab('music');
  };

  const handleUpdateSelectedMusicClip = (patch: Partial<MusicTimelineClip>) => {
    if (!selectedMusicClipId) return;
    setMusicTimelineClips((prev) => prev.map((clip) => {
      if (clip.id !== selectedMusicClipId) return clip;
      const durationSecond = patch.durationSecond ?? clip.durationSecond;
      const next = { ...clip, ...patch, durationSecond };
      next.fadeInSecond = clampMusicFade(patch.fadeInSecond ?? next.fadeInSecond, durationSecond);
      next.fadeOutSecond = clampMusicFade(patch.fadeOutSecond ?? next.fadeOutSecond, durationSecond);
      next.startSecond = Math.max(0, next.startSecond);
      next.sourceOffsetSecond = Math.max(0, next.sourceOffsetSecond);
      return next;
    }));
  };

  const handleMoveMusicClip = (id: string, startSecond: number, trackIndex?: 0 | 1) => {
    setMusicTimelineClips((prev) => prev.map((clip) => {
      if (clip.id !== id) return clip;
      return {
        ...clip,
        startSecond: Math.max(0, startSecond),
        trackIndex: trackIndex ?? clip.trackIndex,
      };
    }));
  };

  const handleAdjustMusicClipFade = (id: string, kind: 'fadeInSecond' | 'fadeOutSecond', value: number) => {
    setSelectedMusicClipId(id);
    setMusicTimelineClips((prev) => prev.map((clip) => {
      if (clip.id !== id) return clip;
      const next = { ...clip };
      next[kind] = clampMusicFade(value, clip.durationSecond);
      return next;
    }));
  };

  const handleDeleteSelectedMusicClip = () => {
    if (!selectedMusicClipId) return;
    setMusicTimelineClips((prev) => prev.filter((clip) => clip.id !== selectedMusicClipId));
    setSelectedMusicClipId(null);
  };

  const handleClearMusicTimeline = () => {
    setMusicTimelineClips([]);
    setSelectedMusicClipId(null);
  };

  // ---------- export ----------
  const fitPreviewBack = () => {
    const w = Math.max(1, Math.floor(previewFrame.w));
    const h = Math.max(1, Math.floor(previewFrame.h));
    bgRendererRef.current?.setSize(w, h);
    videoRendererRef.current?.setSize(w, h);
  };

  const exportComposition = createExportComposition(
    { activeProjectIdRef, bgRendererRef, videoRendererRef, videoElRef, audioElRef, audioSourceRef, activeExportParamsRef, exportingRef, startRef, jumpCutGapListRef },
    { bg, bgDither, vid, bgLayerOn, bgOffMode, bgOffColor, videoLayerOn, captionsLayerOn, musicLayerOn, jumpCutsEnabled, audioReactivity, music, limiter, mediaVolume, outroVolume, musicTimelineClips, captionMode, captionStyle, captionShader, transcript: effectiveTranscript, videoInfo, audioInfo, cropToGuide, activeGuide, availableGuides, previewFrame },
    { setPlaying, setProjectStatus, addToast, updateToast, fitPreviewBack },
  );

  const currentPresetSettings = useMemo(() => ({
    background: bg,
    backgroundDither: bgDither,
    video: vid,
    audioReactivity,
    music,
    limiter,
    captionMode,
    captionStyle,
    captionShader,
    layers: {
      background: bgLayerOn,
      video: videoLayerOn,
      captions: captionsLayerOn,
      music: musicLayerOn,
      bgOffMode,
      bgOffColor,
    },
    activeGuide,
    cropToGuide,
    exportBackground: bgExport,
    exportVideo: vidExport,
  }), [
    bg, bgDither, vid, audioReactivity, music, limiter,
    captionMode, captionStyle, captionShader,
    bgLayerOn, videoLayerOn, captionsLayerOn, musicLayerOn, bgOffMode, bgOffColor,
    activeGuide, cropToGuide, bgExport, vidExport,
  ]);

  const applyPresetSettings = (data: Record<string, any>) => {
    if (data.background) setBg(data.background);
    if (data.backgroundDither) setBgDither(data.backgroundDither);
    if (data.video) setVid(normalizeVideoShaderParams(data.video));
    if (data.audioReactivity) setAudioReactivity({ ...DEFAULT_AUDIO_REACTIVITY, ...data.audioReactivity });
    if (data.captionMode) setCaptionMode(data.captionMode);
    if (data.captionStyle) setCaptionStyle({ ...DEFAULT_CAPTION_STYLE, ...data.captionStyle });
    if (data.captionShader) setCaptionShader({ ...DEFAULT_CAPTION_SHADER, ...data.captionShader });
    if (data.limiter) setLimiter({ ...DEFAULT_LIMITER, ...data.limiter });
    if (data.music) {
      setMusic({
        ...DEFAULT_MUSIC_PARAMS,
        ...data.music,
        sidechain: {
          ...DEFAULT_MUSIC_PARAMS.sidechain,
          ...(data.music.sidechain ?? {}),
        },
      });
    }
    if (data.layers) {
      if (typeof data.layers.background === 'boolean') setBgLayerOn(data.layers.background);
      if (typeof data.layers.video === 'boolean') setVideoLayerOn(data.layers.video);
      if (typeof data.layers.captions === 'boolean') setCaptionsLayerOn(data.layers.captions);
      if (typeof data.layers.music === 'boolean') setMusicLayerOn(data.layers.music);
      if (data.layers.bgOffMode === 'grid' || data.layers.bgOffMode === 'color') setBgOffMode(data.layers.bgOffMode);
      if (typeof data.layers.bgOffColor === 'string') setBgOffColor(data.layers.bgOffColor);
    }
    if (data.activeGuide === null || typeof data.activeGuide === 'string') setActiveGuide(data.activeGuide);
    if (typeof data.cropToGuide === 'boolean') setCropToGuide(data.cropToGuide);
    if (data.exportBackground) setBgExport({ ...DEFAULT_EXPORT, ...data.exportBackground });
    if (data.exportVideo) setVidExport({ ...DEFAULT_EXPORT, ...data.exportVideo });
  };

  // ---------- layout ----------
  const exportLayerSummary = [
    bgLayerOn ? 'background' : null,
    videoLayerOn ? 'video' : null,
    captionsLayerOn ? 'captions' : null,
  ].filter(Boolean).join(' + ') || 'none';

  const frameStyle: React.CSSProperties = useMemo(() => {
    if (!videoInfo) return { position: 'absolute', inset: 0, width: '100%', height: '100%' };

    // Normal preview: fit the source video dimensions into the container
    return {
      position: 'absolute',
      left: previewFrame.x,
      top: previewFrame.y,
      width: previewFrame.w,
      height: previewFrame.h,
    };
  }, [videoInfo, previewFrame]);

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
        transcript={effectiveTranscript}
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
        microTimelines={timelineSegments}
        timelineItemLabel={editorMode === 'clips' ? 'clip' : 'chunk'}
        clipEditingEnabled={editorMode === 'clips'}
        musicTimelineClips={musicTimelineClips}
        musicClipLabels={musicClipLabels}
        musicDuration={musicTimelineDuration}
        musicPlayhead={musicPlayheadSecond}
        selectedMusicClipId={selectedMusicClipId}
        showAudioTracks={showAudioTracks}
        selectedId={editorMode === 'clips' ? selectedClipId : selectedFullSegmentId}
        pendingClipStart={editorMode === 'clips' ? pendingClipStart : null}
        onSelectClip={editorMode === 'clips' ? setSelectedClipId : setSelectedFullSegmentId}
        onSelectMusicClip={setSelectedMusicClipId}
        onMusicPlayheadChange={handleMusicTimelineSeek}
        onClipRangeChange={editorMode === 'clips' ? handleClipRangeChange : undefined}
        onMoveMusicClip={handleMoveMusicClip}
        onAdjustMusicClipFade={handleAdjustMusicClipFade}
        onAddStart={editorMode === 'clips' ? handleAddClipStart : undefined}
        onAddEnd={editorMode === 'clips' ? handleAddClipEnd : undefined}
        onCancelPending={editorMode === 'clips' ? (() => setPendingClipStart(null)) : undefined}
        onDeleteClip={editorMode === 'clips' ? handleDeleteClip : undefined}
        onRenameClip={editorMode === 'clips' ? handleRenameClip : undefined}
        onToggleAudioTracks={() => setShowAudioTracks((value) => !value)}
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
        videoInfo={videoInfo} audioInfo={audioInfo} audioMode={audioMode} playheadSecond={playheadSecond} mediaDuration={mediaDuration}
        playing={playing} togglePlay={togglePlay} muted={muted} setMuted={setMuted}
        editorSubTab={editorSubTab} setEditorSubTab={setEditorSubTab}
        editorMode={editorMode} setEditorMode={setEditorMode}
        clipCount={microTimelines.length}
        fullChunkCount={fullExportChunks.length}
        fullChunkSpanSec={FULL_EXPORT_CHUNK_SECONDS}
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
        showManualCuts={showManualCuts}
        setShowManualCuts={setShowManualCuts}
        onAddCustomCuts={handleAddCustomCuts}
        onClearCustomCuts={handleClearCustomCuts}
        pendingCustomCutStartMs={pendingCustomCutStartMs}
        onStartCustomCut={handleStartCustomCut}
        onFinishCustomCut={handleFinishCustomCut}
        onCancelPendingCustomCut={handleCancelPendingCustomCut}
        selectedGap={selectedGap}
        selectedGapDisabled={!!(selectedGapKey && jumpCutGapDisabled[selectedGapKey])}
        selectedGapHasOverride={!!(selectedGapKey && jumpCutGapOverrides[selectedGapKey])}
        onAdjustSelectedGap={(startMs, endMs) => {
          if (!selectedGapKey) return;
          const clampedStart = Math.max(0, Math.min(startMs, endMs - 20));
          const clampedEnd = Math.max(clampedStart + 20, endMs);
          handleAdjustGap(selectedGapKey, clampedStart, clampedEnd);
        }}
        onToggleSelectedGapDisabled={handleToggleGapDisabled}
        onResetSelectedGap={handleResetGap}
        onRemoveSelectedCustomCut={(key) => { if (isCustomKey(key)) handleRemoveCustomCut(key); }}
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
        videoShaderSubTab={videoShaderSubTab} setVideoShaderSubTab={setVideoShaderSubTab}
        invertFinalOutput={!!activeExportParams.invertFinalOutput}
        setInvertFinalOutput={(value) => setActiveExportParams((prev) => ({ ...prev, invertFinalOutput: value }))}
        onPickFile={onPickFile}
        onImportNativeMedia={importNativeFile}
        captionsSubTab={captionsSubTab} setCaptionsSubTab={setCaptionsSubTab}
        captionMode={captionMode} setCaptionMode={setCaptionMode}
        captionStyle={captionStyle} setCaptionStyle={setCaptionStyle}
        captionShader={captionShader} setCaptionShader={setCaptionShader}
        onPickTranscript={onPickTranscript} onEditorUpdate={handleEditorUpdateTranscript}
        audioSubTab={audioSubTab} setAudioSubTab={setAudioSubTab}
        audioReactivity={audioReactivity} setAudioReactivity={setAudioReactivity}
        lastBandsRef={lastBandsRef}
        music={music} setMusic={setMusic} musicInfo={musicInfo}
        musicLibrary={musicLibrary}
        musicAssetDurations={musicAssetDurations}
        selectedMusicAssetIds={selectedMusicAssetIds}
        setSelectedMusicAssetIds={setSelectedMusicAssetIds}
        musicTimelineClips={musicTimelineClips}
        selectedMusicClip={selectedMusicClip}
        selectedMusicClipName={selectedMusicClip ? (musicLibrary.find((asset) => asset.id === selectedMusicClip.assetId)?.originalName ?? null) : null}
        showAudioTracks={showAudioTracks}
        setShowAudioTracks={setShowAudioTracks}
        onPickMusicFiles={handlePickMusicFiles}
        onDeleteMusicAsset={handleDeleteMusicAsset}
        onAutoArrangeSelectedMusic={handleAutoArrangeSelectedMusic}
        onUpdateSelectedMusicClip={handleUpdateSelectedMusicClip}
        onDeleteSelectedMusicClip={handleDeleteSelectedMusicClip}
        onClearMusicTimeline={handleClearMusicTimeline}
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
        selectedClipName={selectedTimelineSegment?.name}
        currentPresetSettings={currentPresetSettings}
        onApplyPresetSettings={applyPresetSettings}
        addToast={addToast}
      />
    </div>
  );
};
