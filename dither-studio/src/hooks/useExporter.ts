import type React from 'react';
import { CaptionShaderRenderer } from '../lib/CaptionShaderRenderer';
import type { AudioSource, AudioBands } from '../lib/AudioSource';
import { BackgroundRenderer } from '../lib/BackgroundRenderer';
import { VideoRenderer } from '../lib/VideoRenderer';
import type {
  ExportParams,
  CaptionStyle,
  CaptionShaderParams,
  AudioReactivityParams,
  BackgroundParams,
  DitherParams,
  VideoShaderParams,
} from '../lib/types';
import type { CaptionMode, TranscriptData } from '../lib/transcript';
import type { ProjectTaskStatus } from '../lib/constants';
import { GUIDES } from '../lib/constants';
import { resolveExportRange, guideRectInVideoFrame } from '../lib/layoutUtils';
import { buildExportBaseName, canvasToPngBlob, frameNumber, seekVideoTo } from '../lib/exporter';
import { drawCaptionsToCanvas } from '../lib/captionCanvas';
import {
  createProjectExport, uploadExportFrame, finishProjectExport,
} from '../lib/projectApi';
import type { JumpCutGap } from './useJumpCuts';
import type { Toast } from '../components/StatusToast';

export interface ExporterRefs {
  activeProjectIdRef: React.MutableRefObject<string | null>;
  bgRendererRef: React.MutableRefObject<BackgroundRenderer | null>;
  videoRendererRef: React.MutableRefObject<VideoRenderer | null>;
  videoElRef: React.MutableRefObject<HTMLVideoElement | null>;
  audioElRef: React.MutableRefObject<HTMLAudioElement | null>;
  audioSourceRef: React.MutableRefObject<AudioSource | null>;
  activeExportParamsRef: React.MutableRefObject<ExportParams>;
  exportingRef: React.MutableRefObject<boolean>;
  startRef: React.MutableRefObject<number>;
  jumpCutGapListRef: React.MutableRefObject<JumpCutGap[]>;
}

export interface ExporterState {
  bg: BackgroundParams;
  bgDither: DitherParams;
  vid: VideoShaderParams;
  bgLayerOn: boolean;
  bgOffMode: 'grid' | 'color';
  bgOffColor: string;
  videoLayerOn: boolean;
  captionsLayerOn: boolean;
  jumpCutsEnabled: boolean;
  audioReactivity: AudioReactivityParams;
  captionMode: CaptionMode;
  captionStyle: CaptionStyle;
  captionShader: CaptionShaderParams;
  transcript: TranscriptData | null;
  videoInfo: { name: string; duration: number; w: number; h: number } | null;
  audioInfo: { name: string; duration: number } | null;
  cropToGuide: boolean;
  activeGuide: string | null;
  availableGuides: readonly { key: string; w: number; h: number; label: string }[];
  previewFrame: { x: number; y: number; w: number; h: number };
}

export interface ExporterCallbacks {
  setPlaying: (v: boolean) => void;
  setProjectStatus: (s: ProjectTaskStatus) => void;
  addToast: (message: string, type?: Toast['type'], sticky?: boolean) => number;
  updateToast: (id: number, message: string, type: Toast['type']) => void;
  fitPreviewBack: () => void;
}

