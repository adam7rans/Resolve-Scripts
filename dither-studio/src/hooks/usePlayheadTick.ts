import type React from 'react';
import { useEffect } from 'react';
import type { MusicPlayer } from '../lib/MusicPlayer';
import type { ExportParams, MicroTimeline } from '../lib/types';
import type { JumpCutGap } from './useJumpCuts';

export interface PlayheadTickRefs {
  mediaElRef: React.MutableRefObject<HTMLMediaElement | null>;
  musicPlayerRef: React.MutableRefObject<MusicPlayer | null>;
  outroAudioRef: React.MutableRefObject<HTMLAudioElement>;
  playingRef: React.MutableRefObject<boolean>;
  playheadRef: React.MutableRefObject<number>;
  playingInClipRef: React.MutableRefObject<boolean>;
  selectedClipRef: React.MutableRefObject<MicroTimeline | null>;
  activeExportParamsRef: React.MutableRefObject<ExportParams>;
  jumpCutsEnabledRef: React.MutableRefObject<boolean>;
  jumpCutGapListRef: React.MutableRefObject<JumpCutGap[]>;
}

/**
 * Runs a RAF loop that keeps the playhead in sync with the media element's
 * currentTime, handles jump-cut silence skipping, clip boundaries, and the
 * outro audio trigger.
 */
export function usePlayheadTick(
  refs: PlayheadTickRefs,
  videoInfo: { duration: number } | null,
  audioInfo: { duration: number } | null,
  outroVolume: number,
  setPlaying: React.Dispatch<React.SetStateAction<boolean>>,
  setPlayheadSecond: React.Dispatch<React.SetStateAction<number>>,
) {
  useEffect(() => {
    const {
      mediaElRef, musicPlayerRef, outroAudioRef,
      playingRef, playheadRef, playingInClipRef,
      selectedClipRef, activeExportParamsRef,
      jumpCutsEnabledRef, jumpCutGapListRef,
    } = refs;

    const v = mediaElRef.current;
    const totalDuration = videoInfo?.duration ?? audioInfo?.duration ?? null;
    if (!v || !totalDuration) return;
    let raf: number | null = null;
    let lastT = performance.now();

    const tick = () => {
      const clip = selectedClipRef.current;
      const params = activeExportParamsRef.current;
      const outroDuration = params.outroEnabled ? 5 : 0;
      const insideClip = clip && playingInClipRef.current;
      const clipEnd = insideClip ? clip.endSecond : totalDuration;
      const limit = clipEnd + (insideClip ? outroDuration : 0);
      const vTime = v.currentTime || 0;

      const now = performance.now();
      const dt = (now - lastT) / 1000;
      lastT = now;

      const isOutroRange = clip && outroDuration > 0 && playheadRef.current >= clipEnd && playheadRef.current < limit - 0.02;
      const shouldPlayOutro = playingRef.current && isOutroRange;

      if (shouldPlayOutro) {
        if (outroAudioRef.current.paused) {
          outroAudioRef.current.volume = outroVolume;
          outroAudioRef.current.play().catch(() => {});
        }
      } else {
        if (!outroAudioRef.current.paused) {
          outroAudioRef.current.pause();
          outroAudioRef.current.currentTime = 0;
        }
      }

      if (playingRef.current) {
        let nextP: number;
        if (insideClip && outroDuration > 0 && playheadRef.current >= clipEnd - 0.01) {
          nextP = playheadRef.current + dt;
        } else {
          nextP = vTime;
        }

        // jump-cut: if the new playhead falls inside a precomputed silence gap, seek past it
        if (jumpCutsEnabledRef.current && !v.seeking && !shouldPlayOutro) {
          const gaps = jumpCutGapListRef.current;
          if (gaps.length > 0) {
            const nextMs = nextP * 1000;
            for (const g of gaps) {
              if (g.startMs > nextMs) break;
              if (nextMs >= g.startMs && nextMs < g.endMs) {
                const newSec = g.endMs / 1000;
                try { v.currentTime = newSec; } catch {}
                nextP = newSec;
                break;
              }
            }
          }
        }

        if (nextP >= limit - 0.01) {
          nextP = limit;
          v.pause();
          if (musicPlayerRef.current) musicPlayerRef.current.stop();
          if (outroAudioRef.current) {
            outroAudioRef.current.pause();
            outroAudioRef.current.currentTime = 0;
          }
          setPlaying(false);
          playingRef.current = false;
        }
        if (Math.abs(nextP - playheadRef.current) > 0.001) {
          setPlayheadSecond(nextP);
          playheadRef.current = nextP;
        }
      } else {
        if (!v.seeking && Math.abs(vTime - playheadRef.current) > 0.02) {
          setPlayheadSecond(vTime);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      if (raf) cancelAnimationFrame(raf);
    };
  }, [videoInfo, audioInfo, outroVolume]);
}
