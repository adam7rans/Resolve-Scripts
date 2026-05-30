import React, { useEffect, useRef, useState } from 'react';
import { BackgroundRenderer } from '../lib/BackgroundRenderer';
import { VideoRenderer } from '../lib/VideoRenderer';
import { AudioSource, type AudioBands, type LimiterParams, DEFAULT_LIMITER } from '../lib/AudioSource';
import { MusicPlayer, DEFAULT_MUSIC_PARAMS, type MusicParams } from '../lib/MusicPlayer';
import {
  DEFAULT_AUDIO_REACTIVITY,
  DEFAULT_BACKGROUND,
  DEFAULT_CAPTION_SHADER,
  DEFAULT_CAPTION_STYLE,
  DEFAULT_DITHER,
  DEFAULT_EXPORT,
  DEFAULT_VIDEO,
  type AudioReactivityParams,
  type BackgroundParams,
  type CaptionShaderParams,
  type CaptionStyle,
  type DitherParams,
  type ExportParams,
  type MicroTimeline,
  type MusicAsset,
  type MusicTimelineClip,
  type VideoShaderParams,
} from '../lib/types';
import { type CaptionMode, type ClipCaptionEdits, type TranscriptData } from '../lib/transcript';
import { type AudioSubTab, type BgSubTab, type CaptionsSubTab, type EditorMode, type EditorSubTab, type GuideKey, type MainTab, type ProjectTaskStatus, type VideoShaderSubTab, type VideoSubTab } from '../lib/constants';
import { useToasts } from '../hooks/useToasts';
import { isCustomKey, useJumpCuts } from '../hooks/useJumpCuts';
import { useRenderLoop } from '../hooks/useRenderLoop';
import { usePlayheadTick } from '../hooks/usePlayheadTick';
import { useAutoSave } from '../hooks/useProjectEffects';
import { useAppUndoRedo } from '../hooks/useAppUndoRedo';
import { useClipHandlers } from '../hooks/useClipHandlers';
import { useRefSync, useParamPush } from '../hooks/useParamSync';
import { AppLayout } from './app/AppLayout';
import { useAppDerivedState } from './app/useAppDerivedState';
import { useMusicTimeline } from './app/useMusicTimeline';
import { usePresetSettings } from './app/usePresetSettings';
import { useProjectMediaControls } from './app/useProjectMediaControls';

