import React from 'react';
import type { MicroTimeline } from '../../lib/types';
import { HANDLE_W, OUTRO_DUR, clamp, fmt, type DragKind } from './timelineUtils';

interface Props {
  microTimelines: MicroTimeline[];
  selectedId: string | null;
  selectedClip: MicroTimeline | null;
  outroEnabled: boolean | undefined;
  pendingClipStart: number | null;
  secToPct: (t: number) => number;
  timeAtClientX: (clientX: number) => number;
  onSelectClip: (id: string | null) => void;
  onPlayheadChange: (playhead: number) => void;
  setDragKind: (kind: DragKind) => void;
  startDrag: (kind: Exclude<DragKind, null | 'scroll'>) => (e: React.PointerEvent) => void;
}

export const ClipTrackOverlay: React.FC<Props> = ({
  microTimelines, selectedId, selectedClip, outroEnabled, pendingClipStart,
  secToPct, timeAtClientX, onSelectClip, onPlayheadChange, setDragKind, startDrag,
}) => (
  <>
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
            position: 'absolute', left: `${l}%`, width: `${r - l}%`,
            top: 0, bottom: 0,
            background: mt.color + (isSel ? '66' : '33'),
            borderLeft: `1px solid ${mt.color}`,
            borderRight: `1px solid ${mt.color}`,
            outline: isSel ? `1px solid ${mt.color}` : 'none',
            cursor: 'pointer', zIndex: isSel ? 2 : 1,
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
            position: 'absolute', left: `${oL}%`, width: `${oR - oL}%`,
            top: 0, bottom: 0,
            background: '#eb6f1f44',
            borderLeft: '1px solid #eb6f1f',
            borderRight: oR < 100 ? '1px solid #eb6f1f' : 'none',
            pointerEvents: 'none', zIndex: 1,
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
                position: 'absolute', left: `calc(${sVis}% - ${HANDLE_W / 2}px)`,
                top: -2, bottom: -2, width: HANDLE_W,
                background: selectedClip.color, borderRadius: 2, cursor: 'ew-resize',
                boxShadow: `0 0 4px ${selectedClip.color}99`, zIndex: 3,
              }}
            />
          )}
          {eInView && (
            <div
              onPointerDown={startDrag({ kind: 'clip-end', id: selectedClip.id })}
              title={`${selectedClip.name} end: ${fmt(selectedClip.endSecond)}`}
              style={{
                position: 'absolute', left: `calc(${eVis}% - ${HANDLE_W / 2}px)`,
                top: -2, bottom: -2, width: HANDLE_W,
                background: selectedClip.color, borderRadius: 2, cursor: 'ew-resize',
                boxShadow: `0 0 4px ${selectedClip.color}99`, zIndex: 3,
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
          position: 'absolute', left: `calc(${pVis}% - 1px)`,
          top: 0, bottom: 0, width: 2,
          background: '#ffd60a', borderStyle: 'dashed',
          pointerEvents: 'none', zIndex: 4,
        }} />
      );
    })()}
  </>
);
