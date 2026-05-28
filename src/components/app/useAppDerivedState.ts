import { useEffect, useMemo } from 'react';
import type React from 'react';
import type { JumpCutGap } from '../../hooks/useJumpCuts';
import type { GuideKey, EditorMode } from '../../lib/constants';
import { GUIDES } from '../../lib/constants';
import { fitRect, isVerticalVideo } from '../../lib/layoutUtils';
import { mergeTimeGaps, sourceToOutputTime } from '../../lib/timeMapping';
import { applyClipCaptionEdits, type ClipCaptionEdits, type TranscriptData } from '../../lib/transcript';
import { MICRO_TIMELINE_COLORS, type ExportParams, type MicroTimeline } from '../../lib/types';

export const FULL_EXPORT_CHUNK_SECONDS = 300;

function sanitizeExportPrefix(name: string, fallback: string) {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || fallback;
}

interface Args {
  transcript: TranscriptData | null;
  captionClipEdits: Record<string, ClipCaptionEdits>;
  editorMode: EditorMode;
  microTimelines: MicroTimeline[];
  selectedClipId: string | null;
  selectedFullSegmentId: string | null;
  setSelectedFullSegmentId: React.Dispatch<React.SetStateAction<string | null>>;
  jumpCutsEnabled: boolean;
  jumpCutGapDisabled: Record<string, boolean>;
  jumpCutGapsEffective: JumpCutGap[];
  jumpCutGaps: JumpCutGap[];
  selectedGapKey: string | null;
  baseExportParams: ExportParams;
  videoInfo: { name: string; duration: number; w: number; h: number } | null;
  audioInfo: { name: string; duration: number } | null;
  playheadSecond: number;
  previewSize: { w: number; h: number };
}

