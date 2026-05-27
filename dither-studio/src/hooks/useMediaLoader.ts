import type React from 'react';
import { AudioSource } from '../lib/AudioSource';
import { MusicPlayer } from '../lib/MusicPlayer';
import {
  type ExportParams,
} from '../lib/types';
import type { ProjectTaskStatus, MainTab, AudioSubTab } from '../lib/constants';
import { isAudioFile } from '../lib/constants';
import { snapToExportResolution } from '../lib/layoutUtils';
import type { VideoRenderer } from '../lib/VideoRenderer';
import {
  listProjects, uploadVideo, uploadAudio, uploadMusic, deleteMusic,
  importNativeMedia, getVideoUrl, getAudioUrl,
  type ProjectMeta,
} from '../lib/projectApi';
import type { TranscriptData } from '../lib/transcript';
import type { Toast } from '../components/StatusToast';

export interface MediaLoaderRefs {
  mediaElRef: React.MutableRefObject<HTMLMediaElement | null>;
  videoElRef: React.MutableRefObject<HTMLVideoElement | null>;
  audioElRef: React.MutableRefObject<HTMLAudioElement | null>;
  audioSourceRef: React.MutableRefObject<AudioSource | null>;
  videoRendererRef: React.MutableRefObject<VideoRenderer | null>;
  musicElRef: React.MutableRefObject<HTMLAudioElement | null>;
  musicPlayerRef: React.MutableRefObject<MusicPlayer | null>;
  videoBlobUrlRef: React.MutableRefObject<string | null>;
  audioBlobUrlRef: React.MutableRefObject<string | null>;
  activeProjectIdRef: React.MutableRefObject<string | null>;
}

export interface MediaLoaderSetters {
  setProjects: React.Dispatch<React.SetStateAction<ProjectMeta[]>>;
  setProjectStatus: (s: ProjectTaskStatus) => void;
  setMainTab: React.Dispatch<React.SetStateAction<MainTab>>;
  setAudioSubTab: React.Dispatch<React.SetStateAction<AudioSubTab>>;
  setPlaying: React.Dispatch<React.SetStateAction<boolean>>;
  setVideoInfo: React.Dispatch<React.SetStateAction<{ name: string; duration: number; w: number; h: number } | null>>;
  setAudioInfo: React.Dispatch<React.SetStateAction<{ name: string; duration: number } | null>>;
  setPlayheadSecond: React.Dispatch<React.SetStateAction<number>>;
  setTranscript: React.Dispatch<React.SetStateAction<TranscriptData | null>>;
  setTranscriptName: React.Dispatch<React.SetStateAction<string | null>>;
  setVidExport: React.Dispatch<React.SetStateAction<ExportParams>>;
  setBgExport: React.Dispatch<React.SetStateAction<ExportParams>>;
  setMusicInfo: React.Dispatch<React.SetStateAction<{ name: string } | null>>;
  setMusicLayerOn: React.Dispatch<React.SetStateAction<boolean>>;
  addToast: (message: string, type?: Toast['type'], sticky?: boolean) => number;
  updateToast: (id: number, message: string, type: Toast['type']) => void;
}

function loadManagedVideoSource(
  refs: MediaLoaderRefs,
  setters: MediaLoaderSetters,
  pid: string,
  name: string,
) {
  const { mediaElRef, audioSourceRef, videoRendererRef, videoElRef } = refs;
  const s = setters;
  const url = getVideoUrl(pid);
  const v = document.createElement('video');
  v.src = url;
  v.muted = false;
  v.volume = 1;
  v.playsInline = true;
  v.preload = 'auto';
  v.addEventListener('loadedmetadata', () => {
    s.setVideoInfo({ name, duration: v.duration, w: v.videoWidth, h: v.videoHeight });
    const snap = snapToExportResolution(v.videoWidth, v.videoHeight);
    s.setVidExport((p) => {
      const nextEnd = p.endSecond === undefined ? v.duration : Math.min(v.duration, p.endSecond);
      const nextStart = Math.min(p.startSecond, Math.max(0, nextEnd - 0.01));
      return {
        ...p,
        width: snap.w,
        height: snap.h,
        startSecond: nextStart,
        endSecond: nextEnd,
        duration: Math.max(0.01, nextEnd - nextStart),
      };
    });
    videoRendererRef.current?.setVideo(v);
    videoElRef.current = v;
    mediaElRef.current = v;
    audioSourceRef.current = new AudioSource({ element: v, url });
    v.currentTime = 0;
  });
}

