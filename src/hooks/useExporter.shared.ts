import { guideRectInVideoFrame } from '../lib/layoutUtils';
import { sourceToOutputTime } from '../lib/timeMapping';
import type {
  ExportGap,
  ExportGuide,
  ExportKeptSegment,
  ExportRangeLike,
  ExportRenderFrame,
  ExportTiming,
} from './useExporter.types';
import type { JumpCutGap } from './useJumpCuts';

export function applyFinalInvertPass(
  sourceCanvas: HTMLCanvasElement,
  sourceCtx: CanvasRenderingContext2D,
  invertCanvas: HTMLCanvasElement | null,
  invertCtx: CanvasRenderingContext2D | null,
  width: number,
  height: number,
) {
  if (!invertCanvas || !invertCtx) return;
  invertCtx.save();
  invertCtx.clearRect(0, 0, width, height);
  invertCtx.filter = 'invert(1)';
  invertCtx.drawImage(sourceCanvas, 0, 0, width, height);
  invertCtx.restore();

  sourceCtx.clearRect(0, 0, width, height);
  sourceCtx.drawImage(invertCanvas, 0, 0, width, height);
}

export function resolveLayerRenderFrame(
  width: number,
  height: number,
  videoInfo: { w: number; h: number } | null,
  guide: ExportGuide | null,
): ExportRenderFrame {
  if (!videoInfo || !guide) {
    return { w: width, h: height, crop: null };
  }

  const sourceAspect = videoInfo.w / Math.max(1, videoInfo.h);
  const guideAspect = guide.w / guide.h;
  let renderWidth = width;
  let renderHeight = height;

  if (sourceAspect >= guideAspect) {
    renderHeight = height;
    renderWidth = Math.max(width, Math.ceil(renderHeight * sourceAspect));
  } else {
    renderWidth = width;
    renderHeight = Math.max(height, Math.ceil(renderWidth / sourceAspect));
  }

  return {
    w: renderWidth,
    h: renderHeight,
    crop: guideRectInVideoFrame(
      { x: 0, y: 0, w: renderWidth, h: renderHeight },
      videoInfo,
      guide,
    ),
  };
}

export function drawLayerToExportCanvas(
  ctx: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  renderFrame: ExportRenderFrame,
  width: number,
  height: number,
) {
  if (!renderFrame.crop) {
    ctx.drawImage(source, 0, 0, width, height);
    return;
  }

  const { x, y, w, h } = renderFrame.crop;
  ctx.drawImage(source, x, y, w, h, 0, 0, width, height);
}

export function buildExportTiming(
  range: ExportRangeLike,
  fps: number,
  jumpCutsEnabled: boolean,
  jumpCutGapList: JumpCutGap[],
): ExportTiming {
  const activeGapsForExport: ExportGap[] = jumpCutsEnabled
    ? jumpCutGapList
        .map((gap) => ({ start: gap.startMs / 1000, end: gap.endMs / 1000 }))
        .filter((gap) => gap.end > range.start && gap.start < range.end)
        .map((gap) => ({
          start: Math.max(gap.start, range.start),
          end: Math.min(gap.end, range.end),
        }))
        .sort((a, b) => a.start - b.start)
    : [];

  const kept: ExportKeptSegment[] = [];
  let cursor = range.start;
  let outCursor = 0;

  for (const gap of activeGapsForExport) {
    if (gap.start > cursor) {
      kept.push({ srcStart: cursor, srcEnd: gap.start, outStart: outCursor });
      outCursor += gap.start - cursor;
    }
    cursor = Math.max(cursor, gap.end);
  }

  if (cursor < range.end) {
    kept.push({ srcStart: cursor, srcEnd: range.end, outStart: outCursor });
  }
  if (kept.length === 0) {
    kept.push({ srcStart: range.start, srcEnd: range.end, outStart: 0 });
  }

  const musicOutputStartTime = sourceToOutputTime(range.start, activeGapsForExport);
  const lastKept = kept[kept.length - 1];
  const contentDuration = lastKept.outStart + (lastKept.srcEnd - lastKept.srcStart);
  const duration = contentDuration + range.outroDuration;

  return {
    activeGapsForExport,
    kept,
    contentDuration,
    duration,
    total: Math.max(1, Math.ceil(duration * fps)),
    musicOutputStartTime,
    outToSrc: (tOut: number) => {
      if (tOut >= contentDuration) {
        return {
          src: range.end + (tOut - contentDuration),
          inOutro: range.outroDuration > 0,
        };
      }

      for (const segment of kept) {
        const segmentDuration = segment.srcEnd - segment.srcStart;
        if (tOut <= segment.outStart + segmentDuration + 1e-9) {
          return {
            src: segment.srcStart + (tOut - segment.outStart),
            inOutro: false,
          };
        }
      }

      return { src: range.end, inOutro: false };
    },
  };
}