export function createExportComposition(
  refs: ExporterRefs,
  state: ExporterState,
  callbacks: ExporterCallbacks,
) {
  return async (
    onProgress: (done: number, total: number) => void,
    signal: AbortSignal,
  ) => {
    const { activeProjectIdRef, bgRendererRef, videoRendererRef, videoElRef, audioElRef, audioSourceRef, activeExportParamsRef, exportingRef, startRef, jumpCutGapListRef } = refs;
    const { bg, bgDither, vid, bgLayerOn, bgOffMode, bgOffColor, videoLayerOn, captionsLayerOn, jumpCutsEnabled, audioReactivity, captionMode, captionStyle, captionShader, transcript, videoInfo, audioInfo, cropToGuide, activeGuide, availableGuides, previewFrame } = state;
    const { setPlaying, setProjectStatus, addToast, updateToast, fitPreviewBack } = callbacks;

    const projectId = activeProjectIdRef.current;
    if (!projectId) throw new Error('Create or select a project before exporting.');
    if (!bgLayerOn && !videoLayerOn && !captionsLayerOn) throw new Error('Turn on at least one layer before exporting.');
    const throwIfAborted = () => {
      if (signal.aborted) {
        const err = new Error('Export cancelled');
        err.name = 'AbortError';
        throw err;
      }
    };

    const video = videoElRef.current;
    const audio = audioSourceRef.current;
    const params = activeExportParamsRef.current;
    const exportMode = params.exportMode ?? 'master';
    const sourceDuration = videoInfo?.duration ?? audioInfo?.duration ?? null;
    const range = resolveExportRange(params, sourceDuration);
    const exportBaseName = buildExportBaseName(params.filenamePrefix, range.start, range.end);
    if (videoLayerOn && !video) throw new Error('Load a video before exporting the video layer.');

    // Pre-compute deterministic per-frame audio bands when audio is loaded.
    if (audio && audioReactivity.enabled) {
      try { await audio.preloadEnvelope(); } catch (e) { console.warn('Audio envelope preload failed', e); }
    }

    const activeGuideObj = cropToGuide ? GUIDES.find((g) => g.key === activeGuide) : null;
    const width = activeGuideObj ? activeGuideObj.w : Math.max(1, Math.floor(params.width));
    const height = activeGuideObj ? activeGuideObj.h : Math.max(1, Math.floor(params.height));
    const preserveAlpha = exportMode === 'web' && !bgLayerOn;
    const renderFrame = resolveLayerRenderFrame(width, height, videoInfo, activeGuideObj);

    // Compute "kept segments" for jump-cut silence skipping during export.
    type KeptSegment = { srcStart: number; srcEnd: number; outStart: number };
    const activeGapsForExport = jumpCutsEnabled
      ? jumpCutGapListRef.current
          .map(g => ({ start: g.startMs / 1000, end: g.endMs / 1000 }))
          .filter(g => g.end > range.start && g.start < range.end)
          .map(g => ({ start: Math.max(g.start, range.start), end: Math.min(g.end, range.end) }))
          .sort((a, b) => a.start - b.start)
      : [];
    const kept: KeptSegment[] = [];
    {
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
    }
    const lastKept = kept[kept.length - 1];
    const contentDuration = lastKept.outStart + (lastKept.srcEnd - lastKept.srcStart);
    const duration = contentDuration + range.outroDuration;
    const total = Math.max(1, Math.ceil(duration * params.fps));
    const outToSrc = (tOut: number): { src: number; inOutro: boolean } => {
      if (tOut >= contentDuration) {
        return { src: range.end + (tOut - contentDuration), inOutro: range.outroDuration > 0 };
      }
      for (const seg of kept) {
        const segDur = seg.srcEnd - seg.srcStart;
        if (tOut <= seg.outStart + segDur + 1e-9) {
          return { src: seg.srcStart + (tOut - seg.outStart), inOutro: false };
        }
      }
      return { src: range.end, inOutro: false };
    };
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not create export canvas.');
    const invertCanvas = params.invertFinalOutput ? document.createElement('canvas') : null;
    const invertCtx = invertCanvas?.getContext('2d') ?? null;
    if (invertCanvas) {
      invertCanvas.width = width;
      invertCanvas.height = height;
    }
    const bgRenderer = bgLayerOn
      ? new BackgroundRenderer(document.createElement('canvas'), bg, bgDither)
      : null;
    const videoRenderer = videoLayerOn
      ? new VideoRenderer(document.createElement('canvas'), vid)
      : null;
    videoRenderer?.setVideo(video);

    const capRenderer = (captionsLayerOn && captionShader.enabled) ? new CaptionShaderRenderer(document.createElement('canvas')) : null;
    const capOffscreen = capRenderer ? document.createElement('canvas') : null;
    if (capRenderer && capOffscreen) {
      capRenderer.resize(width, height, 1);
      capOffscreen.width = width;
      capOffscreen.height = height;
    }

    exportingRef.current = true;
    const mediaEl = video ?? audioElRef.current;
    if (mediaEl) { mediaEl.pause(); setPlaying(false); }
    const toastId = addToast('Creating project export folder…', 'progress', true);

    try {
      bgRenderer?.setSize(renderFrame.w, renderFrame.h);
      videoRenderer?.setSize(renderFrame.w, renderFrame.h);
      const created = await createProjectExport(projectId, {
        prefix: exportBaseName,
        width,
        height,
        fps: params.fps,
        totalFrames: total,
        exportMode,
        preserveAlpha,
        startTime: range.start,
        duration,
        baseDuration: contentDuration,
        outroDuration: range.outroDuration,
        keptSegments: activeGapsForExport.length > 0
          ? kept.map(({ srcStart, srcEnd }) => ({ srcStart, srcEnd }))
          : undefined,
        layers: {
          background: bgLayerOn,
          video: videoLayerOn,
          captions: captionsLayerOn,
        },
      });
      setProjectStatus({ kind: 'progress', message: 'Exporting PNG sequence', detail: created.folder, progress: 0 });
      updateToast(toastId, `Exporting to ${created.folder}`, 'progress');

      for (let i = 0; i < total; i++) {
        throwIfAborted();
        const tOut = i / params.fps;
        const { src: tSrc, inOutro } = outToSrc(tOut);
        ctx.clearRect(0, 0, width, height);

        // Fill with solid color when background layer is off and user chose a flat color
        if (!preserveAlpha && !bgLayerOn && bgOffMode === 'color') {
          ctx.fillStyle = bgOffColor;
          ctx.fillRect(0, 0, width, height);
        }

        const bands: AudioBands = audio && audioReactivity.enabled
          ? audio.getDeterministicBands(tSrc)
          : { rms: 0, low: 0, mid: 0, high: 0 };
        const g = audioReactivity.gain;

        if (bgLayerOn && bgRenderer) {
          bgRenderer.setModulation(audio && audioReactivity.enabled ? {
            speed: bands.rms * g * audioReactivity.modSpeed * 1.5,
            brightness: bands.rms * g * audioReactivity.modBrightness,
          } : { speed: 0, brightness: 0 });
          bgRenderer.renderFrame(tOut);
          drawLayerToExportCanvas(ctx, bgRenderer.renderer.domElement as HTMLCanvasElement, renderFrame, width, height);
          if (bgRendererRef.current) {
            bgRendererRef.current.setModulation(audio && audioReactivity.enabled ? {
              speed: bands.rms * g * audioReactivity.modSpeed * 1.5,
              brightness: bands.rms * g * audioReactivity.modBrightness,
            } : { speed: 0, brightness: 0 });
            bgRendererRef.current.renderFrame(tOut);
          }
        }

        if (videoLayerOn && videoRenderer && video) {
          const tVideo = inOutro ? range.end : tSrc;
          if (tVideo <= video.duration) {
            await seekVideoTo(video, tVideo);
            throwIfAborted();
            videoRenderer.renderFrame(tVideo);
            drawLayerToExportCanvas(ctx, videoRenderer.renderer.domElement as HTMLCanvasElement, renderFrame, width, height);
            if (videoRendererRef.current) {
              videoRendererRef.current.renderFrame(tVideo, tVideo);
            }
          }
        }

        if (captionsLayerOn && transcript) {
          const guide = cropToGuide ? availableGuides.find((g) => g.key === activeGuide) : undefined;
          const logicalCaptionFrame = guide && videoInfo
            ? guideRectInVideoFrame(previewFrame, videoInfo, guide)
            : previewFrame;

          const capScale = width / logicalCaptionFrame.w;

          let capOpacity = 1;
          if (inOutro) {
            const outroElapsed = tOut - contentDuration;
            capOpacity = Math.max(0, 1 - outroElapsed / 3);
          }

          if (capRenderer && capOffscreen) {
            const capCtx = capOffscreen.getContext('2d');
            if (capCtx) {
               capCtx.clearRect(0, 0, width, height);
               drawCaptionsToCanvas(capCtx, transcript, captionMode, tSrc * 1000, width, height, captionStyle, capScale, range.start * 1000);
               capRenderer.render(capOffscreen, captionShader, tOut);
               ctx.globalAlpha = capOpacity;
               ctx.drawImage(capRenderer.canvas, 0, 0, width, height);
               ctx.globalAlpha = 1;
            }
          } else {
            ctx.globalAlpha = capOpacity;
            drawCaptionsToCanvas(ctx, transcript, captionMode, tSrc * 1000, width, height, captionStyle, capScale, range.start * 1000);
            ctx.globalAlpha = 1;
          }
        }

        // Draw outro transition overlay (white circle)
        if (inOutro) {
          const outroElapsed = tOut - contentDuration;
          const progress = Math.min(1, outroElapsed / range.outroDuration);

          const centerX = width / 2;
          const centerY = height / 2;
          const maxRadius = Math.sqrt(centerX * centerX + centerY * centerY);
          const radius = progress * maxRadius;

          ctx.beginPath();
          ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
          ctx.fillStyle = 'white';
          ctx.fill();
        }

        if (params.invertFinalOutput) {
          applyFinalInvertPass(canvas, ctx, invertCanvas, invertCtx, width, height);
        }

        const blob = await canvasToPngBlob(canvas);
        throwIfAborted();
        await uploadExportFrame(projectId, created.exportId, `${exportBaseName}_${frameNumber(i)}.png`, blob);
        onProgress(i + 1, total);
        if (i % 2 === 0) {
          const pct = Math.round(((i + 1) / total) * 100);
          setProjectStatus({ kind: 'progress', message: 'Exporting PNG sequence', detail: created.folder, progress: pct });
          await new Promise((res) => setTimeout(res, 0));
        }
      }

      setProjectStatus({ kind: 'progress', message: 'Stitching video with FFMPEG…', detail: created.folder });
      updateToast(toastId, 'PNG sequence complete. Stitching video…', 'progress');
      const finished = await finishProjectExport(projectId, created.exportId);
      if (finished.error) {
        updateToast(toastId, finished.error, 'error');
        setProjectStatus({ kind: 'error', message: finished.error, detail: finished.folder });
        return finished.folder;
      }
      setProjectStatus({ kind: 'success', message: 'Video export complete', detail: finished.videoFile ? `${finished.folder}/${finished.videoFile}` : finished.folder });
      updateToast(toastId, finished.videoFile ? `Export complete: ${finished.videoFile}` : `Export complete: ${finished.folder}`, 'success');
      return finished.videoFile ? `${finished.folder}/${finished.videoFile}` : finished.folder;
    } catch (error: any) {
      if (error?.name === 'AbortError' || signal.aborted) {
        updateToast(toastId, 'Export cancelled', 'info');
        setProjectStatus({ kind: 'idle', message: 'Export cancelled', detail: `Folder: projects/${projectId}` });
      } else {
        updateToast(toastId, `Export failed: ${error?.message ?? error}`, 'error');
        setProjectStatus({ kind: 'error', message: `Export failed: ${error?.message ?? error}` });
      }
      throw error;
    } finally {
      bgRenderer?.dispose();
      videoRenderer?.dispose();
      capRenderer?.dispose();
      fitPreviewBack();
      startRef.current = performance.now();
      exportingRef.current = false;
    }
  };
}

function applyFinalInvertPass(
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

function resolveLayerRenderFrame(
  width: number,
  height: number,
  videoInfo: { w: number; h: number } | null,
  guide: { w: number; h: number } | null,
) {
  if (!videoInfo || !guide) {
    return { w: width, h: height, crop: null as null | { x: number; y: number; w: number; h: number } };
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

  const crop = guideRectInVideoFrame(
    { x: 0, y: 0, w: renderWidth, h: renderHeight },
    videoInfo,
    guide,
  );

  return { w: renderWidth, h: renderHeight, crop };
}

function drawLayerToExportCanvas(
  ctx: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  renderFrame: { w: number; h: number; crop: null | { x: number; y: number; w: number; h: number } },
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
