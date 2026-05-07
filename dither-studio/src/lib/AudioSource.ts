/**
 * AudioSource
 *
 * - Wraps an HTMLAudioElement for live preview playback (driven by the user's
 *   transport: Play/Pause, Seek). Wires it to a Web Audio AnalyserNode so the
 *   render loop can read bands at the current playhead in real time.
 *
 * - Independently fetches the audio file once, decodes it to an AudioBuffer,
 *   and pre-computes deterministic per-frame band envelopes by running the
 *   buffer through low/band/high biquad filters in OfflineAudioContext. Used
 *   for frame-accurate, deterministic export.
 *
 * Bands returned are normalised 0..1 floats with attack/release smoothing
 * applied (see `getBands`). `getDeterministicBands(time)` returns the same
 * shape but read from the offline-rendered buffers — no smoothing applied
 * (the consumer can apply attack/release to match preview look if desired).
 */

export interface AudioBands {
  rms: number;
  low: number;
  mid: number;
  high: number;
}

/**
 * Parameters for the video/speech limiter chain. Implemented as
 *   inputGain → DynamicsCompressorNode (limiter settings) → outputGain
 * inserted between the source and the rest of the graph. When disabled the
 * chain becomes unity (compressor threshold pushed to 0 dB, ratio 1).
 */
export interface LimiterParams {
  enabled: boolean;
  /** Pre-compressor boost in dB. Use this to drive a quiet voice into the limiter. */
  inputGainDb: number;
  /** Compressor threshold in dB (-60..0). Anything above is limited. */
  thresholdDb: number;
  /** Release time in seconds (0.05..1.0). */
  releaseSec: number;
  /** Post-compressor make-up gain in dB. */
  outputGainDb: number;
}

export const DEFAULT_LIMITER: LimiterParams = {
  enabled: false,
  inputGainDb: 0,
  thresholdDb: -6,
  releaseSec: 0.25,
  outputGainDb: 0,
};

function dbToLin(db: number): number {
  return Math.pow(10, db / 20);
}

export interface AudioSourceOptions {
  /** Media element used for live playback (created/managed externally). */
  element: HTMLMediaElement;
  /** URL to fetch + decode for offline analysis. */
  url: string;
}

const FFT_SIZE = 1024;
const TIME_DOMAIN_BYTES = FFT_SIZE;
const FREQ_BIN_COUNT = FFT_SIZE / 2;

export class AudioSource {
  readonly element: HTMLMediaElement;
  private url: string;
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private srcNode: MediaElementAudioSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private limiterIn: GainNode | null = null;
  private limiterComp: DynamicsCompressorNode | null = null;
  private limiterOut: GainNode | null = null;
  private limiterParams: LimiterParams = { ...DEFAULT_LIMITER };
  private timeData = new Uint8Array(TIME_DOMAIN_BYTES);
  private freqData = new Uint8Array(FREQ_BIN_COUNT);

  private buffer: AudioBuffer | null = null;
  /** Pre-computed envelope data: 4 channels (rms, low, mid, high) at `envelopeRate` Hz. */
  private envelope: Float32Array | null = null;
  private envelopeRate = 240; // samples per second (≈ 4ms resolution)

  // smoothing state
  private smoothed: AudioBands = { rms: 0, low: 0, mid: 0, high: 0 };
  private lastBands: AudioBands = { rms: 0, low: 0, mid: 0, high: 0 };

  constructor(opts: AudioSourceOptions) {
    this.element = opts.element;
    this.url = opts.url;
  }

  /** Lazily create the Web Audio graph (must be called from a user gesture). */
  ensureGraph() {
    if (this.ctx) return;
    const Ctx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
    const ctx = new Ctx();
    const src = ctx.createMediaElementSource(this.element);
    const limiterIn = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    const limiterOut = ctx.createGain();
    const gain = ctx.createGain();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = FFT_SIZE;
    analyser.smoothingTimeConstant = 0.4;

    // Limiter graph (always in the chain; bypassed by neutralizing the
    // compressor + gains when disabled). Order: src → limiterIn → comp →
    // limiterOut → gain (mute) → analyser (post-fx) → destination.
    src.connect(limiterIn);
    limiterIn.connect(comp);
    comp.connect(limiterOut);
    limiterOut.connect(gain);
    gain.connect(analyser);
    analyser.connect(ctx.destination);

    this.ctx = ctx;
    this.srcNode = src;
    this.gainNode = gain;
    this.limiterIn = limiterIn;
    this.limiterComp = comp;
    this.limiterOut = limiterOut;
    this.analyser = analyser;
    // Apply current limiter params (in case setLimiter was called pre-graph).
    this.applyLimiterParams();
  }

