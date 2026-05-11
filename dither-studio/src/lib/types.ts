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

// All uniforms of src/shaders/videoShader.ts (dancingVideoShader on the site).
// This single shader does levels/tone/color/distortion/dither in one pass.
export interface VideoShaderParams {
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
  useSingleColor: boolean;
  isDarkMode: boolean;
  ditherColor: string;       // hex (used when useSingleColor)
  lightModeColor: string;    // hex (used when !useSingleColor && !isDarkMode)
  darkModeColor: string;     // hex (used when !useSingleColor && isDarkMode)
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
  useSingleColor: false,
  isDarkMode: true,
  ditherColor: '#ffffff',
  lightModeColor: '#5754ff', // [0.34, 0.33, 1]
  darkModeColor: '#666eae',  // [0.40, 0.43, 0.68]
};

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
  useSingleColor: DEFAULT_VIDEO.useSingleColor,
  isDarkMode: DEFAULT_VIDEO.isDarkMode,
  ditherColor: DEFAULT_VIDEO.ditherColor,
  lightModeColor: DEFAULT_VIDEO.lightModeColor,
  darkModeColor: DEFAULT_VIDEO.darkModeColor,
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
  dimColor: 'rgba(255,255,255,0.5)',
};
