import * as THREE from 'three';
import { backgroundFragmentShader, backgroundVertexShader } from '../shaders/backgroundShader';
import { DitherPass } from './DitherPass';
import type { BackgroundParams, DitherParams } from './types';

const NOISE_INDEX = { value: 0, simplex: 1, worley: 2 } as const;

/**
 * Renders the animated dither-noise background to a canvas, deterministically.
 * Call setTime(seconds) and renderFrame() to draw any frame on demand
 * (this is what the PNG-sequence exporter uses).
 */
export class BackgroundRenderer {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private material: THREE.ShaderMaterial;
  private rt: THREE.WebGLRenderTarget;
  private dither = new DitherPass();
  private params: BackgroundParams;
  private ditherParams: DitherParams;
  private width = 1;
  private height = 1;

  constructor(canvas: HTMLCanvasElement, params: BackgroundParams, ditherParams: DitherParams) {
    this.params = { ...params };
    this.ditherParams = { ...ditherParams };

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(1); // exporter wants exact pixel sizes
    this.renderer.setClearColor(0x000000, 0);

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        u_resolution: { value: new THREE.Vector2(1, 1) },
        u_time: { value: 0 },
        u_speed: { value: params.speed },
        u_complexity: { value: params.complexity },
        u_noiseType: { value: NOISE_INDEX[params.noiseType] },
        u_colorA: { value: new THREE.Color(params.colorA) },
        u_colorB: { value: new THREE.Color(params.colorB) },
        u_scale: { value: params.scale },
        u_warp: { value: params.warp },
        u_contrast: { value: params.contrast },
        u_bias: { value: params.bias },
        u_rotation: { value: (params.rotation * Math.PI) / 180.0 },
        u_brightness: { value: 1.0 },
      },
      vertexShader: backgroundVertexShader,
      fragmentShader: backgroundFragmentShader,
      depthTest: false,
      depthWrite: false,
    });

    this.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material));

    this.rt = new THREE.WebGLRenderTarget(1, 1, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      depthBuffer: false,
      stencilBuffer: false,
    });

    this.dither.setParams(this.ditherParams);
  }

  setSize(width: number, height: number) {
    this.width = Math.max(1, Math.floor(width));
    this.height = Math.max(1, Math.floor(height));
    // updateStyle=false so we don't overwrite the canvas's CSS width/height —
    // React's frameStyle controls the on-screen size; this only changes the
    // backing-store resolution.
    this.renderer.setSize(this.width, this.height, false);
    this.rt.setSize(this.width, this.height);
    (this.material.uniforms.u_resolution.value as THREE.Vector2).set(this.width, this.height);
    this.dither.setSize(this.width, this.height);
  }

  setParams(p: BackgroundParams) {
    this.params = { ...p };
    const u = this.material.uniforms;
    u.u_speed.value = p.speed;
    u.u_complexity.value = Math.max(1, Math.min(8, Math.round(p.complexity)));
    u.u_noiseType.value = NOISE_INDEX[p.noiseType];
    u.u_scale.value = p.scale;
    u.u_warp.value = p.warp;
    u.u_contrast.value = p.contrast;
    u.u_bias.value = p.bias;
    u.u_rotation.value = (p.rotation * Math.PI) / 180.0;
    (u.u_colorA.value as THREE.Color).set(p.colorA);
    (u.u_colorB.value as THREE.Color).set(p.colorB);
  }

  setDitherParams(p: DitherParams) {
    this.ditherParams = { ...p };
    this.dither.setParams(this.ditherParams);
  }

  /**
   * Apply per-frame audio modulation on top of the base parameters.
   *  - `speed`      : additive offset to u_speed (scrolling speed of the noise)
   *  - `brightness` : additive offset to the neutral 1.0 brightness multiplier
   *                   applied to the final color (>0 brightens, <0 darkens)
   * Pass zeros to leave the base values untouched. Called immediately before
   * renderFrame() so this only affects the next draw.
   */
  setModulation(offsets: { speed: number; brightness: number }) {
    const u = this.material.uniforms;
    const p = this.params;
    u.u_speed.value = p.speed + offsets.speed;
    u.u_brightness.value = Math.max(0, 1.0 + offsets.brightness);
  }

  /** Draw a single frame at time t (seconds). */
  renderFrame(timeSeconds: number) {
    const u = this.material.uniforms;
    u.u_time.value = timeSeconds;
    if (this.params.autoRotate) {
      u.u_rotation.value =
        ((this.params.rotation + timeSeconds * this.params.autoRotateSpeed) * Math.PI) / 180.0;
    }
    if (this.ditherParams.enabled) {
      this.renderer.setRenderTarget(this.rt);
      this.renderer.render(this.scene, this.camera);
      this.renderer.setRenderTarget(null);
      this.dither.render(this.renderer, this.rt.texture, null);
    } else {
      this.renderer.setRenderTarget(null);
      this.renderer.render(this.scene, this.camera);
    }
  }

  dispose() {
    this.rt.dispose();
    this.material.dispose();
    this.dither.dispose();
    this.renderer.dispose();
  }
}
