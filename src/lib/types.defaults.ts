import type { AudioReactivityParams, BackgroundParams, CaptionShaderParams, CaptionStyle, ExportParams, VideoShaderParams } from './types.models';
import { createDefaultVideoGradientStops, normalizeVideoGradientStops, withGradientStops } from './types.videoGradient';

function clampGradientScale(value: number): number {
  return Math.max(0.1, Math.min(5, value));
}

export const DEFAULT_BACKGROUND: BackgroundParams = { noiseType: 'simplex', complexity: 2, speed: 0.22, scale: 0.29, warp: 0.34, contrast: 2.33, bias: 0.2, rotation: -46, autoRotate: true, autoRotateSpeed: -3.8, colorA: '#16120f', colorB: '#73809C' };
export const DEFAULT_DITHER = { enabled: true, ditherType: 4, ditherScale: 0.25, contrast: 1, brightness: 1, threshold: 0.5, levels: 2, colorA: '#16120f', colorB: '#73809C' };

export const DEFAULT_VIDEO: VideoShaderParams = {
  gradientEnabled: false, gradientType: 0, gradientStops: createDefaultVideoGradientStops('#000000', 1, '#ffffff', 1), gradientGuideVisible: false,
  gradientColorA: '#000000', gradientOpacityA: 1, gradientColorB: '#ffffff', gradientOpacityB: 1, gradientOpacity: 1, gradientBlendMode: 1, gradientAngle: 0, gradientScale: 1, gradientOffsetX: 0, gradientOffsetY: 0,
  shaderEnabled: true, blackPoint: 0, whitePoint: 1, brightness: 0.8, contrast: 0.9, shadows: 0, midtones: 0, highlights: 0, exposure: 0, gamma: 1, saturation: 1, clarity: 0,
  rezEnabled: false, rezCellWidth: 8, rezCellHeight: 8, rezColorLevels: 24, rezMix: 1, rezJitter: 0,
  positionX: 0, positionY: 0, positionRotation: 0, positionScale: 1, rotation: 0, scale: 1, distortionFrequency: 82, distortionAmplitude: 0.005, distortionSpeed: 1.7, distortionAngle: 1,
  ditherEnabled: true, ditherType: 8, ditherScale: 1.1, threshold: 1, alphaThreshold: 0.95, ditherGradient: true, ditherColor: '#ffffff', ditherGradientColorA: '#5754ff', ditherGradientColorB: '#666eae', ditherGradientAngle: 0, ditherGradientScale: 1, ditherGradientOffsetX: 0, ditherGradientOffsetY: 0,
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
  return {
    ...withGradientStops(merged, normalizeVideoGradientStops(input?.gradientStops, merged.gradientColorA, merged.gradientOpacityA, merged.gradientColorB, merged.gradientOpacityB)),
    gradientGuideVisible: typeof input?.gradientGuideVisible === 'boolean' ? input.gradientGuideVisible : DEFAULT_VIDEO.gradientGuideVisible,
    gradientScale: clampGradientScale(merged.gradientScale),
  };
}

