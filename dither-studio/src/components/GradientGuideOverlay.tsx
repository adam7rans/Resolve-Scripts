import React from 'react';
import { withGradientStops, type VideoGradientStop, type VideoShaderParams } from '../lib/types';

interface Props {
  frame: { x: number; y: number; w: number; h: number };
  value: VideoShaderParams;
  onChange: (value: VideoShaderParams) => void;
}

type DragState =
  | { kind: 'center' }
  | { kind: 'stop'; stopId: string };

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function stopIsPinned(stops: VideoGradientStop[], stopId: string): boolean {
  const index = stops.findIndex((stop) => stop.id === stopId);
  return index <= 0 || index >= stops.length - 1;
}

export const GradientGuideOverlay: React.FC<Props> = ({ frame, value, onChange }) => {
  const overlayRef = React.useRef<HTMLDivElement | null>(null);
  const dragRef = React.useRef<DragState | null>(null);

  React.useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      const rect = overlayRef.current?.getBoundingClientRect();
      if (!drag || !rect || rect.width <= 0 || rect.height <= 0) return;

      const uvX = clamp((event.clientX - rect.left) / rect.width, -0.5, 1.5);
      const uvY = clamp((event.clientY - rect.top) / rect.height, -0.5, 1.5);

      if (drag.kind === 'center') {
        onChange({
          ...value,
          gradientOffsetX: clamp(uvX - 0.5, -1, 1),
          gradientOffsetY: clamp(uvY - 0.5, -1, 1),
        });
        return;
      }

      if (stopIsPinned(value.gradientStops, drag.stopId)) return;

      const centerX = 0.5 + value.gradientOffsetX;
      const centerY = 0.5 + value.gradientOffsetY;
      let position = 0;

      if (value.gradientType === 0) {
        const dirX = Math.cos(value.gradientAngle);
        const dirY = Math.sin(value.gradientAngle);
        const projected = (uvX - centerX) * dirX + (uvY - centerY) * dirY;
        position = clamp(projected * value.gradientScale + 0.5, 0, 1);
      } else {
        const dx = uvX - centerX;
        const dy = uvY - centerY;
        position = clamp(Math.sqrt(dx * dx + dy * dy) * value.gradientScale, 0, 1);
      }

      const nextStops = value.gradientStops.map((stop) => (
        stop.id === drag.stopId ? { ...stop, position } : stop
      ));
      onChange(withGradientStops(value, nextStops));
    };

    const handlePointerUp = () => {
      dragRef.current = null;
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [onChange, value]);

  if (!value.gradientEnabled || !value.gradientGuideVisible || frame.w <= 0 || frame.h <= 0) {
    return null;
  }

  const centerX = (0.5 + value.gradientOffsetX) * frame.w;
  const centerY = (0.5 + value.gradientOffsetY) * frame.h;
  const radialPixelsPerUnit = frame.h / Math.max(value.gradientScale, 0.1);
  const linearDirX = Math.cos(value.gradientAngle);
  const linearDirY = Math.sin(value.gradientAngle);
  const startX = centerX + ((0 - 0.5) / value.gradientScale) * linearDirX * frame.w;
  const startY = centerY + ((0 - 0.5) / value.gradientScale) * linearDirY * frame.h;
  const endX = centerX + ((1 - 0.5) / value.gradientScale) * linearDirX * frame.w;
  const endY = centerY + ((1 - 0.5) / value.gradientScale) * linearDirY * frame.h;

  return (
    <div
      ref={overlayRef}
      style={{
        position: 'absolute',
        left: frame.x,
        top: frame.y,
        width: frame.w,
        height: frame.h,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          position: 'absolute',
          right: 12,
          top: 12,
          padding: '4px 8px',
          borderRadius: 999,
          background: 'rgba(5, 8, 14, 0.7)',
          border: '1px solid rgba(109, 168, 255, 0.35)',
          color: '#9ec5ff',
          fontSize: 10,
          letterSpacing: 0.8,
          textTransform: 'uppercase',
          backdropFilter: 'blur(6px)',
        }}
      >
        Gradient guide
      </div>

      {value.gradientType === 0 ? (
        <svg
          width={frame.w}
          height={frame.h}
          style={{ position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'auto' }}
        >
          <line
            x1={startX}
            y1={startY}
            x2={endX}
            y2={endY}
            stroke="rgba(164, 205, 255, 0.9)"
            strokeWidth="1.5"
            strokeDasharray="6 5"
          />
          {value.gradientStops.map((stop, index) => {
            const px = centerX + ((stop.position - 0.5) / value.gradientScale) * linearDirX * frame.w;
            const py = centerY + ((stop.position - 0.5) / value.gradientScale) * linearDirY * frame.h;
            const pinned = index === 0 || index === value.gradientStops.length - 1;
            return (
              <g key={stop.id}>
                <circle
                  cx={px}
                  cy={py}
                  r={pinned ? 7 : 8}
                  fill={stop.color}
                  fillOpacity={Math.max(0.25, stop.opacity)}
                  stroke={pinned ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.95)'}
                  strokeWidth={pinned ? 1.5 : 2}
                  style={{ pointerEvents: pinned ? 'none' : 'auto', cursor: pinned ? 'default' : 'ew-resize' }}
                  onPointerDown={(event) => {
                    if (pinned) return;
                    event.preventDefault();
                    dragRef.current = { kind: 'stop', stopId: stop.id };
                  }}
                />
                <text
                  x={px}
                  y={py - 14}
                  textAnchor="middle"
                  fill="#d3e7ff"
                  fontSize="10"
                  style={{ pointerEvents: 'none' }}
                >
                  {Math.round(stop.position * 100)}%
                </text>
              </g>
            );
          })}
        </svg>
      ) : (
        <svg
          width={frame.w}
          height={frame.h}
          style={{ position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'auto' }}
        >
          <line
            x1={centerX}
            y1={centerY}
            x2={centerX + radialPixelsPerUnit}
            y2={centerY}
            stroke="rgba(164, 205, 255, 0.75)"
            strokeWidth="1.5"
            strokeDasharray="6 5"
          />
          {value.gradientStops.map((stop, index) => {
            const radius = stop.position * radialPixelsPerUnit;
            const pinned = index === 0 || index === value.gradientStops.length - 1;
            return (
              <g key={stop.id}>
                <circle
                  cx={centerX}
                  cy={centerY}
                  r={radius}
                  fill="none"
                  stroke={index === value.gradientStops.length - 1 ? 'rgba(164, 205, 255, 0.9)' : 'rgba(164, 205, 255, 0.4)'}
                  strokeWidth={1.5}
                  strokeDasharray={index === value.gradientStops.length - 1 ? '6 5' : '3 5'}
                />
                <circle
                  cx={centerX + radius}
                  cy={centerY}
                  r={pinned ? 7 : 8}
                  fill={stop.color}
                  fillOpacity={Math.max(0.25, stop.opacity)}
                  stroke={pinned ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.95)'}
                  strokeWidth={pinned ? 1.5 : 2}
                  style={{ pointerEvents: pinned ? 'none' : 'auto', cursor: pinned ? 'default' : 'ew-resize' }}
                  onPointerDown={(event) => {
                    if (pinned) return;
                    event.preventDefault();
                    dragRef.current = { kind: 'stop', stopId: stop.id };
                  }}
                />
                <text
                  x={centerX + radius}
                  y={centerY - 14}
                  textAnchor="middle"
                  fill="#d3e7ff"
                  fontSize="10"
                  style={{ pointerEvents: 'none' }}
                >
                  {Math.round(stop.position * 100)}%
                </text>
              </g>
            );
          })}
        </svg>
      )}

      <button
        onPointerDown={(event) => {
          event.preventDefault();
          dragRef.current = { kind: 'center' };
        }}
        title="Drag gradient center"
        style={{
          position: 'absolute',
          left: centerX - 10,
          top: centerY - 10,
          width: 20,
          height: 20,
          borderRadius: 999,
          border: '2px solid #fff',
          background: 'rgba(31, 111, 235, 0.85)',
          boxShadow: '0 0 0 3px rgba(31,111,235,0.25)',
          cursor: 'move',
          pointerEvents: 'auto',
        }}
      />
    </div>
  );
};
