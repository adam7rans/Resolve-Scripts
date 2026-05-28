import { CaptionShaderRenderer } from '../lib/CaptionShaderRenderer';
import type { AudioSource } from '../lib/AudioSource';
import { BackgroundRenderer } from '../lib/BackgroundRenderer';
import { VideoRenderer } from '../lib/VideoRenderer';
import { GUIDES } from '../lib/constants';
import { resolveExportRange } from '../lib/layoutUtils';
import { buildExportBaseName } from '../lib/exporter';
import {
  createProjectExport,
} from '../lib/projectApi';
import { finishRenderedExport, renderExportFrames } from './useExporter.renderFrames';
import {
  buildExportTiming,
  resolveLayerRenderFrame,
} from './useExporter.shared';
import type {
  ExporterCallbacks,
  ExporterRefs,
  ExporterState,
} from './useExporter.types';

export type {
  ExporterCallbacks,
  ExporterRefs,
  ExporterState,
} from './useExporter.types';

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
    const { bg, bgDither, vid, bgLayerOn, bgOffMode, bgOffColor, videoLayerOn, captionsLayerOn, musicLayerOn, jumpCutsEnabled, audioReactivity, music, limiter, mediaVolume, outroVolume, musicTimelineClips, captionMode, captionStyle, captionShader, transcript, videoInfo, audioInfo, cropToGuide, activeGuide, availableGuides, previewFrame } = state;
    const { setPlaying, setProjectStatus, addToast, updateToast, fitPreviewBack } = callbacks;

    const projectId = activeProjectIdRef.current;
    if (!projectId) throw new Error('Create or select a project before exporting.');
    if (!bgLayerOn && !videoLayerOn && !captionsLayerOn) throw new Error('Turn on at least one layer before exporting.');
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

    const timing = buildExportTiming(
      range,
      params.fps,
      jumpCutsEnabled,
      jumpCutGapListRef.current,
    );
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
        totalFrames: timing.total,
        exportMode,
        preserveAlpha,
        startTime: range.start,
        duration: timing.duration,
        baseDuration: timing.contentDuration,
        outroDuration: range.outroDuration,
        musicOutputStartTime: timing.musicOutputStartTime,
        keptSegments: timing.activeGapsForExport.length > 0
          ? timing.kept.map(({ srcStart, srcEnd }) => ({ srcStart, srcEnd }))
          : undefined,
        layers: {
          background: bgLayerOn,
          video: videoLayerOn,
          captions: captionsLayerOn,
          music: musicLayerOn,
        },
        musicTimelineClips,
        musicSnapshot: music,
        limiter,
        ui: {
          mediaVolume,
          outroVolume,
        },
      });
      setProjectStatus({ kind: 'progress', message: 'Rendering export frames', detail: created.folder, progress: 0 });
      updateToast(toastId, `Exporting to ${created.folder}`, 'progress');
      await renderExportFrames({
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
        resources: {
          canvas,
          ctx,
          invertCanvas,
          invertCtx,
          bgRenderer,
          videoRenderer,
          capRenderer,
          capOffscreen,
        },
      });

      updateToast(toastId, 'Frame render complete. Stitching video…', 'progress');
      const finished = await finishRenderedExport(projectId, created.exportId);
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
