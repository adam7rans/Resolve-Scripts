import React, { useCallback, useEffect, useRef, useState } from 'react';

export interface TimelineRangeProps {
  /** Total length of the timeline in seconds. */
  duration: number;
  /** Selected start time (seconds). */
  start: number;
  /** Selected end time (seconds). */
  end: number;
  /** Current playhead position (seconds). */
  playhead: number;
  onStartChange: (s: number) => void;
  onEndChange: (e: number) => void;
  onPlayheadChange: (p: number) => void;
}

type DragKind = 'start' | 'end' | 'playhead' | null;

const formatTime = (sec: number) => {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
};

const HANDLE_W = 10;

/**
 * Two-track timeline:
 *   - top track: range slider with start + end handles (defines export region)
 *   - bottom track: playhead scrubber; areas outside [start, end] are dimmed
 */
export const TimelineRange: React.FC<TimelineRangeProps> = ({
  duration, start, end, playhead, onStartChange, onEndChange, onPlayheadChange,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState<DragKind>(null);

  const safeDuration = Math.max(0.01, duration);
  const startPct = Math.max(0, Math.min(100, (start / safeDuration) * 100));
  const endPct = Math.max(0, Math.min(100, (end / safeDuration) * 100));
  const playPct = Math.max(0, Math.min(100, (playhead / safeDuration) * 100));

  const timeAtClientX = useCallback((clientX: number): number => {
    const el = containerRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
    return (x / rect.width) * safeDuration;
  }, [safeDuration]);

  // Pointer move/up handlers (attached only while dragging)
  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      const t = timeAtClientX(e.clientX);
      if (drag === 'start') {
        onStartChange(Math.max(0, Math.min(end - 0.01, t)));
      } else if (drag === 'end') {
        onEndChange(Math.max(start + 0.01, Math.min(safeDuration, t)));
      } else if (drag === 'playhead') {
        onPlayheadChange(Math.max(0, Math.min(safeDuration, t)));
      }
    };
    const onUp = () => setDrag(null);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [drag, end, start, safeDuration, timeAtClientX, onStartChange, onEndChange, onPlayheadChange]);

  const startDrag = (kind: DragKind) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setDrag(kind);
  };

  // Click on the playhead track to jump
  const onPlayheadTrackClick = (e: React.PointerEvent<HTMLDivElement>) => {
    if (drag) return;
    const t = timeAtClientX(e.clientX);
    onPlayheadChange(Math.max(0, Math.min(safeDuration, t)));
    setDrag('playhead');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8, marginBottom: 6, userSelect: 'none' }}>
      {/* labels: start / playhead / end */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#888' }}>
        <span title="export start">{formatTime(start)}</span>
        <span title="playhead" style={{ color: '#ddd' }}>{formatTime(playhead)}</span>
        <span title="export end">{formatTime(end)}</span>
      </div>

      <div
        ref={containerRef}
        style={{ position: 'relative', height: 28, padding: '0 0' }}
      >
        {/* RANGE TRACK (top) */}
        <div style={{
          position: 'absolute', left: 0, right: 0, top: 2, height: 8,
          background: '#1a1a1a', borderRadius: 4, border: '1px solid #2a2a2a',
        }}>
          {/* selected range fill */}
          <div style={{
            position: 'absolute',
            left: `${startPct}%`,
            width: `${Math.max(0, endPct - startPct)}%`,
            top: 0, bottom: 0,
            background: '#1f6feb55',
            borderTop: '1px solid #1f6feb',
            borderBottom: '1px solid #1f6feb',
          }} />
          {/* start handle */}
          <div
            onPointerDown={startDrag('start')}
            title={`Start: ${formatTime(start)}`}
            style={{
              position: 'absolute',
              left: `calc(${startPct}% - ${HANDLE_W / 2}px)`,
              top: -3, width: HANDLE_W, height: 14,
              background: '#1f6feb', borderRadius: 2, cursor: 'ew-resize',
              boxShadow: '0 0 4px rgba(31,111,235,0.6)',
            }}
          />
          {/* end handle */}
          <div
            onPointerDown={startDrag('end')}
            title={`End: ${formatTime(end)}`}
            style={{
              position: 'absolute',
              left: `calc(${endPct}% - ${HANDLE_W / 2}px)`,
              top: -3, width: HANDLE_W, height: 14,
              background: '#1f6feb', borderRadius: 2, cursor: 'ew-resize',
              boxShadow: '0 0 4px rgba(31,111,235,0.6)',
            }}
          />
        </div>

        {/* PLAYHEAD TRACK (bottom) */}
        <div
          onPointerDown={onPlayheadTrackClick}
          style={{
            position: 'absolute', left: 0, right: 0, top: 18, height: 8,
            background: '#0d0d0d', borderRadius: 4, border: '1px solid #2a2a2a',
            cursor: 'pointer', overflow: 'hidden',
          }}
        >
          {/* dim regions outside [start, end] */}
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${startPct}%`, background: 'rgba(0,0,0,0.55)' }} />
          <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: `${100 - endPct}%`, background: 'rgba(0,0,0,0.55)' }} />
          {/* in-range fill (subtle) */}
          <div style={{
            position: 'absolute',
            left: `${startPct}%`,
            width: `${Math.max(0, endPct - startPct)}%`,
            top: 0, bottom: 0, background: '#181818',
          }} />
          {/* playhead line */}
          <div
            onPointerDown={startDrag('playhead')}
            style={{
              position: 'absolute',
              left: `calc(${playPct}% - 1px)`,
              top: -2, bottom: -2, width: 2,
              background: '#fff', cursor: 'ew-resize',
              boxShadow: '0 0 4px rgba(255,255,255,0.7)',
            }}
          />
        </div>
      </div>
    </div>
  );
};
