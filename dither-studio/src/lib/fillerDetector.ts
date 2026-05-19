/**
 * Deterministic filler-phrase detector. Given a transcript, returns an array
 * of time ranges that should be skipped to tighten rambling speech.
 *
 * Detected patterns:
 *   - filler interjections: "you know", "I mean", "kind of", "sort of",
 *     "I guess", "like", "I don't know" (when used as a sentence break)
 *   - stutter repeats: same body token said 2+ times in a row
 *     ("I, I, I", "the the", "and, and")
 *
 * Pure function — no state, no DOM, no AI. The same input always produces
 * the same output. Output is sorted by startMs and non-overlapping.
 */
import type { TranscriptData, TranscriptWord } from './transcript';

export interface CustomCut {
  key: string;
  startMs: number;
  endMs: number;
  /** Free-form tag explaining why this was cut (for the timeline tooltip). */
  label?: string;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z']+/g, '');

/** Multi-word filler phrases that should be skipped wherever they appear. */
const FILLER_PHRASES: string[][] = [
  ['you', 'know'],
  ['i', 'mean'],
  ['kind', 'of'],
  ['sort', 'of'],
  ['i', 'guess'],
  ['i', 'dont', 'know'],
];

/** Single-word fillers (only cut if surrounded by sentence punctuation). */
const SINGLE_WORD_FILLERS = new Set(['like', 'basically', 'literally', 'actually']);

function flattenWords(transcript: TranscriptData): TranscriptWord[] {
  const out: TranscriptWord[] = [];
  for (const u of transcript.utterances) {
    if (u.words) out.push(...u.words);
  }
  out.sort((a, b) => (a.start ?? 0) - (b.start ?? 0));
  return out;
}

function matchPhrase(words: TranscriptWord[], i: number, phrase: string[]): boolean {
  for (let k = 0; k < phrase.length; k++) {
    if (i + k >= words.length) return false;
    if (norm(words[i + k].text) !== phrase[k]) return false;
  }
  return true;
}

function endsSentence(w: TranscriptWord): boolean {
  return /[.!?]$/.test(w.text);
}

function detectStutters(words: TranscriptWord[]): CustomCut[] {
  const cuts: CustomCut[] = [];
  let i = 0;
  while (i < words.length - 1) {
    const a = norm(words[i].text);
    if (!a || a.length === 0) { i++; continue; }
    let j = i + 1;
    while (j < words.length && norm(words[j].text) === a) j++;
    if (j - i >= 2) {
      // Keep the LAST occurrence (so the sentence still flows), cut the rest.
      const last = words[j - 1];
      cuts.push({
        key: `stutter:${words[i].start}`,
        startMs: words[i].start ?? 0,
        endMs: last.start ?? words[j - 2].end ?? 0,
        label: `stutter "${a}"`,
      });
    }
    i = j;
  }
  return cuts;
}

function detectPhrases(words: TranscriptWord[]): CustomCut[] {
  const cuts: CustomCut[] = [];
  let i = 0;
  while (i < words.length) {
    let matched = false;
    for (const phrase of FILLER_PHRASES) {
      if (matchPhrase(words, i, phrase)) {
        const first = words[i];
        const last = words[i + phrase.length - 1];
        // Keep the trailing punctuation by ending at the word's start when it
        // closes a sentence (so the period of "you know." survives in the
        // outgoing audio's micro-pause boundary; not perfect but close).
        cuts.push({
          key: `filler:${first.start}`,
          startMs: first.start ?? 0,
          endMs: (last.end ?? last.start ?? 0),
          label: phrase.join(' '),
        });
        i += phrase.length;
        matched = true;
        break;
      }
    }
    if (matched) continue;
    const w = words[i];
    const lower = norm(w.text);
    // Single-word fillers are only cut when they look like an interjection:
    // surrounded by commas or appearing right after punctuation.
    if (SINGLE_WORD_FILLERS.has(lower)) {
      const prev = words[i - 1];
      const next = words[i + 1];
      const afterPunct = !prev || endsSentence(prev) || /[,]$/.test(prev.text);
      const beforePunct = !next || /^[.,!?]/.test(next.text) || /[,.!?]$/.test(w.text);
      if (afterPunct && beforePunct) {
        cuts.push({
          key: `filler:${w.start}`,
          startMs: w.start ?? 0,
          endMs: w.end ?? w.start ?? 0,
          label: lower,
        });
      }
    }
    i++;
  }
  return cuts;
}

/** Merge overlapping / adjacent cuts so the player doesn't bounce. */
function mergeCuts(cuts: CustomCut[], minGapMs = 40): CustomCut[] {
  if (cuts.length === 0) return cuts;
  const sorted = [...cuts].sort((a, b) => a.startMs - b.startMs);
  const out: CustomCut[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const last = out[out.length - 1];
    const cur = sorted[i];
    if (cur.startMs - last.endMs <= minGapMs) {
      last.endMs = Math.max(last.endMs, cur.endMs);
      last.label = last.label && cur.label ? `${last.label} + ${cur.label}` : last.label ?? cur.label;
    } else {
      out.push({ ...cur });
    }
  }
  return out;
}

export function detectFillerCuts(transcript: TranscriptData): CustomCut[] {
  const words = flattenWords(transcript);
  if (words.length === 0) return [];
  const cuts = [...detectStutters(words), ...detectPhrases(words)];
  return mergeCuts(cuts);
}
