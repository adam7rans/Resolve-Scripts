import type { ExportParams } from './types';

export function isVerticalVideo(info: { w: number; h: number } | null) {
  return !!info && info.h > info.w;
}

export function fitRect(pw: number, ph: number, gw: number, gh: number) {
  if (pw <= 0 || ph <= 0) return { x: 0, y: 0, w: 0, h: 0 };
  const scale = Math.min(pw / gw, ph / gh);
  const w = gw * scale;
  const h = gh * scale;
  return { x: (pw - w) / 2, y: (ph - h) / 2, w, h };
}

export function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

export function snapToExportResolution(vw: number, vh: number): { w: number; h: number } {
  const CANONICAL_RESOLUTIONS = [
    { w: 1080, h: 1920 }, // 9:16
    { w: 1080, h: 1350 }, // 4:5
    { w: 1080, h: 1080 }, // 1:1
    { w: 1920, h: 1080 }, // 16:9
  ] as const;

  const ar = vw / vh;
  let best: { w: number; h: number } = CANONICAL_RESOLUTIONS[0];
  let bestDiff = Infinity;
  for (const res of CANONICAL_RESOLUTIONS) {
    const diff = Math.abs(ar - res.w / res.h);
    if (diff < bestDiff) { bestDiff = diff; best = res; }
  }
  return best;
}

export function resolveExportRange(params: ExportParams, totalDuration: number | null) {
  const total = Math.max(0.01, totalDuration ?? (params.endSecond ?? params.duration ?? 10));
  const minGap = 0.01;
  const start = clamp(params.startSecond ?? 0, 0, Math.max(0, total - minGap));
  const fallbackEnd = params.endSecond ?? Math.min(total, start + Math.max(minGap, params.duration || minGap));
  const end = clamp(fallbackEnd, start + minGap, total);
  const baseDuration = end - start;
  const outroDuration = params.outroEnabled ? 5 : 0;
  return { start, end, total, duration: baseDuration + outroDuration, baseDuration, outroDuration };
}

export function guideRectInVideoFrame(
  frame: { x: number; y: number; w: number; h: number },
  video: { w: number; h: number } | null,
  guide: { w: number; h: number },
) {
  if (!video) return fitRect(frame.w, frame.h, guide.w, guide.h);
  const scale = Math.min(frame.w / guide.w, frame.h / guide.h);
  const w = guide.w * scale;
  const h = guide.h * scale;
  return {
    x: frame.x + (frame.w - w) / 2,
    y: frame.y + (frame.h - h) / 2,
    w,
    h,
  };
}
