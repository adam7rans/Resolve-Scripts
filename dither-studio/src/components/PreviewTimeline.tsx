import React, { useEffect, useRef, useState } from 'react';

export interface PreviewTimelineProps {
  /** Total media duration (seconds). */
  duration: number;
  /** Export-range start (seconds). */
  start: number;
  /** Export-range end (seconds). */
  end: number;
  /** Current playhead (seconds). */
  playhead: number;
  /** Called when the user drags either of the start/end handles. */
  onRangeChange: (start: number, end: number) => void;
  /** Called when the user clicks/drags on the track to scrub. */
  onPlayheadChange: (p: number) => void;
}

const HANDLE_W = 10;
const MIN_VIEW_SEC = 0.05;

function clamp(v: number, mn: number, mx: number) { return Math.min(mx, Math.max(mn, v)); }
function fmt(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}

type DragKind = null | 'start' | 'end' | 'play' | 'scroll';

/**
 * Wide timeline rendered below the preview canvas.
 *
 * Mirrors the start/end range handles from the Export panel's "Time range"
 * but adds:
 *   - a horizontal scroll thumb beneath the track for panning the view
 *   - "Focus Export Area / Start / End" buttons that reframe the view
 *   - "Zoom In / Out" buttons (zoom centered on the export area's midpoint)
 */
