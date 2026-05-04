// Transcript data types and a flexible parser, ported from
// w3rk17/src/components/audio-transcript/types.ts and the loader in
// w3rk17/src/app/page.tsx. Timestamps are in milliseconds.

export type TranscriptWord = {
  text: string;
  start: number; // ms
  end: number;   // ms
};

export type TranscriptUtterance = {
  speaker: string | null;
  start: number;
  end: number;
  text?: string;
  words?: TranscriptWord[];
};

export type TranscriptData = {
  speakers?: string[];
  utterances: TranscriptUtterance[];
};

export type CaptionMode = 'line' | 'word';

/** Accepts the two formats used in w3rk17/src/content/. */
export function parseTranscript(raw: unknown): TranscriptData {
  const rawSource: any = raw;
  const rawUtterances: any[] = Array.isArray(rawSource?.utterances)
    ? rawSource.utterances
    : Array.isArray(rawSource)
      ? rawSource
      : [];

  const utterances: TranscriptUtterance[] = rawUtterances.map((entry) => {
    const start = typeof entry?.start === 'number' ? entry.start : 0;
    const end = typeof entry?.end === 'number' ? entry.end : start;

    const words: TranscriptWord[] | undefined = Array.isArray(entry?.words)
      ? entry.words.map((w: any) => {
          const ws = typeof w?.start === 'number' ? w.start : 0;
          const we = typeof w?.end === 'number' ? w.end : ws;
          return { text: typeof w?.text === 'string' ? w.text : '', start: ws, end: we };
        })
      : undefined;

    return {
      speaker: typeof entry?.speaker === 'string' && entry.speaker.length > 0 ? entry.speaker : null,
      start,
      end,
      text: typeof entry?.text === 'string' ? entry.text : undefined,
      words,
    };
  });

  return { utterances };
}

const SENTENCE_END = /[.!?]+$/;

export type CaptionSentence = {
  words: TranscriptWord[];
  speaker: string | null;
  start: number;
  end: number;
  text: string;
};

export type LineSplitConfig = {
  mode: 'sentence' | 'words' | 'chars' | 'duration' | 'balanced';
  maxWords?: number;
  maxChars?: number;
  /** seconds */
  maxSeconds?: number;
  /** target words per chunk in 'balanced' mode */
  targetWords?: number;
};

const DEFAULT_SPLIT: Required<LineSplitConfig> = {
  mode: 'sentence',
  maxWords: 8,
  maxChars: 60,
  maxSeconds: 3,
  targetWords: 6,
};

/**
 * Build a CaptionSentence from a slice of words inside an utterance.
 * Used by both the streaming flush() and the balanced post-processor.
 */
function makeSentence(
  words: TranscriptWord[],
  speaker: string | null,
  fallbackStart: number,
  fallbackEnd: number,
): CaptionSentence {
  const start = words.find((w) => typeof w.start === 'number')?.start ?? fallbackStart;
  const end = [...words].reverse().find((w) => typeof w.end === 'number')?.end ?? fallbackEnd;
  const text = words.map((w) => w.text ?? '').join(' ').trim();
  return { words: [...words], speaker, start, end, text };
}

/**
 * For 'balanced' mode: take a sentence's word array and split it into
 * `ceil(words.length / target)` chunks whose sizes are as equal as possible.
 * Earlier chunks may be 1 word longer than later ones.
 *
 * Example (target = 6):
 *   9 words → 2 chunks of [5, 4]
 *  16 words → 3 chunks of [6, 5, 5]
 */
function balancedChunkSizes(total: number, target: number): number[] {
  const N = Math.max(1, Math.ceil(total / Math.max(1, target)));
  const base = Math.floor(total / N);
  const remainder = total - base * N;
  const sizes: number[] = [];
  for (let i = 0; i < N; i++) sizes.push(base + (i < remainder ? 1 : 0));
  return sizes;
}

/** Same algorithm as TranscriptScroller, generalized over split modes. */
export function splitSentences(data: TranscriptData, config?: LineSplitConfig): CaptionSentence[] {
  const cfg = { ...DEFAULT_SPLIT, ...(config ?? {}) };
  const out: CaptionSentence[] = [];
  for (const u of data.utterances) {
    if (!u.words || u.words.length === 0) {
      if (u.text) {
        out.push({ words: [], speaker: u.speaker, start: u.start, end: u.end, text: u.text });
      }
      continue;
    }
    let buf: TranscriptWord[] = [];
    let charCount = 0;
    const flush = () => {
      if (!buf.length) return;
      // 'balanced' mode: split each completed sentence into evenly-sized chunks
      // so a long sentence is shown as N captions but no caption ever spans
      // two sentences.
      if (cfg.mode === 'balanced') {
        const sizes = balancedChunkSizes(buf.length, cfg.targetWords);
        let cursor = 0;
        for (const size of sizes) {
          const slice = buf.slice(cursor, cursor + size);
          if (slice.length) out.push(makeSentence(slice, u.speaker, u.start, u.end));
          cursor += size;
        }
      } else {
        out.push(makeSentence(buf, u.speaker, u.start, u.end));
      }
      buf = [];
      charCount = 0;
    };
    for (const w of u.words) {
      const wText = (w.text ?? '').trim();
      // 'chars' mode: flush BEFORE adding if this word would push us over the cap
      // (but always include at least one word, otherwise we'd loop forever).
      if (cfg.mode === 'chars' && buf.length > 0) {
        const projected = charCount + (charCount > 0 ? 1 : 0) + wText.length;
        if (projected > cfg.maxChars) flush();
      }
      buf.push(w);
      charCount += (charCount > 0 ? 1 : 0) + wText.length;

      // Decide whether to flush AFTER adding.
      let shouldFlush = false;
      switch (cfg.mode) {
        case 'sentence':
        case 'balanced':
          // Both modes treat punctuation as the sentence boundary; balanced
          // then post-processes the buffer in flush().
          shouldFlush = SENTENCE_END.test(wText);
          break;
        case 'words':
          shouldFlush = buf.length >= Math.max(1, cfg.maxWords);
          break;
        case 'duration': {
          const first = buf[0];
          const last = buf[buf.length - 1];
          const span = ((last.end ?? last.start ?? 0) - (first.start ?? first.end ?? 0)) / 1000;
          shouldFlush = span >= Math.max(0.1, cfg.maxSeconds);
          break;
        }
        case 'chars':
          // Already handled by the pre-flush above; nothing to do here.
          break;
      }
      if (shouldFlush) flush();
    }
    flush();
  }
  return out;
}
