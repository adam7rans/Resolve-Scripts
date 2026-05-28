import type { AudioBands } from '../lib/AudioSource';
import { guideRectInVideoFrame } from '../lib/layoutUtils';
import { canvasToPngBlob, frameNumber, seekVideoTo } from '../lib/exporter';
import { drawCaptionsToCanvas } from '../lib/captionCanvas';
import { finishProjectExport, uploadExportFrame } from '../lib/projectApi';
import {
  applyFinalInvertPass,
  drawLayerToExportCanvas,
} from './useExporter.shared';
import type { RenderExportFramesArgs } from './useExporter.types';

export async function renderExportFrames({
  refs,
  state,
  callbacks,
  signal,
  onProgress,
  projectId,
  created,
  exportBaseName,
  params,
  range,
  width,
  height,
  preserveAlpha,
  renderFrame,
  timing,
  video,
  audio,
  resources,
}: RenderExportFramesArgs) {
  const {
    bgRendererRef,
    videoRendererRef,
  } = refs;
  const {
    bgLayerOn,
    bgOffMode,
    bgOffColor,
    videoLayerOn,
    captionsLayerOn,
    audioReactivity,
    captionMode,
    captionStyle,
    captionShader,
    transcript,
    videoInfo,
    cropToGuide,
    activeGuide,
    availableGuides,
    previewFrame,
  } = state;
  const {
    setProjectStatus,
  } = callbacks;
  const {
    canvas,
    ctx,
    invertCanvas,
    invertCtx,
    bgRenderer,
    videoRenderer,
    capRenderer,
    capOffscreen,
  } = resources;

  const throwIfAborted = () => {
    if (signal.aborted) {
      const error = new Error('Export cancelled');
      error.name = 'AbortError';
      throw error;
    }
  };

  for (let i = 0; i < timing.total; i += 1) {
    throwIfAborted();
    const tOut = i / params.fps;
    const { src: tSrc, inOutro } = timing.outToSrc(tOut);
    ctx.clearRect(0, 0, width, height);

    if (!preserveAlpha && !bgLayerOn && bgOffMode === 'color') {
      ctx.fillStyle = bgOffColor;
      ctx.fillRect(0, 0, width, height);
    }

    const bands: AudioBands = audio && audioReactivity.enabled
      ? audio.getDeterministicBands(tSrc)
      : { rms: 0, low: 0, mid: 0, high: 0 };
    const gain = audioReactivity.gain;
    const modulation = audio && audioReactivity.enabled
      ? {
          speed: bands.rms * gain * audioReactivity.modSpeed * 1.5,
          brightness: bands.rms * gain * audioReactivity.modBrightness,
        }
      : { speed: 0, brightness: 0 };

    if (bgLayerOn && bgRenderer) {
      bgRenderer.setModulation(modulation);
      bgRenderer.renderFrame(tOut);
      drawLayerToExportCanvas(
        ctx,
        bgRenderer.renderer.domElement as HTMLCanvasElement,
        renderFrame,
        width,
        height,
      );
      if (bgRendererRef.current) {
        bgRendererRef.current.setModulation(modulation);
        bgRendererRef.current.renderFrame(tOut);
      }
    }

    if (videoLayerOn && videoRenderer && video) {
      const tVideo = inOutro ? range.end : tSrc;
      if (tVideo <= video.duration) {
        await seekVideoTo(video, tVideo);
        throwIfAborted();
        videoRenderer.renderFrame(tVideo);
        drawLayerToExportCanvas(
          ctx,
          videoRenderer.renderer.domElement as HTMLCanvasElement,
          renderFrame,
          width,
          height,
        );
        if (videoRendererRef.current) {
          videoRendererRef.current.renderFrame(tVideo, tVideo);
        }
      }
    }

    if (captionsLayerOn && transcript) {
      const guide = cropToGuide
        ? availableGuides.find((candidate) => candidate.key === activeGuide)
        : undefined;
      const logicalCaptionFrame = guide && videoInfo
        ? guideRectInVideoFrame(previewFrame, videoInfo, guide)
        : previewFrame;
      const capScale = width / logicalCaptionFrame.w;
      const capOpacity = inOutro
        ? Math.max(0, 1 - (tOut - timing.contentDuration) / 3)
        : 1;

      if (capRenderer && capOffscreen) {
        const capCtx = capOffscreen.getContext('2d');
        if (capCtx) {
          capCtx.clearRect(0, 0, width, height);
          drawCaptionsToCanvas(
            capCtx,
            transcript,
            captionMode,
            tSrc * 1000,
            width,
            height,
            captionStyle,
            capScale,
            range.start * 1000,
          );
          capRenderer.render(capOffscreen, captionShader, tOut);
          ctx.globalAlpha = capOpacity;
          ctx.drawImage(capRenderer.canvas, 0, 0, width, height);
          ctx.globalAlpha = 1;
        }
      } else {
        ctx.globalAlpha = capOpacity;
        drawCaptionsToCanvas(
          ctx,
          transcript,
          captionMode,
          tSrc * 1000,
          width,
          height,
          captionStyle,
          capScale,
          range.start * 1000,
        );
        ctx.globalAlpha = 1;
      }
    }

    if (inOutro) {
      const progress = Math.min(
        1,
        (tOut - timing.contentDuration) / range.outroDuration,
      );
      const centerX = width / 2;
      const centerY = height / 2;
      const maxRadius = Math.sqrt(centerX * centerX + centerY * centerY);

      ctx.beginPath();
      ctx.arc(centerX, centerY, progress * maxRadius, 0, Math.PI * 2);
      ctx.fillStyle = 'white';
      ctx.fill();
    }

    if (params.invertFinalOutput) {
      applyFinalInvertPass(canvas, ctx, invertCanvas, invertCtx, width, height);
    }

    const blob = await canvasToPngBlob(canvas);
    throwIfAborted();
    await uploadExportFrame(
      projectId,
      created.exportId,
      `${exportBaseName}_${frameNumber(i)}.png`,
      blob,
    );
    onProgress(i + 1, timing.total);
    if (i % 2 === 0) {
      const pct = Math.round(((i + 1) / timing.total) * 100);
      setProjectStatus({
        kind: 'progress',
        message: 'Rendering export frames',
        detail: created.folder,
        progress: pct,
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  setProjectStatus({
    kind: 'progress',
    message: 'Stitching video with FFMPEG…',
    detail: created.folder,
  });
}

export async function finishRenderedExport(
  projectId: string,
  exportId: string,
) {
  return finishProjectExport(projectId, exportId);
}
