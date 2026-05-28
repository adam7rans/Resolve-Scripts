import React, { useEffect, useRef, useState } from 'react';
import {
  MIN_VIEW_SEC, OUTRO_DUR,
  clamp, fmt,
  type DragKind, type PreviewTimelineProps,
} from './timelineUtils';
import { ClipTrackOverlay } from './ClipTrackOverlay';
import { MusicTrackOverlay } from './MusicTrackOverlay';
import { SkipGapOverlay } from './SkipGapOverlay';
import { TimelineControls } from './TimelineControls';

export type { PreviewTimelineProps };

function clipEnd(clip: { startSecond: number; durationSecond: number }) {
  return clip.startSecond + clip.durationSecond;
}

export const PreviewTimeline: React.FC<PreviewTimelineProps> = ({
  duration, playhead, onPlayheadChange,
  outroEnabled, onToggleOutro,
  microTimelines, timelineItemLabel = 'clip', clipEditingEnabled = true, musicTimelineClips = [], musicClipLabels = {}, musicDuration, musicPlayhead, selectedMusicClipId = null, showAudioTracks = false, selectedId, pendingClipStart,
  onSelectClip, onSelectMusicClip, onMusicPlayheadChange, onClipRangeChange, onMoveMusicClip, onAdjustMusicClipFade,
  onAddStart, onAddEnd, onCancelPending, onDeleteClip, onRenameClip,
  onToggleAudioTracks,
  skipGapsEnabled = false, skipGaps = [], skipGapsEffective = [],
  skipGapOverrides = {}, onAdjustSkipGap, onResetSkipGap, onResetAllSkipGaps,
  skipGapDisabled = {}, selectedGapKey = null, onSelectGap, onToggleGapDisabled,
}) => {
  const [hoverGapKey, setHoverGapKey] = useState<string | null>(null);
  const totalDuration = Math.max(0.01, duration);
  const projectDuration = totalDuration + (outroEnabled ? OUTRO_DUR : 0);
  const effectiveMusicDuration = Math.max(0.01, musicDuration ?? projectDuration);
  const effectiveMusicPlayhead = musicPlayhead ?? playhead;

  const [view, setView] = useState<{ s: number; e: number }>({ s: 0, e: projectDuration });
  const [musicView, setMusicView] = useState<{ s: number; e: number }>({ s: 0, e: effectiveMusicDuration });
  const [followPlayhead, setFollowPlayhead] = useState(false);

  useEffect(() => {
    if (projectDuration <= MIN_VIEW_SEC * 1.5) return;
    setView({ s: 0, e: projectDuration });
  }, [projectDuration]);

  useEffect(() => {
    if (effectiveMusicDuration <= MIN_VIEW_SEC * 1.5) {
      setMusicView({ s: 0, e: effectiveMusicDuration });
      return;
    }
    setMusicView((prev) => {
      const prevSpan = Math.max(MIN_VIEW_SEC, prev.e - prev.s);
      const nextSpan = Math.min(effectiveMusicDuration, prevSpan);
      const nextStart = clamp(prev.s, 0, Math.max(0, effectiveMusicDuration - nextSpan));
      return { s: nextStart, e: nextStart + nextSpan };
    });
  }, [effectiveMusicDuration]);

  const viewStart = view.s;
  const viewEnd = Math.max(view.s + MIN_VIEW_SEC, Math.min(view.e, projectDuration));
  const viewSpan = Math.max(MIN_VIEW_SEC, viewEnd - viewStart);
  const musicViewStart = musicView.s;
  const musicViewEnd = Math.max(musicView.s + MIN_VIEW_SEC, Math.min(musicView.e, effectiveMusicDuration));
  const musicViewSpan = Math.max(MIN_VIEW_SEC, musicViewEnd - musicViewStart);

  // Auto-scroll when followPlayhead is on and playhead leaves visible area
  useEffect(() => {
    if (!followPlayhead) return;
    const isZoomed = viewSpan < projectDuration * 0.99;
    if (!isZoomed) return;
    const margin = viewSpan * 0.25;
    if (playhead < viewStart + margin * 0.3 || playhead > viewStart + viewSpan - margin * 0.3) {
      const ns = clamp(playhead - margin, 0, Math.max(0, projectDuration - viewSpan));
      setView({ s: ns, e: ns + viewSpan });
    }
  });

  const trackRef = useRef<HTMLDivElement | null>(null);
  const musicTrackRef = useRef<HTMLDivElement | null>(null);
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

  let skippedSec = 0;
  let baseDur = selectedClip ? (selectedClip.endSecond - selectedClip.startSecond) : projectDuration;
  if (skipGapsEnabled) {
    for (const g of skipGapsEffective) {
      const gStart = g.startMs / 1000;
      const gEnd = g.endMs / 1000;
      const overlapStart = Math.max(selectedClip ? selectedClip.startSecond : 0, gStart);
      const overlapEnd = Math.min(selectedClip ? selectedClip.endSecond : projectDuration, gEnd);
      if (overlapEnd > overlapStart) {
        skippedSec += (overlapEnd - overlapStart);
      }
    }
  }
  const finalDur = baseDur - skippedSec;

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
            if (!clipEditingEnabled || !onClipRangeChange) return;
            const clip = microTimelines.find(mt => mt.id === dragKind.id);
            if (!clip) return;
            if (dragKind.kind === 'clip-start') {
              onClipRangeChange(dragKind.id, clamp(t, 0, clip.endSecond - 0.01), clip.endSecond);
            } else {
              onClipRangeChange(dragKind.id, clip.startSecond, clamp(t, clip.startSecond + 0.01, totalDuration));
            }
            return;
          }
          case 'music-move': {
            if (!onMoveMusicClip) return;
            const musicT = musicTimeAtClientX(e.clientX);
            const nextStart = Math.max(0, musicT - dragKind.offset);
            const musicRect = musicTrackRef.current?.getBoundingClientRect();
            let nextTrackIndex: 0 | 1 | undefined = undefined;
            if (musicRect) {
              const laneHeight = musicRect.height / 2;
              const lane = clamp(Math.floor((e.clientY - musicRect.top) / Math.max(1, laneHeight)), 0, 1);
              nextTrackIndex = lane as 0 | 1;
            }
            onMoveMusicClip(dragKind.id, nextStart, nextTrackIndex);
            return;
          }
          case 'music-fade-in':
          case 'music-fade-out': {
            if (!onAdjustMusicClipFade) return;
            const clip = musicTimelineClips.find((item) => item.id === dragKind.id);
            if (!clip) return;
            const musicT = musicTimeAtClientX(e.clientX);
            if (dragKind.kind === 'music-fade-in') {
              const nextFadeIn = clamp(musicT - clip.startSecond, 0, clip.durationSecond);
              onAdjustMusicClipFade(dragKind.id, 'fadeInSecond', nextFadeIn);
            } else {
              const nextFadeOut = clamp(clipEnd(clip) - musicT, 0, clip.durationSecond);
              onAdjustMusicClipFade(dragKind.id, 'fadeOutSecond', nextFadeOut);
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
  }, [clipEditingEnabled, dragKind, viewSpan, projectDuration, totalDuration, microTimelines, musicTimelineClips, onClipRangeChange, onMoveMusicClip, onAdjustMusicClipFade, onPlayheadChange, viewStart, skipGaps, onAdjustSkipGap]);

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

  const setMusicViewClamped = (s: number, e: number) => {
    let span = Math.max(MIN_VIEW_SEC, Math.min(effectiveMusicDuration, e - s));
    let ns = s;
    let ne = ns + span;
    if (ne > effectiveMusicDuration) { ne = effectiveMusicDuration; ns = Math.max(0, ne - span); }
    if (ns < 0) { ns = 0; ne = Math.min(effectiveMusicDuration, ns + span); }
    setMusicView({ s: ns, e: ne });
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
  const zoomMusicIn = () => {
    const newSpan = Math.max(MIN_VIEW_SEC, musicViewSpan / 2);
    setMusicViewClamped(effectiveMusicPlayhead - newSpan / 2, effectiveMusicPlayhead + newSpan / 2);
  };
  const zoomMusicOut = () => {
    const newSpan = Math.min(effectiveMusicDuration, musicViewSpan * 2);
    setMusicViewClamped(effectiveMusicPlayhead - newSpan / 2, effectiveMusicPlayhead + newSpan / 2);
  };
  const resetView = () => setView({ s: 0, e: projectDuration });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const ae = document.activeElement as HTMLElement | null;
      const isTextEntry =
        ae?.tagName === 'INPUT' ||
        ae?.tagName === 'TEXTAREA' ||
        ae?.tagName === 'SELECT' ||
        ae?.isContentEditable;
      if (isTextEntry) return;

      if (e.key === '=') {
        e.preventDefault();
        zoomIn();
        return;
      }
      if (e.key === '-') {
        e.preventDefault();
        zoomOut();
        return;
      }
      if (e.key === ']') {
        e.preventDefault();
        zoomMusicIn();
        return;
      }
      if (e.key === '[') {
        e.preventDefault();
        zoomMusicOut();
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [playhead, projectDuration, viewSpan, effectiveMusicPlayhead, effectiveMusicDuration, musicViewSpan]);

  const scrollThumbPct = (viewSpan / projectDuration) * 100;
  const scrollThumbLeftPct = (viewStart / projectDuration) * 100;
  const musicSecToPct = (t: number) => ((t - musicViewStart) / musicViewSpan) * 100;
  const musicTimeAtClientX = (clientX: number) => {
    const r = musicTrackRef.current?.getBoundingClientRect();
    if (!r) return 0;
    const x = clamp(clientX - r.left, 0, r.width);
    return clamp(musicViewStart + (x / r.width) * musicViewSpan, 0, effectiveMusicDuration);
  };
  const musicVisPlay = musicSecToPct(effectiveMusicPlayhead);
  const musicPlayheadVisible = musicVisPlay >= 0 && musicVisPlay <= 100;

  const onScrollDown: React.PointerEventHandler<HTMLDivElement> = (e) => {
    const r = scrollRef.current?.getBoundingClientRect();
    if (!r) return;
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    setFollowPlayhead(false); // manual scroll disables follow
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
  const playheadVisible = visPlay >= 0 && visPlay <= 100;

  const onTrackDown: React.PointerEventHandler<HTMLDivElement> = (e) => {
    onSelectGap?.(null);
    onSelectMusicClip?.(null);
    onPlayheadChange(timeAtClientX(e.clientX));
    startDrag('play')(e);
  };

  const onPlayheadHandleDown: React.PointerEventHandler<HTMLDivElement> = (e) => {
    onSelectGap?.(null);
    onSelectMusicClip?.(null);
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
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>
            {selectedClip
              ? <>{selectedClip.name}: {fmt(selectedClip.startSecond)} → {fmt(selectedClip.endSecond)}</>
              : `${microTimelines.length} ${timelineItemLabel}${microTimelines.length !== 1 ? 's' : ''}`
            }
          </span>
          {skipGapsEnabled && skippedSec > 0 && (
            <span style={{ background: '#2a2a2a', padding: '2px 6px', borderRadius: 4, color: '#aaa' }}>
              Final: <span style={{ color: '#fff' }}>{fmt(finalDur)}</span> <span style={{ color: '#eb6f1f' }}>(−{fmt(skippedSec)} cut)</span>
            </span>
          )}
        </span>
      </div>

      <div
        onPointerDown={onTrackDown}
        style={{
          position: 'relative',
          height: 18,
          background: '#0f0f0f',
          border: '1px solid #202020',
          borderRadius: 4,
          userSelect: 'none',
          cursor: 'ew-resize',
        }}
      >
        {playheadVisible && (
          <div
            onPointerDown={onPlayheadHandleDown}
            title={`Playhead ${fmt(playhead)} — drag to scrub`}
            style={{
              position: 'absolute',
              left: `calc(${visPlay}% - 8px)`,
              top: 1,
              width: 16,
              height: 14,
              borderRadius: 999,
              background: '#ffffff',
              boxShadow: '0 0 8px rgba(255,255,255,0.45)',
              cursor: 'grab',
              zIndex: 8,
            }}
          />
        )}
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
          editHandlesEnabled={clipEditingEnabled}
          outroEnabled={outroEnabled}
          pendingClipStart={clipEditingEnabled ? pendingClipStart : null}
          secToPct={secToPct}
          timeAtClientX={timeAtClientX}
          onSelectClip={onSelectClip}
          onPlayheadChange={onPlayheadChange}
          setDragKind={setDragKind}
          startDrag={startDrag}
        />

        {/* skip-silence gaps */}
        {skipGapsEnabled && skipGaps.length > 0 && (
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
        {playheadVisible && (
          <div style={{
            position: 'absolute', left: `calc(${visPlay}% - 1px)`,
            top: -20, bottom: -3, width: 2,
            background: '#fff', boxShadow: '0 0 4px rgba(255,255,255,0.7)',
            pointerEvents: 'none', zIndex: 5,
          }} />
        )}
      </div>

      {showAudioTracks && (
        <div
          ref={musicTrackRef}
          style={{
            position: 'relative',
            border: '1px solid #2a2a2a',
            borderRadius: 4,
            overflow: 'hidden',
            background: '#101010',
          }}
        >
          <MusicTrackOverlay
            clips={musicTimelineClips}
            clipLabels={musicClipLabels}
            selectedMusicClipId={selectedMusicClipId}
            dragKind={dragKind}
            secToPct={musicSecToPct}
            timeAtClientX={musicTimeAtClientX}
            onSelectMusicClip={(id) => {
              onSelectGap?.(null);
              onSelectMusicClip?.(id);
            }}
            onPlayheadChange={(next) => (onMusicPlayheadChange ?? onPlayheadChange)(next)}
            startDrag={startDrag}
          />
          {musicPlayheadVisible && (
            <div style={{
              position: 'absolute', left: `calc(${musicVisPlay}% - 1px)`,
              top: 0, bottom: 0, width: 2,
              background: '#fff', boxShadow: '0 0 4px rgba(255,255,255,0.7)',
              pointerEvents: 'none', zIndex: 5,
            }} />
          )}
        </div>
      )}

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
        timelineItemLabel={timelineItemLabel}
        clipEditingEnabled={clipEditingEnabled}
        selectedClip={selectedClip}
        onSelectClip={onSelectClip}
        onPlayheadChange={onPlayheadChange}
        onRenameClip={onRenameClip}
        pendingClipStart={clipEditingEnabled ? pendingClipStart : null}
        onAddStart={onAddStart}
        onAddEnd={onAddEnd}
        onCancelPending={onCancelPending}
        onDeleteClip={onDeleteClip}
        onFocusClip={focusClip}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onResetView={resetView}
        followPlayhead={followPlayhead}
        onToggleFollow={() => setFollowPlayhead(f => !f)}
        showAudioTracks={showAudioTracks}
        onToggleAudioTracks={onToggleAudioTracks}
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