export const PreviewTimeline: React.FC<PreviewTimelineProps> = ({
  duration, start, end, playhead, onRangeChange, onPlayheadChange,
}) => {
  const totalDuration = Math.max(0.01, duration);

  // Visible window in seconds. Defaults to the full duration; user can zoom/pan.
  const [view, setView] = useState<{ s: number; e: number }>({ s: 0, e: totalDuration });

  // Track the latest start/end without retriggering the auto-focus effect.
  const startRef = useRef(start);
  const endRef = useRef(end);
  useEffect(() => { startRef.current = start; endRef.current = end; }, [start, end]);

  // When duration changes (new project / media loaded), automatically frame the
  // view on the export area (same behaviour as clicking "Focus Export Area")
  // so the user can immediately see and adjust both handles.
  useEffect(() => {
    if (totalDuration <= MIN_VIEW_SEC * 1.5) return;
    const s = startRef.current;
    const e = endRef.current;
    const exportSpan = Math.max(MIN_VIEW_SEC, e - s);
    const padFrac = 0.05; // 5% pad on each side -> handles fill ~90% of view
    const newSpan = Math.min(totalDuration, exportSpan / (1 - padFrac * 2));
    const center = (s + e) / 2;
    let ns = center - newSpan / 2;
    let ne = center + newSpan / 2;
    if (ne > totalDuration) { ne = totalDuration; ns = Math.max(0, ne - newSpan); }
    if (ns < 0) { ns = 0; ne = Math.min(totalDuration, ns + newSpan); }
    setView({ s: ns, e: ne });
  }, [totalDuration]);

  const viewStart = view.s;
  const viewEnd = Math.max(view.s + MIN_VIEW_SEC, Math.min(view.e, totalDuration));
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
    return clamp(viewStart + (x / r.width) * viewSpan, 0, totalDuration);
  };

  // Global pointer move/up while dragging anything.
  useEffect(() => {
    if (!dragKind) return;
    const onMove = (e: PointerEvent) => {
      if (dragKind === 'start') {
        const t = timeAtClientX(e.clientX);
        onRangeChange(clamp(t, 0, end - 0.01), end);
      } else if (dragKind === 'end') {
        const t = timeAtClientX(e.clientX);
        onRangeChange(start, clamp(t, start + 0.01, totalDuration));
      } else if (dragKind === 'play') {
        onPlayheadChange(timeAtClientX(e.clientX));
      } else if (dragKind === 'scroll') {
        const r = scrollRef.current?.getBoundingClientRect();
        if (!r) return;
        const thumbW = (viewSpan / totalDuration) * r.width;
        const localX = e.clientX - r.left - dragOffsetRef.current;
        const newThumbStart = clamp(localX, 0, Math.max(0, r.width - thumbW));
        const newViewStart = clamp((newThumbStart / r.width) * totalDuration, 0, Math.max(0, totalDuration - viewSpan));
        setView({ s: newViewStart, e: newViewStart + viewSpan });
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
  }, [dragKind, viewSpan, totalDuration, start, end, onRangeChange, onPlayheadChange, viewStart]);

  const startDrag = (kind: Exclude<DragKind, null | 'scroll'>) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    setDragKind(kind);
  };

  // ----- view helpers -----
  const setViewClamped = (s: number, e: number) => {
    let span = Math.max(MIN_VIEW_SEC, Math.min(totalDuration, e - s));
    let ns = s;
    let ne = ns + span;
    if (ne > totalDuration) { ne = totalDuration; ns = Math.max(0, ne - span); }
    if (ns < 0) { ns = 0; ne = Math.min(totalDuration, ns + span); }
    setView({ s: ns, e: ne });
  };

  const focusExportArea = () => {
    const exportSpan = Math.max(MIN_VIEW_SEC, end - start);
    const padFrac = 0.05; // 5% pad on each side -> handles fill ~90% of view
    const newSpan = Math.min(totalDuration, exportSpan / (1 - padFrac * 2));
    const center = (start + end) / 2;
    setViewClamped(center - newSpan / 2, center + newSpan / 2);
  };

  const focusOnHandle = (t: number) => {
    const newSpan = Math.max(MIN_VIEW_SEC, viewSpan / 4);
    setViewClamped(t - newSpan / 2, t + newSpan / 2);
  };

  const zoomIn = () => {
    const center = (start + end) / 2;
    const newSpan = Math.max(MIN_VIEW_SEC, viewSpan / 2);
    setViewClamped(center - newSpan / 2, center + newSpan / 2);
  };

  const zoomOut = () => {
    const center = (viewStart + viewEnd) / 2;
    const newSpan = Math.min(totalDuration, viewSpan * 2);
    setViewClamped(center - newSpan / 2, center + newSpan / 2);
  };

  const resetView = () => setView({ s: 0, e: totalDuration });

  // Scrollbar geometry
  const scrollThumbPct = (viewSpan / totalDuration) * 100;
  const scrollThumbLeftPct = (viewStart / totalDuration) * 100;

  const onScrollDown: React.PointerEventHandler<HTMLDivElement> = (e) => {
    const r = scrollRef.current?.getBoundingClientRect();
    if (!r) return;
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    const x = e.clientX - r.left;
    const thumbW = (viewSpan / totalDuration) * r.width;
    const thumbX = (viewStart / totalDuration) * r.width;
    if (x >= thumbX && x <= thumbX + thumbW) {
      dragOffsetRef.current = x - thumbX;
    } else {
      // Click outside the thumb: jump so the click is centered on the thumb.
      dragOffsetRef.current = thumbW / 2;
      const newThumbStart = clamp(x - thumbW / 2, 0, Math.max(0, r.width - thumbW));
      const newViewStart = clamp((newThumbStart / r.width) * totalDuration, 0, Math.max(0, totalDuration - viewSpan));
      setView({ s: newViewStart, e: newViewStart + viewSpan });
    }
    setDragKind('scroll');
  };

  // Visible positions (% within the visible view)
  const visStart = secToPct(start);
  const visEnd = secToPct(end);
  const visPlay = secToPct(playhead);
  const startInView = visStart >= -1 && visStart <= 101;
  const endInView = visEnd >= -1 && visEnd <= 101;

  const fillL = clamp(visStart, 0, 100);
  const fillR = clamp(visEnd, 0, 100);

  const onTrackDown: React.PointerEventHandler<HTMLDivElement> = (e) => {
    // If a handle was hit, its own onPointerDown stops propagation.
    onPlayheadChange(timeAtClientX(e.clientX));
    startDrag('play')(e);
  };

  const btn: React.CSSProperties = {
    background: '#1a1a1a', color: '#ddd', border: '1px solid #2a2a2a',
    padding: '4px 8px', borderRadius: 3, cursor: 'pointer', fontSize: 11,
    fontFamily: 'inherit',
  };
  const btnPrimary: React.CSSProperties = { ...btn, background: '#1f6feb22', borderColor: '#1f6feb', color: '#fff' };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 4,
      padding: '6px 10px 8px', background: '#0a0a0a',
      borderTop: '1px solid #1f1f1f', flexShrink: 0,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#888' }}>
        <span>view {fmt(viewStart)} – {fmt(viewEnd)} ({fmt(viewSpan)})</span>
        <span style={{ color: '#ddd' }}>{fmt(playhead)}</span>
        <span>export {fmt(start)} → {fmt(end)} ({fmt(end - start)})</span>
      </div>

      {/* range track */}
      <div
        ref={trackRef}
        onPointerDown={onTrackDown}
        style={{
          position: 'relative',
          height: 24,
          background: '#161616',
          border: '1px solid #2a2a2a',
          borderRadius: 4,
          userSelect: 'none',
          cursor: 'ew-resize',
        }}
      >
        {/* selected fill (clamped to the visible window) */}
        {fillR > fillL && (
          <div style={{
            position: 'absolute',
            left: `${fillL}%`,
            width: `${fillR - fillL}%`,
            top: 0, bottom: 0,
            background: '#1f6feb44',
            borderLeft: startInView ? '1px solid #1f6feb' : 'none',
            borderRight: endInView ? '1px solid #1f6feb' : 'none',
            pointerEvents: 'none',
          }} />
        )}

        {/* off-screen indicators */}
        {!startInView && visStart < 0 && (
          <div title={`Start ${fmt(start)} (off-screen left)`} style={{
            position: 'absolute', left: 2, top: 4, bottom: 4, width: 4,
            background: '#1f6feb', borderRadius: 2, pointerEvents: 'none',
          }} />
        )}
        {!endInView && visEnd > 100 && (
          <div title={`End ${fmt(end)} (off-screen right)`} style={{
            position: 'absolute', right: 2, top: 4, bottom: 4, width: 4,
            background: '#1f6feb', borderRadius: 2, pointerEvents: 'none',
          }} />
        )}

        {/* start handle */}
        {startInView && (
          <div
            onPointerDown={startDrag('start')}
            title={`Start: ${fmt(start)}`}
            style={{
              position: 'absolute',
              left: `calc(${visStart}% - ${HANDLE_W / 2}px)`,
              top: -2, bottom: -2, width: HANDLE_W,
              background: '#1f6feb', borderRadius: 2, cursor: 'ew-resize',
              boxShadow: '0 0 4px rgba(31,111,235,0.6)',
            }}
          />
        )}
        {/* end handle */}
        {endInView && (
          <div
            onPointerDown={startDrag('end')}
            title={`End: ${fmt(end)}`}
            style={{
              position: 'absolute',
              left: `calc(${visEnd}% - ${HANDLE_W / 2}px)`,
              top: -2, bottom: -2, width: HANDLE_W,
              background: '#1f6feb', borderRadius: 2, cursor: 'ew-resize',
              boxShadow: '0 0 4px rgba(31,111,235,0.6)',
            }}
          />
        )}

        {/* playhead */}
        {visPlay >= 0 && visPlay <= 100 && (
          <div style={{
            position: 'absolute',
            left: `calc(${visPlay}% - 1px)`,
            top: -3, bottom: -3, width: 2,
            background: '#fff', boxShadow: '0 0 4px rgba(255,255,255,0.7)',
            pointerEvents: 'none',
          }} />
        )}
      </div>

      {/* horizontal scroll bar */}
      <div
        ref={scrollRef}
        onPointerDown={onScrollDown}
        style={{
          position: 'relative',
          height: 10,
          background: '#0d0d0d',
          border: '1px solid #222',
          borderRadius: 5,
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        <div style={{
          position: 'absolute',
          left: `${scrollThumbLeftPct}%`,
          width: `${scrollThumbPct}%`,
          top: 0, bottom: 0,
          background: dragKind === 'scroll' ? '#4a4a4a' : '#3a3a3a',
          borderRadius: 5,
          minWidth: 18,
          pointerEvents: 'none',
        }} />
      </div>

      {/* control buttons */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
        <button style={btnPrimary} onClick={focusExportArea} title="Zoom so the export range fills ~90% of the timeline">Focus Export Area</button>
        <button style={btn} onClick={() => focusOnHandle(start)} title="Zoom in on the start handle">Focus on Start</button>
        <button style={btn} onClick={() => focusOnHandle(end)} title="Zoom in on the end handle">Focus on End</button>
        <button style={btn} onClick={zoomIn} title="Zoom in (centered on the midpoint between the start and end handles)">Zoom In</button>
        <button style={btn} onClick={zoomOut} title="Zoom out">Zoom Out</button>
        <button style={btn} onClick={resetView} title="Show the full duration">Reset</button>
      </div>
    </div>
  );
};
