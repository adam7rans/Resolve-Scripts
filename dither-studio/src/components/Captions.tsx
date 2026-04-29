// Adapted from w3rk17/src/components/audio-transcript/TranscriptScroller.tsx —
// keeps only the caption view (line / word) with the fade + word underline
// progress animation. No chapters, no timeline, no video controls.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  splitSentences, type CaptionMode, type CaptionSentence,
  type TranscriptData, type TranscriptWord,
} from '../lib/transcript';
import { DEFAULT_CAPTION_STYLE, type CaptionStyle } from '../lib/types';

interface CaptionsProps {
  transcript: TranscriptData;
  mode: CaptionMode;
  style?: CaptionStyle;
  frame: { x: number; y: number; w: number; h: number };
  /** something whose .currentTime is read each frame (in seconds) */
  timeSourceRef: React.MutableRefObject<HTMLVideoElement | null>;
}

const isWordActive = (w: TranscriptWord, ms: number) =>
  ms >= (w.start ?? 0) && ms <= (w.end ?? w.start ?? 0);

export const Captions: React.FC<CaptionsProps> = ({ transcript, mode, style = DEFAULT_CAPTION_STYLE, frame, timeSourceRef }) => {
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const rafRef = useRef<number | null>(null);
  const captionStyle = { ...DEFAULT_CAPTION_STYLE, ...style };

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
    const words = activeUtterance.words;
    const exact = words.find((w) => isWordActive(w, currentTimeMs));
    if (exact) return exact;
    const previous = [...words].reverse().find((w) => currentTimeMs >= (w.start ?? 0));
    if (!previous) return null;
    const utteranceEnd = activeUtterance.end ?? previous.end ?? previous.start ?? 0;
    return currentTimeMs <= utteranceEnd + 1000 ? previous : null;
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
  const boxWidth = 92;
  const boxLeft = ((100 - boxWidth) * captionStyle.horizontalPosition) / 100;
  const overlayStyle: React.CSSProperties = {
    position: 'absolute',
    left: frame.x,
    top: frame.y,
    width: frame.w,
    height: frame.h,
    overflow: 'visible',
    pointerEvents: 'none',
    fontFamily: captionStyle.fontFamily,
  };
  const captionBoxStyle: React.CSSProperties = {
    position: 'absolute',
    left: `${boxLeft}%`,
    top: `${captionStyle.verticalPosition}%`,
    width: `${boxWidth}%`,
    transform: 'translateY(-50%)',
    textAlign: captionStyle.textAlign,
  };

  if (mode === 'word') {
    return (
      <div style={overlayStyle}>
        <span
          style={{
            ...captionBoxStyle,
            display: 'block',
            fontSize: captionStyle.wordFontSize,
            fontWeight: captionStyle.fontWeight,
            letterSpacing: `${captionStyle.letterSpacing}em`,
            color: captionStyle.color,
            textShadow: '0 2px 16px rgba(0,0,0,0.7)',
            opacity: captionStyle.wordHighlightEnabled ? (wordVisible ? 1 : 0) : 1,
            transition: captionStyle.wordHighlightEnabled ? 'opacity 200ms ease, color 200ms ease' : 'none',
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
          ...captionBoxStyle,
          fontSize: captionStyle.lineFontSize,
          fontWeight: captionStyle.fontWeight,
          letterSpacing: `${captionStyle.letterSpacing}em`,
          lineHeight: captionStyle.lineHeight,
          color: captionStyle.color,
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
              const highlighted = active && captionStyle.wordHighlightEnabled;
              return (
                <span
                  key={i}
                  style={{
                    color: captionStyle.wordHighlightEnabled ? (highlighted ? captionStyle.color : captionStyle.dimColor) : captionStyle.color,
                    backgroundImage: `linear-gradient(to right, ${captionStyle.color}, ${captionStyle.color})`,
                    backgroundSize: active && captionStyle.underlineEnabled ? `${(progress * 100).toFixed(2)}% 2px` : '0% 2px',
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
