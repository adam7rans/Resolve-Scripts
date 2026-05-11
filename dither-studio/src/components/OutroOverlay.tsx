import React from 'react';

interface OutroOverlayProps {
  frame: { x: number; y: number; w: number; h: number };
  playhead: number;
  outroStart: number;
  outroDuration: number;
}

export const OutroOverlay: React.FC<OutroOverlayProps> = ({ frame, playhead, outroStart, outroDuration }) => {
  if (outroDuration <= 0 || playhead < outroStart) return null;

  const progress = Math.min(1, (playhead - outroStart) / outroDuration);
  
  // To cover the rectangle, the radius needs to reach the distance from center to corner
  const centerX = frame.w / 2;
  const centerY = frame.h / 2;
  const maxRadius = Math.sqrt(centerX * centerX + centerY * centerY);
  const radius = progress * maxRadius;

  const style: React.CSSProperties = {
    position: 'absolute',
    left: frame.x,
    top: frame.y,
    width: frame.w,
    height: frame.h,
    pointerEvents: 'none',
    overflow: 'hidden',
    zIndex: 100, // Ensure it's above captions
  };

  const circleStyle: React.CSSProperties = {
    position: 'absolute',
    left: centerX - radius,
    top: centerY - radius,
    width: radius * 2,
    height: radius * 2,
    borderRadius: '50%',
    backgroundColor: 'white',
    transition: 'none', // We manage the size directly
  };

  return (
    <div style={style}>
      <div style={circleStyle} />
    </div>
  );
};