export const DEFAULT_VIDEO_LEVELS: Partial<VideoShaderParams> = { blackPoint: DEFAULT_VIDEO.blackPoint, whitePoint: DEFAULT_VIDEO.whitePoint, brightness: DEFAULT_VIDEO.brightness, contrast: DEFAULT_VIDEO.contrast };
export const DEFAULT_VIDEO_TONE: Partial<VideoShaderParams> = { shadows: DEFAULT_VIDEO.shadows, midtones: DEFAULT_VIDEO.midtones, highlights: DEFAULT_VIDEO.highlights };
export const DEFAULT_VIDEO_COLOR: Partial<VideoShaderParams> = { exposure: DEFAULT_VIDEO.exposure, gamma: DEFAULT_VIDEO.gamma, saturation: DEFAULT_VIDEO.saturation, clarity: DEFAULT_VIDEO.clarity };
export const DEFAULT_VIDEO_POSITION: Partial<VideoShaderParams> = { positionX: DEFAULT_VIDEO.positionX, positionY: DEFAULT_VIDEO.positionY, positionRotation: DEFAULT_VIDEO.positionRotation, positionScale: DEFAULT_VIDEO.positionScale };
export const DEFAULT_VIDEO_REZ: Partial<VideoShaderParams> = { rezEnabled: DEFAULT_VIDEO.rezEnabled, rezCellWidth: DEFAULT_VIDEO.rezCellWidth, rezCellHeight: DEFAULT_VIDEO.rezCellHeight, rezColorLevels: DEFAULT_VIDEO.rezColorLevels, rezMix: DEFAULT_VIDEO.rezMix, rezJitter: DEFAULT_VIDEO.rezJitter };
export const DEFAULT_VIDEO_DISTORTION: Partial<VideoShaderParams> = { rotation: DEFAULT_VIDEO.rotation, scale: DEFAULT_VIDEO.scale, distortionFrequency: DEFAULT_VIDEO.distortionFrequency, distortionAmplitude: DEFAULT_VIDEO.distortionAmplitude, distortionSpeed: DEFAULT_VIDEO.distortionSpeed, distortionAngle: DEFAULT_VIDEO.distortionAngle };
export const DEFAULT_VIDEO_DITHER: Partial<VideoShaderParams> = {
  ditherEnabled: DEFAULT_VIDEO.ditherEnabled, ditherType: DEFAULT_VIDEO.ditherType, ditherScale: DEFAULT_VIDEO.ditherScale, threshold: DEFAULT_VIDEO.threshold, alphaThreshold: DEFAULT_VIDEO.alphaThreshold,
  ditherGradient: DEFAULT_VIDEO.ditherGradient, ditherColor: DEFAULT_VIDEO.ditherColor, ditherGradientColorA: DEFAULT_VIDEO.ditherGradientColorA, ditherGradientColorB: DEFAULT_VIDEO.ditherGradientColorB, ditherGradientAngle: DEFAULT_VIDEO.ditherGradientAngle, ditherGradientScale: DEFAULT_VIDEO.ditherGradientScale, ditherGradientOffsetX: DEFAULT_VIDEO.ditherGradientOffsetX, ditherGradientOffsetY: DEFAULT_VIDEO.ditherGradientOffsetY,
};

export const MICRO_TIMELINE_COLORS = ['#1f6feb', '#30d158', '#eb6f1f', '#ff453a', '#bf5af2', '#ffd60a', '#64d2ff'];
export const DEFAULT_EXPORT: ExportParams = { width: 1920, height: 1080, fps: 30, duration: 10, filenamePrefix: 'dither', exportMode: 'master', invertFinalOutput: false, startSecond: 0, endSecond: 10, outroEnabled: false };
export const DEFAULT_AUDIO_REACTIVITY: AudioReactivityParams = { enabled: true, attack: 0.6, release: 0.12, gain: 1, modSpeed: 0.6, modBrightness: 0.6 };
export const DEFAULT_CAPTION_SHADER: CaptionShaderParams = { enabled: false, frequency: 8, speed: 2, amplitude: 0.01, angleDeg: 0 };
export const DEFAULT_CAPTION_STYLE: CaptionStyle = {
  fontFamily: '"Source Code Pro", ui-monospace, "SF Mono", Menlo, Consolas, monospace', lineFontSize: 28, wordFontSize: 64, fontWeight: 700, letterSpacing: 0.06, lineHeight: 1.4,
  horizontalPosition: 50, verticalPosition: 72, lineMaxWidth: 92, textAlign: 'center', underlineMode: 'draw', underlineFadeMs: 150, wordHighlightEnabled: true,
  lineSplitMode: 'sentence', lineMaxWords: 8, lineMaxChars: 60, lineMaxSeconds: 3, lineTargetWords: 6, color: '#ffffff', dimColor: '#ffffff', colorOpacity: 1, dimColorOpacity: 0.5, shadowEnabled: true,
};
