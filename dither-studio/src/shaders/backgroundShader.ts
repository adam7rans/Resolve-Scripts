// Background fragment shader extracted verbatim from
// w3rk17/src/components/ThreeGradientBackground.tsx so the look is identical.

export const backgroundVertexShader = /* glsl */ `
void main() {
  gl_Position = vec4(position, 1.0);
}
`;

export const backgroundFragmentShader = /* glsl */ `
precision highp float;

uniform vec2 u_resolution;
uniform float u_time;
uniform float u_speed;
uniform float u_complexity;
uniform int u_noiseType;
uniform vec3 u_colorA;
uniform vec3 u_colorB;
uniform float u_scale;
uniform float u_warp;
uniform float u_contrast;
uniform float u_bias;
uniform float u_rotation; // radians
uniform float u_brightness; // 1.0 = neutral; >1 brightens, <1 darkens

// Hash / Value noise
float hash(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p.x) * p.y * 43758.5453123);
}

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);

  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));

  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

// Simplex noise (2D) - Ashima
vec3 mod289(vec3 x){return x - floor(x * (1.0 / 289.0)) * 289.0;}
vec2 mod289(vec2 x){return x - floor(x * (1.0 / 289.0)) * 289.0;}
vec3 permute(vec3 x){return mod289(((x*34.0)+1.0)*x);}
float snoise(vec2 v){
  const vec4 C = vec4(0.211324865405187,
                      0.366025403784439,
                      -0.577350269189626,
                      0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
  m = m*m; m = m*m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
  vec3 g;
  g.x  = a0.x * x0.x + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

// Worley (cellular) noise (2D)
float worley(vec2 uv) {
  vec2 i_st = floor(uv);
  vec2 f_st = fract(uv);
  float m_dist = 1.0;
  for (int y=-1; y<=1; y++) {
    for (int x=-1; x<=1; x++) {
      vec2 neighbor = vec2(float(x), float(y));
      vec2 point = hash(i_st + neighbor) * vec2(1.0);
      point = vec2(hash(i_st + neighbor), hash(i_st + neighbor + 1.234));
      vec2 diff = neighbor + point - f_st;
      float dist = length(diff);
      m_dist = min(m_dist, dist);
    }
  }
  return m_dist;
}

float fbm(vec2 p, int octaves) {
  float value = 0.0;
  float amp = 0.5;
  float freq = 1.0;
  for (int i=0; i<8; i++) {
    if (i >= octaves) break;
    value += amp * snoise(p * freq);
    freq *= 2.0;
    amp *= 0.5;
  }
  return value;
}

float getNoise(vec2 uv, int type, int octaves) {
  if (type == 0) {
    float v = 0.0;
    float amp = 0.5;
    float freq = 1.0;
    for (int i=0; i<8; i++) {
      if (i >= octaves) break;
      v += amp * valueNoise(uv * freq);
      freq *= 2.0;
      amp *= 0.5;
    }
    return v;
  } else if (type == 1) {
    return fbm(uv, octaves);
  } else {
    float v = 0.0;
    float amp = 0.5;
    float freq = 1.0;
    for (int i=0; i<8; i++) {
      if (i >= octaves) break;
      v += amp * (1.0 - worley(uv * freq));
      freq *= 2.0;
      amp *= 0.5;
    }
    return v;
  }
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  vec2 p = (gl_FragCoord.xy * 2.0 - u_resolution.xy) / min(u_resolution.x, u_resolution.y);
  float c = cos(u_rotation);
  float s = sin(u_rotation);
  mat2 R = mat2(c, -s, s, c);
  p = R * p * u_scale;
  float t = u_time * u_speed * 0.25;
  float base = getNoise(p + vec2(t, -t), u_noiseType, int(u_complexity));
  vec2 warp = vec2(
    getNoise(p + base + vec2(1.7, 9.2) + t, u_noiseType, int(u_complexity)),
    getNoise(p + base + vec2(-8.3, -2.8) - t, u_noiseType, int(u_complexity))
  );
  float n = getNoise(p + warp * u_warp, u_noiseType, int(u_complexity));
  n = clamp(n + u_bias, 0.0, 1.0);
  n = pow(n, u_contrast);

  vec3 col = mix(u_colorA, u_colorB, n);
  col = clamp(col * u_brightness, 0.0, 1.0);
  gl_FragColor = vec4(col, 1.0);
}
`;

export type NoiseType = 'value' | 'simplex' | 'worley';
