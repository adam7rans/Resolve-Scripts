/**
 * MusicPlayer
 *
 * Plays a backing-music HTMLAudioElement through a Web Audio graph:
 *
 *   MediaElement → volumeGain → duckGain → destination
 *
 * `volumeGain` is the user volume (0..1, or 0 if muted).
 * `duckGain`   is driven by `applySidechain(speechRms, params, dt)` which is
 *              called once per animation frame from App.tsx. It computes a
 *              target gain (1.0 when no ducking, < 1.0 when speech is loud)
 *              and smooths the actual gain toward it with separate attack
 *              (going down) and release (going up) time-constants.
 *
 * The whole thing only matters for the live preview — PNG export is silent,
 * so DaVinci Resolve will mux audio at edit time.
 */
export interface SidechainParams {
  enabled: boolean;
  /** Speech RMS (0..1) above which ducking starts. */
  threshold: number;
  /** Maximum ducking when speech is at full volume (0..1). 1 = full silence. */
  amount: number;
  /** Time-constant for ducking down (ms). */
  attackMs: number;
  /** Time-constant for releasing back to full volume (ms). */
  releaseMs: number;
}

export interface MusicParams {
  volume: number;       // 0..1
  muted: boolean;
  sidechain: SidechainParams;
}

export class MusicPlayer {
  readonly element: HTMLAudioElement;
  private ctx: AudioContext | null = null;
  private srcNode: MediaElementAudioSourceNode | null = null;
  private volumeGain: GainNode | null = null;
  private duckGain: GainNode | null = null;
  /** Smoothed duck multiplier currently applied (1.0 = no ducking). */
  private currentDuck = 1.0;
  private lastTimeMs = 0;

  constructor(element: HTMLAudioElement) {
    this.element = element;
  }

  /** Lazily build the Web Audio graph (must be called from a user gesture). */
  ensureGraph() {
    if (this.ctx) return;
    const Ctx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
    const ctx = new Ctx();
    const src = ctx.createMediaElementSource(this.element);
    const volumeGain = ctx.createGain();
    const duckGain = ctx.createGain();
    volumeGain.gain.value = 1;
    duckGain.gain.value = 1;
    src.connect(volumeGain);
    volumeGain.connect(duckGain);
    duckGain.connect(ctx.destination);
    this.ctx = ctx;
    this.srcNode = src;
    this.volumeGain = volumeGain;
    this.duckGain = duckGain;
    this.lastTimeMs = performance.now();
  }

  async resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  /** Apply user volume + mute. Call whenever those change. */
  setVolume(volume: number, muted: boolean) {
    const v = muted ? 0 : Math.max(0, Math.min(1, volume));
    if (this.volumeGain) {
      // Use immediate set to keep response snappy with the slider.
      this.volumeGain.gain.value = v;
    }
    // Also reflect on the element so it keeps working before ensureGraph().
    this.element.muted = muted;
    if (!muted) this.element.volume = Math.max(0, Math.min(1, volume));
  }

  /**
   * Per-frame sidechain update. Computes the target duck gain from the speech
   * RMS and smooths the live duckGain toward it. Time-constant smoothing uses
   * 1 - exp(-dt/tau) so attack/release feel natural regardless of frame rate.
   *
   * Returns the current duck gain (mostly for debug / metering in the UI).
   */
  applySidechain(speechRms: number, p: SidechainParams): number {
    if (!this.duckGain || !this.ctx) return 1;

    // Target duck gain: 1.0 at or below threshold, dropping toward (1 - amount)
    // as speech approaches full volume. Linear above threshold.
    let target = 1.0;
    if (p.enabled) {
      // Speech RMS typically maxes out around 0.2-0.3. Normalize it so it reaches 1.0.
      const normalizedRms = Math.min(1, speechRms * 4);
      if (normalizedRms > p.threshold) {
        const over = normalizedRms - p.threshold;
        // Scale 'over' heavily so crossing the threshold causes significant ducking
        const compression = Math.min(1, over * 4);
        target = 1 - (compression * Math.max(0, Math.min(1, p.amount)));
      }
    }

    // Frame-rate-independent one-pole smoothing.
    const now = performance.now();
    const dt = Math.max(0.001, (now - this.lastTimeMs) / 1000);
    this.lastTimeMs = now;
    const goingDown = target < this.currentDuck;
    const tauMs = goingDown ? p.attackMs : p.releaseMs;
    const tau = Math.max(0.001, tauMs / 1000);
    const alpha = 1 - Math.exp(-dt / tau);
    this.currentDuck = this.currentDuck + (target - this.currentDuck) * alpha;

    // Apply to the GainNode. setTargetAtTime would also work, but a direct
    // assignment is fine when we update every frame.
    this.duckGain.gain.value = this.currentDuck;
    return this.currentDuck;
  }

  /** Reset smoothing — call on seek, stop, or when sidechain is toggled off. */
  resetDuck() {
    this.currentDuck = 1;
    if (this.duckGain) this.duckGain.gain.value = 1;
    this.lastTimeMs = performance.now();
  }

  get currentDuckGain(): number {
    return this.currentDuck;
  }

  dispose() {
    try { this.srcNode?.disconnect(); } catch {}
    try { this.volumeGain?.disconnect(); } catch {}
    try { this.duckGain?.disconnect(); } catch {}
    if (this.ctx) this.ctx.close().catch(() => {});
    this.ctx = null;
    this.srcNode = null;
    this.volumeGain = null;
    this.duckGain = null;
  }
}

export const DEFAULT_MUSIC_PARAMS: MusicParams = {
  volume: 0.6,
  muted: false,
  sidechain: {
    enabled: true,
    threshold: 0.05,
    amount: 0.7,
    attackMs: 80,
    releaseMs: 350,
  },
};
