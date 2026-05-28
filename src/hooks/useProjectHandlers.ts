import { AudioSource } from '../lib/AudioSource';
import { MusicPlayer } from '../lib/MusicPlayer';
import { DEFAULT_AUDIO_REACTIVITY } from '../lib/types';
import { parseTranscript } from '../lib/transcript';
import { snapToExportResolution } from '../lib/layoutUtils';
import { createProject, getAudioUrl, getMusicUrl, getProject, getTranscript, getVideoUrl, listProjects } from '../lib/projectApi';
import type { GuideKey } from '../lib/constants';
import type { ProjectHandlerRefs, ProjectHandlerSetters } from './useProjectHandlers.types';
import { applyProjectUiState, applyProjectVisualState, resetManagedMedia, resetProjectState } from './useProjectHandlers.shared';

export type { ProjectHandlerRefs, ProjectHandlerSetters } from './useProjectHandlers.types';

export function createHandleCreateProject(refs: ProjectHandlerRefs, setters: ProjectHandlerSetters) {
  return async (name: string) => {
    try {
      const project = await createProject(name);
      setters.setProjects(await listProjects());
      setters.setActiveProjectId(project.id);
      resetManagedMedia(refs);
      resetProjectState(setters);
      setters.setProjectStatus({ kind: 'success', message: `Project "${project.name}" created`, detail: `Folder: projects/${project.id}` });
      setters.addToast(`Project "${project.name}" created`, 'success');
    } catch {
      setters.addToast('Failed to create project', 'error');
    }
  };
}

