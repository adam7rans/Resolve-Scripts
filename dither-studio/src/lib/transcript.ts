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

/** Same algorithm as TranscriptScroller: split utterances into sentence-sized chunks. */
export function splitSentences(data: TranscriptData): CaptionSentence[] {
  const out: CaptionSentence[] = [];
  for (const u of data.utterances) {
    if (!u.words || u.words.length === 0) {
      if (u.text) {
        out.push({ words: [], speaker: u.speaker, start: u.start, end: u.end, text: u.text });
      }
      continue;
    }
    let buf: TranscriptWord[] = [];
    const flush = () => {
      if (!buf.length) return;
      const start = buf.find((w) => typeof w.start === 'number')?.start ?? u.start;
      const end = [...buf].reverse().find((w) => typeof w.end === 'number')?.end ?? u.end;
      const text = buf.map((w) => w.text ?? '').join(' ').trim();
      out.push({ words: [...buf], speaker: u.speaker, start, end, text });
      buf = [];
    };
    for (const w of u.words) {
      buf.push(w);
      if (SENTENCE_END.test((w.text ?? '').trim())) flush();
    }
    flush();
  }
  return out;
}
