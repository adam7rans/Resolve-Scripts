import React from 'react';
import { clamp, fmt, type DragKind } from './timelineUtils';

interface SkipGap { startMs: number; endMs: number; key: string; kind?: 'silence' | 'custom'; label?: string }

// Color palette: silence = orange, custom/filler = green
const SILENCE_COLOR = '255,180,80';
const CUSTOM_COLOR = '48,209,88';

function gapBaseColor(g: SkipGap): string {
  return g.kind === 'custom' ? CUSTOM_COLOR : SILENCE_COLOR;
}

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
    {/* skip gaps (silence + custom/filler cuts) */}
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
      const baseCol = gapBaseColor(g);
      const stripeColor = isDisabled ? '140,140,140' : isOverridden ? '120,200,255' : baseCol;
      const baseAlpha = isDisabled ? 0.18 : (isHover || isDraggingThis || isSelected) ? 0.5 : 0.28;
      const handleColor = isDisabled
        ? 'rgba(140,140,140,0.6)'
        : isOverridden ? 'rgba(120,200,255,0.95)' : `rgba(${baseCol},0.9)`;
      const isCustom = g.kind === 'custom';
      const typeLabel = isCustom ? 'Filler cut' : 'Skip silence';
      const handleLabel = isCustom ? 'Filler-cut' : 'Skip-silence';
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
              `${typeLabel}: ${fmt(startSec)} – ${fmt(endSec)} (${(g.endMs - g.startMs).toFixed(0)}ms)` +
              (g.label ? `\n"${g.label}"` : '') +
              (isDisabled ? '\nDisabled — selected + Delete to restore' : '') +
              (isOverridden ? '\nEdited — right-click to reset' : '\nDrag the edges to adjust')
            }
            style={{
              position: 'absolute',
              left: `${l}%`,
              width: `${r - l}%`,
              top: '25%', bottom: '25%',
              background: isCustom
                ? `repeating-linear-gradient(-45deg, rgba(${stripeColor},${baseAlpha}) 0 3px, rgba(8,20,8,${isDisabled ? 0.3 : 0.55}) 3px 6px)`
                : `repeating-linear-gradient(45deg, rgba(${stripeColor},${baseAlpha}) 0 4px, rgba(20,12,0,${isDisabled ? 0.3 : 0.55}) 4px 8px)`,
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
                title={`${handleLabel} start: ${fmt(startSec)} — drag to adjust`}
                style={{
                  position: 'absolute',
                  left: `calc(${l}% - 3px)`,
                  top: '20%', bottom: '20%', width: 6,
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
                title={`${handleLabel} end: ${fmt(endSec)} — drag to adjust`}
                style={{
                  position: 'absolute',
                  left: `calc(${r}% - 3px)`,
                  top: '20%', bottom: '20%', width: 6,
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
      const baseCol = gapBaseColor(g);
      const stripeColor = isOverridden ? '120,200,255' : baseCol;
      return (
        <div
          key={`eff-${g.key}`}
          title={`Effective skip: ${fmt(startSec)} – ${fmt(endSec)}`}
          style={{
            position: 'absolute',
            left: `${l}%`,
            width: `${r - l}%`,
            top: '35%', bottom: '35%',
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
