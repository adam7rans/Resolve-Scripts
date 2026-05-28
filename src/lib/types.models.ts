import type { NoiseType } from '../shaders/backgroundShader';
import type { DitherType } from '../shaders/ditherShader';

export interface DitherParams {
  enabled: boolean;
  ditherType: DitherType;
  ditherScale: number;
  contrast: number;
  brightness: number;
  threshold: number;
  levels: number;
  colorA: string;
  colorB: string;
}

export interface VideoGradientStop {
  id: string;
  color: string;
  opacity: number;
  position: number;
}

export interface VideoShaderParams {
  gradientEnabled: boolean;
  gradientType: number;
  gradientStops: VideoGradientStop[];
  gradientGuideVisible: boolean;
  gradientColorA: string;
  gradientOpacityA: number;
  gradientColorB: string;
  gradientOpacityB: number;
  gradientOpacity: number;
  gradientBlendMode: number;
  gradientAngle: number;
  gradientScale: number;
  gradientOffsetX: number;
  gradientOffsetY: number;
  shaderEnabled: boolean;
  blackPoint: number;
  whitePoint: number;
  brightness: number;
  contrast: number;
  shadows: number;
  midtones: number;
  highlights: number;
  exposure: number;
  gamma: number;
  saturation: number;
  clarity: number;
  rezEnabled: boolean;
  rezCellWidth: number;
  rezCellHeight: number;
  rezColorLevels: number;
  rezMix: number;
  rezJitter: number;
  positionX: number;
  positionY: number;
  positionRotation: number;
  rotation: number;
  scale: number;
  distortionFrequency: number;
  distortionAmplitude: number;
  distortionSpeed: number;
  distortionAngle: number;
  ditherEnabled: boolean;
  ditherType: number;
  ditherScale: number;
  threshold: number;
  alphaThreshold: number;
  ditherGradient: boolean;
  ditherColor: string;
  ditherGradientColorA: string;
  ditherGradientColorB: string;
  ditherGradientAngle: number;
  ditherGradientScale: number;
  ditherGradientOffsetX: number;
  ditherGradientOffsetY: number;
}

export interface BackgroundParams {
  noiseType: NoiseType;
  complexity: number;
  speed: number;
  scale: number;
  warp: number;
  contrast: number;
  bias: number;
  rotation: number;
  autoRotate: boolean;
  autoRotateSpeed: number;
  colorA: string;
  colorB: string;
}

export interface AudioReactivityParams {
  enabled: boolean;
  attack: number;
  release: number;
  gain: number;
  modSpeed: number;
  modBrightness: number;
}

export interface ExportParams {
  width: number;
  height: number;
  fps: number;
  duration: number;
  filenamePrefix: string;
  exportMode?: 'master' | 'web';
  invertFinalOutput?: boolean;
  startSecond: number;
  endSecond?: number;
  outroEnabled?: boolean;
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
  lineMaxWidth: number;
  textAlign: 'left' | 'center' | 'right';
  underlineMode: 'off' | 'draw' | 'fade';
  underlineEnabled?: boolean;
  underlineFadeMs: number;
  wordHighlightEnabled: boolean;
  lineSplitMode: 'sentence' | 'words' | 'chars' | 'duration' | 'balanced';
  lineMaxWords: number;
  lineMaxChars: number;
  lineMaxSeconds: number;
  lineTargetWords: number;
  color: string;
  dimColor: string;
  colorOpacity?: number;
  dimColorOpacity?: number;
  shadowEnabled?: boolean;
}

export interface MicroTimeline {
  id: string;
  name: string;
  startSecond: number;
  endSecond: number;
  color: string;
}

export interface MusicAsset {
  id: string;
  filename: string;
  originalName: string;
}

export interface MusicTimelineClip {
  id: string;
  assetId: string;
  trackIndex: 0 | 1;
  startSecond: number;
  durationSecond: number;
  sourceOffsetSecond: number;
  fadeInSecond: number;
  fadeOutSecond: number;
  color: string;
}

export interface CaptionShaderParams {
  enabled: boolean;
  frequency: number;
  speed: number;
  amplitude: number;
  angleDeg: number;
}
