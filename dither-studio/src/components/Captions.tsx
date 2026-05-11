// Adapted from w3rk17/src/components/audio-transcript/TranscriptScroller.tsx —
// keeps only the caption view (line / word) with the fade + word underline
// progress animation. No chapters, no timeline, no video controls.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  splitSentences, type CaptionMode, type CaptionSentence,
  type TranscriptData, type TranscriptWord,
} from '../lib/transcript';
import { DEFAULT_CAPTION_STYLE, type CaptionStyle } from '../lib/types';

// After a caption's last word ends, hold it fully visible for this long…
const CAPTION_HOLD_MS = 1000;
// …then fade it out over this duration.
const CAPTION_FADE_MS = 2000;
const CAPTION_GRACE_MS = CAPTION_HOLD_MS + CAPTION_FADE_MS;

function captionFadeAlpha(timeMs: number, captionEndMs: number, playbackStartMs: number | undefined): number {
  if (timeMs <= captionEndMs) return 1;
  if (playbackStartMs !== undefined && captionEndMs < playbackStartMs) return 0;
  const elapsed = timeMs - captionEndMs;
  if (elapsed <= CAPTION_HOLD_MS) return 1;
  if (elapsed <= CAPTION_GRACE_MS) return 1 - (elapsed - CAPTION_HOLD_MS) / CAPTION_FADE_MS;
  return 0;
}

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

const isWordActive = (w: TranscriptWord, ms: number) =>
  ms >= (w.start ?? 0) && ms <= (w.end ?? w.start ?? 0);

/**
 * Split a token into [leadingPunct, body, trailingPunct]. The body is the
 * actual word that should ever receive highlight/underline; the punctuation
 * around it stays dim and undecorated. If the entire token is punctuation
 * (e.g. "—"), it is returned entirely as the leading part.
 */
const splitWordParts = (text: string): { lead: string; body: string; trail: string } => {
  const m = /^(\p{P}*)(.*?)(\p{P}*)$/u.exec(text);
  if (!m) return { lead: '', body: text, trail: '' };
  let [, lead, body, trail] = m;
  // Tokens that are entirely punctuation: keep them as the leading part with
  // no body so the highlight/underline path renders nothing for them.
  if (!body) return { lead: text, body: '', trail: '' };
  return { lead: lead ?? '', body, trail: trail ?? '' };
};

export const Captions: React.FC<CaptionsProps> = ({ transcript, mode, style = DEFAULT_CAPTION_STYLE, frame, timeSourceRef, playhead, opacity = 1, playbackStartMs }) => {
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const rafRef = useRef<number | null>(null);
  const captionStyle = { ...DEFAULT_CAPTION_STYLE, ...style };

  // poll currentTime every frame
  useEffect(() => {
    const tick = () => {
      let t: number;
      if (playhead !== undefined) {
        t = playhead * 1000;
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
            color: captionStyle.color,
            textShadow: '0 2px 16px rgba(0,0,0,0.7)',
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
          color: captionStyle.color,
          textShadow: '0 2px 12px rgba(0,0,0,0.7)',
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

              // Resolve underline mode (with legacy boolean fallback)
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
                ? captionStyle.dimColor
                : captionStyle.color;
              const bodyColor = captionStyle.wordHighlightEnabled
                ? (highlighted ? captionStyle.color : captionStyle.dimColor)
                : captionStyle.color;

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
                          background: captionStyle.color,
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