export function createHandleSelectProject(refs: ProjectHandlerRefs, setters: ProjectHandlerSetters) {
  return async (id: string) => {
    try {
      const project = await getProject(id);
      setters.setActiveProjectId(id);
      setters.setPlaying(false);
      resetManagedMedia(refs);
      setters.setMusicInfo(null);
      setters.setMusicLibrary(Array.isArray((project as any).musicFiles) ? (project as any).musicFiles : project.musicFile ? [{ id: 'legacy-music', filename: project.musicFile, originalName: project.originalMusicName || project.musicFile }] : []);
      setters.setMusicAssetDurations(project.musicLibraryDurations && typeof project.musicLibraryDurations === 'object' ? project.musicLibraryDurations : {});
      setters.setSelectedMusicAssetIds([]);
      setters.setMusicTimelineClips(Array.isArray((project as any).musicTimelineClips) ? (project as any).musicTimelineClips : []);
      setters.setSelectedMusicClipId(null);
      setters.setSelectedGapKey(null);
      setters.setVideoInfo(null);
      setters.setAudioInfo(null);
      setters.setPlayheadSecond(0);
      setters.setTranscript(null);
      setters.setTranscriptName(null);
      setters.setCaptionClipEdits(project.captionClipEdits && typeof project.captionClipEdits === 'object' ? project.captionClipEdits : {});
      applyProjectVisualState(project, setters);
      applyProjectUiState(project, setters);
      if (project.microTimelines?.length) {
        setters.setMicroTimelines(project.microTimelines);
        setters.setSelectedClipId(project.selectedClipId ?? project.microTimelines[0]?.id ?? null);
      } else {
        setters.setMicroTimelines([]);
        setters.setSelectedClipId(null);
      }
      if (!project.ui || !('selectedFullSegmentId' in project.ui)) setters.setSelectedFullSegmentId(null);
      setters.setPendingClipStart(null);
      setters.setCustomCuts(Array.isArray(project.customCuts) ? project.customCuts : []);
      setters.setJumpCutGapOverrides({});
      setters.setJumpCutGapDisabled({});
      setters.setShowSilenceGaps(false);
      setters.setShowFillerCuts(false);
      setters.setShowManualCuts(false);
      if (project.jumpCuts) {
        if (typeof project.jumpCuts.enabled === 'boolean') setters.setJumpCutsEnabled(project.jumpCuts.enabled);
        if (typeof project.jumpCuts.gapMs === 'number') setters.setJumpCutGapMs(project.jumpCuts.gapMs);
        if (typeof project.jumpCuts.paddingMs === 'number') setters.setJumpCutPaddingMs(project.jumpCuts.paddingMs);
        if (typeof project.jumpCuts.customPaddingMs === 'number') setters.setCustomCutPaddingMs(project.jumpCuts.customPaddingMs);
        if (typeof project.jumpCuts.showSilence === 'boolean') setters.setShowSilenceGaps(project.jumpCuts.showSilence);
        if (typeof project.jumpCuts.showFiller === 'boolean') setters.setShowFillerCuts(project.jumpCuts.showFiller);
        if (typeof project.jumpCuts.showManual === 'boolean') setters.setShowManualCuts(project.jumpCuts.showManual);
        else if (project.jumpCuts.enabled && Array.isArray(project.customCuts) && project.customCuts.some((cut: any) => String(cut.key || '').startsWith('editorial:') || String(cut.key || '').startsWith('custom:'))) setters.setShowManualCuts(true);
        if (project.jumpCuts.overrides && typeof project.jumpCuts.overrides === 'object') setters.setJumpCutGapOverrides(project.jumpCuts.overrides);
        if (project.jumpCuts.disabled && typeof project.jumpCuts.disabled === 'object') setters.setJumpCutGapDisabled(project.jumpCuts.disabled);
      } else setters.setJumpCutsEnabled(false);

      if (project.hasVideo) {
        const url = getVideoUrl(id);
        const video = document.createElement('video');
        video.src = url;
        video.muted = false;
        video.volume = 1;
        video.playsInline = true;
        video.preload = 'auto';
        video.addEventListener('loadedmetadata', () => {
          setters.setVideoInfo({ name: project.videoFile || 'video', duration: video.duration, w: video.videoWidth, h: video.videoHeight });
          const snap = snapToExportResolution(video.videoWidth, video.videoHeight);
          setters.setVidExport((prev) => {
            const nextEnd = prev.endSecond === undefined ? video.duration : Math.min(video.duration, prev.endSecond);
            const nextStart = Math.min(prev.startSecond, Math.max(0, nextEnd - 0.01));
            return { ...prev, width: snap.w, height: snap.h, startSecond: nextStart, endSecond: nextEnd, duration: Math.max(0.01, nextEnd - nextStart) };
          });
          refs.videoRendererRef.current?.setVideo(video);
          refs.videoElRef.current = video;
          refs.mediaElRef.current = video;
          refs.audioSourceRef.current = new AudioSource({ element: video, url });
          video.currentTime = 0;
        });
      }

      if (project.hasAudio && !project.hasVideo) {
        const url = getAudioUrl(id);
        const audio = document.createElement('audio');
        audio.src = url;
        audio.crossOrigin = 'anonymous';
        audio.preload = 'auto';
        audio.addEventListener('loadedmetadata', () => {
          const duration = audio.duration;
          setters.setAudioInfo({ name: project.audioFile || 'audio', duration });
          setters.setBgExport((prev) => {
            const nextEnd = prev.endSecond === undefined ? duration : Math.min(duration, prev.endSecond);
            const nextStart = Math.min(prev.startSecond, Math.max(0, nextEnd - 0.01));
            return { ...prev, startSecond: nextStart, endSecond: nextEnd, duration: Math.max(0.01, nextEnd - nextStart) };
          });
          refs.audioElRef.current = audio;
          refs.mediaElRef.current = audio;
          refs.audioSourceRef.current = new AudioSource({ element: audio, url });
          audio.currentTime = 0;
        });
      }

      if (project.hasMusic && !(Array.isArray((project as any).musicFiles) && (project as any).musicFiles.length > 0)) {
        const url = getMusicUrl(id);
        const music = document.createElement('audio');
        music.src = url;
        music.crossOrigin = 'anonymous';
        music.preload = 'auto';
        music.loop = true;
        music.addEventListener('loadedmetadata', () => {
          setters.setMusicInfo({ name: project.originalMusicName || 'music' });
          refs.musicElRef.current = music;
          refs.musicPlayerRef.current = new MusicPlayer(music);
        });
      }

      if (project.hasTranscript) {
        const transcript = await getTranscript(id);
        if (transcript) {
          try {
            setters.setTranscript(parseTranscript(transcript));
            setters.setTranscriptName('caption.json');
          } catch {}
        }
      }

      if (!project.audioReactivity) setters.setAudioReactivity(DEFAULT_AUDIO_REACTIVITY);
      setters.setProjectStatus({
        kind: 'success',
        message: `Loaded "${project.name}"`,
        detail: project.hasTranscript ? 'Caption JSON is ready' : project.hasVideo ? 'Video imported; captions not ready yet' : `Folder: projects/${id}`,
      });
      setters.addToast(`Loaded "${project.name}"`, 'success');
    } catch {
      setters.addToast('Failed to load project', 'error');
    }
  };
}
