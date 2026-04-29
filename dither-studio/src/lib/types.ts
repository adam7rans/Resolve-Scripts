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

export interface ExportParams {
  width: number;
  height: number;
  fps: number;
  duration: number;        // seconds (background) or unused (video uses video duration)
  filenamePrefix: string;
  startSecond: number;     // start time offset
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
  textAlign: 'left' | 'center' | 'right';
  underlineEnabled: boolean;
  wordHighlightEnabled: boolean;
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

export const DEFAULT_EXPORT: ExportParams = {
  width: 1920,
  height: 1080,
  fps: 30,
  duration: 10,
  filenamePrefix: 'dither',
  startSecond: 0,
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
  textAlign: 'center',
  underlineEnabled: true,
  wordHighlightEnabled: true,
  color: '#ffffff',
  dimColor: 'rgba(255,255,255,0.5)',
};
