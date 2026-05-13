/**
 * Offline envelope computation for deterministic, frame-accurate audio analysis.
 *
 * Fetches an audio file, decodes it to an AudioBuffer, and pre-computes
 * per-frame band envelopes by running the buffer through low/band/high
 * biquad filters in an OfflineAudioContext.
 */

import type { AudioBands } from './AudioSource';

export interface EnvelopeData {
  buffer: AudioBuffer;
  envelope: Float32Array;
}

/**
 * Fetch + decode + pre-compute filtered envelopes.
 * Returns the decoded AudioBuffer and a Float32Array with 4 interleaved
 * channels (rms, low, mid, high) at `envelopeRate` samples/sec.
 */
export async function computeEnvelope(url: string, envelopeRate: number): Promise<EnvelopeData> {
  const Ctx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
  const tmpCtx = new Ctx();
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch audio: ${res.status}`);
    const buf = await res.arrayBuffer();
    const audioBuffer = await tmpCtx.decodeAudioData(buf.slice(0));

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
    const frames = Math.ceil(totalSec * envelopeRate);
    const env = new Float32Array(frames * 4);
    const windowSize = Math.max(1, Math.floor(sr / envelopeRate));
    const fullData = audioBuffer.getChannelData(0);
    const lowData = low.getChannelData(0);
    const midData = mid.getChannelData(0);
    const highData = high.getChannelData(0);

    // First pass: raw RMS per band
    let max = 1e-6;
    for (let i = 0; i < frames; i++) {
      const start = Math.floor(i * sr / envelopeRate);
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

    return { buffer: audioBuffer, envelope: env };
  } finally {
    tmpCtx.close().catch(() => {});
  }
}

/**
 * Read deterministic bands at `timeSec` from a pre-computed envelope.
 * Returns zeros if envelope is null.
 */
export function readEnvelopeBands(envelope: Float32Array | null, envelopeRate: number, timeSec: number): AudioBands {
  if (!envelope) return { rms: 0, low: 0, mid: 0, high: 0 };
  const i = Math.max(0, Math.min(envelope.length / 4 - 1, Math.floor(timeSec * envelopeRate)));
  return {
    rms: envelope[i * 4 + 0],
    low: envelope[i * 4 + 1],
    mid: envelope[i * 4 + 2],
    high: envelope[i * 4 + 3],
  };
}

function rmsRange(data: Float32Array, start: number, end: number): number {
  let s = 0;
  const n = Math.max(1, end - start);
  for (let i = start; i < end; i++) s += data[i] * data[i];
  return Math.sqrt(s / n);
}
