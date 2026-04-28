export const ditherVertexShader = `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const ditherFragmentShader = `
uniform sampler2D tDiffuse;
uniform vec2 uResolution;
uniform float uDitherScale;
uniform float uContrast;
uniform float uBrightness;
uniform int uDitherType;
uniform float uErrorDiffusion;
uniform float uThreshold;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform float uLevels; // number of quantization levels (>=2)
varying vec2 vUv;

// Dither type constants
const int BAYER_2X2 = 0;
const int BAYER_4X4 = 1;
const int BAYER_8X8 = 2;
const int RANDOM = 3;
const int BLUE_NOISE = 4;
const int PATTERN = 5;
const int THRESHOLD = 6;
const int FLOYD_STEINBERG = 7;
const int ATKINSON = 8;
const int BURKES = 9;
const int JARVIS = 10;
const int SIERRA2 = 11;
const int STUCKI = 12;
const int DIFFUSION_ROW = 13;
const int DIFFUSION_COLUMN = 14;
const int DIFFUSION_2D = 15;

// 2x2 Bayer matrix
float getBayer2x2(vec2 coord) {
  ivec2 pos = ivec2(mod(coord, 2.0));
  float matrix[4] = float[4](
    0.0, 2.0,
    3.0, 1.0
  );
  return matrix[pos.y * 2 + pos.x] / 4.0;
}

// 4x4 Bayer matrix
float getBayer4x4(vec2 coord) {
  ivec2 pos = ivec2(mod(coord, 4.0));
  float matrix[16] = float[16](
    0.0,  8.0,  2.0,  10.0,
    12.0, 4.0,  14.0, 6.0,
    3.0,  11.0, 1.0,  9.0,
    15.0, 7.0,  13.0, 5.0
  );
  return matrix[pos.y * 4 + pos.x] / 16.0;
}

// 8x8 Bayer matrix
float getBayer8x8(vec2 coord) {
  ivec2 pos = ivec2(mod(coord, 8.0));
  float matrix[64] = float[64](
    0.0, 32.0, 8.0, 40.0, 2.0, 34.0, 10.0, 42.0,
    48.0, 16.0, 56.0, 24.0, 50.0, 18.0, 58.0, 26.0,
    12.0, 44.0, 4.0, 36.0, 14.0, 46.0, 6.0, 38.0,
    60.0, 28.0, 52.0, 20.0, 62.0, 30.0, 54.0, 22.0,
    3.0, 35.0, 11.0, 43.0, 1.0, 33.0, 9.0, 41.0,
    51.0, 19.0, 59.0, 27.0, 49.0, 17.0, 57.0, 25.0,
    15.0, 47.0, 7.0, 39.0, 13.0, 45.0, 5.0, 37.0,
    63.0, 31.0, 55.0, 23.0, 61.0, 29.0, 53.0, 21.0
  );
  return matrix[pos.y * 8 + pos.x] / 64.0;
}

// Random dithering
float random(vec2 coord) {
  return fract(sin(dot(coord, vec2(12.9898, 78.233))) * 43758.5453);
}

// Blue noise approximation
float getBlueNoise(vec2 coord) {
  vec2 p = fract(coord * 0.3183099 + 0.71);
  p *= 17.0;
  return fract(p.x * p.y * (p.x + p.y));
}

// Pattern dithering (halftone-like)
float getPatternValue(vec2 coord) {
  vec2 center = fract(coord / 4.0) - 0.5;
  float radius = length(center);
  return smoothstep(0.2, 0.4, radius);
}

float getLuminance(vec3 color) {
  return dot(color, vec3(0.299, 0.587, 0.114));
}

// Error diffusion approximations (simplified for real-time rendering)
float getFloydSteinbergDither(vec2 coord, float luminance) {
  vec2 noise = fract(coord * 0.5453 + luminance * 0.3183);
  float dither = (noise.x + noise.y) * 0.5;
  return step(dither * 0.9375, luminance); // 15/16 error diffusion factor
}

float getAtkinsonDither(vec2 coord, float luminance) {
  vec2 noise = fract(coord * 0.7531 + luminance * 0.4142);
  float dither = (noise.x * noise.y) * 0.8;
  return step(dither * 0.75, luminance); // 3/4 error diffusion factor
}

float getBurkesDither(vec2 coord, float luminance) {
  vec2 noise = fract(coord * 0.6180 + luminance * 0.2618);
  float dither = abs(noise.x - noise.y) * 0.7;
  return step(dither * 0.96875, luminance); // 31/32 error diffusion factor
}

float getJarvisDither(vec2 coord, float luminance) {
  vec2 noise = fract(coord * 0.8660 + luminance * 0.5774);
  float dither = length(noise - 0.5) * 0.6;
  return step(dither * 0.9583, luminance); // 23/24 error diffusion factor
}

float getSierra2Dither(vec2 coord, float luminance) {
  vec2 noise = fract(coord * 0.4472 + luminance * 0.8944);
  float dither = sin(noise.x * 6.28) * cos(noise.y * 6.28) * 0.5 + 0.5;
  return step(dither * 0.875, luminance); // 7/8 error diffusion factor
}

float getStuckiDither(vec2 coord, float luminance) {
  vec2 noise = fract(coord * 0.9239 + luminance * 0.3827);
  float dither = pow(noise.x * noise.y, 0.8) * 0.9;
  return step(dither * 0.9583, luminance); // 23/24 error diffusion factor
}

float getDiffusionRowDither(vec2 coord, float luminance) {
  float noise = fract(coord.x * 0.5453 + luminance * 0.7071);
  return step(noise * 0.5, luminance);
}

