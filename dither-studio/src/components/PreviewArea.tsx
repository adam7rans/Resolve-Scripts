import React from 'react';
import type { CaptionMode, TranscriptData } from '../lib/transcript';
import type { CaptionStyle, CaptionShaderParams, ExportParams } from '../lib/types';
import { resolveExportRange, guideRectInVideoFrame } from '../lib/layoutUtils';
import type { GUIDES } from '../lib/constants';
import { ShaderCaptions } from './ShaderCaptions';
import { OutroOverlay } from './OutroOverlay';
import { StatusToast, type Toast } from './StatusToast';

interface Props {
  previewWrapRef: React.Ref<HTMLDivElement>;
  bgCanvasRef: React.Ref<HTMLCanvasElement>;
  videoCanvasRef: React.Ref<HTMLCanvasElement>;
  frameStyle: React.CSSProperties;
  bgLayerOn: boolean;
  bgOffMode: 'grid' | 'color';
  bgOffColor: string;
  videoLayerOn: boolean;
  captionsLayerOn: boolean;
  audioMode: boolean;
  activeGuide: string | null;
  cropToGuide: boolean;
  availableGuides: readonly { key: string; w: number; h: number; label: string }[];
  previewFrame: { x: number; y: number; w: number; h: number };
  videoInfo: { name: string; duration: number; w: number; h: number } | null;
  audioInfo: { name: string; duration: number } | null;
  transcript: TranscriptData | null;
  captionMode: CaptionMode;
  captionStyle: CaptionStyle;
  captionShader: CaptionShaderParams;
  mediaElRef: React.MutableRefObject<HTMLMediaElement | null>;
  playheadSecond: number;
  playbackStartMs: number | undefined;
  activeExportParams: ExportParams;
  toasts: Toast[];
  onDismissToast: (id: number) => void;
  onDrop: React.DragEventHandler<HTMLDivElement>;
}

export const PreviewArea: React.FC<Props> = ({
  previewWrapRef, bgCanvasRef, videoCanvasRef, frameStyle,
  bgLayerOn, bgOffMode, bgOffColor, videoLayerOn, captionsLayerOn, audioMode,
  activeGuide, cropToGuide, availableGuides, previewFrame,
  videoInfo, audioInfo, transcript,
  captionMode, captionStyle, captionShader,
  mediaElRef, playheadSecond, playbackStartMs,
  activeExportParams, toasts, onDismissToast, onDrop,
}) => (
  <div
    ref={previewWrapRef}
    style={{
      position: 'relative',
      flex: 1,
      background: bgLayerOn
        ? '#000'
        : bgOffMode === 'color'
          ? bgOffColor
          : `repeating-conic-gradient(#1a1a1a 0 25%, #2a2a2a 0 50%) 50% / 20px 20px`,
      overflow: 'hidden',
      minHeight: 0,
    }}
  >
    <canvas
      ref={bgCanvasRef}
      style={{ ...frameStyle, display: bgLayerOn ? 'block' : 'none' }}
    />
    <canvas
      ref={videoCanvasRef}
      style={{ ...frameStyle, display: videoLayerOn && !audioMode ? 'block' : 'none' }}
    />

    {/* composition guide outline (only the active one) */}
    {(() => {
      const g = availableGuides.find((x) => x.key === activeGuide);
      if (!g) return null;
      const r = guideRectInVideoFrame(previewFrame, videoInfo, g);
      return (
        <div
          key={g.key}
          style={{
            position: 'absolute', left: r.x, top: r.y, width: r.w, height: r.h,
            border: '1px solid #1f6feb', boxShadow: '0 0 0 1px rgba(0,0,0,0.5)',
            pointerEvents: 'none',
          }}
        >
          <div style={{
            position: 'absolute', top: -18, left: 0,
            fontSize: 10, color: '#1f6feb', background: 'rgba(0,0,0,0.6)',
            padding: '1px 5px', borderRadius: 2, letterSpacing: 0.5,
          }}>{g.label}</div>
        </div>
      );
    })()}

    {/* crop mask: black-out everything outside the active guide */}
    {cropToGuide && (() => {
      const active = availableGuides.find((g) => g.key === activeGuide);
      if (!active) return null;
      const r = guideRectInVideoFrame(previewFrame, videoInfo, active);
      const mask = '#000';
      return (
        <>
          <div style={{ position: 'absolute', left: 0, top: 0, right: 0, height: r.y, background: mask, pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', left: 0, top: r.y + r.h, right: 0, bottom: 0, background: mask, pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', left: 0, top: r.y, width: r.x, height: r.h, background: mask, pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', left: r.x + r.w, top: r.y, right: 0, height: r.h, background: mask, pointerEvents: 'none' }} />
        </>
      );
    })()}

    {/* captions overlay */}
    {captionsLayerOn && transcript && (() => {
      const guide = cropToGuide
        ? availableGuides.find((g) => g.key === activeGuide)
        : undefined;
      const captionFrame = guide
        ? guideRectInVideoFrame(previewFrame, videoInfo, guide)
        : previewFrame;

      let capOpacity = 1;
      const { end, outroDuration } = resolveExportRange(activeExportParams, videoInfo?.duration ?? audioInfo?.duration ?? null);
      if (outroDuration > 0 && playheadSecond > end) {
        const outroElapsed = playheadSecond - end;
        const fadeTargetSec = 3;
        capOpacity = Math.max(0, 1 - outroElapsed / fadeTargetSec);
      }

      return (
        <ShaderCaptions
          transcript={transcript}
          mode={captionMode}
          style={captionStyle}
          frame={captionFrame}
          timeSourceRef={mediaElRef}
          shader={captionShader}
          playhead={playheadSecond}
          opacity={capOpacity}
          playbackStartMs={playbackStartMs}
        />
      );
    })()}

    {/* outro transition overlay */}
    {activeExportParams.outroEnabled && (() => {
      const { end, outroDuration } = resolveExportRange(activeExportParams, videoInfo?.duration ?? audioInfo?.duration ?? null);
      const guide = cropToGuide
        ? availableGuides.find((g) => g.key === activeGuide)
        : undefined;
      const overlayFrame = guide && videoInfo
        ? guideRectInVideoFrame(previewFrame, videoInfo, guide)
        : previewFrame;
      return (
        <OutroOverlay
          frame={overlayFrame}
          playhead={playheadSecond}
          outroStart={end}
          outroDuration={outroDuration}
        />
      );
    })()}

    {/* status toasts */}
    <StatusToast toasts={toasts} onDismiss={onDismissToast} />

    {!videoInfo && !audioInfo && (
      <div
        onDrop={onDrop}
        onDragOver={(e) => e.preventDefault()}
        style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#888', flexDirection: 'column', gap: 12,
          background: 'rgba(0,0,0,0.35)',
        }}
      >
        <div>No media loaded.</div>
        <div style={{ fontSize: 11 }}>Drop a video or audio file here or use the panel on the right.</div>
      </div>
    )}
  </div>
);
