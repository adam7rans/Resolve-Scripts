export const dancingVideoVertexShader = `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const dancingVideoFragmentShader = `
uniform sampler2D tDiffuse;
uniform vec2 uResolution;
uniform float uDitherScale;
uniform float uContrast;
uniform float uBrightness;
uniform float uBlackPoint;
uniform float uWhitePoint;
uniform float uGamma;
uniform float uShadows;
uniform float uMidtones;
uniform float uHighlights;
uniform float uSaturation; // Color saturation control
uniform float uExposure; // Exposure adjustment
uniform float uClarity; // Mid-tone contrast boost
uniform int uDitherType;
uniform float uErrorDiffusion;
uniform float uThreshold;
uniform float uAlphaThreshold; // Threshold for bright pixels to become transparent
uniform float uTime; // For animation effects
uniform bool uUseSingleColor; // Use single color for dither pixels
uniform bool uDitherEnabled;
uniform vec3 uDitherColor; // Single color for dither pixels
uniform vec3 uLightModeColor; // Color for rendered pixels in light mode
uniform vec3 uDarkModeColor; // Color for rendered pixels in dark mode
uniform bool uIsDarkMode; // Current theme mode
uniform float uDistortionFrequency; // Frequency of sine wave distortion
uniform float uDistortionAmplitude; // Amplitude of sine wave distortion
uniform float uDistortionSpeed; // Speed of sine wave animation
uniform float uDistortionAngle; // Angle of distortion in radians
uniform float uRotation;
uniform float uScale;
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

// 4x4 Bayer matrix (most common)
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

// 2x2 Bayer matrix
float getBayer2x2(vec2 coord) {
  ivec2 pos = ivec2(mod(coord, 2.0));
  float matrix[4] = float[4](
    0.0, 2.0,
    3.0, 1.0
  );
  return matrix[pos.y * 2 + pos.x] / 4.0;
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

vec3 applyLevels(vec3 color, float blackPoint, float whitePoint) {
  float range = max(whitePoint - blackPoint, 0.0001);
  vec3 adjusted = (color - vec3(blackPoint)) / range;
  return clamp(adjusted, 0.0, 1.0);
}

float adjustTone(float value, float shadows, float midtones, float highlights) {
  float shadowInfluence = 1.0 - smoothstep(0.0, 0.6, value);
  float highlightInfluence = smoothstep(0.4, 1.0, value);
  float midtoneInfluence = 1.0 - abs(value - 0.5) * 2.0;

  value += shadowInfluence * shadows;
  value += midtoneInfluence * midtones;
  value += highlightInfluence * highlights;
  return clamp(value, 0.0, 1.0);
}

// Error diffusion approximations
float getFloydSteinbergDither(vec2 coord, float luminance) {
  vec2 noise = fract(coord * 0.5453 + luminance * 0.3183);
  float dither = (noise.x + noise.y) * 0.5;
  return step(dither * 0.9375, luminance);
}

float getAtkinsonDither(vec2 coord, float luminance) {
  vec2 noise = fract(coord * 0.7531 + luminance * 0.4142);
  float dither = (noise.x * noise.y) * 0.8;
  return step(dither * 0.75, luminance);
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
  } else {
    return step(0.5, luminance); // Default binary threshold
  }
}

