import { AudioSource } from '../lib/AudioSource';
import { MusicPlayer } from '../lib/MusicPlayer';
import { snapToExportResolution } from '../lib/layoutUtils';
import { getAudioUrl, getVideoUrl } from '../lib/projectApi';
import type { MediaLoaderRefs, MediaLoaderSetters } from './useMediaLoader.types';

export function revokeManagedUrls(refs: MediaLoaderRefs) {
  if (refs.videoBlobUrlRef.current) URL.revokeObjectURL(refs.videoBlobUrlRef.current);
  if (refs.audioBlobUrlRef.current) URL.revokeObjectURL(refs.audioBlobUrlRef.current);
}

export function resetMediaState(refs: MediaLoaderRefs, setters: MediaLoaderSetters, clearVideo = true) {
  setters.setPlaying(false);
  refs.mediaElRef.current?.pause();
  refs.audioSourceRef.current?.dispose();
  refs.audioSourceRef.current = null;
  refs.audioElRef.current = null;
  refs.mediaElRef.current = null;
  if (clearVideo) {
    refs.videoRendererRef.current?.setVideo(null);
    refs.videoElRef.current = null;
    setters.setVideoInfo(null);
  }
  setters.setAudioInfo(null);
  setters.setTranscript(null);
  setters.setTranscriptName(null);
  setters.setPlayheadSecond(0);
}

export function loadManagedVideoSource(refs: MediaLoaderRefs, setters: MediaLoaderSetters, projectId: string, name: string) {
  const url = getVideoUrl(projectId);
  const video = document.createElement('video');
  video.src = url;
  video.muted = false;
  video.volume = 1;
  video.playsInline = true;
  video.preload = 'auto';
  video.addEventListener('loadedmetadata', () => {
    setters.setVideoInfo({ name, duration: video.duration, w: video.videoWidth, h: video.videoHeight });
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

export function loadManagedAudioSource(refs: MediaLoaderRefs, setters: MediaLoaderSetters, projectId: string, name: string) {
  const url = getAudioUrl(projectId);
  const audio = document.createElement('audio');
  audio.src = url;
  audio.crossOrigin = 'anonymous';
  audio.preload = 'auto';
  audio.addEventListener('loadedmetadata', () => {
    const duration = audio.duration;
    setters.setAudioInfo({ name, duration });
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

export function loadManagedMusicSource(refs: MediaLoaderRefs, setters: MediaLoaderSetters, file: File) {
  const music = document.createElement('audio');
  music.src = URL.createObjectURL(file);
  music.crossOrigin = 'anonymous';
  music.preload = 'auto';
  music.loop = true;
  music.addEventListener('loadedmetadata', () => {
    setters.setMusicInfo({ name: file.name });
    refs.musicElRef.current = music;
    refs.musicPlayerRef.current = new MusicPlayer(music);
  });
}
