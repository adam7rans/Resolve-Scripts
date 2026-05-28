import React from 'react';
import type { MusicTimelineClip } from '../../lib/types';
import { clamp, fmt, type DragKind } from './timelineUtils';

function clipEnd(clip: MusicTimelineClip) {
  return clip.startSecond + clip.durationSecond;
}

interface Props {
  clips: MusicTimelineClip[];
  clipLabels?: Record<string, string>;
  selectedMusicClipId: string | null;
  dragKind: DragKind;
  secToPct: (t: number) => number;
  timeAtClientX: (clientX: number) => number;
  onSelectMusicClip: (id: string | null) => void;
  onPlayheadChange: (playhead: number) => void;
  startDrag: (kind: Exclude<DragKind, null | 'scroll'>) => (e: React.PointerEvent) => void;
}

export const MusicTrackOverlay: React.FC<Props> = ({
  clips,
  clipLabels = {},
  selectedMusicClipId,
  dragKind,
  secToPct,
  timeAtClientX,
  onSelectMusicClip,
  onPlayheadChange,
  startDrag,
}) => {
  const HANDLE_W = 10;
  return (
    <>
      {[0, 1].map((lane) => (
        <div
          key={lane}
          onPointerDown={(e) => {
            onSelectMusicClip(null);
            onPlayheadChange(timeAtClientX(e.clientX));
            startDrag('play')(e);
          }}
          style={{
            position: 'relative',
            height: 26,
            background: lane === 0 ? '#111' : '#0d0d0d',
            borderTop: lane === 0 ? '1px solid #242424' : '1px solid #1d1d1d',
            borderBottom: lane === 1 ? '1px solid #242424' : undefined,
            cursor: 'ew-resize',
            userSelect: 'none',
          }}
        >
          <div style={{ position: 'absolute', left: 6, top: 5, color: '#555', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 }}>
            A{lane + 1}
          </div>
          {clips.filter((clip) => clip.trackIndex === lane).map((clip) => {
            const l = clamp(secToPct(clip.startSecond), 0, 100);
            const r = clamp(secToPct(clipEnd(clip)), 0, 100);
            if (r <= l) return null;
            const selected = clip.id === selectedMusicClipId;
            const dragging = !!dragKind && typeof dragKind === 'object' && dragKind.kind === 'music-move' && dragKind.id === clip.id;
            const fadeInPct = clip.durationSecond > 0 ? clamp((clip.fadeInSecond / clip.durationSecond) * 100, 0, 100) : 0;
            const fadeOutPct = clip.durationSecond > 0 ? clamp((clip.fadeOutSecond / clip.durationSecond) * 100, 0, 100) : 0;
            const showHandles = selected || (fadeInPct > 0 || fadeOutPct > 0);
            return (
              <div
                key={clip.id}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onSelectMusicClip(clip.id);
                  startDrag({ kind: 'music-move', id: clip.id, offset: timeAtClientX(e.clientX) - clip.startSecond })(e);
                }}
                title={`${fmt(clip.startSecond)} → ${fmt(clipEnd(clip))}`}
                style={{
                  position: 'absolute',
                  left: `${l}%`,
                  width: `${r - l}%`,
                  top: 3,
                  bottom: 3,
                  borderRadius: 4,
                  background: selected ? `${clip.color}55` : `${clip.color}33`,
                  border: `1px solid ${selected ? clip.color : `${clip.color}aa`}`,
                  overflow: 'hidden',
                  minWidth: 18,
                  cursor: dragging ? 'grabbing' : 'grab',
                }}
              >
                {clip.fadeInSecond > 0 && (
                  <div
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      bottom: 0,
                      width: `${fadeInPct}%`,
                      background: 'linear-gradient(90deg, rgba(255,255,255,0.18), rgba(255,255,255,0.02))',
                      pointerEvents: 'none',
                    }}
                  />
                )}
                {clip.fadeOutSecond > 0 && (
                  <div
                    style={{
                      position: 'absolute',
                      right: 0,
                      top: 0,
                      bottom: 0,
                      width: `${fadeOutPct}%`,
                      background: 'linear-gradient(270deg, rgba(255,255,255,0.18), rgba(255,255,255,0.02))',
                      pointerEvents: 'none',
                    }}
                  />
                )}
                {showHandles && (
                  <>
                    <div
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        onSelectMusicClip(clip.id);
                        startDrag({ kind: 'music-fade-in', id: clip.id })(e);
                      }}
                      title={`Fade in ${fmt(clip.fadeInSecond)}`}
                      style={{
                        position: 'absolute',
                        left: `calc(${fadeInPct}% - ${HANDLE_W / 2}px)`,
                        top: 1,
                        bottom: 1,
                        width: HANDLE_W,
                        borderRadius: 999,
                        background: selected ? '#ffffffdd' : '#ffffff99',
                        boxShadow: selected ? '0 0 6px rgba(255,255,255,0.5)' : 'none',
                        cursor: 'ew-resize',
                        zIndex: 3,
                      }}
                    />
                    <div
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        onSelectMusicClip(clip.id);
                        startDrag({ kind: 'music-fade-out', id: clip.id })(e);
                      }}
                      title={`Fade out ${fmt(clip.fadeOutSecond)}`}
                      style={{
                        position: 'absolute',
                        left: `calc(${100 - fadeOutPct}% - ${HANDLE_W / 2}px)`,
                        top: 1,
                        bottom: 1,
                        width: HANDLE_W,
                        borderRadius: 999,
                        background: selected ? '#ffffffdd' : '#ffffff99',
                        boxShadow: selected ? '0 0 6px rgba(255,255,255,0.5)' : 'none',
                        cursor: 'ew-resize',
                        zIndex: 3,
                      }}
                    />
                  </>
                )}
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', padding: '0 8px', color: '#eee', fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {clipLabels[clip.id] ?? `Track ${clip.trackIndex + 1}`}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </>
  );
};
