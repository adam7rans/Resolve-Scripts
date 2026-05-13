import React from 'react';
import { clamp, fmt, type DragKind } from './timelineUtils';

interface SkipGap { startMs: number; endMs: number; key: string }

interface Props {
  skipGaps: SkipGap[];
  skipGapsEffective: SkipGap[];
  skipGapOverrides: Record<string, { startMs: number; endMs: number }>;
  skipGapDisabled: Record<string, true>;
  selectedGapKey: string | null;
  hoverGapKey: string | null;
  onHoverGap: (key: string | null) => void;
  dragKind: DragKind;
  secToPct: (t: number) => number;
  timeAtClientX: (clientX: number) => number;
  onSelectGap: ((key: string | null) => void) | undefined;
  onPlayheadChange: (playhead: number) => void;
  startDrag: (kind: Exclude<DragKind, null | 'scroll'>) => (e: React.PointerEvent) => void;
  onResetSkipGap: ((key: string) => void) | undefined;
}

export const SkipGapOverlay: React.FC<Props> = ({
  skipGaps, skipGapsEffective, skipGapOverrides, skipGapDisabled,
  selectedGapKey, hoverGapKey, onHoverGap, dragKind,
  secToPct, timeAtClientX, onSelectGap, onPlayheadChange, startDrag, onResetSkipGap,
}) => (
  <>
    {/* skip-silence gaps (jump cuts) */}
    {skipGaps.map((g) => {
      const startSec = g.startMs / 1000;
      const endSec = g.endMs / 1000;
      const l = clamp(secToPct(startSec), 0, 100);
      const r = clamp(secToPct(endSec), 0, 100);
      if (r <= l) return null;
      const isOverridden = !!skipGapOverrides[g.key];
      const isDisabled = !!skipGapDisabled[g.key];
      const isSelected = selectedGapKey === g.key;
      const isHover = hoverGapKey === g.key;
      const isDraggingThis = !!dragKind && typeof dragKind === 'object'
        && (dragKind.kind === 'gap-start' || dragKind.kind === 'gap-end')
        && dragKind.key === g.key;
      const stripeColor = isDisabled ? '140,140,140' : isOverridden ? '120,200,255' : '255,180,80';
      const baseAlpha = isDisabled ? 0.18 : (isHover || isDraggingThis || isSelected) ? 0.5 : 0.28;
      const handleColor = isDisabled
        ? 'rgba(140,140,140,0.6)'
        : isOverridden ? 'rgba(120,200,255,0.95)' : 'rgba(255,180,80,0.9)';
      return (
        <React.Fragment key={`gap-${g.key}`}>
          <div
            onPointerEnter={() => onHoverGap(g.key)}
            onPointerLeave={() => onHoverGap(null)}
            onContextMenu={(e) => {
              if (isOverridden && onResetSkipGap) {
                e.preventDefault();
                e.stopPropagation();
                onResetSkipGap(g.key);
              }
            }}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              e.stopPropagation();
              onSelectGap?.(g.key);
              onPlayheadChange(timeAtClientX(e.clientX));
              startDrag('play')(e);
            }}
            title={
              `Skip silence: ${fmt(startSec)} – ${fmt(endSec)} (${(g.endMs - g.startMs).toFixed(0)}ms)` +
              (isDisabled ? '\nDisabled — selected + Delete to restore' : '') +
              (isOverridden ? '\nEdited — right-click to reset' : '\nDrag the edges to adjust')
            }
            style={{
              position: 'absolute',
              left: `${l}%`,
              width: `${r - l}%`,
              top: 0, bottom: 0,
              background:
                `repeating-linear-gradient(45deg, rgba(${stripeColor},${baseAlpha}) 0 4px, rgba(20,12,0,${isDisabled ? 0.3 : 0.55}) 4px 8px)`,
              borderLeft: `1px solid rgba(${stripeColor},${isDisabled ? 0.4 : 0.6})`,
              borderRight: `1px solid rgba(${stripeColor},${isDisabled ? 0.4 : 0.6})`,
              outline: isSelected ? `2px solid rgba(${stripeColor},1)` : 'none',
              outlineOffset: -1,
              boxShadow: isSelected ? `0 0 6px rgba(${stripeColor},0.7)` : undefined,
              opacity: isDisabled && !isSelected ? 0.55 : 1,
              cursor: 'pointer',
              zIndex: isSelected ? 5 : 4,
            }}
          />
          {/* edge handles (hidden on disabled gaps) */}
          {!isDisabled && (
            <>
              <div
                onPointerDown={(e) => { e.stopPropagation(); onSelectGap?.(g.key); startDrag({ kind: 'gap-start', key: g.key })(e); }}
                onPointerEnter={() => onHoverGap(g.key)}
                title={`Skip-silence start: ${fmt(startSec)} — drag to adjust`}
                style={{
                  position: 'absolute',
                  left: `calc(${l}% - 3px)`,
                  top: -2, bottom: -2, width: 6,
                  background: handleColor,
                  borderRadius: 2,
                  cursor: 'ew-resize',
                  opacity: (isHover || isDraggingThis || isSelected) ? 1 : 0.55,
                  zIndex: 6,
                }}
              />
              <div
                onPointerDown={(e) => { e.stopPropagation(); onSelectGap?.(g.key); startDrag({ kind: 'gap-end', key: g.key })(e); }}
                onPointerEnter={() => onHoverGap(g.key)}
                title={`Skip-silence end: ${fmt(endSec)} — drag to adjust`}
                style={{
                  position: 'absolute',
                  left: `calc(${r}% - 3px)`,
                  top: -2, bottom: -2, width: 6,
                  background: handleColor,
                  borderRadius: 2,
                  cursor: 'ew-resize',
                  opacity: (isHover || isDraggingThis || isSelected) ? 1 : 0.55,
                  zIndex: 6,
                }}
              />
            </>
          )}
        </React.Fragment>
      );
    })}

    {/* effective skip zones (after padding) — bright solid inner stripe */}
    {skipGapsEffective.map((g) => {
      if (skipGapDisabled[g.key]) return null;
      const startSec = g.startMs / 1000;
      const endSec = g.endMs / 1000;
      const l = clamp(secToPct(startSec), 0, 100);
      const r = clamp(secToPct(endSec), 0, 100);
      if (r <= l) return null;
      const isOverridden = !!skipGapOverrides[g.key];
      const stripeColor = isOverridden ? '120,200,255' : '255,180,80';
      return (
        <div
          key={`eff-${g.key}`}
          title={`Effective skip: ${fmt(startSec)} – ${fmt(endSec)}`}
          style={{
            position: 'absolute',
            left: `${l}%`,
            width: `${r - l}%`,
            top: '30%', bottom: '30%',
            background: `rgba(${stripeColor},0.55)`,
            borderRadius: 2,
            pointerEvents: 'none',
            zIndex: 4,
          }}
        />
      );
    })}
  </>
);