export function useAppDerivedState({
  transcript,
  captionClipEdits,
  editorMode,
  microTimelines,
  selectedClipId,
  selectedFullSegmentId,
  setSelectedFullSegmentId,
  jumpCutsEnabled,
  jumpCutGapDisabled,
  jumpCutGapsEffective,
  jumpCutGaps,
  selectedGapKey,
  baseExportParams,
  videoInfo,
  audioInfo,
  playheadSecond,
  previewSize,
}: Args) {
  const selectedProjectClip = microTimelines.find((mt) => mt.id === selectedClipId) ?? null;
  const mediaDuration = videoInfo?.duration ?? audioInfo?.duration ?? baseExportParams.duration ?? 10;
  const fullExportChunks = useMemo(() => {
    if (!Number.isFinite(mediaDuration) || mediaDuration <= 0) return [];
    const chunks: MicroTimeline[] = [];
    for (let start = 0, index = 0; start < mediaDuration - 0.001; index += 1) {
      const end = Math.min(mediaDuration, start + FULL_EXPORT_CHUNK_SECONDS);
      chunks.push({
        id: `full-chunk-${index + 1}`,
        name: `Full ${index + 1}`,
        startSecond: start,
        endSecond: end,
        color: MICRO_TIMELINE_COLORS[index % MICRO_TIMELINE_COLORS.length],
      });
      start = end;
    }
    return chunks;
  }, [mediaDuration]);
  const selectedFullSegment = fullExportChunks.find((chunk) => chunk.id === selectedFullSegmentId) ?? null;
  const selectedTimelineSegment = editorMode === 'clips' ? selectedProjectClip : selectedFullSegment;
  const timelineSegments = editorMode === 'clips' ? microTimelines : fullExportChunks;
  const activeSkipTimeGaps = useMemo(
    () =>
      mergeTimeGaps(
        jumpCutsEnabled
          ? jumpCutGapsEffective.filter((gap) => !jumpCutGapDisabled[gap.key]).map((gap) => ({ start: gap.startMs / 1000, end: gap.endMs / 1000 }))
          : [],
      ),
    [jumpCutGapDisabled, jumpCutGapsEffective, jumpCutsEnabled],
  );
  const selectedGap = jumpCutGaps.find((gap) => gap.key === selectedGapKey) ?? null;
  const effectiveTranscript = useMemo(
    () => (transcript && editorMode === 'clips' && selectedProjectClip ? applyClipCaptionEdits(transcript, captionClipEdits[selectedProjectClip.id]) : transcript),
    [captionClipEdits, editorMode, selectedProjectClip, transcript],
  );
  const activeExportParams = useMemo(() => {
    if (selectedTimelineSegment) {
      const isLastFullChunk = editorMode === 'full' && selectedTimelineSegment.id === fullExportChunks[fullExportChunks.length - 1]?.id;
      return {
        ...baseExportParams,
        startSecond: selectedTimelineSegment.startSecond,
        endSecond: selectedTimelineSegment.endSecond,
        duration: Math.max(0.01, selectedTimelineSegment.endSecond - selectedTimelineSegment.startSecond),
        outroEnabled: editorMode === 'full' ? (isLastFullChunk ? baseExportParams.outroEnabled : false) : baseExportParams.outroEnabled,
        filenamePrefix: sanitizeExportPrefix(selectedTimelineSegment.name, baseExportParams.filenamePrefix),
      };
    }
    if (editorMode === 'full') {
      return {
        ...baseExportParams,
        startSecond: 0,
        endSecond: mediaDuration,
        duration: Math.max(0.01, mediaDuration),
        filenamePrefix: sanitizeExportPrefix(`${baseExportParams.filenamePrefix}-full`, baseExportParams.filenamePrefix),
      };
    }
    return baseExportParams;
  }, [baseExportParams, editorMode, fullExportChunks, mediaDuration, selectedTimelineSegment]);
  const timelineDuration = mediaDuration + (activeExportParams.outroEnabled ? 5 : 0);
  const musicTimelineDuration = useMemo(
    () => sourceToOutputTime(mediaDuration, activeSkipTimeGaps) + (activeExportParams.outroEnabled ? 5 : 0),
    [activeExportParams.outroEnabled, activeSkipTimeGaps, mediaDuration],
  );
  const musicPlayheadSecond = useMemo(
    () => sourceToOutputTime(playheadSecond, activeSkipTimeGaps),
    [activeSkipTimeGaps, playheadSecond],
  );
  const verticalVideo = isVerticalVideo(videoInfo);
  const availableGuides = verticalVideo ? GUIDES.filter((g) => g.key !== '1920x1080') : GUIDES;
  const previewFrame = videoInfo ? fitRect(previewSize.w, previewSize.h, videoInfo.w, videoInfo.h) : { x: 0, y: 0, w: previewSize.w, h: previewSize.h };
  const frameStyle = useMemo<React.CSSProperties>(
    () => (videoInfo ? { position: 'absolute', left: previewFrame.x, top: previewFrame.y, width: previewFrame.w, height: previewFrame.h } : { position: 'absolute', inset: 0, width: '100%', height: '100%' }),
    [previewFrame, videoInfo],
  );
  const audioMode = !!audioInfo && !videoInfo;

  useEffect(() => {
    if (editorMode !== 'full') return;
    if (fullExportChunks.length === 0) {
      if (selectedFullSegmentId !== null) setSelectedFullSegmentId(null);
      return;
    }
    if (!selectedFullSegmentId || !fullExportChunks.some((chunk) => chunk.id === selectedFullSegmentId)) {
      setSelectedFullSegmentId(fullExportChunks[0].id);
    }
  }, [editorMode, fullExportChunks, selectedFullSegmentId, setSelectedFullSegmentId]);

  return {
    mediaDuration,
    fullExportChunks,
    timelineSegments,
    selectedTimelineSegment,
    selectedGap,
    effectiveTranscript,
    activeExportParams,
    timelineDuration,
    activeSkipTimeGaps,
    musicTimelineDuration,
    musicPlayheadSecond,
    availableGuides,
    previewFrame,
    frameStyle,
    audioMode,
  };
}