  setLimiter(p: LimiterParams) {
    this.limiterParams = { ...p };
    this.applyLimiterParams();
  }

  private applyLimiterParams() {
    const { limiterIn, limiterComp, limiterOut } = this;
    if (!limiterIn || !limiterComp || !limiterOut || !this.ctx) return;
    const p = this.limiterParams;
    const now = this.ctx.currentTime;
    if (p.enabled) {
      limiterIn.gain.setTargetAtTime(dbToLin(p.inputGainDb), now, 0.01);
      limiterComp.threshold.setTargetAtTime(p.thresholdDb, now, 0.01);
      limiterComp.knee.setTargetAtTime(0, now, 0.01);
      limiterComp.ratio.setTargetAtTime(20, now, 0.01); // limiter behavior
      limiterComp.attack.setTargetAtTime(0.003, now, 0.01);
      limiterComp.release.setTargetAtTime(Math.max(0.01, p.releaseSec), now, 0.01);
      limiterOut.gain.setTargetAtTime(dbToLin(p.outputGainDb), now, 0.01);
    } else {
      // Bypass: unity in/out, compressor neutered (threshold 0 dB, ratio 1).
      limiterIn.gain.setTargetAtTime(1, now, 0.01);
      limiterComp.threshold.setTargetAtTime(0, now, 0.01);
      limiterComp.knee.setTargetAtTime(0, now, 0.01);
      limiterComp.ratio.setTargetAtTime(1, now, 0.01);
      limiterComp.attack.setTargetAtTime(0.003, now, 0.01);
      limiterComp.release.setTargetAtTime(0.25, now, 0.01);
      limiterOut.gain.setTargetAtTime(1, now, 0.01);
    }
  }

  /** Live gain reduction (dB, ≤ 0) from the compressor. */
  getLimiterReductionDb(): number {
    return this.limiterComp ? this.limiterComp.reduction : 0;
  }

  /** Resume the AudioContext if it's suspended (must follow a user gesture). */
  async resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  setMuted(muted: boolean) {
    if (this.gainNode) this.gainNode.gain.value = muted ? 0 : 1;
    // Also mute the element so it works without the audio graph (e.g., before
    // first play if ensureGraph hasn't been called yet).
    this.element.muted = muted;
  }

  /**
   * Read bands from the live AnalyserNode. Returns smoothed values.
   * `attack` / `release` are simple one-pole coefficients (0..1) applied per
   * frame. Higher attack = more responsive on rises; higher release = decays
   * back to zero faster.
   */
  getBands(attack = 0.5, release = 0.15): AudioBands {
    const analyser = this.analyser;
    if (!analyser) return this.smoothed;

    analyser.getByteFrequencyData(this.freqData);
    analyser.getByteTimeDomainData(this.timeData);

    // RMS over time-domain (centered around 128)
    let sumSq = 0;
    for (let i = 0; i < this.timeData.length; i++) {
      const v = (this.timeData[i] - 128) / 128;
      sumSq += v * v;
    }
    const rms = Math.sqrt(sumSq / this.timeData.length);

    // Frequency bands. Sample rate / 2 / FREQ_BIN_COUNT = bin width (Hz)
    const sr = this.ctx?.sampleRate ?? 44100;
    const binHz = sr / 2 / FREQ_BIN_COUNT;
    const lowEnd = Math.min(FREQ_BIN_COUNT, Math.floor(250 / binHz));
    const midEnd = Math.min(FREQ_BIN_COUNT, Math.floor(2000 / binHz));
    const sumRange = (a: number, b: number) => {
      let s = 0; const n = Math.max(1, b - a);
      for (let i = a; i < b; i++) s += this.freqData[i];
      return s / (n * 255);
    };
    const low = sumRange(0, lowEnd);
    const mid = sumRange(lowEnd, midEnd);
    const high = sumRange(midEnd, FREQ_BIN_COUNT);

    const next: AudioBands = { rms, low, mid, high };
    this.lastBands = next;

    // Asymmetric smoothing
    const update = (cur: number, target: number) => {
      const c = target > cur ? attack : release;
      return cur + (target - cur) * c;
    };
    this.smoothed = {
      rms: update(this.smoothed.rms, rms),
      low: update(this.smoothed.low, low),
      mid: update(this.smoothed.mid, mid),
      high: update(this.smoothed.high, high),
    };
    return this.smoothed;
  }

