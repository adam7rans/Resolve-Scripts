/**
 * CaptionShaderRenderer
 *
 * Applies a WebGL2 fragment shader (sine-wave displacement) to a caption
 * overlay. The caller renders the captions into an offscreen 2D canvas via
 * `drawCaptionsToCanvas` and then passes that canvas to `render()`.
 *
 * This implementation intentionally avoids the experimental WICG
 * html-in-canvas APIs (`texElementImage2D` / `layoutsubtree`), so it runs in
 * every modern browser — Chrome stable, Safari, Firefox — without any flag.
 * The standard `gl.texImage2D(..., HTMLCanvasElement)` overload is used to
 * upload the captions texture each frame.
 */
import type { CaptionShaderParams } from './types';

/**
 * Always supported — the renderer only depends on baseline WebGL2 features.
 * Kept as a helper so callers can keep their existing capability checks.
 *
 * The result is cached: the first call creates a throwaway WebGL2 context to
 * verify availability, and subsequent calls return the cached boolean. This
 * matters because React components call this on every render, and Chrome
 * caps the number of live WebGL contexts (~16) — re-probing each render
 * would steal context slots from the background renderer and the caption
 * shader itself, eventually killing them mid-session.
 */
let cachedSupport: boolean | null = null;
export function isHtmlInCanvasSupported(): boolean {
  if (cachedSupport !== null) return cachedSupport;
  if (typeof document === 'undefined') return (cachedSupport = false);
  const probe = document.createElement('canvas');
  const gl = probe.getContext('webgl2');
  cachedSupport = !!gl;
  // Best-effort release of the throwaway context so it doesn't sit in the
  // browser's WebGL context budget for the rest of the session.
  if (gl) {
    const lose = gl.getExtension('WEBGL_lose_context');
    lose?.loseContext();
  }
  return cachedSupport;
}

const VERT_SRC = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  // Texture is top-down (canvas pixel order); WebGL is bottom-up. Flip Y so
  // the sampled UV matches the rendered HTML/canvas content.
  v_uv = vec2(a_pos.x * 0.5 + 0.5, 0.5 - a_pos.y * 0.5);
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FRAG_SRC = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_tex;
uniform float u_time;
uniform float u_speed;
uniform float u_freq;
uniform float u_amp;
uniform vec2  u_dir; // unit vector along wave propagation
out vec4 outColor;
void main() {
  float phase = dot(v_uv, u_dir) * u_freq * 6.2831853 + u_time * u_speed;
  vec2 perp = vec2(-u_dir.y, u_dir.x);
  vec2 disp = perp * sin(phase) * u_amp;
  vec2 uv = v_uv + disp;
  // Transparent outside [0,1] so the displaced edges fade out instead of
  // wrapping/repeating.
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    outColor = vec4(0.0);
    return;
  }
  outColor = texture(u_tex, uv);
}`;

export class CaptionShaderRenderer {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext | null = null;
  private prog: WebGLProgram | null = null;
  private texture: WebGLTexture | null = null;
  private vbo: WebGLBuffer | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private uTime: WebGLUniformLocation | null = null;
  private uSpeed: WebGLUniformLocation | null = null;
  private uFreq: WebGLUniformLocation | null = null;
  private uAmp: WebGLUniformLocation | null = null;
  private uDir: WebGLUniformLocation | null = null;
  private startMs = performance.now();
  private supported = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', { premultipliedAlpha: true, alpha: true });
    if (!gl) return;
    this.gl = gl;
    this.supported = true;
    this.initGl();
  }

  isSupported(): boolean {
    return this.supported;
  }

  /** Resize the backing buffer. CSS size is managed by the React component. */
  resize(widthPx: number, heightPx: number, forceDpr?: number) {
    if (!this.gl) return;
    const dpr = forceDpr ?? Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.floor(widthPx * dpr));
    const h = Math.max(1, Math.floor(heightPx * dpr));
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
    this.gl.viewport(0, 0, w, h);
  }

  dispose() {
    const gl = this.gl;
    if (!gl) return;
    if (this.vbo) gl.deleteBuffer(this.vbo);
    if (this.vao) gl.deleteVertexArray(this.vao);
    if (this.texture) gl.deleteTexture(this.texture);
    if (this.prog) gl.deleteProgram(this.prog);
    this.vbo = this.vao = null;
    this.texture = null;
    this.prog = null;
    this.gl = null;
  }

  /**
   * Upload the offscreen 2D canvas as a texture and draw the shader pass.
   * When `params.enabled` is false the canvas is just cleared so the overlay
   * disappears (the caller still owns the React fallback path).
   */
  render(sourceCanvas: HTMLCanvasElement, params: CaptionShaderParams, timeSeconds?: number) {
    const gl = this.gl;
    if (!gl || !this.prog || !this.texture) return;

    // When the shader is disabled we want a blank canvas (the React layer
    // also unmounts us, but this is a defensive fallback).
    if (!params.enabled) {
      gl.clear(gl.COLOR_BUFFER_BIT);
      return;
    }
    // If we can't draw a valid frame this tick, leave the previous frame on
    // screen instead of clearing — otherwise transient bad inputs (slider
    // mid-drag, zero-size source, NaN) would make captions blink out.
    if (
      sourceCanvas.width === 0 || sourceCanvas.height === 0 ||
      !Number.isFinite(params.speed) ||
      !Number.isFinite(params.frequency) ||
      !Number.isFinite(params.amplitude) ||
      !Number.isFinite(params.angleDeg)
    ) {
      return;
    }

    gl.clear(gl.COLOR_BUFFER_BIT);
    const tSec = timeSeconds !== undefined ? timeSeconds : (performance.now() - this.startMs) / 1000;
    const a = (params.angleDeg * Math.PI) / 180;
    const dirX = Math.cos(a);
    const dirY = Math.sin(a);

    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    // Standard WebGL upload from a 2D canvas — supported everywhere.
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sourceCanvas);

    if (this.uTime) gl.uniform1f(this.uTime, tSec);
    if (this.uSpeed) gl.uniform1f(this.uSpeed, params.speed);
    if (this.uFreq) gl.uniform1f(this.uFreq, params.frequency);
    if (this.uAmp) gl.uniform1f(this.uAmp, params.amplitude);
    if (this.uDir) gl.uniform2f(this.uDir, dirX, dirY);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }

  private initGl() {
    const gl = this.gl!;
    const vs = compileShader(gl, gl.VERTEX_SHADER, VERT_SRC);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.bindAttribLocation(prog, 0, 'a_pos');
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error('CaptionShader link failed: ' + gl.getProgramInfoLog(prog));
    }
    this.prog = prog;
    this.uTime = gl.getUniformLocation(prog, 'u_time');
    this.uSpeed = gl.getUniformLocation(prog, 'u_speed');
    this.uFreq = gl.getUniformLocation(prog, 'u_freq');
    this.uAmp = gl.getUniformLocation(prog, 'u_amp');
    this.uDir = gl.getUniformLocation(prog, 'u_dir');

    this.vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
       1,  1,
    ]), gl.STATIC_DRAW);
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);
  }
}

function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error('shader compile failed: ' + log);
  }
  return sh;
}
