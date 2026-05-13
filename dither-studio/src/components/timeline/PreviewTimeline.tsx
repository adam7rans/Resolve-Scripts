import React, { useEffect, useRef, useState } from 'react';
import {
  MIN_VIEW_SEC, OUTRO_DUR,
  clamp, fmt,
  type DragKind, type PreviewTimelineProps,
} from './timelineUtils';
import { ClipTrackOverlay } from './ClipTrackOverlay';
import { SkipGapOverlay } from './SkipGapOverlay';
import { TimelineControls } from './TimelineControls';

export type { PreviewTimelineProps };

export const PreviewTimeline: React.FC<PreviewTimelineProps> = ({
  duration, playhead, onPlayheadChange,
  outroEnabled, onToggleOutro,
  microTimelines, selectedId, pendingClipStart,
  onSelectClip, onClipRangeChange,
  onAddStart, onAddEnd, onCancelPending, onDeleteClip, onRenameClip,
  skipGapsEnabled = false, skipGaps = [], skipGapsEffective = [],
  skipGapOverrides = {}, onAdjustSkipGap, onResetSkipGap, onResetAllSkipGaps,
  skipGapDisabled = {}, selectedGapKey = null, onSelectGap, onToggleGapDisabled,
}) => {
  const [hoverGapKey, setHoverGapKey] = useState<string | null>(null);
  const totalDuration = Math.max(0.01, duration);
  const projectDuration = totalDuration + (outroEnabled ? OUTRO_DUR : 0);

  const [view, setView] = useState<{ s: number; e: number }>({ s: 0, e: projectDuration });

  useEffect(() => {
    if (projectDuration <= MIN_VIEW_SEC * 1.5) return;
    setView({ s: 0, e: projectDuration });
  }, [projectDuration]);

  const viewStart = view.s;
  const viewEnd = Math.max(view.s + MIN_VIEW_SEC, Math.min(view.e, projectDuration));
  const viewSpan = Math.max(MIN_VIEW_SEC, viewEnd - viewStart);

  const trackRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [dragKind, setDragKind] = useState<DragKind>(null);
  const dragOffsetRef = useRef(0);

  const secToPct = (t: number) => ((t - viewStart) / viewSpan) * 100;

  const timeAtClientX = (clientX: number) => {
    const r = trackRef.current?.getBoundingClientRect();
    if (!r) return 0;
    const x = clamp(clientX - r.left, 0, r.width);
    return clamp(viewStart + (x / r.width) * viewSpan, 0, projectDuration);
  };

  const selectedClip = microTimelines.find(mt => mt.id === selectedId) ?? null;

  useEffect(() => {
    if (!dragKind) return;
    const onMove = (e: PointerEvent) => {
      if (dragKind === 'play') {
        onPlayheadChange(timeAtClientX(e.clientX));
      } else if (dragKind === 'scroll') {
        const r = scrollRef.current?.getBoundingClientRect();
        if (!r) return;
        const thumbW = (viewSpan / projectDuration) * r.width;
        const localX = e.clientX - r.left - dragOffsetRef.current;
        const newThumbStart = clamp(localX, 0, Math.max(0, r.width - thumbW));
        const newViewStart = clamp((newThumbStart / r.width) * projectDuration, 0, Math.max(0, projectDuration - viewSpan));
        setView({ s: newViewStart, e: newViewStart + viewSpan });
      } else if (dragKind && typeof dragKind === 'object') {
        const tMs = timeAtClientX(e.clientX) * 1000;
        const t = tMs / 1000;
        switch (dragKind.kind) {
          case 'gap-start':
          case 'gap-end': {
            if (!onAdjustSkipGap) return;
            const gap = skipGaps.find(g => g.key === dragKind.key);
            if (!gap) return;
            if (dragKind.kind === 'gap-start') {
              onAdjustSkipGap(dragKind.key, clamp(tMs, 0, gap.endMs - 20), gap.endMs);
            } else {
              onAdjustSkipGap(dragKind.key, gap.startMs, clamp(tMs, gap.startMs + 20, projectDuration * 1000));
            }
            return;
          }
          case 'clip-start':
          case 'clip-end': {
            const clip = microTimelines.find(mt => mt.id === dragKind.id);
            if (!clip) return;
            if (dragKind.kind === 'clip-start') {
              onClipRangeChange(dragKind.id, clamp(t, 0, clip.endSecond - 0.01), clip.endSecond);
            } else {
              onClipRangeChange(dragKind.id, clip.startSecond, clamp(t, clip.startSecond + 0.01, totalDuration));
            }
            return;
          }
        }
      }
    };
    const onUp = () => setDragKind(null);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [dragKind, viewSpan, projectDuration, totalDuration, microTimelines, onClipRangeChange, onPlayheadChange, viewStart, skipGaps, onAdjustSkipGap]);

  const startDrag = (kind: Exclude<DragKind, null | 'scroll'>) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    setDragKind(kind);
  };

  const setViewClamped = (s: number, e: number) => {
    let span = Math.max(MIN_VIEW_SEC, Math.min(projectDuration, e - s));
    let ns = s;
    let ne = ns + span;
    if (ne > projectDuration) { ne = projectDuration; ns = Math.max(0, ne - span); }
    if (ns < 0) { ns = 0; ne = Math.min(projectDuration, ns + span); }
    setView({ s: ns, e: ne });
  };

  const focusClip = () => {
    if (!selectedClip) return;
    const s = selectedClip.startSecond;
    const e = selectedClip.endSecond;
    const exportSpan = Math.max(MIN_VIEW_SEC, e - s);
    const padFrac = 0.05;
    const newSpan = Math.min(projectDuration, exportSpan / (1 - padFrac * 2));
    const center = (s + e) / 2;
    setViewClamped(center - newSpan / 2, center + newSpan / 2);
  };

  const zoomIn = () => {
    const newSpan = Math.max(MIN_VIEW_SEC, viewSpan / 2);
    setViewClamped(playhead - newSpan / 2, playhead + newSpan / 2);
  };
  const zoomOut = () => {
    const newSpan = Math.min(projectDuration, viewSpan * 2);
    setViewClamped(playhead - newSpan / 2, playhead + newSpan / 2);
  };
  const resetView = () => setView({ s: 0, e: projectDuration });

  const scrollThumbPct = (viewSpan / projectDuration) * 100;
  const scrollThumbLeftPct = (viewStart / projectDuration) * 100;

  const onScrollDown: React.PointerEventHandler<HTMLDivElement> = (e) => {
    const r = scrollRef.current?.getBoundingClientRect();
    if (!r) return;
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    const x = e.clientX - r.left;
    const thumbW = (viewSpan / projectDuration) * r.width;
    const thumbX = (viewStart / projectDuration) * r.width;
    if (x >= thumbX && x <= thumbX + thumbW) {
      dragOffsetRef.current = x - thumbX;
    } else {
      dragOffsetRef.current = thumbW / 2;
      const newThumbStart = clamp(x - thumbW / 2, 0, Math.max(0, r.width - thumbW));
      const newViewStart = clamp((newThumbStart / r.width) * projectDuration, 0, Math.max(0, projectDuration - viewSpan));
      setView({ s: newViewStart, e: newViewStart + viewSpan });
    }
    setDragKind('scroll');
  };

  const visPlay = secToPct(playhead);

  const onTrackDown: React.PointerEventHandler<HTMLDivElement> = (e) => {
    onSelectGap?.(null);
    onPlayheadChange(timeAtClientX(e.clientX));
    startDrag('play')(e);
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 4,
      padding: '6px 10px 8px', background: '#0a0a0a',
      borderTop: '1px solid #1f1f1f', flexShrink: 0,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#888' }}>
        <span>view {fmt(viewStart)} – {fmt(viewEnd)} ({fmt(viewSpan)})</span>
        <span style={{ color: '#ddd' }}>
          {fmt(playhead)}
          {selectedClip && (
            <span style={{ color: '#888' }}> · {selectedClip.name} {fmt(selectedClip.endSecond - selectedClip.startSecond)}</span>
          )}
        </span>
        <span>
          {selectedClip
            ? <>{selectedClip.name}: {fmt(selectedClip.startSecond)} → {fmt(selectedClip.endSecond)}</>
            : `${microTimelines.length} clip${microTimelines.length !== 1 ? 's' : ''}`
          }
        </span>
      </div>

      {/* range track */}
      <div
        ref={trackRef}
        onPointerDown={onTrackDown}
        style={{
          position: 'relative', height: 24, background: '#161616',
          border: '1px solid #2a2a2a', borderRadius: 4,
          userSelect: 'none', cursor: 'ew-resize',
        }}
      >
        <ClipTrackOverlay
          microTimelines={microTimelines}
          selectedId={selectedId}
          selectedClip={selectedClip}
          outroEnabled={outroEnabled}
          pendingClipStart={pendingClipStart}
          secToPct={secToPct}
          timeAtClientX={timeAtClientX}
          onSelectClip={onSelectClip}
          onPlayheadChange={onPlayheadChange}
          setDragKind={setDragKind}
          startDrag={startDrag}
        />

        {/* skip-silence gaps */}
        {skipGapsEnabled && (
          <SkipGapOverlay
            skipGaps={skipGaps}
            skipGapsEffective={skipGapsEffective}
            skipGapOverrides={skipGapOverrides}
            skipGapDisabled={skipGapDisabled}
            selectedGapKey={selectedGapKey}
            hoverGapKey={hoverGapKey}
            onHoverGap={setHoverGapKey}
            dragKind={dragKind}
            secToPct={secToPct}
            timeAtClientX={timeAtClientX}
            onSelectGap={onSelectGap}
            onPlayheadChange={onPlayheadChange}
            startDrag={startDrag}
            onResetSkipGap={onResetSkipGap}
          />
        )}

        {/* playhead */}
        {visPlay >= 0 && visPlay <= 100 && (
          <div style={{
            position: 'absolute', left: `calc(${visPlay}% - 1px)`,
            top: -3, bottom: -3, width: 2,
            background: '#fff', boxShadow: '0 0 4px rgba(255,255,255,0.7)',
            pointerEvents: 'none', zIndex: 5,
          }} />
        )}
      </div>

      {/* horizontal scroll bar */}
      <div
        ref={scrollRef}
        onPointerDown={onScrollDown}
        style={{
          position: 'relative', height: 10, background: '#0d0d0d',
          border: '1px solid #222', borderRadius: 5,
          cursor: 'pointer', userSelect: 'none',
        }}
      >
        <div style={{
          position: 'absolute', left: `${scrollThumbLeftPct}%`, width: `${scrollThumbPct}%`,
          top: 0, bottom: 0,
          background: dragKind === 'scroll' ? '#4a4a4a' : '#3a3a3a',
          borderRadius: 5, minWidth: 18, pointerEvents: 'none',
        }} />
      </div>

      <TimelineControls
        microTimelines={microTimelines}
        selectedClip={selectedClip}
        onSelectClip={onSelectClip}
        onPlayheadChange={onPlayheadChange}
        onRenameClip={onRenameClip}
        pendingClipStart={pendingClipStart}
        onAddStart={onAddStart}
        onAddEnd={onAddEnd}
        onCancelPending={onCancelPending}
        onDeleteClip={onDeleteClip}
        onFocusClip={focusClip}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onResetView={resetView}
        skipGapsEnabled={skipGapsEnabled}
        selectedGapKey={selectedGapKey}
        skipGapDisabled={skipGapDisabled}
        skipGapOverrides={skipGapOverrides}
        onToggleGapDisabled={onToggleGapDisabled}
        onResetAllSkipGaps={onResetAllSkipGaps}
        outroEnabled={outroEnabled}
        onToggleOutro={onToggleOutro}
      />
    </div>
  );
};