  /** Fetch + decode + pre-compute filtered envelopes for deterministic export. */
  async preloadEnvelope(): Promise<void> {
    if (this.envelope) return;
    const Ctx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
    const tmpCtx = new Ctx();
    try {
      const res = await fetch(this.url);
      if (!res.ok) throw new Error(`Failed to fetch audio: ${res.status}`);
      const buf = await res.arrayBuffer();
      const audioBuffer = await tmpCtx.decodeAudioData(buf.slice(0));
      this.buffer = audioBuffer;

      const sr = audioBuffer.sampleRate;
      const Offline = (window as any).OfflineAudioContext as typeof OfflineAudioContext;

      // Render three filtered copies in parallel
      const renderFiltered = (type: BiquadFilterType, freq: number, q: number) =>
        new Promise<AudioBuffer>((resolve) => {
          const off = new Offline(1, audioBuffer.length, sr);
          const src = off.createBufferSource();
          src.buffer = audioBuffer;
          const filter = off.createBiquadFilter();
          filter.type = type;
          filter.frequency.value = freq;
          filter.Q.value = q;
          src.connect(filter);
          filter.connect(off.destination);
          src.start();
          off.startRendering().then(resolve);
        });

      const [low, mid, high] = await Promise.all([
        renderFiltered('lowpass', 250, 0.7),
        renderFiltered('bandpass', 1000, 0.7),
        renderFiltered('highpass', 4000, 0.7),
      ]);

      // Build envelope at envelopeRate Hz: per channel, RMS over a window
      const totalSec = audioBuffer.duration;
      const frames = Math.ceil(totalSec * this.envelopeRate);
      const env = new Float32Array(frames * 4);
      const windowSize = Math.max(1, Math.floor(sr / this.envelopeRate));
      const fullData = audioBuffer.getChannelData(0);
      const lowData = low.getChannelData(0);
      const midData = mid.getChannelData(0);
      const highData = high.getChannelData(0);

      // First pass: raw RMS per band
      let max = 1e-6;
      for (let i = 0; i < frames; i++) {
        const start = Math.floor(i * sr / this.envelopeRate);
        const end = Math.min(fullData.length, start + windowSize);
        const rms = rmsRange(fullData, start, end);
        const lo = rmsRange(lowData, start, end);
        const md = rmsRange(midData, start, end);
        const hi = rmsRange(highData, start, end);
        env[i * 4 + 0] = rms;
        env[i * 4 + 1] = lo;
        env[i * 4 + 2] = md;
        env[i * 4 + 3] = hi;
        if (rms > max) max = rms;
      }
      // Normalise to peak so 1.0 = loudest moment in the file.
      const inv = 1 / max;
      for (let i = 0; i < env.length; i++) env[i] = Math.min(1, env[i] * inv);
      this.envelope = env;
    } finally {
      tmpCtx.close().catch(() => {});
    }
  }

  /**
   * Read deterministic bands at `timeSec`. Returns zeros if the envelope
   * hasn't been computed yet (no preloadEnvelope call).
   */
  getDeterministicBands(timeSec: number): AudioBands {
    const env = this.envelope;
    if (!env) return { rms: 0, low: 0, mid: 0, high: 0 };
    const i = Math.max(0, Math.min(env.length / 4 - 1, Math.floor(timeSec * this.envelopeRate)));
    return {
      rms: env[i * 4 + 0],
      low: env[i * 4 + 1],
      mid: env[i * 4 + 2],
      high: env[i * 4 + 3],
    };
  }

  /** Clear smoothing state — call when seeking or starting export. */
  resetSmoothing() {
    this.smoothed = { rms: 0, low: 0, mid: 0, high: 0 };
  }

  get duration(): number {
    return this.buffer?.duration ?? this.element.duration ?? 0;
  }

  dispose() {
    try { this.srcNode?.disconnect(); } catch {}
    try { this.limiterIn?.disconnect(); } catch {}
    try { this.limiterComp?.disconnect(); } catch {}
    try { this.limiterOut?.disconnect(); } catch {}
    try { this.gainNode?.disconnect(); } catch {}
    try { this.analyser?.disconnect(); } catch {}
    if (this.ctx) this.ctx.close().catch(() => {});
    this.ctx = null;
    this.srcNode = null;
    this.gainNode = null;
    this.limiterIn = null;
    this.limiterComp = null;
    this.limiterOut = null;
    this.analyser = null;
    this.buffer = null;
    this.envelope = null;
  }
}

function rmsRange(data: Float32Array, start: number, end: number): number {
  let s = 0;
  const n = Math.max(1, end - start);
  for (let i = start; i < end; i++) s += data[i] * data[i];
  return Math.sqrt(s / n);
}