function loadManagedAudioSource(
  refs: MediaLoaderRefs,
  setters: MediaLoaderSetters,
  pid: string,
  name: string,
) {
  const { mediaElRef, audioSourceRef, audioElRef } = refs;
  const s = setters;
  const url = getAudioUrl(pid);
  const a = document.createElement('audio');
  a.src = url;
  a.crossOrigin = 'anonymous';
  a.preload = 'auto';
  a.addEventListener('loadedmetadata', () => {
    const duration = a.duration;
    s.setAudioInfo({ name, duration });
    s.setBgExport((p) => {
      const nextEnd = p.endSecond === undefined ? duration : Math.min(duration, p.endSecond);
      const nextStart = Math.min(p.startSecond, Math.max(0, nextEnd - 0.01));
      return { ...p, startSecond: nextStart, endSecond: nextEnd, duration: Math.max(0.01, nextEnd - nextStart) };
    });
    audioElRef.current = a;
    mediaElRef.current = a;
    audioSourceRef.current = new AudioSource({ element: a, url });
    a.currentTime = 0;
  });
}

export function createLoadVideoFile(refs: MediaLoaderRefs, setters: MediaLoaderSetters) {
  return (file: File, pid: string) => {
    const { videoBlobUrlRef, audioBlobUrlRef, mediaElRef, audioSourceRef, audioElRef, videoRendererRef, videoElRef } = refs;
    const s = setters;

    if (videoBlobUrlRef.current) URL.revokeObjectURL(videoBlobUrlRef.current);
    if (audioBlobUrlRef.current) URL.revokeObjectURL(audioBlobUrlRef.current);
    s.setPlaying(false);
    mediaElRef.current?.pause();
    audioSourceRef.current?.dispose();
    audioSourceRef.current = null;
    audioElRef.current = null;
    mediaElRef.current = null;
    s.setAudioInfo(null);
    s.setTranscript(null);
    s.setTranscriptName(null);
    s.setPlayheadSecond(0);
    s.setProjectStatus({ kind: 'progress', message: 'Importing video into project folder', progress: 0, detail: `Folder: projects/${pid}` });

    const url = URL.createObjectURL(file);
    videoBlobUrlRef.current = url;
    const v = document.createElement('video');
    v.src = url;
    v.muted = false; v.volume = 1; v.playsInline = true; v.preload = 'auto';
    v.addEventListener('loadedmetadata', () => {
      s.setVideoInfo({ name: file.name, duration: v.duration, w: v.videoWidth, h: v.videoHeight });
      const snap = snapToExportResolution(v.videoWidth, v.videoHeight);
      s.setVidExport((p) => {
        const nextEnd = p.endSecond === undefined ? v.duration : Math.min(v.duration, p.endSecond);
        const nextStart = Math.min(p.startSecond, Math.max(0, nextEnd - 0.01));
        return {
          ...p,
          width: snap.w,
          height: snap.h,
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
    const uploadId = s.addToast('Importing video into project folder…', 'progress', true);
    uploadVideo(pid, file, (pct) => {
      s.setProjectStatus({ kind: 'progress', message: 'Importing video into project folder', progress: pct, detail: `Folder: projects/${pid}` });
      s.updateToast(uploadId, `Importing… ${pct}%`, 'progress');
    }).then(() => {
      s.setProjectStatus({ kind: 'progress', message: 'Video imported; starting transcription', detail: `Folder: projects/${pid}` });
      s.updateToast(uploadId, 'Video imported — starting transcription…', 'info');
      listProjects().then(s.setProjects);
    }).catch(err => {
      s.setProjectStatus({ kind: 'error', message: `Import failed: ${err.message}` });
      s.updateToast(uploadId, `Import failed: ${err.message}`, 'error');
    });
  };
}

export function createLoadAudioFile(refs: MediaLoaderRefs, setters: MediaLoaderSetters) {
  return (file: File, pid: string) => {
    const { videoBlobUrlRef, audioBlobUrlRef, mediaElRef, videoRendererRef, videoElRef, audioSourceRef, audioElRef } = refs;
    const s = setters;

    if (videoBlobUrlRef.current) URL.revokeObjectURL(videoBlobUrlRef.current);
    if (audioBlobUrlRef.current) URL.revokeObjectURL(audioBlobUrlRef.current);
    s.setPlaying(false);
    mediaElRef.current?.pause();
    videoRendererRef.current?.setVideo(null);
    videoElRef.current = null;
    audioSourceRef.current?.dispose();
    audioSourceRef.current = null;
    audioElRef.current = null;
    mediaElRef.current = null;
    s.setVideoInfo(null);
    s.setAudioInfo(null);
    s.setTranscript(null);
    s.setTranscriptName(null);
    s.setPlayheadSecond(0);
    s.setProjectStatus({ kind: 'progress', message: 'Importing audio into project folder', progress: 0, detail: `Folder: projects/${pid}` });

    const url = URL.createObjectURL(file);
    audioBlobUrlRef.current = url;
    const a = document.createElement('audio');
    a.src = url;
    a.crossOrigin = 'anonymous';
    a.preload = 'auto';
    a.addEventListener('loadedmetadata', () => {
      const duration = a.duration;
      s.setAudioInfo({ name: file.name, duration });
      s.setBgExport((p) => {
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

    s.setMainTab('audio');
    s.setAudioSubTab('reactivity');

    const uploadId = s.addToast('Importing audio into project folder…', 'progress', true);
    uploadAudio(pid, file, (pct) => {
      s.setProjectStatus({ kind: 'progress', message: 'Importing audio into project folder', progress: pct, detail: `Folder: projects/${pid}` });
      s.updateToast(uploadId, `Importing… ${pct}%`, 'progress');
    }).then(() => {
      s.setProjectStatus({ kind: 'progress', message: 'Audio imported; starting transcription', detail: `Folder: projects/${pid}` });
      s.updateToast(uploadId, 'Audio imported — starting transcription…', 'info');
      listProjects().then(s.setProjects);
    }).catch(err => {
      s.setProjectStatus({ kind: 'error', message: `Import failed: ${err.message}` });
      s.updateToast(uploadId, `Import failed: ${err.message}`, 'error');
    });
  };
}

export function createLoadMusicFile(refs: MediaLoaderRefs, setters: MediaLoaderSetters) {
  return (file: File, pid: string) => {
    const { mediaElRef, musicElRef, musicPlayerRef } = refs;
    const s = setters;

    s.setPlaying(false);
    mediaElRef.current?.pause();
    musicElRef.current?.pause();
    musicPlayerRef.current?.dispose();
    musicPlayerRef.current = null;
    musicElRef.current = null;
    s.setMusicInfo(null);
    s.setProjectStatus({ kind: 'progress', message: 'Importing music into project folder', progress: 0, detail: `Folder: projects/${pid}` });

    const url = URL.createObjectURL(file);
    const m = document.createElement('audio');
    m.src = url;
    m.crossOrigin = 'anonymous';
    m.preload = 'auto';
    m.loop = true;
    m.addEventListener('loadedmetadata', () => {
      s.setMusicInfo({ name: file.name });
      musicElRef.current = m;
      musicPlayerRef.current = new MusicPlayer(m);
    });

    const uploadId = s.addToast('Importing music into project folder…', 'progress', true);
    uploadMusic(pid, file, (pct) => {
      s.setProjectStatus({ kind: 'progress', message: 'Importing music into project folder', progress: pct, detail: `Folder: projects/${pid}` });
      s.updateToast(uploadId, `Importing… ${pct}%`, 'progress');
    }).then(() => {
      s.setProjectStatus({ kind: 'success', message: 'Music imported', detail: `Folder: projects/${pid}` });
      s.updateToast(uploadId, 'Music imported successfully', 'success');
      listProjects().then(s.setProjects);
    }).catch(err => {
      s.setProjectStatus({ kind: 'error', message: `Import failed: ${err.message}` });
      s.updateToast(uploadId, `Import failed: ${err.message}`, 'error');
    });
  };
}

export function createHandleClearMusic(refs: MediaLoaderRefs, setters: MediaLoaderSetters) {
  return () => {
    const { musicElRef, musicPlayerRef, activeProjectIdRef } = refs;
    const s = setters;

    musicElRef.current?.pause();
    musicPlayerRef.current?.dispose();
    musicPlayerRef.current = null;
    musicElRef.current = null;
    s.setMusicInfo(null);
    s.setMusicLayerOn(false);
    const pid = activeProjectIdRef.current;
    if (pid) {
      deleteMusic(pid)
        .then(() => listProjects().then(s.setProjects))
        .catch(() => s.addToast('Failed to remove music file from project', 'error'));
    }
  };
}

export function createLoadFile(refs: MediaLoaderRefs, setters: MediaLoaderSetters) {
  const loadVideoFile = createLoadVideoFile(refs, setters);
  const loadAudioFile = createLoadAudioFile(refs, setters);
  return (file: File) => {
    const pid = refs.activeProjectIdRef.current;
    if (!pid) {
      setters.setProjectStatus({ kind: 'error', message: 'Create or select a project before importing media' });
      setters.addToast('Create or select a project before importing media', 'error');
      return;
    }
    if (isAudioFile(file)) {
      loadAudioFile(file, pid);
    } else {
      loadVideoFile(file, pid);
    }
  };
}

export function createImportNativeMedia(refs: MediaLoaderRefs, setters: MediaLoaderSetters) {
  return async () => {
    const { videoBlobUrlRef, audioBlobUrlRef, mediaElRef, videoRendererRef, videoElRef, audioSourceRef, audioElRef, activeProjectIdRef } = refs;
    const s = setters;
    const pid = activeProjectIdRef.current;
    if (!pid) {
      s.setProjectStatus({ kind: 'error', message: 'Create or select a project before importing media' });
      s.addToast('Create or select a project before importing media', 'error');
      return;
    }

    if (videoBlobUrlRef.current) URL.revokeObjectURL(videoBlobUrlRef.current);
    if (audioBlobUrlRef.current) URL.revokeObjectURL(audioBlobUrlRef.current);
    s.setPlaying(false);
    mediaElRef.current?.pause();
    videoRendererRef.current?.setVideo(null);
    videoElRef.current = null;
    audioSourceRef.current?.dispose();
    audioSourceRef.current = null;
    audioElRef.current = null;
    mediaElRef.current = null;
    s.setVideoInfo(null);
    s.setAudioInfo(null);
    s.setTranscript(null);
    s.setTranscriptName(null);
    s.setPlayheadSecond(0);

    const importId = s.addToast('Choose a file to move into the project…', 'progress', true);
    s.setProjectStatus({ kind: 'progress', message: 'Waiting for a file selection', detail: `Folder: projects/${pid}` });

    try {
      const result = await importNativeMedia(pid);
      if (result.mediaType === 'audio') {
        s.setMainTab('audio');
        s.setAudioSubTab('reactivity');
        loadManagedAudioSource(refs, setters, pid, result.originalName);
      } else {
        loadManagedVideoSource(refs, setters, pid, result.originalName);
      }
      s.setProjectStatus({ kind: 'progress', message: `${result.mediaType === 'audio' ? 'Audio' : 'Video'} transferred; starting transcription`, detail: `Folder: projects/${pid}` });
      s.updateToast(importId, `${result.mediaType === 'audio' ? 'Audio' : 'Video'} moved into project — starting transcription…`, 'info');
      listProjects().then(s.setProjects);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Import failed';
      s.setProjectStatus({ kind: 'error', message });
      s.updateToast(importId, message, 'error');
    }
  };
}
