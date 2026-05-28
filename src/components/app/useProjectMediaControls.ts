import { useEffect, useRef } from 'react';
import type React from 'react';
import { createHandleCreateProject, createHandleSelectProject } from '../../hooks/useProjectHandlers';
import { createImportNativeMedia, createLoadFile, createLoadMusicFile, createHandleClearMusic as createClearMusic } from '../../hooks/useMediaLoader';
import { createTogglePlay, createHandleSeekPlayhead, usePlaybackKeyboard } from '../../hooks/usePlayback';
import { createExportComposition } from '../../hooks/useExporter';
import { useProjectRouting, useSSEStream } from '../../hooks/useProjectEffects';
import { useTranscriptHandlers } from '../../hooks/useTranscript';
import { outputToSourceTime } from '../../lib/timeMapping';

interface Args {
  refs: any;
  state: any;
  setters: any;
  toasts: any;
}

export function useProjectMediaControls({ refs, state, setters, toasts }: Args) {
  const projectRefs = {
    mediaElRef: refs.mediaElRef,
    videoElRef: refs.videoElRef,
    audioElRef: refs.audioElRef,
    audioSourceRef: refs.audioSourceRef,
    videoRendererRef: refs.videoRendererRef,
    musicElRef: refs.musicElRef,
    musicPlayerRef: refs.musicPlayerRef,
  };
  const handleCreateProject = createHandleCreateProject(projectRefs, { ...setters, addToast: toasts.addToast });
  const handleSelectProject = createHandleSelectProject(projectRefs, { ...setters, addToast: toasts.addToast });

  useProjectRouting(refs.activeProjectIdRef, state.activeProjectId, setters.setProjects, handleSelectProject);

  const mediaLoaderRefs = {
    ...projectRefs,
    videoBlobUrlRef: refs.videoBlobUrlRef,
    audioBlobUrlRef: refs.audioBlobUrlRef,
    activeProjectIdRef: refs.activeProjectIdRef,
  };
  const mediaLoaderSetters = {
    setProjects: setters.setProjects,
    setProjectStatus: setters.setProjectStatus,
    setMainTab: setters.setMainTab,
    setAudioSubTab: setters.setAudioSubTab,
    setPlaying: setters.setPlaying,
    setVideoInfo: setters.setVideoInfo,
    setAudioInfo: setters.setAudioInfo,
    setPlayheadSecond: setters.setPlayheadSecond,
    setTranscript: setters.setTranscript,
    setTranscriptName: setters.setTranscriptName,
    setVidExport: setters.setVidExport,
    setBgExport: setters.setBgExport,
    setMusicInfo: setters.setMusicInfo,
    setMusicLayerOn: setters.setMusicLayerOn,
    addToast: toasts.addToast,
    updateToast: toasts.updateToast,
  };
  const loadFile = createLoadFile(mediaLoaderRefs, mediaLoaderSetters);
  const importNativeFile = createImportNativeMedia(mediaLoaderRefs, mediaLoaderSetters);
  const loadMusicFile = createLoadMusicFile(mediaLoaderRefs, mediaLoaderSetters);
  const handleClearMusic = createClearMusic(mediaLoaderRefs, mediaLoaderSetters);

  const togglePlay = createTogglePlay(
    {
      mediaElRef: refs.mediaElRef,
      audioSourceRef: refs.audioSourceRef,
      musicElRef: refs.musicElRef,
      musicPlayerRef: refs.musicPlayerRef,
      playingInClipRef: refs.playingInClipRef,
    },
    {
      music: state.music,
      musicLayerOn: state.musicLayerOn,
      hasTimelineMusic: state.musicTimelineClips.length > 0,
      videoInfo: state.videoInfo,
      audioInfo: state.audioInfo,
      selectedClip: state.selectedTimelineSegment,
    },
    {
      setPlaying: setters.setPlaying,
      setPlayheadSecond: setters.setPlayheadSecond,
      setPlaybackStartMs: setters.setPlaybackStartMs,
      setMuted: setters.setMuted,
    },
  );
  const togglePlayRef = useRef(togglePlay);
  useEffect(() => {
    togglePlayRef.current = togglePlay;
  }, [togglePlay]);

  const handleSeekPlayhead = createHandleSeekPlayhead(
    {
      mediaElRef: refs.mediaElRef,
      audioSourceRef: refs.audioSourceRef,
      musicElRef: refs.musicElRef,
      musicPlayerRef: refs.musicPlayerRef,
      playingInClipRef: refs.playingInClipRef,
    },
    {
      music: state.music,
      musicLayerOn: state.musicLayerOn,
      hasTimelineMusic: state.musicTimelineClips.length > 0,
      videoInfo: state.videoInfo,
      audioInfo: state.audioInfo,
      selectedClip: state.selectedTimelineSegment,
    },
    {
      setPlaying: setters.setPlaying,
      setPlayheadSecond: setters.setPlayheadSecond,
      setPlaybackStartMs: setters.setPlaybackStartMs,
      setMuted: setters.setMuted,
    },
  );
  usePlaybackKeyboard(refs.mediaElRef, refs.previewWrapRef, togglePlayRef, setters.setMuted);

  const { handleEditorUpdateTranscript, onPickTranscript } = useTranscriptHandlers({
    activeProjectIdRef: refs.activeProjectIdRef,
    setProjects: setters.setProjects,
    setProjectStatus: setters.setProjectStatus,
    setTranscript: setters.setTranscript,
    setTranscriptName: setters.setTranscriptName,
    addToast: toasts.addToast,
  });

  useSSEStream({
    activeProjectId: state.activeProjectId,
    activeProjectIdRef: refs.activeProjectIdRef,
    setProjectStatus: setters.setProjectStatus,
    setTranscript: setters.setTranscript,
    setTranscriptName: setters.setTranscriptName,
    setProjects: setters.setProjects,
    addToast: toasts.addToast,
    updateToast: toasts.updateToast,
  });

  const fitPreviewBack = () => {
    const width = Math.max(1, Math.floor(state.previewFrame.w));
    const height = Math.max(1, Math.floor(state.previewFrame.h));
    refs.bgRendererRef.current?.setSize(width, height);
    refs.videoRendererRef.current?.setSize(width, height);
  };

  const exportComposition = createExportComposition(
    {
      activeProjectIdRef: refs.activeProjectIdRef,
      bgRendererRef: refs.bgRendererRef,
      videoRendererRef: refs.videoRendererRef,
      videoElRef: refs.videoElRef,
      audioElRef: refs.audioElRef,
      audioSourceRef: refs.audioSourceRef,
      activeExportParamsRef: refs.activeExportParamsRef,
      exportingRef: refs.exportingRef,
      startRef: refs.startRef,
      jumpCutGapListRef: refs.jumpCutGapListRef,
    },
    {
      bg: state.bg,
      bgDither: state.bgDither,
      vid: state.vid,
      bgLayerOn: state.bgLayerOn,
      bgOffMode: state.bgOffMode,
      bgOffColor: state.bgOffColor,
      videoLayerOn: state.videoLayerOn,
      captionsLayerOn: state.captionsLayerOn,
      musicLayerOn: state.musicLayerOn,
      jumpCutsEnabled: state.jumpCutsEnabled,
      audioReactivity: state.audioReactivity,
      music: state.music,
      limiter: state.limiter,
      mediaVolume: state.mediaVolume,
      outroVolume: state.outroVolume,
      musicTimelineClips: state.musicTimelineClips,
      captionMode: state.captionMode,
      captionStyle: state.captionStyle,
      captionShader: state.captionShader,
      transcript: state.effectiveTranscript,
      videoInfo: state.videoInfo,
      audioInfo: state.audioInfo,
      cropToGuide: state.cropToGuide,
      activeGuide: state.activeGuide,
      availableGuides: state.availableGuides,
      previewFrame: state.previewFrame,
    },
    {
      setPlaying: setters.setPlaying,
      setProjectStatus: setters.setProjectStatus,
      addToast: toasts.addToast,
      updateToast: toasts.updateToast,
      fitPreviewBack,
    },
  );

  return {
    handleCreateProject,
    handleSelectProject,
    loadMusicFile,
    importNativeFile,
    handleClearMusic,
    togglePlay,
    handleSeekPlayhead,
    handleMusicTimelineSeek: (second: number) => handleSeekPlayhead(outputToSourceTime(second, state.activeSkipTimeGaps, state.mediaDuration)),
    handleEditorUpdateTranscript,
    onPickTranscript,
    onPickFile: ((e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) loadFile(file);
    }) as React.ChangeEventHandler<HTMLInputElement>,
    onDrop: ((e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const file = e.dataTransfer.files?.[0];
      if (file) loadFile(file);
    }) as React.DragEventHandler<HTMLDivElement>,
    exportComposition,
  };
}
