import { splitSentences, type CaptionMode, type TranscriptData, type TranscriptWord } from './transcript';
import { DEFAULT_CAPTION_STYLE, type CaptionStyle } from './types';

const isWordActive = (w: TranscriptWord, ms: number) =>
  ms >= (w.start ?? 0) && ms <= (w.end ?? w.start ?? 0);

function applyCaptionFont(ctx: CanvasRenderingContext2D, size: number, style: CaptionStyle) {
  ctx.font = `${style.fontWeight} ${size}px ${style.fontFamily}`;
  (ctx as any).letterSpacing = `${style.letterSpacing}em`;
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(0,0,0,0.7)';
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 2;
}

function measure(ctx: CanvasRenderingContext2D, text: string) {
  return ctx.measureText(text).width;
}

function lineStartX(boxLeft: number, boxWidth: number, lineWidth: number, align: CaptionStyle['textAlign']) {
  if (align === 'right') return boxLeft + boxWidth - lineWidth;
  if (align === 'center') return boxLeft + (boxWidth - lineWidth) / 2;
  return boxLeft;
}

function wrapTokens(
  ctx: CanvasRenderingContext2D,
  tokens: Array<{ text: string; active?: boolean; progress?: number }>,
  maxWidth: number,
) {
  const lines: Array<typeof tokens> = [];
  let line: typeof tokens = [];
  let lineWidth = 0;

  for (const token of tokens) {
    const tokenWidth = measure(ctx, token.text);
    if (line.length && lineWidth + tokenWidth > maxWidth) {
      lines.push(line);
      line = [];
      lineWidth = 0;
    }
    line.push(token);
    lineWidth += tokenWidth;
  }
  if (line.length) lines.push(line);
  return lines;
}

function activeUtteranceAt(data: TranscriptData, timeMs: number) {
  return data.utterances.find((u, i) => {
    const next = data.utterances[i + 1]?.start ?? Number.POSITIVE_INFINITY;
    return timeMs >= u.start && timeMs < next;
  }) ?? null;
}

function activeWordAt(data: TranscriptData, timeMs: number) {
  const utterance = activeUtteranceAt(data, timeMs);
  if (!utterance?.words) return null;
  const exact = utterance.words.find((w) => isWordActive(w, timeMs));
  if (exact) return exact;
  const previous = [...utterance.words].reverse().find((w) => timeMs >= (w.start ?? 0));
  if (!previous) return null;
  const utteranceEnd = utterance.end ?? previous.end ?? previous.start ?? 0;
  return timeMs <= utteranceEnd + 1000 ? previous : null;
}

function activeSentenceAt(data: TranscriptData, timeMs: number) {
  const sentences = splitSentences(data);
  return sentences.find((s, i) => {
    const next = sentences[i + 1]?.start ?? Number.POSITIVE_INFINITY;
    return timeMs >= s.start && timeMs < next;
  }) ?? null;
}

export function drawCaptionsToCanvas(
  ctx: CanvasRenderingContext2D,
  transcript: TranscriptData,
  mode: CaptionMode,
  timeMs: number,
  width: number,
  height: number,
  inputStyle: CaptionStyle,
) {
  const style = { ...DEFAULT_CAPTION_STYLE, ...inputStyle };
  const wordBoxWidth = width * 0.92;
  const lineBoxFraction = Math.max(0.01, Math.min(1, (style.lineMaxWidth ?? 92) / 100));
  const lineBoxWidth = width * lineBoxFraction;
  const centerY = (height * style.verticalPosition) / 100;

  ctx.save();
  ctx.textAlign = 'left';

  if (mode === 'word') {
    const word = activeWordAt(transcript, timeMs)?.text ?? '';
    if (!word) {
      ctx.restore();
      return;
    }
    applyCaptionFont(ctx, style.wordFontSize, style);
    const wordWidth = measure(ctx, word);
    const wordBoxLeft = ((width - wordBoxWidth) * style.horizontalPosition) / 100;
    const x = lineStartX(wordBoxLeft, wordBoxWidth, wordWidth, style.textAlign);
    ctx.fillStyle = style.color;
    ctx.globalAlpha = style.wordHighlightEnabled ? 1 : 1;
    ctx.fillText(word, x, centerY + style.wordFontSize / 3);
    ctx.restore();
    return;
  }

  const sentence = activeSentenceAt(transcript, timeMs);
  if (!sentence) {
    ctx.restore();
    return;
  }

  applyCaptionFont(ctx, style.lineFontSize, style);
  const boxWidth = lineBoxWidth;
  const boxLeft = ((width - lineBoxWidth) * style.horizontalPosition) / 100;
  // Underline fade window (ms). 0 → instant on/off, matches the React preview.
  const FADE_MS = Math.max(0, style.underlineFadeMs ?? 150);
  const tokens = sentence.words?.length
    ? sentence.words.map((w) => {
        const active = isWordActive(w, timeMs);
        const start = w.start ?? 0;
        const end = w.end ?? start;
        const duration = Math.max(end - start, 1);
        const elapsed = active ? Math.min(Math.max(timeMs - start, 0), duration) : 0;
        const remaining = active ? Math.max(end - timeMs, 0) : 0;
        const fadeAlpha = active
          ? FADE_MS === 0
            ? 1
            : Math.max(0, Math.min(1, Math.min(elapsed, remaining) / FADE_MS))
          : 0;
        return {
          text: `${w.text} `,
          word: w.text,
          active,
          progress: active ? elapsed / duration : 0,
          fadeAlpha,
        };
      })
    : sentence.text.split(/\s+/).filter(Boolean).map((text) => ({ text: `${text} `, word: text }));

  const lines = wrapTokens(ctx, tokens, boxWidth);
  const lineHeightPx = style.lineFontSize * style.lineHeight;
  const totalHeight = Math.max(style.lineFontSize, lines.length * lineHeightPx);
  let y = centerY - totalHeight / 2 + style.lineFontSize;

  // Resolve underline mode (with legacy boolean fallback).
  const underlineMode: 'off' | 'draw' | 'fade' =
    style.underlineMode ?? (style.underlineEnabled === false ? 'off' : 'draw');

  for (const line of lines) {
    const lineWidth = line.reduce((sum, token) => sum + measure(ctx, token.text), 0);
    let x = lineStartX(boxLeft, boxWidth, lineWidth, style.textAlign);
    for (const token of line) {
      const tokenWidth = measure(ctx, token.text);
      ctx.fillStyle = style.wordHighlightEnabled
        ? token.active ? style.color : style.dimColor
        : style.color;
      ctx.fillText(token.text, x, y);

      if (token.active && underlineMode !== 'off') {
        // Underline only the word itself, not the trailing space — matches
        // the React preview where the bar sits under each word.
        const wordWidth = measure(ctx, (token as any).word ?? token.text.trimEnd());
        const barWidth =
          underlineMode === 'draw'
            ? wordWidth * (token.progress ?? 0)
            : wordWidth;
        const alpha =
          underlineMode === 'fade' ? ((token as any).fadeAlpha ?? 0) : 1;
        if (barWidth > 0 && alpha > 0) {
          ctx.save();
          ctx.shadowColor = 'transparent';
          ctx.globalAlpha = alpha;
          ctx.fillStyle = style.color;
          ctx.fillRect(x, y + 5, barWidth, 2);
          ctx.restore();
        }
      }
      x += tokenWidth;
    }
    y += lineHeightPx;
  }

  ctx.restore();
}
