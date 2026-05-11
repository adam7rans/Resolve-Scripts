import React, { useEffect, useRef, useState } from 'react';
import type { MicroTimeline } from '../lib/types';

export interface PreviewTimelineProps {
  duration: number;
  playhead: number;
  onPlayheadChange: (playhead: number) => void;
  outroEnabled?: boolean;
  onToggleOutro?: () => void;
  microTimelines: MicroTimeline[];
  selectedId: string | null;
  pendingClipStart: number | null;
  onSelectClip: (id: string | null) => void;
  onClipRangeChange: (id: string, start: number, end: number) => void;
  onAddStart: () => void;
  onAddEnd: () => void;
  onCancelPending: () => void;
  onDeleteClip: (id: string) => void;
  onRenameClip: (id: string, name: string) => void;
}

const HANDLE_W = 10;
const OUTRO_DUR = 5;
const MIN_VIEW_SEC = 0.05;

function clamp(v: number, mn: number, mx: number) { return Math.min(mx, Math.max(mn, v)); }
function fmt(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}

type DragKind = null | { kind: 'clip-start' | 'clip-end'; id: string } | 'play' | 'scroll';

export const PreviewTimeline: React.FC<PreviewTimelineProps> = ({
  duration, playhead, onPlayheadChange,
  outroEnabled, onToggleOutro,
  microTimelines, selectedId, pendingClipStart,
  onSelectClip, onClipRangeChange,
  onAddStart, onAddEnd, onCancelPending, onDeleteClip, onRenameClip,
}) => {
  const totalDuration = Math.max(0.01, duration);
  const projectDuration = totalDuration + (outroEnabled ? OUTRO_DUR : 0);

  const [view, setView] = useState<{ s: number; e: number }>({ s: 0, e: projectDuration });
  const [editingName, setEditingName] = useState<string | null>(null);

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
        const t = timeAtClientX(e.clientX);
        const clip = microTimelines.find(mt => mt.id === dragKind.id);
        if (!clip) return;
        if (dragKind.kind === 'clip-start') {
          onClipRangeChange(dragKind.id, clamp(t, 0, clip.endSecond - 0.01), clip.endSecond);
        } else {
          onClipRangeChange(dragKind.id, clip.startSecond, clamp(t, clip.startSecond + 0.01, totalDuration));
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
  }, [dragKind, viewSpan, projectDuration, totalDuration, microTimelines, onClipRangeChange, onPlayheadChange, viewStart]);

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
    const center = (viewStart + viewEnd) / 2;
    const newSpan = Math.max(MIN_VIEW_SEC, viewSpan / 2);
    setViewClamped(center - newSpan / 2, center + newSpan / 2);
  };

  const zoomOut = () => {
    const center = (viewStart + viewEnd) / 2;
    const newSpan = Math.min(projectDuration, viewSpan * 2);
    setViewClamped(center - newSpan / 2, center + newSpan / 2);
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
    onPlayheadChange(timeAtClientX(e.clientX));
    startDrag('play')(e);
  };

  const btn: React.CSSProperties = {
    background: '#1a1a1a', color: '#ddd', border: '1px solid #2a2a2a',
    padding: '4px 8px', borderRadius: 3, cursor: 'pointer', fontSize: 11,
    fontFamily: 'inherit',
  };
  const btnPrimary: React.CSSProperties = { ...btn, background: '#1f6feb22', borderColor: '#1f6feb', color: '#fff' };
  const btnDanger: React.CSSProperties = { ...btn, background: '#ff453a22', borderColor: '#ff453a', color: '#ff453a' };

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
          position: 'relative',
          height: 24,
          background: '#161616',
          border: '1px solid #2a2a2a',
          borderRadius: 4,
          userSelect: 'none',
          cursor: 'ew-resize',
        }}
      >
        {/* clip regions */}
        {microTimelines.map((mt) => {
          const l = clamp(secToPct(mt.startSecond), 0, 100);
          const r = clamp(secToPct(mt.endSecond), 0, 100);
          if (r <= l) return null;
          const isSel = mt.id === selectedId;
          return (
            <div
              key={mt.id}
              onPointerDown={(e) => {
                e.stopPropagation();
                onSelectClip(mt.id);
                onPlayheadChange(timeAtClientX(e.clientX));
                setDragKind('play');
                (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
              }}
              title={`${mt.name}: ${fmt(mt.startSecond)} – ${fmt(mt.endSecond)}`}
              style={{
                position: 'absolute',
                left: `${l}%`,
                width: `${r - l}%`,
                top: 0, bottom: 0,
                background: mt.color + (isSel ? '66' : '33'),
                borderLeft: `1px solid ${mt.color}`,
                borderRight: `1px solid ${mt.color}`,
                outline: isSel ? `1px solid ${mt.color}` : 'none',
                cursor: 'pointer',
                zIndex: isSel ? 2 : 1,
              }}
            />
          );
        })}

        {/* outro block after selected clip */}
        {outroEnabled && selectedClip && (() => {
          const oStart = selectedClip.endSecond;
          const oEnd = selectedClip.endSecond + OUTRO_DUR;
          const oL = clamp(secToPct(oStart), 0, 100);
          const oR = clamp(secToPct(oEnd), 0, 100);
          if (oR <= oL) return null;
          return (
            <div
              title={`Outro: ${fmt(oStart)} – ${fmt(oEnd)}`}
              style={{
                position: 'absolute',
                left: `${oL}%`,
                width: `${oR - oL}%`,
                top: 0, bottom: 0,
                background: '#eb6f1f44',
                borderLeft: '1px solid #eb6f1f',
                borderRight: oR < 100 ? '1px solid #eb6f1f' : 'none',
                pointerEvents: 'none',
                zIndex: 1,
              }}
            />
          );
        })()}

        {/* per-clip drag handles (only for selected clip) */}
        {selectedClip && (() => {
          const sVis = secToPct(selectedClip.startSecond);
          const eVis = secToPct(selectedClip.endSecond);
          const sInView = sVis >= -1 && sVis <= 101;
          const eInView = eVis >= -1 && eVis <= 101;
          return (
            <>
              {sInView && (
                <div
                  onPointerDown={startDrag({ kind: 'clip-start', id: selectedClip.id })}
                  title={`${selectedClip.name} start: ${fmt(selectedClip.startSecond)}`}
                  style={{
                    position: 'absolute',
                    left: `calc(${sVis}% - ${HANDLE_W / 2}px)`,
                    top: -2, bottom: -2, width: HANDLE_W,
                    background: selectedClip.color, borderRadius: 2, cursor: 'ew-resize',
                    boxShadow: `0 0 4px ${selectedClip.color}99`,
                    zIndex: 3,
                  }}
                />
              )}
              {eInView && (
                <div
                  onPointerDown={startDrag({ kind: 'clip-end', id: selectedClip.id })}
                  title={`${selectedClip.name} end: ${fmt(selectedClip.endSecond)}`}
                  style={{
                    position: 'absolute',
                    left: `calc(${eVis}% - ${HANDLE_W / 2}px)`,
                    top: -2, bottom: -2, width: HANDLE_W,
                    background: selectedClip.color, borderRadius: 2, cursor: 'ew-resize',
                    boxShadow: `0 0 4px ${selectedClip.color}99`,
                    zIndex: 3,
                  }}
                />
              )}
            </>
          );
        })()}

        {/* pending clip start marker */}
        {pendingClipStart !== null && (() => {
          const pVis = secToPct(pendingClipStart);
          if (pVis < 0 || pVis > 100) return null;
          return (
            <div style={{
              position: 'absolute',
              left: `calc(${pVis}% - 1px)`,
              top: 0, bottom: 0, width: 2,
              background: '#ffd60a',
              borderStyle: 'dashed',
              pointerEvents: 'none',
              zIndex: 4,
            }} />
          );
        })()}

        {/* playhead */}
        {visPlay >= 0 && visPlay <= 100 && (
          <div style={{
            position: 'absolute',
            left: `calc(${visPlay}% - 1px)`,
            top: -3, bottom: -3, width: 2,
            background: '#fff', boxShadow: '0 0 4px rgba(255,255,255,0.7)',
            pointerEvents: 'none',
            zIndex: 5,
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

      {/* clip list */}
      {microTimelines.length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 2 }}>
          {microTimelines.map((mt) => {
            const isSel = mt.id === selectedId;
            return (
              <button
                key={mt.id}
                onClick={() => { if (isSel) onPlayheadChange(mt.startSecond); else onSelectClip(mt.id); }}
                onDoubleClick={() => setEditingName(mt.id)}
                style={{
                  ...btn,
                  background: isSel ? mt.color + '33' : '#1a1a1a',
                  borderColor: isSel ? mt.color : '#2a2a2a',
                  color: isSel ? '#fff' : '#aaa',
                  position: 'relative',
                  paddingLeft: 14,
                }}
              >
                <span style={{
                  position: 'absolute', left: 4, top: '50%', transform: 'translateY(-50%)',
                  width: 6, height: 6, borderRadius: '50%', background: mt.color,
                }} />
                {editingName === mt.id ? (
                  <input
                    autoFocus
                    defaultValue={mt.name}
                    onClick={(e) => e.stopPropagation()}
                    onBlur={(e) => { onRenameClip(mt.id, e.target.value || mt.name); setEditingName(null); }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { onRenameClip(mt.id, (e.target as HTMLInputElement).value || mt.name); setEditingName(null); }
                      if (e.key === 'Escape') setEditingName(null);
                    }}
                    style={{
                      background: 'transparent', border: 'none', color: 'inherit',
                      fontSize: 'inherit', fontFamily: 'inherit', width: 60, outline: 'none',
                      borderBottom: '1px solid #888',
                    }}
                  />
                ) : (
                  <span>{mt.name} ({fmt(mt.endSecond - mt.startSecond)})</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* control buttons */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
        {pendingClipStart === null ? (
          <button style={btnPrimary} onClick={onAddStart} title="Mark clip start at the current playhead">+ Start</button>
        ) : (
          <>
            <button style={{ ...btn, background: '#ffd60a22', borderColor: '#ffd60a', color: '#ffd60a' }} disabled>
              Start @ {fmt(pendingClipStart)}
            </button>
            <button style={btnPrimary} onClick={onAddEnd} title="Mark clip end at the current playhead">+ End</button>
            <button style={btn} onClick={onCancelPending}>Cancel</button>
          </>
        )}

        <span style={{ width: 1, background: '#333', margin: '0 2px' }} />

        {selectedClip && (
          <>
            <button style={btnPrimary} onClick={focusClip} title="Zoom so the selected clip fills ~90% of the timeline">Focus Clip</button>
            <button style={btnDanger} onClick={() => onDeleteClip(selectedClip.id)} title="Delete the selected clip">Delete</button>
          </>
        )}

        <button style={btn} onClick={zoomIn} title="Zoom in">Zoom In</button>
        <button style={btn} onClick={zoomOut} title="Zoom out">Zoom Out</button>
        <button style={btn} onClick={resetView} title="Show the full duration">Reset</button>

        {onToggleOutro && (
          <button
            style={{
              ...btn,
              marginLeft: 'auto',
              background: outroEnabled ? '#eb6f1f44' : '#1a1a1a',
              borderColor: outroEnabled ? '#eb6f1f' : '#2a2a2a',
              color: outroEnabled ? '#fff' : '#aaa'
            }}
            onClick={onToggleOutro}
            title="Add a 5-second frozen-frame extension at the end of the video"
          >
            {outroEnabled ? '✓ Outro (5s)' : '+ Outro'}
          </button>
        )}
      </div>
    </div>
  );
};