export const App: React.FC = () => {
  const [mainTab, setMainTab] = useState<MainTab>('background');
  const [bgSubTab, setBgSubTab] = useState<BgSubTab>('noise');
  const [videoSubTab, setVideoSubTab] = useState<VideoSubTab>('shader');
  const [videoShaderSubTab, setVideoShaderSubTab] = useState<VideoShaderSubTab>('image');
  const [audioSubTab, setAudioSubTab] = useState<AudioSubTab>('music');
  const [captionsSubTab, setCaptionsSubTab] = useState<CaptionsSubTab>('editor');
  const [editorSubTab, setEditorSubTab] = useState<EditorSubTab>('edits');
  const [editorMode, setEditorMode] = useState<EditorMode>('clips');
  const [outroVolume, setOutroVolume] = useState(0.5);
  const [bgLayerOn, setBgLayerOn] = useState(true);
  const [bgOffMode, setBgOffMode] = useState<'grid' | 'color'>('grid');
  const [bgOffColor, setBgOffColor] = useState('#000000');
  const [videoLayerOn, setVideoLayerOn] = useState(true);
  const [captionsLayerOn, setCaptionsLayerOn] = useState(true);
  const [audioInfo, setAudioInfo] = useState<{ name: string; duration: number } | null>(null);
  const [audioReactivity, setAudioReactivity] = useState<AudioReactivityParams>(DEFAULT_AUDIO_REACTIVITY);
  const [music, setMusic] = useState<MusicParams>(DEFAULT_MUSIC_PARAMS);
  const [musicLayerOn, setMusicLayerOn] = useState(true);
  const [musicInfo, setMusicInfo] = useState<{ name: string } | null>(null);
  const [musicLibrary, setMusicLibrary] = useState<MusicAsset[]>([]);
  const [musicAssetDurations, setMusicAssetDurations] = useState<Record<string, number>>({});
  const [selectedMusicAssetIds, setSelectedMusicAssetIds] = useState<string[]>([]);
  const [musicTimelineClips, setMusicTimelineClips] = useState<MusicTimelineClip[]>([]);
  const [selectedMusicClipId, setSelectedMusicClipId] = useState<string | null>(null);
  const [showAudioTracks, setShowAudioTracks] = useState(true);
  const [transcript, setTranscript] = useState<TranscriptData | null>(null);
  const [transcriptName, setTranscriptName] = useState<string | null>(null);
  const [captionClipEdits, setCaptionClipEdits] = useState<Record<string, ClipCaptionEdits>>({});
  const [captionMode, setCaptionMode] = useState<CaptionMode>('line');
  const [captionStyle, setCaptionStyle] = useState<CaptionStyle>(DEFAULT_CAPTION_STYLE);
  const [captionShader, setCaptionShader] = useState<CaptionShaderParams>(DEFAULT_CAPTION_SHADER);
  const [activeGuide, setActiveGuide] = useState<GuideKey | null>(null);
  const [cropToGuide, setCropToGuide] = useState(false);
  const [previewSize, setPreviewSize] = useState({ w: 0, h: 0 });
  const [bg, setBg] = useState<BackgroundParams>(DEFAULT_BACKGROUND);
  const [bgDither, setBgDither] = useState<DitherParams>(DEFAULT_DITHER);
  const [bgExport, setBgExport] = useState<ExportParams>({ ...DEFAULT_EXPORT, filenamePrefix: 'bg' });
  const [vid, setVid] = useState<VideoShaderParams>(DEFAULT_VIDEO);
  const [vidExport, setVidExport] = useState<ExportParams>({ ...DEFAULT_EXPORT, filenamePrefix: 'talking' });
  const [videoInfo, setVideoInfo] = useState<{ name: string; duration: number; w: number; h: number } | null>(null);
  const [playing, setPlaying] = useState(false);
  const [playheadSecond, setPlayheadSecond] = useState(0);
  const [playbackStartMs, setPlaybackStartMs] = useState<number | undefined>(undefined);
  const [microTimelines, setMicroTimelines] = useState<MicroTimeline[]>([]);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [selectedFullSegmentId, setSelectedFullSegmentId] = useState<string | null>(null);
  const [pendingClipStart, setPendingClipStart] = useState<number | null>(null);
  const [muted, setMuted] = useState(false);
  const [mediaVolume, setMediaVolume] = useState(1);
  const [limiter, setLimiter] = useState<LimiterParams>(DEFAULT_LIMITER);
  const [projects, setProjects] = useState<any[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [projectStatus, setProjectStatus] = useState<ProjectTaskStatus>({ kind: 'idle', message: 'Create or select a project' });
  const activeProjectIdRef = useRef<string | null>(null);
  const [outroAudio] = useState(() => Object.assign(new Audio('audio/bassnoise.wav'), { loop: false }));
  const outroAudioRef = useRef(outroAudio);

  useEffect(() => void (activeProjectIdRef.current = activeProjectId), [activeProjectId]);
  useEffect(() => void (outroAudio.volume = outroVolume), [outroAudio, outroVolume]);

  const jumpCuts = useJumpCuts(transcript);
  const {
    jumpCutsEnabled, setJumpCutsEnabled, jumpCutGapMs, setJumpCutGapMs, jumpCutPaddingMs, setJumpCutPaddingMs,
    customCutPaddingMs, setCustomCutPaddingMs, showSilenceGaps, setShowSilenceGaps, showFillerCuts, setShowFillerCuts,
    showManualCuts, setShowManualCuts, jumpCutGapOverrides, setJumpCutGapOverrides, jumpCutGapDisabled, setJumpCutGapDisabled,
    selectedGapKey, setSelectedGapKey, jumpCutGaps, jumpCutGapsEffective, jumpCutsEnabledRef, jumpCutGapListRef,
    customCuts, setCustomCuts, pendingCustomCutStartMs, handleAdjustGap, handleResetGap, handleResetAllGaps,
    handleAddCustomCuts, handleClearCustomCuts, handleStartCustomCut, handleCancelPendingCustomCut, handleFinishCustomCut,
    handleRemoveCustomCut, handleToggleGapDisabled, handleSelectGap,
  } = jumpCuts;

  const baseExportParams = videoInfo ? vidExport : bgExport;
  const setBaseExportParams = videoInfo ? setVidExport : setBgExport;
  const derived = useAppDerivedState({
    transcript, captionClipEdits, editorMode, microTimelines, selectedClipId, selectedFullSegmentId, setSelectedFullSegmentId,
    jumpCutsEnabled, jumpCutGapDisabled, jumpCutGapsEffective, jumpCutGaps, selectedGapKey, baseExportParams, videoInfo, audioInfo, playheadSecond, previewSize,
  });
  const { mediaDuration, fullExportChunks, timelineSegments, selectedTimelineSegment, selectedGap, effectiveTranscript, activeExportParams, timelineDuration, activeSkipTimeGaps, musicTimelineDuration, musicPlayheadSecond, availableGuides, previewFrame, frameStyle, audioMode } = derived;

  const { toasts, addToast, updateToast, dismissToast } = useToasts();
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
  const musicElRef = useRef<HTMLAudioElement | null>(null);
  const musicPlayerRef = useRef<MusicPlayer | null>(null);
  const musicDuckGainRef = useRef(1);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef(performance.now());
  const exportingRef = useRef(false);
  const lastBandsRef = useRef<AudioBands>({ rms: 0, low: 0, mid: 0, high: 0 });
  const speechRmsRef = useRef(0);
  const limiterReductionRef = useRef(0);
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

  useRefSync({ bgLayerOnRef, videoLayerOnRef, audioReactivityRef, musicRef, playingRef, playheadRef, activeExportParamsRef, timelineDurationRef, selectedClipRef, activeProjectIdRef }, { bgLayerOn, videoLayerOn, audioReactivity, music, playing, playheadSecond, activeExportParams, timelineDuration, selectedClip: selectedTimelineSegment, activeProjectId });
  useRenderLoop({ previewWrapRef, bgCanvasRef, videoCanvasRef, bgRendererRef, videoRendererRef, audioSourceRef, musicPlayerRef, videoBlobUrlRef, audioBlobUrlRef, rafRef, startRef, exportingRef, lastBandsRef, speechRmsRef, musicDuckGainRef, limiterReductionRef, bgLayerOnRef, videoLayerOnRef, audioReactivityRef, musicRef, playheadRef, activeExportParamsRef, timelineDurationRef }, bg, bgDither, vid, setPreviewSize);
  useParamPush({ bgRendererRef, videoRendererRef, videoElRef, audioElRef, audioSourceRef, musicPlayerRef, musicDuckGainRef, exportingRef }, { bg, bgDither, vid, muted, mediaVolume, limiter, music, musicLayerOn, videoInfo, audioInfo, previewFrameW: previewFrame.w, previewFrameH: previewFrame.h, verticalVideo: videoInfo ? videoInfo.h > videoInfo.w : false, activeGuide, setActiveGuide, setCropToGuide });
  usePlayheadTick({ mediaElRef, audioSourceRef, musicPlayerRef, outroAudioRef, playingRef, playheadRef, playingInClipRef, selectedClipRef, activeExportParamsRef, jumpCutsEnabledRef, jumpCutGapListRef }, videoInfo, audioInfo, outroVolume, setPlaying, setPlayheadSecond);

  const musicTimeline = useMusicTimeline({
    activeProjectId, activeProjectIdRef, music, musicLayerOn, musicLibrary, musicAssetDurations, selectedMusicAssetIds,
    musicTimelineClips, selectedMusicClipId, musicPlayheadSecond, playing, muted, musicElRef, musicDuckGainRef,
    setProjects, setMusicLibrary, setMusicAssetDurations, setSelectedMusicAssetIds, setMusicTimelineClips, setSelectedMusicClipId,
    setShowAudioTracks, showMusicPanel: () => { setMainTab('audio'); setAudioSubTab('music'); }, addToast, updateToast,
  });
  const controls = useProjectMediaControls({
    refs: { previewWrapRef, mediaElRef, videoElRef, audioElRef, audioSourceRef, videoRendererRef, musicElRef, musicPlayerRef, playingInClipRef, activeProjectIdRef, videoBlobUrlRef, audioBlobUrlRef, bgRendererRef, activeExportParamsRef, exportingRef, startRef, jumpCutGapListRef },
    state: { activeProjectId, music, musicLayerOn, musicTimelineClips, videoInfo, audioInfo, selectedTimelineSegment, activeSkipTimeGaps, mediaDuration, bg, bgDither, vid, bgLayerOn, bgOffMode, bgOffColor, videoLayerOn, captionsLayerOn, jumpCutsEnabled, audioReactivity, limiter, mediaVolume, outroVolume, captionMode, captionStyle, captionShader, effectiveTranscript, cropToGuide, activeGuide, availableGuides, previewFrame },
    setters: { setProjects, setActiveProjectId, setProjectStatus, setMainTab, setBgSubTab, setVideoSubTab, setAudioSubTab, setVideoShaderSubTab, setCaptionsSubTab, setEditorSubTab, setEditorMode, setBg, setBgDither, setVid, setBgExport, setVidExport, setActiveGuide, setCropToGuide, setBgLayerOn, setBgOffMode, setBgOffColor, setVideoLayerOn, setCaptionsLayerOn, setMusicLayerOn, setCaptionMode, setCaptionStyle, setCaptionShader, setMuted, setMediaVolume, setOutroVolume, setVideoInfo, setAudioInfo, setPlayheadSecond, setTranscript, setTranscriptName, setCaptionClipEdits, setPlaying, setAudioReactivity, setMusicInfo, setMusic, setMusicLibrary, setMusicAssetDurations, setSelectedMusicAssetIds, setMusicTimelineClips, setSelectedMusicClipId, setLimiter, setMicroTimelines, setSelectedClipId, setSelectedFullSegmentId, setPendingClipStart, setCustomCuts, setJumpCutGapOverrides, setJumpCutGapDisabled, setSelectedGapKey, setJumpCutsEnabled, setJumpCutGapMs, setJumpCutPaddingMs, setCustomCutPaddingMs, setShowSilenceGaps, setShowFillerCuts, setShowManualCuts, setShowAudioTracks, setPlaybackStartMs },
    toasts: { addToast, updateToast },
  });
  const { currentPresetSettings, applyPresetSettings } = usePresetSettings({
    state: { bg, bgDither, vid, audioReactivity, music, limiter, captionMode, captionStyle, captionShader, bgLayerOn, videoLayerOn, captionsLayerOn, musicLayerOn, bgOffMode, bgOffColor, activeGuide, cropToGuide, bgExport, vidExport },
    setters: { setBg, setBgDither, setVid, setAudioReactivity, setMusic, setLimiter, setCaptionMode, setCaptionStyle, setCaptionShader, setBgLayerOn, setVideoLayerOn, setCaptionsLayerOn, setMusicLayerOn, setBgOffMode, setBgOffColor, setActiveGuide, setCropToGuide, setBgExport, setVidExport },
  });

  useAutoSave(activeProjectId, {
    bg, bgDither, vid, audioReactivity, music, musicLibraryDurations: musicAssetDurations, musicTimelineClips, limiter, captionMode, captionStyle, captionShader,
    bgLayerOn, bgOffMode, bgOffColor, videoLayerOn, captionsLayerOn, musicLayerOn, activeGuide, cropToGuide, bgExport, vidExport,
    microTimelines, selectedClipId, captionClipEdits, customCuts, jumpCutGapOverrides, jumpCutGapDisabled, jumpCutsEnabled, jumpCutGapMs, jumpCutPaddingMs, customCutPaddingMs,
    showSilenceGaps, showFillerCuts, showManualCuts, mainTab, bgSubTab, videoSubTab, audioSubTab, captionsSubTab, editorSubTab, editorMode, selectedFullSegmentId,
    showAudioTracks, muted, mediaVolume, outroVolume, videoShaderSubTab, projectHasVideo: !!projects.find((p) => p.id === activeProjectId)?.hasVideo,
    projectHasAudio: !!projects.find((p) => p.id === activeProjectId)?.hasAudio, videoInfoLoaded: !!videoInfo, audioInfoLoaded: !!audioInfo,
  });
  useAppUndoRedo(
    { bg, bgDither, vid, audioReactivity, music, limiter, captionMode, captionStyle, captionShader, bgLayerOn, bgOffMode, bgOffColor, videoLayerOn, captionsLayerOn, musicLayerOn, activeGuide, cropToGuide, bgExport, vidExport, microTimelines, selectedClipId, musicTimelineClips, selectedMusicClipId, showAudioTracks, customCuts, jumpCutGapOverrides, jumpCutGapDisabled, jumpCutsEnabled, jumpCutGapMs, jumpCutPaddingMs, customCutPaddingMs, showSilenceGaps, showFillerCuts, showManualCuts, muted, mediaVolume, outroVolume },
    { setBg, setBgDither, setVid, setAudioReactivity, setMusic, setLimiter, setCaptionMode, setCaptionStyle, setCaptionShader, setBgLayerOn, setBgOffMode, setBgOffColor, setVideoLayerOn, setCaptionsLayerOn, setMusicLayerOn, setActiveGuide, setCropToGuide, setBgExport, setVidExport, setMicroTimelines, setSelectedClipId, setMusicTimelineClips, setSelectedMusicClipId, setShowAudioTracks, setCustomCuts, setJumpCutGapOverrides, setJumpCutGapDisabled, setJumpCutsEnabled, setJumpCutGapMs, setJumpCutPaddingMs, setCustomCutPaddingMs, setShowSilenceGaps, setShowFillerCuts, setShowManualCuts, setMuted, setMediaVolume, setOutroVolume },
    activeProjectId,
  );

  const { handleClipRangeChange, handleAddClipStart, handleAddClipEnd, handleDeleteClip, handleRenameClip, handleToggleOutro } = useClipHandlers({
    microTimelines, setMicroTimelines, selectedClipId, setSelectedClipId, pendingClipStart, setPendingClipStart, playheadSecond, setPlayheadSecond, mediaElRef, handleSeekPlayhead: controls.handleSeekPlayhead, setBaseExportParams,
  });
  const activeProject = projects.find((p) => p.id === activeProjectId);
  const exportLayerSummary = [bgLayerOn ? 'background' : null, videoLayerOn ? 'video' : null, captionsLayerOn ? 'captions' : null].filter(Boolean).join(' + ') || 'none';

  return (
    <AppLayout
      previewAreaProps={{ previewWrapRef, bgCanvasRef, videoCanvasRef, frameStyle, bgLayerOn, bgOffMode, bgOffColor, videoLayerOn, vid, setVid, captionsLayerOn, audioMode, activeGuide, cropToGuide, availableGuides, previewFrame, videoInfo, audioInfo, transcript: effectiveTranscript, captionMode, captionStyle, captionShader, mediaElRef, playheadSecond, playbackStartMs, activeExportParams, toasts, onDismissToast: dismissToast, onDrop: controls.onDrop }}
      timelineProps={{ duration: mediaDuration, playhead: playheadSecond, onPlayheadChange: controls.handleSeekPlayhead, outroEnabled: activeExportParams.outroEnabled, onToggleOutro: handleToggleOutro, microTimelines: timelineSegments, timelineItemLabel: editorMode === 'clips' ? 'clip' : 'chunk', clipEditingEnabled: editorMode === 'clips', musicTimelineClips, musicClipLabels: musicTimeline.musicClipLabels, musicDuration: musicTimelineDuration, musicPlayhead: musicPlayheadSecond, selectedMusicClipId, showAudioTracks, selectedId: editorMode === 'clips' ? selectedClipId : selectedFullSegmentId, pendingClipStart: editorMode === 'clips' ? pendingClipStart : null, onSelectClip: editorMode === 'clips' ? setSelectedClipId : setSelectedFullSegmentId, onSelectMusicClip: setSelectedMusicClipId, onMusicPlayheadChange: controls.handleMusicTimelineSeek, onClipRangeChange: editorMode === 'clips' ? handleClipRangeChange : undefined, onMoveMusicClip: musicTimeline.handleMoveMusicClip, onAdjustMusicClipFade: musicTimeline.handleAdjustMusicClipFade, onAddStart: editorMode === 'clips' ? handleAddClipStart : undefined, onAddEnd: editorMode === 'clips' ? handleAddClipEnd : undefined, onCancelPending: editorMode === 'clips' ? (() => setPendingClipStart(null)) : undefined, onDeleteClip: editorMode === 'clips' ? handleDeleteClip : undefined, onRenameClip: editorMode === 'clips' ? handleRenameClip : undefined, onToggleAudioTracks: () => setShowAudioTracks((value) => !value), skipGapsEnabled: jumpCutsEnabled, skipGaps: jumpCutGaps, skipGapsEffective: jumpCutGapsEffective, skipGapOverrides: jumpCutGapOverrides, skipGapDisabled: jumpCutGapDisabled, selectedGapKey, onSelectGap: handleSelectGap, onToggleGapDisabled: handleToggleGapDisabled, onAdjustSkipGap: handleAdjustGap, onResetSkipGap: handleResetGap, onResetAllSkipGaps: handleResetAllGaps }}
      sidebarProps={{ projects, activeProjectId, activeProject, projectStatus, onSelectProject: controls.handleSelectProject, onCreateProject: controls.handleCreateProject, videoInfo, audioInfo, audioMode, playheadSecond, mediaDuration, playing, togglePlay: controls.togglePlay, muted, setMuted, editorSubTab, setEditorSubTab, editorMode, setEditorMode, clipCount: microTimelines.length, fullChunkCount: fullExportChunks.length, fullChunkSpanSec: 300, transcript, transcriptName, jumpCutsEnabled, setJumpCutsEnabled, jumpCutGapMs, setJumpCutGapMs, jumpCutPaddingMs, setJumpCutPaddingMs, customCuts, customCutPaddingMs, setCustomCutPaddingMs, showSilenceGaps, setShowSilenceGaps, showFillerCuts, setShowFillerCuts, showManualCuts, setShowManualCuts, onAddCustomCuts: handleAddCustomCuts, onClearCustomCuts: handleClearCustomCuts, pendingCustomCutStartMs, onStartCustomCut: handleStartCustomCut, onFinishCustomCut: handleFinishCustomCut, onCancelPendingCustomCut: handleCancelPendingCustomCut, selectedGap, selectedGapDisabled: !!(selectedGapKey && jumpCutGapDisabled[selectedGapKey]), selectedGapHasOverride: !!(selectedGapKey && jumpCutGapOverrides[selectedGapKey]), onAdjustSelectedGap: (startMs: number, endMs: number) => selectedGapKey && handleAdjustGap(selectedGapKey, Math.max(0, Math.min(startMs, endMs - 20)), Math.max(Math.max(0, Math.min(startMs, endMs - 20)) + 20, endMs)), onToggleSelectedGapDisabled: handleToggleGapDisabled, onResetSelectedGap: handleResetGap, onRemoveSelectedCustomCut: (key: string) => { if (isCustomKey(key)) handleRemoveCustomCut(key); }, bgLayerOn, setBgLayerOn, bgOffMode, setBgOffMode, bgOffColor, setBgOffColor, videoLayerOn, setVideoLayerOn, captionsLayerOn, setCaptionsLayerOn, musicLayerOn, setMusicLayerOn, activeGuide, setActiveGuide, cropToGuide, setCropToGuide, availableGuides, mainTab, setMainTab, bg, setBg, bgDither, setBgDither, bgSubTab, setBgSubTab, vid, setVid, videoSubTab, setVideoSubTab, videoShaderSubTab, setVideoShaderSubTab, invertFinalOutput: !!activeExportParams.invertFinalOutput, setInvertFinalOutput: (value: boolean) => setBaseExportParams((prev) => ({ ...prev, invertFinalOutput: value })), onPickFile: controls.onPickFile, onImportNativeMedia: controls.importNativeFile, captionsSubTab, setCaptionsSubTab, captionMode, setCaptionMode, captionStyle, setCaptionStyle, captionShader, setCaptionShader, onPickTranscript: controls.onPickTranscript, onEditorUpdate: controls.handleEditorUpdateTranscript, audioSubTab, setAudioSubTab, audioReactivity, setAudioReactivity, lastBandsRef, music, setMusic, musicInfo, musicLibrary, musicAssetDurations, selectedMusicAssetIds, setSelectedMusicAssetIds, musicTimelineClips, selectedMusicClip: musicTimeline.selectedMusicClip, selectedMusicClipName: musicTimeline.selectedMusicClipName, showAudioTracks, setShowAudioTracks, onPickMusicFiles: musicTimeline.handlePickMusicFiles, onDeleteMusicAsset: musicTimeline.handleDeleteMusicAsset, onAutoArrangeSelectedMusic: musicTimeline.handleAutoArrangeSelectedMusic, onUpdateSelectedMusicClip: musicTimeline.handleUpdateSelectedMusicClip, onDeleteSelectedMusicClip: musicTimeline.handleDeleteSelectedMusicClip, onClearMusicTimeline: musicTimeline.handleClearMusicTimeline, onPickMusicFile: (file: File) => activeProjectIdRef.current ? controls.loadMusicFile(file, activeProjectIdRef.current) : addToast('Select project first', 'error'), onClearMusic: controls.handleClearMusic, musicDuckGainRef, speechRmsRef, mediaVolume, setMediaVolume, limiter, setLimiter, limiterReductionRef, outroVolume, setOutroVolume, activeExportParams, setActiveExportParams: setBaseExportParams, exportComposition: controls.exportComposition, exportLayerSummary, selectedClipName: selectedTimelineSegment?.name, currentPresetSettings, onApplyPresetSettings: applyPresetSettings, addToast }}
    />
  );
};
