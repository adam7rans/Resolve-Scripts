import type { TranscriptWord } from '../lib/transcript';

export const CAPTION_HOLD_MS = 1000;
export const CAPTION_FADE_MS = 2000;
export const CAPTION_GRACE_MS = CAPTION_HOLD_MS + CAPTION_FADE_MS;

export function captionFadeAlpha(timeMs: number, captionEndMs: number, playbackStartMs: number | undefined): number {
  if (timeMs <= captionEndMs) return 1;
  if (playbackStartMs !== undefined && captionEndMs < playbackStartMs) return 0;
  const elapsed = timeMs - captionEndMs;
  if (elapsed <= CAPTION_HOLD_MS) return 1;
  if (elapsed <= CAPTION_GRACE_MS) return 1 - (elapsed - CAPTION_HOLD_MS) / CAPTION_FADE_MS;
  return 0;
}

export const isWordActive = (word: TranscriptWord, ms: number) => ms >= (word.start ?? 0) && ms <= (word.end ?? word.start ?? 0);

export function splitWordParts(text: string): { lead: string; body: string; trail: string } {
  const match = /^(\p{P}*)(.*?)(\p{P}*)$/u.exec(text);
  if (!match) return { lead: '', body: text, trail: '' };
  const [, lead, body, trail] = match;
  if (!body) return { lead: text, body: '', trail: '' };
  return { lead: lead ?? '', body, trail: trail ?? '' };
}
