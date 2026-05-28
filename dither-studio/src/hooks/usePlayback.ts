import type React from 'react';
import { useEffect, useRef } from 'react';
import type { AudioSource } from '../lib/AudioSource';
import type { MusicPlayer, MusicParams } from '../lib/MusicPlayer';
import type { MicroTimeline } from '../lib/types';
import { clamp } from '../lib/layoutUtils';

export interface PlaybackRefs {
  mediaElRef: React.MutableRefObject<HTMLMediaElement | null>;
  audioSourceRef: React.MutableRefObject<AudioSource | null>;
  musicElRef: React.MutableRefObject<HTMLAudioElement | null>;
  musicPlayerRef: React.MutableRefObject<MusicPlayer | null>;
  playingInClipRef: React.MutableRefObject<boolean>;
}

export interface PlaybackState {
  music: MusicParams;
  musicLayerOn: boolean;
  hasTimelineMusic?: boolean;
  videoInfo: { name: string; duration: number; w: number; h: number } | null;
  audioInfo: { name: string; duration: number } | null;
  selectedClip: MicroTimeline | null;
}

export interface PlaybackSetters {
  setPlaying: React.Dispatch<React.SetStateAction<boolean>>;
  setPlayheadSecond: React.Dispatch<React.SetStateAction<number>>;
  setPlaybackStartMs: React.Dispatch<React.SetStateAction<number | undefined>>;
  setMuted: React.Dispatch<React.SetStateAction<boolean>>;
}

export function createTogglePlay(refs: PlaybackRefs, state: PlaybackState, setters: PlaybackSetters) {
  return () => {
    const { mediaElRef, audioSourceRef, musicElRef, musicPlayerRef, playingInClipRef } = refs;
    const { music, musicLayerOn, hasTimelineMusic, videoInfo, audioInfo, selectedClip } = state;
    const { setPlaying, setPlayheadSecond, setPlaybackStartMs } = setters;

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
    if (v.paused) {
      audioSourceRef.current?.ensureGraph();
      audioSourceRef.current?.resume();
      musicPlayerRef.current?.ensureGraph();
      musicPlayerRef.current?.resume();
      musicPlayerRef.current?.setVolume(music.volume, music.muted || !musicLayerOn);
      const cur = v.currentTime || 0;
      let target = cur;
      const clip = selectedClip;
      if (clip) {
        const insideClip = cur >= clip.startSecond && cur < clip.endSecond - 0.001;
        target = insideClip ? cur : clip.startSecond;
        playingInClipRef.current = true;
      } else {
        playingInClipRef.current = false;
        if (cur >= totalDuration - 0.001) target = 0;
      }
      setPlayheadSecond(target);
      setPlaybackStartMs(target * 1000);
      const clipStart = clip?.startSecond ?? 0;
      const startPlayback = () => {
        const p = v.play();
        if (p && typeof p.catch === 'function') p.catch(() => setPlaying(false));
        const mEl = musicElRef.current;
        if (mEl && musicLayerOn && !hasTimelineMusic) {
          if (mEl.duration > 0) {
            mEl.currentTime = (target - clipStart) % mEl.duration;
          }
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
}

export function createHandleSeekPlayhead(refs: PlaybackRefs, state: PlaybackState, setters: PlaybackSetters) {
  return (second: number) => {
    const v = refs.mediaElRef.current;
    if (!v) return;
    const totalDuration = state.videoInfo?.duration ?? state.audioInfo?.duration ?? v.duration;
    const target = clamp(second, 0, totalDuration);
    v.currentTime = target;
    setters.setPlayheadSecond(target);
    setters.setPlaybackStartMs(target * 1000);
  };
}

/**
 * Keyboard shortcuts: space = play/pause, m = mute/unmute.
 * Uses a togglePlayRef to always call the latest togglePlay closure.
 */
export function usePlaybackKeyboard(
  mediaElRef: React.MutableRefObject<HTMLMediaElement | null>,
  previewWrapRef: React.MutableRefObject<HTMLDivElement | null>,
  togglePlayRef: React.MutableRefObject<() => void>,
  setMuted: React.Dispatch<React.SetStateAction<boolean>>,
) {
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
      } else if (e.key === 'f' || e.key === 'F') {
        const preview = previewWrapRef.current;
        if (!preview) return;
        e.preventDefault();
        if (document.fullscreenElement === preview) {
          void document.exitFullscreen();
        } else if (!document.fullscreenElement) {
          void preview.requestFullscreen();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mediaElRef, previewWrapRef, togglePlayRef, setMuted]);
}