void main() {
  // Apply sine wave distortion to UV coordinates
  vec2 distortedUv = vUv;

  // Center coordinates for rotation/scale
  vec2 centeredUv = distortedUv - 0.5;

  // Apply rotation
  float cosR = cos(uRotation);
  float sinR = sin(uRotation);
  mat2 rotationMatrix = mat2(cosR, -sinR, sinR, cosR);
  centeredUv = rotationMatrix * centeredUv;

  // Apply uniform scale
  centeredUv *= uScale;

  // Translate back
  distortedUv = centeredUv + 0.5;

  // Only apply wave distortion if dithering is enabled
  if (uDitherEnabled) {
    // Calculate wave direction based on angle
    vec2 waveDirection = vec2(cos(uDistortionAngle), sin(uDistortionAngle));

    // Create wave pattern along the specified direction
    float wavePattern = dot(vUv - 0.5, waveDirection);
    float wave = sin(wavePattern * uDistortionFrequency + uTime * uDistortionSpeed) * uDistortionAmplitude;

    // Apply distortion perpendicular to wave direction
    vec2 perpDirection = vec2(-waveDirection.y, waveDirection.x);
    distortedUv += perpDirection * wave;
  }

  // Clamp UV coordinates to prevent sampling outside texture
  distortedUv = clamp(distortedUv, 0.0, 1.0);

  vec2 coord = distortedUv * uResolution * uDitherScale;
  vec4 texColor = texture2D(tDiffuse, distortedUv);
  
  // ALWAYS apply tonal adjustments (even when dithering is disabled)
  vec3 toneColor = pow(texColor.rgb, vec3(2.2));

  // Exposure adjustment (applied early in linear space)
  toneColor *= pow(2.0, uExposure);

  toneColor = applyLevels(toneColor, uBlackPoint, uWhitePoint);
  toneColor.r = adjustTone(toneColor.r, uShadows, uMidtones, uHighlights);
  toneColor.g = adjustTone(toneColor.g, uShadows, uMidtones, uHighlights);
  toneColor.b = adjustTone(toneColor.b, uShadows, uMidtones, uHighlights);
  toneColor = pow(toneColor, vec3(1.0 / max(uGamma, 0.001)));
  toneColor = clamp(toneColor, 0.0, 1.0);
  
  // Clarity (mid-tone contrast) - applied in linear space
  if (uClarity != 0.0) {
    float lum = dot(toneColor, vec3(0.299, 0.587, 0.114));
    float clarityMask = 4.0 * lum * (1.0 - lum); // Peaks at 0.5
    toneColor = mix(toneColor, vec3(lum), -uClarity * clarityMask);
  }
  
  toneColor = pow(toneColor, vec3(1.0 / 2.2));

  // Global contrast and brightness
  toneColor = (toneColor - 0.5) * vec3(uContrast) + 0.5;
  toneColor += vec3(uBrightness - 1.0);
  toneColor = clamp(toneColor, 0.0, 1.0);
  
  // Saturation adjustment
  if (uSaturation != 1.0) {
    float gray = dot(toneColor, vec3(0.299, 0.587, 0.114));
    toneColor = mix(vec3(gray), toneColor, uSaturation);
  }

  // Early return if dithering is disabled - output tonal-adjusted video
  if (!uDitherEnabled) {
    gl_FragColor = vec4(toneColor, 1.0);
    return;
  }

  float luminance = getLuminance(toneColor);

  // Masking logic: bright pixels become transparent, dark pixels get dithered and rendered
  float alpha = 1.0;

  // If the pixel is bright (above threshold), make it transparent
  if (luminance > uAlphaThreshold) {
    alpha = 0.0;
  } else {
    // For dark pixels, apply dithering effect
    float ditherThreshold;

    if (uDitherType >= FLOYD_STEINBERG && uDitherType <= DIFFUSION_2D) {
      ditherThreshold = getErrorDiffusionDither(coord, uDitherType, luminance);
    } else {
      ditherThreshold = getDitherValue(coord, uDitherType);
    }

    // Create binary dither pattern for dark pixels
    float ditheredValue = step(ditherThreshold, luminance);

    // Use the dithered result to create the final effect
    // Dark areas that pass the dither become visible, others transparent
    if (ditheredValue > 0.5) {
      alpha = 1.0;

      // Choose color based on mode
      if (uUseSingleColor) {
        toneColor = uDitherColor;
      } else {
        toneColor = uIsDarkMode ? uDarkModeColor : uLightModeColor;
      }
    } else {
      alpha = 0.0; // Dithered out pixels become transparent
    }
  }

  // Add some subtle animation to make it more dynamic
  float pulse = sin(uTime * 2.0) * 0.1 + 0.9;
  alpha *= pulse;

  gl_FragColor = vec4(toneColor, alpha);
}
`;

export const dancingVideoShaderUniforms = {
  tDiffuse: { value: null },
  uResolution: { value: { x: 1920, y: 1080 } },
  uDitherScale: { value: 1.0 },
  uContrast: { value: 1.5 },
  uBrightness: { value: 1.0 },
  uBlackPoint: { value: 0.0 },
  uWhitePoint: { value: 1.0 },
  uGamma: { value: 1.0 },
  uShadows: { value: 0.0 },
  uMidtones: { value: 0.0 },
  uHighlights: { value: 0.0 },
  uSaturation: { value: 1.0 },
  uExposure: { value: 0.0 },
  uClarity: { value: 0.0 },
  uDitherType: { value: 1 }, // Default to Bayer 4x4
  uErrorDiffusion: { value: 1.0 },
  uThreshold: { value: 0.5 },
  uAlphaThreshold: { value: 0.7 }, // Threshold for bright pixels to become transparent
  uTime: { value: 0.0 },
  uUseSingleColor: { value: false },
  uDitherEnabled: { value: true },
  uDitherColor: { value: { x: 1.0, y: 1.0, z: 1.0 } }, // Default white
  uLightModeColor: { value: { x: 0.0, y: 0.0, z: 0.0 } }, // Black for light mode
  uDarkModeColor: { value: { x: 1.0, y: 1.0, z: 1.0 } }, // White for dark mode
  uIsDarkMode: { value: false },
  uDistortionFrequency: { value: 20.0 }, // Frequency of sine wave distortion
  uDistortionAmplitude: { value: 0.02 }, // Amplitude of sine wave distortion
  uDistortionSpeed: { value: 2.0 }, // Speed of sine wave animation
  uDistortionAngle: { value: 0.0 }, // Angle of distortion in radians
  uRotation: { value: 0.0 },
  uScale: { value: 1.0 }
};

// Dither type constants for TypeScript
export const DANCING_DITHER_TYPES = {
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

export type DancingDitherType = typeof DANCING_DITHER_TYPES[keyof typeof DANCING_DITHER_TYPES];