float getDiffusionColumnDither(vec2 coord, float luminance) {
  float noise = fract(coord.y * 0.5453 + luminance * 0.7071);
  return step(noise * 0.5, luminance);
}

float getDiffusion2DDither(vec2 coord, float luminance) {
  vec2 noise = fract(coord * 0.3183 + luminance);
  float diffusion = (noise.x + noise.y) * 0.25 + noise.x * noise.y * 0.5;
  return step(diffusion, luminance);
}

float getDitherValue(vec2 coord, int ditherType) {
  if (ditherType == BAYER_2X2) {
    return getBayer2x2(coord);
  } else if (ditherType == BAYER_4X4) {
    return getBayer4x4(coord);
  } else if (ditherType == BAYER_8X8) {
    return getBayer8x8(coord);
  } else if (ditherType == RANDOM) {
    return random(coord);
  } else if (ditherType == BLUE_NOISE) {
    return getBlueNoise(coord);
  } else if (ditherType == PATTERN) {
    return getPatternValue(coord);
  } else if (ditherType == THRESHOLD) {
    return uThreshold;
  } else {
    return getBayer4x4(coord); // Default
  }
}

float getErrorDiffusionDither(vec2 coord, int ditherType, float luminance) {
  if (ditherType == FLOYD_STEINBERG) {
    return getFloydSteinbergDither(coord, luminance);
  } else if (ditherType == ATKINSON) {
    return getAtkinsonDither(coord, luminance);
  } else if (ditherType == BURKES) {
    return getBurkesDither(coord, luminance);
  } else if (ditherType == JARVIS) {
    return getJarvisDither(coord, luminance);
  } else if (ditherType == SIERRA2) {
    return getSierra2Dither(coord, luminance);
  } else if (ditherType == STUCKI) {
    return getStuckiDither(coord, luminance);
  } else if (ditherType == DIFFUSION_ROW) {
    return getDiffusionRowDither(coord, luminance);
  } else if (ditherType == DIFFUSION_COLUMN) {
    return getDiffusionColumnDither(coord, luminance);
  } else if (ditherType == DIFFUSION_2D) {
    return getDiffusion2DDither(coord, luminance);
  } else {
    return step(0.5, luminance); // Default binary threshold
  }
}

void main() {
  vec2 coord = vUv * uResolution * uDitherScale;
  vec4 texColor = texture2D(tDiffuse, vUv);

  // Determine the gradient axis from provided colors
  vec3 A = uColorA;
  vec3 B = uColorB;
  vec3 axis = B - A;
  float axisLen = max(length(axis), 1e-4);
  vec3 nAxis = axis / axisLen;

  // Project current color onto the A->B axis to get parameter t in [0,1]
  float t = dot(texColor.rgb - A, nAxis) / axisLen * axisLen; // robust
  t = clamp(t, 0.0, 1.0);

  // Tone adjustments on t (acts like brightness/contrast on the ramp)
  t = (t - 0.5) * uContrast + 0.5 + (uBrightness - 1.0);
  t = clamp(t, 0.0, 1.0);

  // Levels quantization with ordered dithering
  float levels = max(2.0, floor(uLevels + 0.5));
  float scaled = t * (levels - 1.0);
  float baseLevel = floor(scaled);
  float frac = scaled - baseLevel;

  float tQuant;
  if (uDitherType >= FLOYD_STEINBERG && uDitherType <= DIFFUSION_2D) {
    // Binary diffusion between current and next level as an approximation
    float decision = getErrorDiffusionDither(coord, uDitherType, frac);
    float nextLevel = baseLevel + (decision > 0.5 ? 1.0 : 0.0);
    nextLevel = clamp(nextLevel, 0.0, levels - 1.0);
    tQuant = nextLevel / (levels - 1.0);
  } else {
    float threshold = getDitherValue(coord, uDitherType);
    float nextLevel = baseLevel + (frac > threshold ? 1.0 : 0.0);
    nextLevel = clamp(nextLevel, 0.0, levels - 1.0);
    tQuant = nextLevel / (levels - 1.0);
  }

  vec3 outColor = mix(A, B, tQuant);
  gl_FragColor = vec4(outColor, texColor.a);
}
`;

export const ditherShaderUniforms = {
  tDiffuse: { value: null },
  uResolution: { value: { x: 1920, y: 1080 } },
  uDitherScale: { value: 1.0 },
  uContrast: { value: 1.0 },
  uBrightness: { value: 1.0 },
  uDitherType: { value: 1 }, // Default to Bayer 4x4
  uErrorDiffusion: { value: 1.0 },
  uThreshold: { value: 0.5 },
  uColorA: { value: { x: 0, y: 0, z: 0 } },
  uColorB: { value: { x: 1, y: 1, z: 1 } },
  uLevels: { value: 4.0 }
};

// Dither type constants for TypeScript
export const DITHER_TYPES = {
  BAYER_2X2: 0,
  BAYER_4X4: 1,
  BAYER_8X8: 2,
  RANDOM: 3,
  BLUE_NOISE: 4,
  PATTERN: 5,
  THRESHOLD: 6,
  FLOYD_STEINBERG: 7,
  ATKINSON: 8,
  BURKES: 9,
  JARVIS: 10,
  SIERRA2: 11,
  STUCKI: 12,
  DIFFUSION_ROW: 13,
  DIFFUSION_COLUMN: 14,
  DIFFUSION_2D: 15
} as const;

export type DitherType = typeof DITHER_TYPES[keyof typeof DITHER_TYPES];