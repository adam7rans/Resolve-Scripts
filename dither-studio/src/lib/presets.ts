// Mirrors w3rk17/src/lib/three-presets.ts and DitherModeSelector.tsx
import type { BackgroundParams, DitherParams, VideoShaderParams } from './types';

export interface Preset {
  name: string;
  background: BackgroundParams;
  dither: DitherParams;
  pageBackground: string;
}

export const DARK_PRESET: Preset = {
  name: 'Dark (site default)',
  background: {
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
  },
  dither: {
    enabled: true,
    ditherType: 4, // BLUE_NOISE
    ditherScale: 0.25,
    contrast: 1.0,
    brightness: 1.0,
    threshold: 0.5,
    levels: 2,
    colorA: '#16120f',
    colorB: '#73809C',
  },
  pageBackground: '#16120f',
};

export const LIGHT_PRESET: Preset = {
  name: 'Light',
  background: {
    noiseType: 'simplex',
    complexity: 2,
    speed: 0.22,
    scale: 0.29,
    warp: 0.34,
    contrast: 1.11,
    bias: 0.27,
    rotation: -46,
    autoRotate: true,
    autoRotateSpeed: -3.8,
    colorA: '#FFFFEB',
    colorB: '#E0E1FF',
  },
  dither: {
    enabled: true,
    ditherType: 4,
    ditherScale: 0.25,
    contrast: 1.0,
    brightness: 1.0,
    threshold: 0.5,
    levels: 2,
    colorA: '#FFFFEB',
    colorB: '#E0E1FF',
  },
  pageBackground: '#FFFFEB',
};

export const SAND_CLOUDS: Preset = {
  name: 'Sand Clouds',
  background: {
    noiseType: 'simplex',
    complexity: 8,
    speed: 0.06,
    scale: 0.25,
    warp: 0.24,
    contrast: 1.25,
    bias: -0.28,
    rotation: 0,
    autoRotate: true,
    autoRotateSpeed: 5.0,
    colorA: '#544C45',
    colorB: '#FFFFCC',
  },
  dither: {
    enabled: true,
    ditherType: 10, // JARVIS
    ditherScale: 0.25,
    contrast: 1.03,
    brightness: 0.90,
    threshold: 0.69,
    levels: 2,
    colorA: '#544C45',
    colorB: '#FFFFCC',
  },
  pageBackground: '#544C45',
};

export const PRESETS: Preset[] = [DARK_PRESET, LIGHT_PRESET, SAND_CLOUDS];

// ----- Video shader presets (DITHER_PRESETS from the site) -----

export interface VideoPreset {
  name: string;
  params: VideoShaderParams;
}

const baseVideoDefaults = {
  blackPoint: 0.0,
  whitePoint: 1.0,
  shadows: 0.0,
  midtones: 0.0,
  highlights: 0.0,
  exposure: 0.0,
  gamma: 1.0,
  saturation: 1.0,
  clarity: 0.0,
  rotation: 0.0,
  scale: 1.0,
  useSingleColor: false,
  isDarkMode: true,
  ditherColor: '#ffffff',
  lightModeColor: '#5754ff', // [0.34, 0.33, 1]
  darkModeColor: '#666eae',  // [0.40, 0.43, 0.68]
};

export const VIDEO_PRESETS: VideoPreset[] = [
  {
    name: 'Tight Focus V2',
    params: {
      ...baseVideoDefaults,
      brightness: 0.8,
      contrast: 0.9,
      ditherEnabled: true,
      ditherType: 8,
      ditherScale: 1.1,
      threshold: 1,
      alphaThreshold: 0.95,
      distortionFrequency: 82,
      distortionAmplitude: 0.005,
      distortionSpeed: 1.7,
      distortionAngle: 1,
    },
  },
  {
    name: 'Tight Focus',
    params: {
      ...baseVideoDefaults,
      brightness: 1.3,
      contrast: 1.8,
      ditherEnabled: true,
      ditherType: 8,
      ditherScale: 1.1,
      threshold: 1,
      alphaThreshold: 0.95,
      distortionFrequency: 82,
      distortionAmplitude: 0.005,
      distortionSpeed: 1.7,
      distortionAngle: 1,
    },
  },
  {
    name: 'High Contrast',
    params: {
      ...baseVideoDefaults,
      brightness: 1.2,
      contrast: 3,
      ditherEnabled: true,
      ditherType: 7,
      ditherScale: 3,
      threshold: 1,
      alphaThreshold: 0.9,
      distortionFrequency: 25,
      distortionAmplitude: 0.005,
      distortionSpeed: 0.7,
      distortionAngle: 2.3,
    },
  },
  {
    name: 'Medium Contrast',
    params: {
      ...baseVideoDefaults,
      brightness: 1.2,
      contrast: 3,
      ditherEnabled: true,
      ditherType: 7,
      ditherScale: 2.5,
      threshold: 1,
      alphaThreshold: 0.9,
      distortionFrequency: 25,
      distortionAmplitude: 0.005,
      distortionSpeed: 0.7,
      distortionAngle: 2.3,
    },
  },
];
