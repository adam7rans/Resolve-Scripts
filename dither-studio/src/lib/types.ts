import type { NoiseType } from '../shaders/backgroundShader';
import type { DitherType } from '../shaders/ditherShader';

export interface DitherParams {
  enabled: boolean;
  ditherType: DitherType;
  ditherScale: number;
  contrast: number;     // tone curve on the gradient ramp t
  brightness: number;
  threshold: number;    // for THRESHOLD dither type
  levels: number;       // quantization levels (>=2)
  colorA: string;       // hex, gradient endpoint A
  colorB: string;       // hex, gradient endpoint B
}

export interface VideoGradientStop {
  id: string;
  color: string;
  opacity: number;
  position: number;
}

export const MAX_VIDEO_GRADIENT_STOPS = 6;

// All uniforms of src/shaders/videoShader.ts (dancingVideoShader on the site).
// This single shader does levels/tone/color/distortion/dither in one pass.
export interface VideoShaderParams {
  // pre-shader gradient overlay (composited onto video before all processing)
  gradientEnabled: boolean;
  gradientType: number;              // 0 = linear, 1 = radial
  gradientStops: VideoGradientStop[];
  gradientGuideVisible: boolean;
  gradientColorA: string;            // hex
  gradientOpacityA: number;          // per-color opacity for A (0..1)
  gradientColorB: string;            // hex
  gradientOpacityB: number;          // per-color opacity for B (0..1)
  gradientOpacity: number;           // master blend strength 0..1
  gradientBlendMode: number;         // 0 = normal, 1 = multiply, 2 = screen, 3 = overlay
  gradientAngle: number;             // direction in radians (linear only)
  gradientScale: number;             // spread
  gradientOffsetX: number;           // center shift (-1..1)
  gradientOffsetY: number;           // center shift (-1..1)
  // shader bypass (when false, only gradient + position apply — no levels/tone/color/dither)
  shaderEnabled: boolean;
  // levels
  blackPoint: number;
  whitePoint: number;
  brightness: number;
  contrast: number;
  // tone
  shadows: number;
  midtones: number;
  highlights: number;
  // color
  exposure: number;
  gamma: number;
  saturation: number;
  clarity: number;
  // rez / pixelation
  rezEnabled: boolean;
  rezCellWidth: number;
  rezCellHeight: number;
  rezColorLevels: number;
  rezMix: number;
  rezJitter: number;
  // position
  positionX: number;         // horizontal offset in UV (-1..1)
  positionY: number;         // vertical offset in UV (-1..1)
  positionRotation: number;  // rotation in radians (0..2π)
  // distortion (UV)
  rotation: number;          // radians
  scale: number;             // uniform scale
  distortionFrequency: number;
  distortionAmplitude: number;
  distortionSpeed: number;
  distortionAngle: number;   // radians
  // dither
  ditherEnabled: boolean;
  ditherType: number;        // matches DITHER_TYPES indices
  ditherScale: number;
  threshold: number;
  alphaThreshold: number;
  ditherGradient: boolean;          // false = single flat color, true = spatial gradient
  ditherColor: string;              // hex — flat color when ditherGradient is false
  ditherGradientColorA: string;     // hex — gradient start
  ditherGradientColorB: string;     // hex — gradient end
  ditherGradientAngle: number;      // gradient direction in radians
  ditherGradientScale: number;      // gradient spread (higher = tighter)
  ditherGradientOffsetX: number;    // gradient center horizontal shift (-1..1)
  ditherGradientOffsetY: number;    // gradient center vertical shift (-1..1)
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function clampGradientScale(value: number): number {
  return Math.max(0.1, Math.min(5, value));
}

function makeGradientStop(index: number, color: string, opacity: number, position: number): VideoGradientStop {
  return {
    id: `stop-${index + 1}`,
    color,
    opacity: clamp01(opacity),
    position: clamp01(position),
  };
}

export function createDefaultVideoGradientStops(
  colorA = '#000000',
  opacityA = 1,
  colorB = '#ffffff',
  opacityB = 1,
): VideoGradientStop[] {
  return [
    makeGradientStop(0, colorA, opacityA, 0),
    makeGradientStop(1, colorB, opacityB, 1),
  ];
}

export function normalizeVideoGradientStops(
  stops: VideoGradientStop[] | undefined,
  fallbackA = '#000000',
  fallbackOpacityA = 1,
  fallbackB = '#ffffff',
  fallbackOpacityB = 1,
): VideoGradientStop[] {
  const source = Array.isArray(stops) && stops.length > 0
    ? stops
    : createDefaultVideoGradientStops(fallbackA, fallbackOpacityA, fallbackB, fallbackOpacityB);

  const normalized = source
    .slice(0, MAX_VIDEO_GRADIENT_STOPS)
    .map((stop, index) => ({
      id: typeof stop?.id === 'string' && stop.id.length > 0 ? stop.id : `stop-${index + 1}`,
      color: typeof stop?.color === 'string' && stop.color.length > 0 ? stop.color : index === 0 ? fallbackA : fallbackB,
      opacity: clamp01(typeof stop?.opacity === 'number' ? stop.opacity : index === 0 ? fallbackOpacityA : fallbackOpacityB),
      position: clamp01(typeof stop?.position === 'number' ? stop.position : index === 0 ? 0 : 1),
    }))
    .sort((a, b) => a.position - b.position)
    .map((stop, index) => ({ ...stop, id: stop.id || `stop-${index + 1}` }));

  if (normalized.length === 1) {
    normalized.push(makeGradientStop(1, fallbackB, fallbackOpacityB, 1));
  }

  normalized[0] = { ...normalized[0], position: 0 };
  normalized[normalized.length - 1] = { ...normalized[normalized.length - 1], position: 1 };
  return normalized;
}

export function withGradientStops(
  params: VideoShaderParams,
  stops: VideoGradientStop[],
): VideoShaderParams {
  const normalizedStops = normalizeVideoGradientStops(
    stops,
    params.gradientColorA,
    params.gradientOpacityA,
    params.gradientColorB,
    params.gradientOpacityB,
  );
  const firstStop = normalizedStops[0];
  const lastStop = normalizedStops[normalizedStops.length - 1];
  return {
    ...params,
    gradientStops: normalizedStops,
    gradientColorA: firstStop.color,
    gradientOpacityA: firstStop.opacity,
    gradientColorB: lastStop.color,
    gradientOpacityB: lastStop.opacity,
  };
}

export interface BackgroundParams {
  noiseType: NoiseType;
  complexity: number;
  speed: number;
  scale: number;
  warp: number;
  contrast: number;
  bias: number;
  rotation: number;       // degrees
  autoRotate: boolean;
  autoRotateSpeed: number; // deg/s
  colorA: string;
  colorB: string;
}

export interface AudioReactivityParams {
  enabled: boolean;
  /** smoothing factor — higher = more responsive (0..1) */
  attack: number;
  /** release factor — higher = decays faster (0..1) */
  release: number;
  /** master gain on all band signals */
  gain: number;
  /** how much RMS modulates background u_speed (0..1) */
  modSpeed: number;
  /** how much RMS modulates background brightness (0..2 multiplier delta) */
  modBrightness: number;
}

export interface ExportParams {
  width: number;
  height: number;
  fps: number;
  duration: number;        // seconds (background) — fallback when endSecond is absent
  filenamePrefix: string;
  exportMode?: 'master' | 'web';
  invertFinalOutput?: boolean;
  startSecond: number;     // start time offset (seconds)
  endSecond?: number;      // end time (seconds) — when absent, uses startSecond + duration
  outroEnabled?: boolean;  // 5s frozen-frame outro
}

export interface CaptionStyle {
  fontFamily: string;
  lineFontSize: number;
  wordFontSize: number;
  fontWeight: number;
  letterSpacing: number;
  lineHeight: number;
  horizontalPosition: number;
  verticalPosition: number;
  /** Max width of line-mode caption box, as a percentage of the frame width (0-100). */
  lineMaxWidth: number;
  textAlign: 'left' | 'center' | 'right';
  /**
   * Underline animation under the active word in line mode.
   *  - 'off'  : never draw the underline
   *  - 'draw' : karaoke-style left-to-right wipe over the word's duration
   *  - 'fade' : full-width underline that fades in/out (~150 ms each side)
   *
   * `underlineEnabled` is the legacy boolean kept only so old saved projects
   * still load — the renderer prefers `underlineMode` when present.
   */
  underlineMode: 'off' | 'draw' | 'fade';
  /** @deprecated use `underlineMode` instead */
  underlineEnabled?: boolean;
  /**
   * Fade-in / fade-out duration (ms) used by the 'fade' underline mode.
   * 0 = instant pop, 300 = slow ease.
   */
  underlineFadeMs: number;
  wordHighlightEnabled: boolean;
  /**
   * How to chop transcript words into "lines" for line-mode captions.
   *  - 'sentence' : split on `.`, `!`, `?` (one whole sentence per showing)
   *  - 'words'    : flush every `lineMaxWords` words (ignores punctuation)
   *  - 'chars'    : flush when adding the next word would exceed `lineMaxChars`
   *  - 'duration' : flush when the buffered words span >= `lineMaxSeconds`
   *  - 'balanced' : sentence-aware. Per sentence, split into
   *                 `ceil(sentenceWords / lineTargetWords)` evenly-sized chunks.
   *                 A new caption never spans two sentences.
   */
  lineSplitMode: 'sentence' | 'words' | 'chars' | 'duration' | 'balanced';
  /** Max words per line in 'words' mode. */
  lineMaxWords: number;
  /** Max characters per line in 'chars' mode (counted including spaces). */
  lineMaxChars: number;
  /** Max duration in seconds per line in 'duration' mode. */
  lineMaxSeconds: number;
  /** Target words per caption showing in 'balanced' mode. */
  lineTargetWords: number;
  color: string;
  dimColor: string;
  /** Opacity (0..1) applied to `color` (active / highlighted state). */
  colorOpacity?: number;
  /** Opacity (0..1) applied to `dimColor` (non-active state). */
  dimColorOpacity?: number;
  /** Drop-shadow behind caption text. Default `true` keeps the legacy look. */
  shadowEnabled?: boolean;
}

// Defaults match the DARK_PRESET used by w3rk17 (src/lib/three-presets.ts)
// so the live look is reproduced 1:1 on first load.
export const DEFAULT_BACKGROUND: BackgroundParams = {
  noiseType: 'simplex',
  complexity: 2,
  speed: 0.22,
  scale: 0.29,
  warp: 0.34,
  contrast: 2.33,
  bias: 0.20,
  rotation: -46,
  autoRotate: true,
  autoRotateSpeed: -3.8,
  colorA: '#16120f',
  colorB: '#73809C',
};

export const DEFAULT_DITHER: DitherParams = {
  enabled: true,
  ditherType: 4, // BLUE_NOISE
  ditherScale: 0.25,
  contrast: 1.0,
  brightness: 1.0,
  threshold: 0.5,
  levels: 2,
  // dither pass uses the same gradient endpoints as the background
  colorA: '#16120f',
  colorB: '#73809C',
};

// Default = "Tight Focus V2" preset from
// w3rk17/src/components/audio-transcript/DitherModeSelector.tsx
// (the preset the talking video uses on the live site).
export const DEFAULT_VIDEO: VideoShaderParams = {
  gradientEnabled: false,
  gradientType: 0,
  gradientStops: createDefaultVideoGradientStops('#000000', 1, '#ffffff', 1),
  gradientGuideVisible: false,
  gradientColorA: '#000000',
  gradientOpacityA: 1,
  gradientColorB: '#ffffff',
  gradientOpacityB: 1,
  gradientOpacity: 1,
  gradientBlendMode: 1,    // multiply
  gradientAngle: 0,
  gradientScale: 1,
  gradientOffsetX: 0,
  gradientOffsetY: 0,
  shaderEnabled: true,
  blackPoint: 0.0,
  whitePoint: 1.0,
  brightness: 0.8,
  contrast: 0.9,
  shadows: 0.0,
  midtones: 0.0,
  highlights: 0.0,
  exposure: 0.0,
  gamma: 1.0,
  saturation: 1.0,
  clarity: 0.0,
  rezEnabled: false,
  rezCellWidth: 8,
  rezCellHeight: 8,
  rezColorLevels: 24,
  rezMix: 1,
  rezJitter: 0,
  positionX: 0,
  positionY: 0,
  positionRotation: 0,
  rotation: 0.0,
  scale: 1.0,
  distortionFrequency: 82,
  distortionAmplitude: 0.005,
  distortionSpeed: 1.7,
  distortionAngle: 1,
  ditherEnabled: true,
  ditherType: 8,         // ATKINSON
  ditherScale: 1.1,
  threshold: 1,
  alphaThreshold: 0.95,
  ditherGradient: true,
  ditherColor: '#ffffff',
  ditherGradientColorA: '#5754ff',
  ditherGradientColorB: '#666eae',
  ditherGradientAngle: 0,
  ditherGradientScale: 1,
  ditherGradientOffsetX: 0,
  ditherGradientOffsetY: 0,
};

export const DEFAULT_VIDEO_GRADIENT: Partial<VideoShaderParams> = {
  gradientEnabled: DEFAULT_VIDEO.gradientEnabled,
  gradientType: DEFAULT_VIDEO.gradientType,
  gradientStops: DEFAULT_VIDEO.gradientStops.map((stop) => ({ ...stop })),
  gradientGuideVisible: DEFAULT_VIDEO.gradientGuideVisible,
  gradientColorA: DEFAULT_VIDEO.gradientColorA,
  gradientOpacityA: DEFAULT_VIDEO.gradientOpacityA,
  gradientColorB: DEFAULT_VIDEO.gradientColorB,
  gradientOpacityB: DEFAULT_VIDEO.gradientOpacityB,
  gradientOpacity: DEFAULT_VIDEO.gradientOpacity,
  gradientBlendMode: DEFAULT_VIDEO.gradientBlendMode,
  gradientAngle: DEFAULT_VIDEO.gradientAngle,
  gradientScale: DEFAULT_VIDEO.gradientScale,
  gradientOffsetX: DEFAULT_VIDEO.gradientOffsetX,
  gradientOffsetY: DEFAULT_VIDEO.gradientOffsetY,
};

export function normalizeVideoShaderParams(input?: Partial<VideoShaderParams> | null): VideoShaderParams {
  const merged = { ...DEFAULT_VIDEO, ...(input ?? {}) };
  const normalizedStops = normalizeVideoGradientStops(
    input?.gradientStops,
    merged.gradientColorA,
    merged.gradientOpacityA,
    merged.gradientColorB,
    merged.gradientOpacityB,
  );
  const withStops = withGradientStops(merged, normalizedStops);
  return {
    ...withStops,
    gradientGuideVisible: typeof input?.gradientGuideVisible === 'boolean'
      ? input.gradientGuideVisible
      : DEFAULT_VIDEO.gradientGuideVisible,
    gradientScale: clampGradientScale(withStops.gradientScale),
  };
}

export const DEFAULT_VIDEO_LEVELS: Partial<VideoShaderParams> = {
  blackPoint: DEFAULT_VIDEO.blackPoint,
  whitePoint: DEFAULT_VIDEO.whitePoint,
  brightness: DEFAULT_VIDEO.brightness,
  contrast: DEFAULT_VIDEO.contrast,
};

export const DEFAULT_VIDEO_TONE: Partial<VideoShaderParams> = {
  shadows: DEFAULT_VIDEO.shadows,
  midtones: DEFAULT_VIDEO.midtones,
  highlights: DEFAULT_VIDEO.highlights,
};

export const DEFAULT_VIDEO_COLOR: Partial<VideoShaderParams> = {
  exposure: DEFAULT_VIDEO.exposure,
  gamma: DEFAULT_VIDEO.gamma,
  saturation: DEFAULT_VIDEO.saturation,
  clarity: DEFAULT_VIDEO.clarity,
};

export const DEFAULT_VIDEO_POSITION: Partial<VideoShaderParams> = {
  positionX: DEFAULT_VIDEO.positionX,
  positionY: DEFAULT_VIDEO.positionY,
  positionRotation: DEFAULT_VIDEO.positionRotation,
};

export const DEFAULT_VIDEO_REZ: Partial<VideoShaderParams> = {
  rezEnabled: DEFAULT_VIDEO.rezEnabled,
  rezCellWidth: DEFAULT_VIDEO.rezCellWidth,
  rezCellHeight: DEFAULT_VIDEO.rezCellHeight,
  rezColorLevels: DEFAULT_VIDEO.rezColorLevels,
  rezMix: DEFAULT_VIDEO.rezMix,
  rezJitter: DEFAULT_VIDEO.rezJitter,
};

export const DEFAULT_VIDEO_DISTORTION: Partial<VideoShaderParams> = {
  rotation: DEFAULT_VIDEO.rotation,
  scale: DEFAULT_VIDEO.scale,
  distortionFrequency: DEFAULT_VIDEO.distortionFrequency,
  distortionAmplitude: DEFAULT_VIDEO.distortionAmplitude,
  distortionSpeed: DEFAULT_VIDEO.distortionSpeed,
  distortionAngle: DEFAULT_VIDEO.distortionAngle,
};

export const DEFAULT_VIDEO_DITHER: Partial<VideoShaderParams> = {
  ditherEnabled: DEFAULT_VIDEO.ditherEnabled,
  ditherType: DEFAULT_VIDEO.ditherType,
  ditherScale: DEFAULT_VIDEO.ditherScale,
  threshold: DEFAULT_VIDEO.threshold,
  alphaThreshold: DEFAULT_VIDEO.alphaThreshold,
  ditherGradient: DEFAULT_VIDEO.ditherGradient,
  ditherColor: DEFAULT_VIDEO.ditherColor,
  ditherGradientColorA: DEFAULT_VIDEO.ditherGradientColorA,
  ditherGradientColorB: DEFAULT_VIDEO.ditherGradientColorB,
  ditherGradientAngle: DEFAULT_VIDEO.ditherGradientAngle,
  ditherGradientScale: DEFAULT_VIDEO.ditherGradientScale,
  ditherGradientOffsetX: DEFAULT_VIDEO.ditherGradientOffsetX,
  ditherGradientOffsetY: DEFAULT_VIDEO.ditherGradientOffsetY,
};

export interface MicroTimeline {
  id: string;
  name: string;
  startSecond: number;
  endSecond: number;
  color: string;
}

export const MICRO_TIMELINE_COLORS = [
  '#1f6feb', '#30d158', '#eb6f1f', '#ff453a',
  '#bf5af2', '#ffd60a', '#64d2ff',
];

export const DEFAULT_EXPORT: ExportParams = {
  width: 1920,
  height: 1080,
  fps: 30,
  duration: 10,
  filenamePrefix: 'dither',
  exportMode: 'master',
  invertFinalOutput: false,
  startSecond: 0,
  endSecond: 10,
  outroEnabled: false,
};

export const DEFAULT_AUDIO_REACTIVITY: AudioReactivityParams = {
  enabled: true,
  attack: 0.6,
  release: 0.12,
  gain: 1.0,
  modSpeed: 0.6,
  modBrightness: 0.6,
};

/**
 * Shader effect applied to the caption layer using the WICG html-in-canvas
 * proposal (texElementImage2D + paint event). When `enabled` is true and the
 * browser exposes the API, captions are rendered through a WebGL pass that
 * applies a sine-wave UV displacement.
 */
export interface CaptionShaderParams {
  enabled: boolean;
  /** Cycles of the sine wave across the canvas along the propagation direction. */
  frequency: number;
  /** Animation speed (radians per second). */
  speed: number;
  /** Displacement magnitude in UV units (0..0.2 is a sane range). */
  amplitude: number;
  /** Direction of wave propagation in degrees (0 = horizontal travel, 90 = vertical). */
  angleDeg: number;
}

export const DEFAULT_CAPTION_SHADER: CaptionShaderParams = {
  enabled: false,
  frequency: 8,
  speed: 2.0,
  amplitude: 0.01,
  angleDeg: 0,
};

export const DEFAULT_CAPTION_STYLE: CaptionStyle = {
  fontFamily: '"Source Code Pro", ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  lineFontSize: 28,
  wordFontSize: 64,
  fontWeight: 700,
  letterSpacing: 0.06,
  lineHeight: 1.4,
  horizontalPosition: 50,
  verticalPosition: 72,
  lineMaxWidth: 92,
  textAlign: 'center',
  underlineMode: 'draw',
  underlineFadeMs: 150,
  wordHighlightEnabled: true,
  lineSplitMode: 'sentence',
  lineMaxWords: 8,
  lineMaxChars: 60,
  lineMaxSeconds: 3,
  lineTargetWords: 6,
  color: '#ffffff',
  dimColor: '#ffffff',
  colorOpacity: 1,
  dimColorOpacity: 0.5,
  shadowEnabled: true,
};
