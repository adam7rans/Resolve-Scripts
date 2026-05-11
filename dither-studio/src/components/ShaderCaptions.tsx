/**
 * ShaderCaptions
 *
 * Renders the caption overlay through a WebGL2 fragment shader (sine-wave
 * displacement). Captions are drawn each frame to an offscreen 2D canvas via
 * `drawCaptionsToCanvas`, then uploaded as a texture by `CaptionShaderRenderer`.
 *
 * This path uses only baseline WebGL2 + 2D canvas APIs, so it works in every
 * modern browser — no Chrome Canary or experimental flags required. When the
 * shader is disabled, the component short-circuits to the plain DOM
 * `<Captions>` overlay so all the existing animations (underline progress,
 * highlight, etc.) keep working unchanged.
 */
import React, { useEffect, useRef } from 'react';
import { Captions } from './Captions';
import { CaptionShaderRenderer } from '../lib/CaptionShaderRenderer';
import { drawCaptionsToCanvas } from '../lib/captionCanvas';
import type { CaptionStyle, CaptionShaderParams } from '../lib/types';
import type { CaptionMode, TranscriptData } from '../lib/transcript';
import { DEFAULT_CAPTION_STYLE } from '../lib/types';

interface ShaderCaptionsProps {
  transcript: TranscriptData;
  mode: CaptionMode;
  style?: CaptionStyle;
  frame: { x: number; y: number; w: number; h: number };
  timeSourceRef: React.MutableRefObject<HTMLMediaElement | null>;
  shader: CaptionShaderParams;
  /** Optional playhead override in seconds (used during the outro) */
  playhead?: number;
  /** Opacity override (0..1) */
  opacity?: number;
  /** Media time (ms) at which the current playback run started (for caption fade-out). */
  playbackStartMs?: number;
}

export const ShaderCaptions: React.FC<ShaderCaptionsProps> = ({
  transcript, mode, style, frame, timeSourceRef, shader, playhead, opacity = 1, playbackStartMs,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<CaptionShaderRenderer | null>(null);
  // Mirror the latest props in refs so the RAF loop sees up-to-date values
  // without restarting (which would reset the shader's time origin).
  const shaderRef = useRef(shader);
  const styleRef = useRef(style);
  const modeRef = useRef(mode);
  const transcriptRef = useRef(transcript);
  const frameRef = useRef(frame);
  const playheadRef = useRef(playhead);
  const playbackStartMsRef = useRef(playbackStartMs);

  useEffect(() => { shaderRef.current = shader; }, [shader]);
  useEffect(() => { styleRef.current = style; }, [style]);
  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { transcriptRef.current = transcript; }, [transcript]);
  useEffect(() => { frameRef.current = frame; }, [frame]);
  useEffect(() => { playheadRef.current = playhead; }, [playhead]);
  useEffect(() => { playbackStartMsRef.current = playbackStartMs; }, [playbackStartMs]);

  // Initialize the WebGL renderer + offscreen 2D canvas once, when shader
  // becomes enabled. Tearing this down/up on every parameter change would
  // recompile the shader and reallocate the texture, which is wasteful and
  // would cause the wave time to reset visibly.
  useEffect(() => {
    if (!shader.enabled) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const r = new CaptionShaderRenderer(canvas);
    if (!r.isSupported()) {
      r.dispose();
      return;
    }
    rendererRef.current = r;
    offscreenRef.current = document.createElement('canvas');
    r.resize(frameRef.current.w, frameRef.current.h);

    let rafId = 0;
    const loop = () => {
      // Schedule the next frame BEFORE doing any risky work. If a transient
      // exception fires (e.g. a slider value momentarily lands on a NaN),
      // the loop keeps going instead of dying silently and leaving the
      // canvas blank until the user toggles Enabled off/on.
      rafId = requestAnimationFrame(loop);
      try {
        const renderer = rendererRef.current;
        const offscreen = offscreenRef.current;
        if (!renderer || !offscreen) return;
        const f = frameRef.current;
        const params = shaderRef.current;

        // Keep the offscreen canvas in sync with the displayed canvas size
        // so caption layout matches what the user sees.
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const bw = Math.max(1, Math.floor(f.w * dpr));
        const bh = Math.max(1, Math.floor(f.h * dpr));
        if (offscreen.width !== bw) offscreen.width = bw;
        if (offscreen.height !== bh) offscreen.height = bh;

        const ctx = offscreen.getContext('2d');
        if (!ctx) return;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, offscreen.width, offscreen.height);
        // Render in CSS-pixel coordinates (the existing caption canvas code
        // assumes that), then scale up for the device-pixel backing buffer.
        ctx.scale(dpr, dpr);
        let timeMs: number;
        if (playheadRef.current !== undefined) {
          timeMs = playheadRef.current * 1000;
        } else {
          const t = timeSourceRef.current;
          timeMs = t ? t.currentTime * 1000 : 0;
        }
        const effectiveStyle = styleRef.current ?? DEFAULT_CAPTION_STYLE;
        drawCaptionsToCanvas(
          ctx, transcriptRef.current, modeRef.current, timeMs, f.w, f.h, effectiveStyle, 1.0, playbackStartMsRef.current,
        );
        renderer.render(offscreen, params);
      } catch (err) {
        // Surface the underlying issue but never let it break the render loop.
        // eslint-disable-next-line no-console
        console.error('ShaderCaptions frame failed', err);
      }
    };
    rafId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafId);
      rendererRef.current?.dispose();
      rendererRef.current = null;
      offscreenRef.current = null;
    };
  }, [shader.enabled, timeSourceRef]);

  // Resize backing buffer when the frame changes (the loop reads frameRef
  // for the offscreen canvas, but the visible canvas needs an explicit
  // resize call so the WebGL viewport matches).
  useEffect(() => {
    rendererRef.current?.resize(frame.w, frame.h);
  }, [frame.w, frame.h]);

  if (!shader.enabled) {
    return (
      <Captions
        transcript={transcript}
        mode={mode}
        style={style}
        frame={frame}
        timeSourceRef={timeSourceRef}
        playhead={playhead}
        opacity={opacity}
        playbackStartMs={playbackStartMs}
      />
    );
  }

  const canvasStyle: React.CSSProperties = {
    position: 'absolute',
    left: frame.x,
    top: frame.y,
    width: frame.w,
    height: frame.h,
    pointerEvents: 'none',
    opacity,
  };
  return <canvas ref={canvasRef} style={canvasStyle} />;
};
