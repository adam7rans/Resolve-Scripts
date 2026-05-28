import { isAudioFile } from '../lib/constants';
import { deleteMusic, getAudioUrl, getVideoUrl, importNativeMedia, listProjects, uploadAudio, uploadMusic, uploadVideo } from '../lib/projectApi';
import type { MediaLoaderRefs, MediaLoaderSetters } from './useMediaLoader.types';
import { loadManagedAudioSource, loadManagedMusicSource, loadManagedVideoSource, resetMediaState, revokeManagedUrls } from './useMediaLoader.shared';
import { AudioSource } from '../lib/AudioSource';
import { snapToExportResolution } from '../lib/layoutUtils';

export type { MediaLoaderRefs, MediaLoaderSetters } from './useMediaLoader.types';

export function createLoadVideoFile(refs: MediaLoaderRefs, setters: MediaLoaderSetters) {
  return (file: File, projectId: string) => {
    revokeManagedUrls(refs);
    resetMediaState(refs, setters);
    setters.setProjectStatus({ kind: 'progress', message: 'Importing video into project folder', progress: 0, detail: `Folder: projects/${projectId}` });

    const url = URL.createObjectURL(file);
    refs.videoBlobUrlRef.current = url;
    const video = document.createElement('video');
    video.src = url;
    video.muted = false;
    video.volume = 1;
    video.playsInline = true;
    video.preload = 'auto';
    video.addEventListener('loadedmetadata', () => {
      setters.setVideoInfo({ name: file.name, duration: video.duration, w: video.videoWidth, h: video.videoHeight });
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

    const uploadId = setters.addToast('Importing video into project folder…', 'progress', true);
    uploadVideo(projectId, file, (pct) => {
      setters.setProjectStatus({ kind: 'progress', message: 'Importing video into project folder', progress: pct, detail: `Folder: projects/${projectId}` });
      setters.updateToast(uploadId, `Importing… ${pct}%`, 'progress');
    }).then(() => {
      setters.setProjectStatus({ kind: 'progress', message: 'Video imported; starting transcription', detail: `Folder: projects/${projectId}` });
      setters.updateToast(uploadId, 'Video imported — starting transcription…', 'info');
      listProjects().then(setters.setProjects);
    }).catch((error) => {
      setters.setProjectStatus({ kind: 'error', message: `Import failed: ${error.message}` });
      setters.updateToast(uploadId, `Import failed: ${error.message}`, 'error');
    });
  };
}

export function createLoadAudioFile(refs: MediaLoaderRefs, setters: MediaLoaderSetters) {
  return (file: File, projectId: string) => {
    revokeManagedUrls(refs);
    resetMediaState(refs, setters);
    setters.setProjectStatus({ kind: 'progress', message: 'Importing audio into project folder', progress: 0, detail: `Folder: projects/${projectId}` });

    const url = URL.createObjectURL(file);
    refs.audioBlobUrlRef.current = url;
    const audio = document.createElement('audio');
    audio.src = url;
    audio.crossOrigin = 'anonymous';
    audio.preload = 'auto';
    audio.addEventListener('loadedmetadata', () => {
      const duration = audio.duration;
      setters.setAudioInfo({ name: file.name, duration });
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

    setters.setMainTab('audio');
    setters.setAudioSubTab('reactivity');
    const uploadId = setters.addToast('Importing audio into project folder…', 'progress', true);
    uploadAudio(projectId, file, (pct) => {
      setters.setProjectStatus({ kind: 'progress', message: 'Importing audio into project folder', progress: pct, detail: `Folder: projects/${projectId}` });
      setters.updateToast(uploadId, `Importing… ${pct}%`, 'progress');
    }).then(() => {
      setters.setProjectStatus({ kind: 'progress', message: 'Audio imported; starting transcription', detail: `Folder: projects/${projectId}` });
      setters.updateToast(uploadId, 'Audio imported — starting transcription…', 'info');
      listProjects().then(setters.setProjects);
    }).catch((error) => {
      setters.setProjectStatus({ kind: 'error', message: `Import failed: ${error.message}` });
      setters.updateToast(uploadId, `Import failed: ${error.message}`, 'error');
    });
  };
}

export function createLoadMusicFile(refs: MediaLoaderRefs, setters: MediaLoaderSetters) {
  return (file: File, projectId: string) => {
    setters.setPlaying(false);
    refs.mediaElRef.current?.pause();
    refs.musicElRef.current?.pause();
    refs.musicPlayerRef.current?.dispose();
    refs.musicPlayerRef.current = null;
    refs.musicElRef.current = null;
    setters.setMusicInfo(null);
    setters.setProjectStatus({ kind: 'progress', message: 'Importing music into project folder', progress: 0, detail: `Folder: projects/${projectId}` });
    loadManagedMusicSource(refs, setters, file);

    const uploadId = setters.addToast('Importing music into project folder…', 'progress', true);
    uploadMusic(projectId, file, (pct) => {
      setters.setProjectStatus({ kind: 'progress', message: 'Importing music into project folder', progress: pct, detail: `Folder: projects/${projectId}` });
      setters.updateToast(uploadId, `Importing… ${pct}%`, 'progress');
    }).then(() => {
      setters.setProjectStatus({ kind: 'success', message: 'Music imported', detail: `Folder: projects/${projectId}` });
      setters.updateToast(uploadId, 'Music imported successfully', 'success');
      listProjects().then(setters.setProjects);
    }).catch((error) => {
      setters.setProjectStatus({ kind: 'error', message: `Import failed: ${error.message}` });
      setters.updateToast(uploadId, `Import failed: ${error.message}`, 'error');
    });
  };
}

export function createHandleClearMusic(refs: MediaLoaderRefs, setters: MediaLoaderSetters) {
  return () => {
    refs.musicElRef.current?.pause();
    refs.musicPlayerRef.current?.dispose();
    refs.musicPlayerRef.current = null;
    refs.musicElRef.current = null;
    setters.setMusicInfo(null);
    setters.setMusicLayerOn(false);
    const projectId = refs.activeProjectIdRef.current;
    if (projectId) deleteMusic(projectId).then(() => listProjects().then(setters.setProjects)).catch(() => setters.addToast('Failed to remove music file from project', 'error'));
  };
}

export function createLoadFile(refs: MediaLoaderRefs, setters: MediaLoaderSetters) {
  const loadVideoFile = createLoadVideoFile(refs, setters);
  const loadAudioFile = createLoadAudioFile(refs, setters);
  return (file: File) => {
    const projectId = refs.activeProjectIdRef.current;
    if (!projectId) {
      setters.setProjectStatus({ kind: 'error', message: 'Create or select a project before importing media' });
      setters.addToast('Create or select a project before importing media', 'error');
      return;
    }
    if (isAudioFile(file)) loadAudioFile(file, projectId);
    else loadVideoFile(file, projectId);
  };
}

export function createImportNativeMedia(refs: MediaLoaderRefs, setters: MediaLoaderSetters) {
  return async () => {
    const projectId = refs.activeProjectIdRef.current;
    if (!projectId) {
      setters.setProjectStatus({ kind: 'error', message: 'Create or select a project before importing media' });
      setters.addToast('Create or select a project before importing media', 'error');
      return;
    }

    revokeManagedUrls(refs);
    resetMediaState(refs, setters);
    const importId = setters.addToast('Choose a file to move into the project…', 'progress', true);
    setters.setProjectStatus({ kind: 'progress', message: 'Waiting for a file selection', detail: `Folder: projects/${projectId}` });

    try {
      const result = await importNativeMedia(projectId);
      if (result.mediaType === 'audio') {
        setters.setMainTab('audio');
        setters.setAudioSubTab('reactivity');
        loadManagedAudioSource(refs, setters, projectId, result.originalName);
      } else {
        loadManagedVideoSource(refs, setters, projectId, result.originalName);
      }
      setters.setProjectStatus({ kind: 'progress', message: `${result.mediaType === 'audio' ? 'Audio' : 'Video'} transferred; starting transcription`, detail: `Folder: projects/${projectId}` });
      setters.updateToast(importId, `${result.mediaType === 'audio' ? 'Audio' : 'Video'} moved into project — starting transcription…`, 'info');
      listProjects().then(setters.setProjects);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Import failed';
      setters.setProjectStatus({ kind: 'error', message });
      setters.updateToast(importId, message, 'error');
    }
  };
}
