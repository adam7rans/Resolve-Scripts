// Adapted from w3rk17/src/components/audio-transcript/TranscriptScroller.tsx —
// keeps only the caption view (line / word) with the fade + word underline
// progress animation. No chapters, no timeline, no video controls.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  splitSentences, type CaptionMode, type CaptionSentence,
  type TranscriptData, type TranscriptWord,
} from '../lib/transcript';

interface CaptionsProps {
  transcript: TranscriptData;
  mode: CaptionMode;
  /** something whose .currentTime is read each frame (in seconds) */
  timeSourceRef: React.MutableRefObject<HTMLVideoElement | null>;
}

const TEXT = '#ffffff';
const TEXT_DIM = 'rgba(255,255,255,0.5)';

const isWordActive = (w: TranscriptWord, ms: number) =>
  ms >= (w.start ?? 0) && ms <= (w.end ?? w.start ?? 0);

export const Captions: React.FC<CaptionsProps> = ({ transcript, mode, timeSourceRef }) => {
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const rafRef = useRef<number | null>(null);

  // poll currentTime every frame
  useEffect(() => {
    const tick = () => {
      const v = timeSourceRef.current;
      const t = v ? v.currentTime * 1000 : 0;
      setCurrentTimeMs(t);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [timeSourceRef]);

  const utterances = transcript.utterances;
  const sentences = useMemo<CaptionSentence[]>(() => splitSentences(transcript), [transcript]);

  const activeUtterance = useMemo(() => {
    return utterances.find((u, i) => {
      const next = utterances[i + 1]?.start ?? Number.POSITIVE_INFINITY;
      return currentTimeMs >= u.start && currentTimeMs < next;
    }) ?? null;
  }, [utterances, currentTimeMs]);

  const activeWord = useMemo(() => {
    if (!activeUtterance?.words) return null;
    return activeUtterance.words.find((w) => isWordActive(w, currentTimeMs)) ?? null;
  }, [activeUtterance, currentTimeMs]);

  const activeSentence = useMemo(() => {
    if (!sentences.length) return null;
    return sentences.find((s, i) => {
      const next = sentences[i + 1]?.start ?? Number.POSITIVE_INFINITY;
      return currentTimeMs >= s.start && currentTimeMs < next;
    }) ?? null;
  }, [sentences, currentTimeMs]);

  // word-mode fade in/out
  const [wordText, setWordText] = useState('');
  const [wordVisible, setWordVisible] = useState(false);
  useEffect(() => {
    if (mode !== 'word') {
      setWordVisible(false);
      setWordText('');
      return;
    }
    const next = activeWord?.text ?? '';
    if (next) {
      setWordText(next);
      const id = requestAnimationFrame(() => setWordVisible(true));
      return () => cancelAnimationFrame(id);
    }
    setWordVisible(false);
    const t = window.setTimeout(() => setWordText(''), 200);
    return () => window.clearTimeout(t);
  }, [activeWord?.text, mode]);

  // shared style for both modes — overlay centered on the preview
  const overlayStyle: React.CSSProperties = {
    position: 'absolute',
    left: 0, right: 0, bottom: '8%',
    display: 'flex',
    justifyContent: 'center',
    pointerEvents: 'none',
    fontFamily: 'inherit',
  };

  if (mode === 'word') {
    return (
      <div style={overlayStyle}>
        <span
          style={{
            fontSize: 64,
            fontWeight: 700,
            letterSpacing: '0.06em',
            color: TEXT,
            textShadow: '0 2px 16px rgba(0,0,0,0.7)',
            opacity: wordVisible ? 1 : 0,
            transition: 'opacity 200ms ease',
          }}
        >
          {wordText}
        </span>
      </div>
    );
  }

  // line mode
  if (!activeSentence) return <div style={overlayStyle} />;

  const words = activeSentence.words ?? [];
  return (
    <div style={overlayStyle}>
      <div
        style={{
          maxWidth: '70%',
          textAlign: 'center',
          fontSize: 28,
          lineHeight: 1.4,
          color: TEXT,
          textShadow: '0 2px 12px rgba(0,0,0,0.7)',
        }}
      >
        {words.length > 0
          ? words.map((w, i) => {
              const active = isWordActive(w, currentTimeMs);
              const wStart = w.start ?? 0;
              const wEnd = w.end ?? wStart;
              const wDur = Math.max(wEnd - wStart, 1);
              const elapsed = active
                ? Math.min(Math.max(currentTimeMs - wStart, 0), wDur)
                : 0;
              const progress = active ? elapsed / wDur : 0;
              return (
                <span
                  key={i}
                  style={{
                    color: active ? TEXT : TEXT_DIM,
                    backgroundImage: `linear-gradient(to right, ${TEXT}, ${TEXT})`,
                    backgroundSize: active ? `${(progress * 100).toFixed(2)}% 2px` : '0% 2px',
                    backgroundPosition: '0 100%',
                    backgroundRepeat: 'no-repeat',
                    transition: 'color 200ms ease, background-size 100ms linear',
                    paddingBottom: 2,
                  }}
                >
                  {w.text}{' '}
                </span>
              );
            })
          : activeSentence.text}
      </div>
    </div>
  );
};
