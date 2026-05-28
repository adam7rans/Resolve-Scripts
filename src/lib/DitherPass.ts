import * as THREE from 'three';
import { ditherVertexShader, ditherFragmentShader } from '../shaders/ditherShader';
import type { DitherParams } from './types';

/**
 * A self-contained post-processing pass that takes any input texture and
 * renders the dithered/quantized result either to the screen or to a target.
 */
export class DitherPass {
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private material: THREE.ShaderMaterial;
  private mesh: THREE.Mesh;

  constructor() {
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uDitherScale: { value: 1.0 },
        uContrast: { value: 1.0 },
        uBrightness: { value: 1.0 },
        uDitherType: { value: 1 },
        uErrorDiffusion: { value: 1.0 },
        uThreshold: { value: 0.5 },
        uColorA: { value: new THREE.Color(0x000000) },
        uColorB: { value: new THREE.Color(0xffffff) },
        uLevels: { value: 4.0 },
      },
      vertexShader: ditherVertexShader,
      fragmentShader: ditherFragmentShader,
      transparent: false,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.scene.add(this.mesh);
  }

  setParams(p: DitherParams) {
    const u = this.material.uniforms;
    u.uDitherScale.value = p.ditherScale;
    u.uContrast.value = p.contrast;
    u.uBrightness.value = p.brightness;
    u.uDitherType.value = p.ditherType;
    u.uThreshold.value = p.threshold;
    u.uLevels.value = Math.max(2, Math.floor(p.levels));
    (u.uColorA.value as THREE.Color).set(p.colorA);
    (u.uColorB.value as THREE.Color).set(p.colorB);
  }

  setSize(w: number, h: number) {
    (this.material.uniforms.uResolution.value as THREE.Vector2).set(w, h);
  }

  render(renderer: THREE.WebGLRenderer, inputTexture: THREE.Texture, target: THREE.WebGLRenderTarget | null = null) {
    this.material.uniforms.tDiffuse.value = inputTexture;
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(target);
    renderer.render(this.scene, this.camera);
    renderer.setRenderTarget(prev);
  }

  dispose() {
    this.material.dispose();
    (this.mesh.geometry as THREE.BufferGeometry).dispose();
  }
}
