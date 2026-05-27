import * as THREE from 'three';
import {
  dancingVideoFragmentShader,
  dancingVideoVertexShader,
  dancingVideoShaderUniforms,
} from '../shaders/videoShader';
import { MAX_VIDEO_GRADIENT_STOPS, type VideoShaderParams, type VideoGradientStop } from './types';

/**
 * Renders an HTMLVideoElement through the single-pass video shader
 * (the same shader the live site uses for the talking video — see
 * w3rk17/src/shaders/dancingVideoShader.ts).
 */
export class VideoRenderer {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private material: THREE.ShaderMaterial;
  private videoTexture: THREE.VideoTexture | null = null;
  private video: HTMLVideoElement | null = null;
  private params: VideoShaderParams;
  private width = 1;
  private height = 1;
  private startTime = performance.now();

  constructor(canvas: HTMLCanvasElement, params: VideoShaderParams) {
    this.params = { ...params };

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(1);
    this.renderer.setClearColor(0x000000, 0);

    this.material = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(dancingVideoShaderUniforms),
      vertexShader: dancingVideoVertexShader,
      fragmentShader: dancingVideoFragmentShader,
      transparent: true,
    });
    // Ensure uniforms use Vector2 for reliable updates
    this.material.uniforms.uResolution.value = new THREE.Vector2(1920, 1080);
    this.material.uniforms.uUvScale.value = new THREE.Vector2(1, 1);
    
    this.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material));

    this.applyParams();
  }

  setVideo(video: HTMLVideoElement | null) {
    if (this.videoTexture) {
      this.videoTexture.dispose();
      this.videoTexture = null;
    }
    this.video = video;
    if (video) {
      const tex = new THREE.VideoTexture(video);
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.format = THREE.RGBAFormat;
      this.videoTexture = tex;
      this.material.uniforms.tDiffuse.value = tex;
    } else {
      this.material.uniforms.tDiffuse.value = null;
    }
  }

  getVideo(): HTMLVideoElement | null { return this.video; }

  setSize(width: number, height: number) {
    this.width = Math.max(1, Math.floor(width));
    this.height = Math.max(1, Math.floor(height));
    // updateStyle=false so we don't overwrite the canvas's CSS width/height —
    // React's frameStyle controls the on-screen size; this only changes the
    // backing-store resolution.
    this.renderer.setSize(this.width, this.height, false);
    (this.material.uniforms.uResolution.value as THREE.Vector2).set(this.width, this.height);
  }

  setParams(p: VideoShaderParams) {
    this.params = { ...p };
    this.applyParams();
  }

  private applyParams() {
    const u = this.material.uniforms;
    const p = this.params;
    // pre-shader gradient overlay
    u.uGradientEnabled.value = p.gradientEnabled;
    u.uGradientType.value = p.gradientType;
    u.uGradientStopCount.value = Math.min(MAX_VIDEO_GRADIENT_STOPS, Math.max(1, p.gradientStops.length));
    setGradientStopArray(u.uGradientStopColors.value as number[], u.uGradientStopOpacities.value as number[], u.uGradientStopPositions.value as number[], p.gradientStops);
    u.uGradientOpacity.value = p.gradientOpacity;
    u.uGradientBlendMode.value = p.gradientBlendMode;
    u.uGradientAngle.value = p.gradientAngle;
    u.uGradientScale.value = p.gradientScale;
    u.uGradientOffsetX.value = p.gradientOffsetX;
    u.uGradientOffsetY.value = p.gradientOffsetY;
    // shader bypass
    u.uShaderEnabled.value = p.shaderEnabled;
    // levels/tone/color
    u.uBlackPoint.value = p.blackPoint;
    u.uWhitePoint.value = p.whitePoint;
    u.uBrightness.value = p.brightness;
    u.uContrast.value = p.contrast;
    u.uShadows.value = p.shadows;
    u.uMidtones.value = p.midtones;
    u.uHighlights.value = p.highlights;
    u.uExposure.value = p.exposure;
    u.uGamma.value = p.gamma;
    u.uSaturation.value = p.saturation;
    u.uClarity.value = p.clarity;
    u.uRezEnabled.value = p.rezEnabled;
    u.uRezCellWidth.value = p.rezCellWidth;
    u.uRezCellHeight.value = p.rezCellHeight;
    u.uRezColorLevels.value = p.rezColorLevels;
    u.uRezMix.value = p.rezMix;
    u.uRezJitter.value = p.rezJitter;
    u.uPositionX.value = p.positionX;
    u.uPositionY.value = p.positionY;
    u.uPositionRotation.value = p.positionRotation;
    u.uRotation.value = p.rotation;
    u.uScale.value = p.scale;
    u.uDistortionFrequency.value = p.distortionFrequency;
    u.uDistortionAmplitude.value = p.distortionAmplitude;
    u.uDistortionSpeed.value = p.distortionSpeed;
    u.uDistortionAngle.value = p.distortionAngle;
    u.uDitherEnabled.value = p.ditherEnabled;
    u.uDitherType.value = p.ditherType;
    u.uDitherScale.value = p.ditherScale;
    u.uThreshold.value = p.threshold;
    u.uAlphaThreshold.value = p.alphaThreshold;
    u.uDitherGradient.value = p.ditherGradient;
    setVec3FromHex(u.uDitherColor.value, p.ditherColor);
    setVec3FromHex(u.uDitherGradientColorA.value, p.ditherGradientColorA);
    setVec3FromHex(u.uDitherGradientColorB.value, p.ditherGradientColorB);
    u.uDitherGradientAngle.value = p.ditherGradientAngle;
    u.uDitherGradientScale.value = p.ditherGradientScale;
    u.uDitherGradientOffsetX.value = p.ditherGradientOffsetX;
    u.uDitherGradientOffsetY.value = p.ditherGradientOffsetY;
  }

  /** Render the current video frame. */
  renderFrame(timeSeconds?: number, videoTime?: number) {
    // Always keep the renderer transparent so the shader's alpha output
    // (uAlphaThreshold + dither masking) is preserved both in the preview
    // and in the exported PNGs.
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setRenderTarget(null);
    if (!this.videoTexture || !this.video) {
      this.renderer.clear();
      return;
    }

    // Update aspect ratio correction (cover fit)
    const vw = this.video.videoWidth || 1;
    const vh = this.video.videoHeight || 1;
    const videoAspect = vw / vh;
    const outputAspect = this.width / this.height;
    const u = this.material.uniforms;
    const uvScale = u.uUvScale.value as THREE.Vector2;

    if (videoAspect > outputAspect) {
      // Video is wider than output: fit height, crop sides
      uvScale.set(outputAspect / videoAspect, 1.0);
    } else {
      // Video is taller than output: fit width, crop top/bottom
      uvScale.set(1.0, videoAspect / outputAspect);
    }

    if (videoTime !== undefined && Math.abs(this.video.currentTime - videoTime) > 0.001) {
      this.video.currentTime = videoTime;
    }
    
    this.videoTexture.needsUpdate = true;
    this.material.uniforms.uTime.value = timeSeconds !== undefined ? timeSeconds : (performance.now() - this.startTime) / 1000;
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    if (this.videoTexture) this.videoTexture.dispose();
    this.material.dispose();
    this.renderer.dispose();
  }
}

function setVec3FromHex(target: { x: number; y: number; z: number } | THREE.Color, hex: string) {
  const c = new THREE.Color(hex);
  if (target instanceof THREE.Color) {
    target.copy(c);
  } else {
    target.x = c.r;
    target.y = c.g;
    target.z = c.b;
  }
}

function setGradientStopArray(
  colorArray: number[],
  opacityArray: number[],
  positionArray: number[],
  stops: VideoGradientStop[],
) {
  const safeStops = stops.length > 0 ? stops : [
    { id: 'stop-1', color: '#000000', opacity: 1, position: 0 },
    { id: 'stop-2', color: '#ffffff', opacity: 1, position: 1 },
  ];

  for (let i = 0; i < MAX_VIDEO_GRADIENT_STOPS; i += 1) {
    const stop = safeStops[Math.min(i, safeStops.length - 1)];
    const color = new THREE.Color(stop.color);
    const base = i * 3;
    colorArray[base] = color.r;
    colorArray[base + 1] = color.g;
    colorArray[base + 2] = color.b;
    opacityArray[i] = stop.opacity;
    positionArray[i] = stop.position;
  }
}
