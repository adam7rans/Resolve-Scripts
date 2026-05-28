// Adapted from w3rk17/src/components/audio-transcript/TranscriptScroller.tsx —
// keeps only the caption view (line / word) with the fade + word underline
// progress animation. No chapters, no timeline, no video controls.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  splitSentences, type CaptionMode, type CaptionSentence,
  type TranscriptData,
} from '../lib/transcript';
import { DEFAULT_CAPTION_STYLE, type CaptionStyle } from '../lib/types';
import { applyAlpha } from '../lib/captionColor';
import { CAPTION_GRACE_MS, captionFadeAlpha, isWordActive, splitWordParts } from './captions.helpers';

interface CaptionsProps {
  transcript: TranscriptData;
  mode: CaptionMode;
  style?: CaptionStyle;
  frame: { x: number; y: number; w: number; h: number };
  /** something whose .currentTime is read each frame (in seconds) */
  timeSourceRef: React.MutableRefObject<HTMLMediaElement | null>;
  /** Optional playhead override in seconds (used during the outro) */
  playhead?: number;
  /** Opacity override (0..1) */
  opacity?: number;
  /** Media time (ms) at which the current playback run started (for caption fade-out). */
  playbackStartMs?: number;
}

export const Captions: React.FC<CaptionsProps> = ({ transcript, mode, style = DEFAULT_CAPTION_STYLE, frame, timeSourceRef, playhead, opacity = 1, playbackStartMs }) => {
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const rafRef = useRef<number | null>(null);
  const captionStyle = { ...DEFAULT_CAPTION_STYLE, ...style };
  const activeColor = applyAlpha(captionStyle.color, captionStyle.colorOpacity ?? 1);
  const dimColorResolved = applyAlpha(captionStyle.dimColor, captionStyle.dimColorOpacity ?? 1);
  const shadowOn = captionStyle.shadowEnabled !== false;

  const playheadRef = useRef(playhead);
  useEffect(() => { playheadRef.current = playhead; }, [playhead]);

  // poll currentTime every frame
  useEffect(() => {
    const tick = () => {
      let t: number;
      const ph = playheadRef.current;
      if (ph !== undefined) {
        t = ph * 1000;
      } else {
        const v = timeSourceRef.current;
        t = v ? v.currentTime * 1000 : 0;
      }
      setCurrentTimeMs(t);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [timeSourceRef]);

  const utterances = transcript.utterances;
  const sentences = useMemo<CaptionSentence[]>(
    () => splitSentences(transcript, {
      mode: captionStyle.lineSplitMode ?? 'sentence',
      maxWords: captionStyle.lineMaxWords,
      maxChars: captionStyle.lineMaxChars,
      maxSeconds: captionStyle.lineMaxSeconds,
      targetWords: captionStyle.lineTargetWords,
    }),
    [
      transcript,
      captionStyle.lineSplitMode,
      captionStyle.lineMaxWords,
      captionStyle.lineMaxChars,
      captionStyle.lineMaxSeconds,
      captionStyle.lineTargetWords,
    ],
  );

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
    if (currentTimeMs > utteranceEnd + CAPTION_GRACE_MS) return null;
    if (captionFadeAlpha(currentTimeMs, utteranceEnd, playbackStartMs) <= 0) return null;
    return previous;
  }, [activeUtterance, currentTimeMs, playbackStartMs]);

  const activeSentence = useMemo(() => {
    if (!sentences.length) return null;
    return sentences.find((s, i) => {
      const next = sentences[i + 1]?.start ?? Number.POSITIVE_INFINITY;
      const deadline = Math.min(next, s.end + CAPTION_GRACE_MS);
      return currentTimeMs >= s.start && currentTimeMs < deadline;
    }) ?? null;
  }, [sentences, currentTimeMs]);

  // Fade alpha for captions after speech ends (hold 1s, fade 2s).
  const sentenceFadeAlpha = useMemo(() => {
    if (!activeSentence) return 0;
    return captionFadeAlpha(currentTimeMs, activeSentence.end, playbackStartMs);
  }, [activeSentence, currentTimeMs, playbackStartMs]);

  const wordFadeAlpha = useMemo(() => {
    if (!activeUtterance || !activeWord) return 0;
    const utteranceEnd = activeUtterance.end ?? activeWord.end ?? activeWord.start ?? 0;
    return captionFadeAlpha(currentTimeMs, utteranceEnd, playbackStartMs);
  }, [activeUtterance, activeWord, currentTimeMs, playbackStartMs]);

  // word-mode fade in/out
  const [wordText, setWordText] = useState('');
  const [wordVisible, setWordVisible] = useState(false);
  useEffect(() => {
    if (mode !== 'word') {
      setWordVisible(false);
      setWordText('');
      return;
    }
    // word mode: strip surrounding punctuation so only the actual word is
    // shown (matches the "no highlight on punctuation" rule used in line mode).
    const raw = activeWord?.text ?? '';
    const next = raw ? splitWordParts(raw).body || raw : '';
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
  // word mode keeps the full width (words are short); line mode uses the configurable max width.
  const wordBoxWidth = 92;
  const lineBoxWidth = Math.max(1, Math.min(100, captionStyle.lineMaxWidth));
  const overlayStyle: React.CSSProperties = {
    position: 'absolute',
    left: frame.x,
    top: frame.y,
    width: frame.w,
    height: frame.h,
    overflow: 'visible',
    pointerEvents: 'none',
    fontFamily: captionStyle.fontFamily,
    opacity,
  };
  const buildBoxStyle = (boxWidth: number): React.CSSProperties => {
    const boxLeft = ((100 - boxWidth) * captionStyle.horizontalPosition) / 100;
    return {
      position: 'absolute',
      left: `${boxLeft}%`,
      top: `${captionStyle.verticalPosition}%`,
      width: `${boxWidth}%`,
      transform: 'translateY(-50%)',
      textAlign: captionStyle.textAlign,
    };
  };

  if (mode === 'word') {
    return (
      <div style={overlayStyle}>
        <span
          style={{
            ...buildBoxStyle(wordBoxWidth),
            display: 'block',
            fontSize: captionStyle.wordFontSize,
            fontWeight: captionStyle.fontWeight,
            letterSpacing: `${captionStyle.letterSpacing}em`,
            color: activeColor,
            textShadow: shadowOn ? '0 2px 16px rgba(0,0,0,0.7)' : 'none',
            opacity: (captionStyle.wordHighlightEnabled ? (wordVisible ? 1 : 0) : 1) * wordFadeAlpha,
            transition: captionStyle.wordHighlightEnabled ? 'opacity 200ms ease, color 200ms ease' : 'none',
          }}
        >
          {wordText}
        </span>
      </div>
    );
  }

  // line mode
  if (!activeSentence || sentenceFadeAlpha <= 0) return <div style={overlayStyle} />;

  const words = activeSentence.words ?? [];
  return (
    <div style={overlayStyle}>
      <div
        style={{
          ...buildBoxStyle(lineBoxWidth),
          fontSize: captionStyle.lineFontSize,
          fontWeight: captionStyle.fontWeight,
          letterSpacing: `${captionStyle.letterSpacing}em`,
          lineHeight: captionStyle.lineHeight,
          color: activeColor,
          textShadow: shadowOn ? '0 2px 12px rgba(0,0,0,0.7)' : 'none',
          opacity: sentenceFadeAlpha,
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

              // Underline mode with legacy boolean fallback
              const underlineMode =
                captionStyle.underlineMode ??
                (captionStyle.underlineEnabled === false ? 'off' : 'draw');

              // Fade alpha for 'fade' mode: ramps in over FADE_MS at the
              // start of the word, holds at 1, and ramps out over FADE_MS at
              // the end. For very short words the peak is < 1 but it still
              // pulses smoothly. FADE_MS = 0 → instant on/off.
              const FADE_MS = Math.max(0, captionStyle.underlineFadeMs ?? 150);
              const remaining = active ? Math.max(wEnd - currentTimeMs, 0) : 0;
              const fadeAlpha = active
                ? FADE_MS === 0
                  ? 1
                  : Math.max(0, Math.min(1, Math.min(elapsed, remaining) / FADE_MS))
                : 0;

              const drawWidth =
                underlineMode === 'draw' && active ? `${(progress * 100).toFixed(2)}%`
                : underlineMode === 'fade' && active ? '100%'
                : '0%';
              const drawOpacity = underlineMode === 'fade' ? fadeAlpha : 1;

              const { lead, body, trail } = splitWordParts(w.text);
              const dimColor = captionStyle.wordHighlightEnabled
                ? dimColorResolved
                : activeColor;
              const bodyColor = captionStyle.wordHighlightEnabled
                ? (highlighted ? activeColor : dimColorResolved)
                : activeColor;

              return (
                <span key={i} style={{ display: 'inline' }}>
                  {lead && (
                    <span style={{ color: dimColor }}>{lead}</span>
                  )}
                  {body && (
                    <span
                      style={{
                        position: 'relative',
                        display: 'inline-block',
                        color: bodyColor,
                        transition: 'color 200ms ease',
                        paddingBottom: 2,
                      }}
                    >
                      {body}
                      <span
                        aria-hidden
                        style={{
                          position: 'absolute',
                          left: 0,
                          bottom: 0,
                          height: 2,
                          width: drawWidth,
                          background: activeColor,
                          opacity: drawOpacity,
                          transition:
                            underlineMode === 'draw'
                              ? 'width 100ms linear'
                              : `opacity ${FADE_MS}ms ease`,
                          pointerEvents: 'none',
                        }}
                      />
                    </span>
                  )}
                  {trail && (
                    <span style={{ color: dimColor }}>{trail}</span>
                  )}
                </span>
              );
            }).reduce<React.ReactNode[]>((acc, el, idx) => {
              if (idx > 0) acc.push(' ');
              acc.push(el);
              return acc;
            }, [])
          : activeSentence.text}
      </div>
    </div>
  );
};
