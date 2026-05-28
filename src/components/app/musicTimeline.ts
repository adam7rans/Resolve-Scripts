import type { MusicTimelineClip } from '../../lib/types';

export const MUSIC_TRACK_COUNT = 2;
export const MUSIC_DEFAULT_OVERLAP_SECONDS = 10;

export function clampMusicFade(value: number, duration: number) {
  return Math.max(0, Math.min(value, Math.max(0, duration - 0.01)));
}

export function musicClipEnd(clip: MusicTimelineClip) {
  return clip.startSecond + clip.durationSecond;
}

export function musicFadeGainAtTime(clip: MusicTimelineClip, t: number) {
  if (t < clip.startSecond || t > musicClipEnd(clip)) return 0;
  const local = t - clip.startSecond;
  const remaining = musicClipEnd(clip) - t;
  const fadeIn = clip.fadeInSecond > 0 ? Math.min(1, local / clip.fadeInSecond) : 1;
  const fadeOut = clip.fadeOutSecond > 0 ? Math.min(1, remaining / clip.fadeOutSecond) : 1;
  return Math.max(0, Math.min(1, fadeIn, fadeOut));
}

export async function readLocalAudioDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = document.createElement('audio');
    audio.preload = 'metadata';
    audio.src = url;
    audio.addEventListener(
      'loadedmetadata',
      () => {
        const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
        URL.revokeObjectURL(url);
        resolve(duration);
      },
      { once: true },
    );
    audio.addEventListener(
      'error',
      () => {
        URL.revokeObjectURL(url);
        resolve(0);
      },
      { once: true },
    );
  });
}
