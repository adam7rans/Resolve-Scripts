import React, { useState } from 'react';
import type { MicroTimeline } from '../../lib/types';
import { OUTRO_DUR, clamp, fmt, type DragKind } from './timelineUtils';

const HANDLE_HIT = 12; // px wide hit zone centered on each clip edge

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
}) => {
  const [hoverHandle, setHoverHandle] = useState<{ id: string; side: 'start' | 'end' } | null>(null);

  return (
    <>
      {/* clip regions */}
      {microTimelines.map((mt) => {
        const l = clamp(secToPct(mt.startSecond), 0, 100);
        const r = clamp(secToPct(mt.endSecond), 0, 100);
        if (r <= l) return null;
        const isSel = mt.id === selectedId;
        const hoverStart = hoverHandle?.id === mt.id && hoverHandle.side === 'start';
        const hoverEnd = hoverHandle?.id === mt.id && hoverHandle.side === 'end';

        return (
          <React.Fragment key={mt.id}>
            {/* clip body */}
            <div
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
                background: mt.color + (isSel ? '44' : '22'),
                borderLeft: `2px solid ${mt.color}${isSel ? 'ff' : '99'}`,
                borderRight: `2px solid ${mt.color}${isSel ? 'ff' : '99'}`,
                cursor: 'pointer', zIndex: isSel ? 2 : 1,
              }}
            />

            {/* start handle */}
            {l >= 0 && l <= 100 && (
              <div
                onPointerEnter={() => setHoverHandle({ id: mt.id, side: 'start' })}
                onPointerLeave={() => setHoverHandle(null)}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onSelectClip(mt.id);
                  startDrag({ kind: 'clip-start', id: mt.id })(e);
                }}
                title={`${mt.name} start: ${fmt(mt.startSecond)} — drag to adjust`}
                style={{
                  position: 'absolute',
                  left: `calc(${l}% - ${HANDLE_HIT / 2}px)`,
                  top: 0, bottom: 0, width: HANDLE_HIT,
                  cursor: 'ew-resize',
                  zIndex: 7,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <div style={{
                  width: 4, height: '70%',
                  background: mt.color,
                  borderRadius: 2,
                  opacity: (hoverStart || isSel) ? 1 : 0.45,
                  boxShadow: (hoverStart || isSel) ? `0 0 6px ${mt.color}cc` : 'none',
                  transition: 'opacity 0.1s, box-shadow 0.1s',
                }} />
              </div>
            )}

            {/* end handle */}
            {r >= 0 && r <= 100 && (
              <div
                onPointerEnter={() => setHoverHandle({ id: mt.id, side: 'end' })}
                onPointerLeave={() => setHoverHandle(null)}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onSelectClip(mt.id);
                  startDrag({ kind: 'clip-end', id: mt.id })(e);
                }}
                title={`${mt.name} end: ${fmt(mt.endSecond)} — drag to adjust`}
                style={{
                  position: 'absolute',
                  left: `calc(${r}% - ${HANDLE_HIT / 2}px)`,
                  top: 0, bottom: 0, width: HANDLE_HIT,
                  cursor: 'ew-resize',
                  zIndex: 7,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <div style={{
                  width: 4, height: '70%',
                  background: mt.color,
                  borderRadius: 2,
                  opacity: (hoverEnd || isSel) ? 1 : 0.45,
                  boxShadow: (hoverEnd || isSel) ? `0 0 6px ${mt.color}cc` : 'none',
                  transition: 'opacity 0.1s, box-shadow 0.1s',
                }} />
              </div>
            )}
          </React.Fragment>
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
};
