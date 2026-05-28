import React, { useEffect, useState } from 'react';
import { Section, Slider, Toggle } from './Controls';
import type { AudioBands } from '../lib/AudioSource';
import type { AudioReactivityParams } from '../lib/types';

export const BandMeter: React.FC<{ label: string; value: number }> = ({ label, value }) => {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
      <span style={{ width: 36, color: '#888', fontSize: 11 }}>{label}</span>
      <div style={{ flex: 1, height: 8, background: '#1a1a1a', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${pct.toFixed(1)}%`, height: '100%', background: '#1f6feb', transition: 'width 60ms linear' }} />
      </div>
      <span style={{ width: 36, color: '#666', fontSize: 10, textAlign: 'right' }}>{value.toFixed(2)}</span>
    </div>
  );
};

export const ReactivityControls: React.FC<{
  value: AudioReactivityParams;
  onChange: (v: AudioReactivityParams) => void;
  hasAudio: boolean;
  bandsRef: React.MutableRefObject<AudioBands>;
}> = ({ value, onChange, hasAudio, bandsRef }) => {
  const set = (patch: Partial<AudioReactivityParams>) => onChange({ ...value, ...patch });

  // Live band display — re-render at ~30fps so the user can see what the
  // signal is doing while they tweak gains.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!hasAudio) return;
    const id = setInterval(() => setTick((n) => n + 1), 33);
    return () => clearInterval(id);
  }, [hasAudio]);
  const b = bandsRef.current;

  return (
    <>
      {!hasAudio && (
        <div style={{ color: '#aaa', fontSize: 11, padding: '4px 0 8px', borderBottom: '1px solid #1f1f1f', marginBottom: 8 }}>
          Load an audio file (Video tab → Choose video or audio…) to enable audio-reactive modulation.
        </div>
      )}
      <Section title="Live levels">
        <BandMeter label="rms"  value={b.rms}  />
        <BandMeter label="low"  value={b.low}  />
        <BandMeter label="mid"  value={b.mid}  />
        <BandMeter label="high" value={b.high} />
      </Section>
      <Section title="Reactivity">
        <Toggle label="enabled" value={value.enabled} onChange={(enabled) => set({ enabled })} />
        <Slider label="gain"    value={value.gain}    min={0} max={4} step={0.05} onChange={(gain) => set({ gain })} />
        <Slider label="attack"  value={value.attack}  min={0} max={1} step={0.01} onChange={(attack) => set({ attack })} />
        <Slider label="release" value={value.release} min={0} max={1} step={0.01} onChange={(release) => set({ release })} />
      </Section>
      <Section title="Background → audio">
        <Slider label="speed (rms)"      value={value.modSpeed}      min={0} max={2} step={0.01} onChange={(modSpeed) => set({ modSpeed })} />
        <Slider label="brightness (rms)" value={value.modBrightness} min={0} max={2} step={0.01} onChange={(modBrightness) => set({ modBrightness })} />
      </Section>
    </>
  );
};
