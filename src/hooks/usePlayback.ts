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
    // Only treat *text-entry* fields as editable. Range sliders, checkboxes,
    // buttons, etc. should NOT swallow the Space shortcut.
    const TEXT_INPUT_TYPES = new Set([
      'text', 'search', 'url', 'tel', 'email', 'password',
      'number', 'date', 'datetime-local', 'month', 'week', 'time',
    ]);
    const isEditableTarget = (el: EventTarget | null) => {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      if (tag === 'TEXTAREA') return true;
      if (tag === 'INPUT') {
        const type = (el as HTMLInputElement).type.toLowerCase();
        return TEXT_INPUT_TYPES.has(type);
      }
      if (el.isContentEditable) return true;
      return false;
    };
    // Capture-phase handler so we intercept Space before any focused
    // button/link/etc. can activate it. Also stop propagation + prevent
    // default on both keydown and keyup (buttons activate Space on keyup).
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isEditableTarget(e.target)) return;
      if (e.code === 'Space') {
        e.preventDefault();
        e.stopPropagation();
        if (e.repeat) return;
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
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      if (isEditableTarget(e.target)) return;
      // Prevent buttons/links from firing their click on Space keyup.
      e.preventDefault();
      e.stopPropagation();
    };
    // Auto-blur non-text-input controls after interaction so they can't
    // capture Space. On macOS, native <select> widgets handle Space at the
    // OS level before JS events fire, so preventing default isn't enough —
    // the element must not be focused when Space is pressed.
    const blurIfNonEditable = () => {
      const el = document.activeElement;
      if (el instanceof HTMLElement && !isEditableTarget(el) && el !== document.body && el.tagName !== 'SELECT') {
        el.blur();
      }
    };
    const onFocusIn = (e: FocusEvent) => {
      const el = e.target;
      if (el instanceof HTMLElement && !isEditableTarget(el) && el.tagName !== 'SELECT') {
        setTimeout(blurIfNonEditable, 0);
      }
    };
    const onSelectChange = (e: Event) => {
      if (e.target instanceof HTMLSelectElement) e.target.blur();
    };
    const onPointerUp = () => setTimeout(blurIfNonEditable, 0);
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('pointerup', onPointerUp, true);
    document.addEventListener('change', onSelectChange, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('pointerup', onPointerUp, true);
      document.removeEventListener('change', onSelectChange, true);
    };
  }, [mediaElRef, previewWrapRef, togglePlayRef, setMuted]);
}
