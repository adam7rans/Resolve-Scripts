import React, { useEffect, useRef, useState } from 'react';
import { Section, Slider, Toggle } from './Controls';
import { TabBar } from './Tabs';
import { BandMeter } from './ReactivityControls';
import { AUDIO_EXTENSIONS, type FxSubTab } from '../lib/constants';
import type { LimiterParams } from '../lib/AudioSource';
import type { MusicParams } from '../lib/MusicPlayer';

/** Compact mute-icon + volume slider row used in the Mixer. */
const VolumeRow: React.FC<{
  volume: number;
  muted: boolean;
  onVolumeChange: (v: number) => void;
  onMutedChange: (m: boolean) => void;
}> = ({ volume, muted, onVolumeChange, onMutedChange }) => {
  const isSilent = muted || volume <= 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <button
        type="button"
        onClick={() => onMutedChange(!muted)}
        title={muted ? 'Unmute' : 'Mute'}
        style={{
          width: 28, height: 24, padding: 0, display: 'inline-flex',
          alignItems: 'center', justifyContent: 'center',
          background: '#1a1a1a', color: isSilent ? '#888' : '#ddd',
          border: '1px solid #2a2a2a', borderRadius: 3, cursor: 'pointer',
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" strokeWidth="2"
             strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" stroke="currentColor" />
          {isSilent ? (
            <>
              <line x1="23" y1="9" x2="17" y2="15" />
              <line x1="17" y1="9" x2="23" y2="15" />
            </>
          ) : (
            <>
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
            </>
          )}
        </svg>
      </button>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={volume}
        onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
        style={{ flex: 1 }}
      />
      <input
        type="number"
        step={0.01}
        min={0}
        max={1}
        value={Number.isFinite(volume) ? Number(volume.toFixed(2)) : 0}
        onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
        style={{ width: 50, background: '#0a0a0a', color: '#ddd', border: '1px solid #333', padding: '2px 4px' }}
      />
    </div>
  );
};

export const MusicControls: React.FC<{
  value: MusicParams;
  onChange: (v: MusicParams) => void;
  hasMusic: boolean;
  musicName: string | null;
  onPickFile: (file: File) => void;
  onClear: () => void;
  /** Live duck gain (0..1) for the meter. */
  duckGainRef: React.MutableRefObject<number>;
  /** Live speech RMS (0..1) for the meter. */
  speechRmsRef: React.MutableRefObject<number>;
  /** Volume (0..1) for the main video/audio element. */
  videoVolume: number;
  onVideoVolumeChange: (v: number) => void;
  videoMuted: boolean;
  onVideoMutedChange: (m: boolean) => void;
  /** Limiter on the main video/audio element. */
  limiter: LimiterParams;
  onLimiterChange: (v: LimiterParams) => void;
  /** Live limiter gain reduction (dB, ≤ 0) for the meter. */
  limiterReductionRef: React.MutableRefObject<number>;
  outroVolume: number;
  onOutroVolumeChange: (v: number) => void;
  showFileSection?: boolean;
}> = ({ value, onChange, hasMusic, musicName, onPickFile, onClear, duckGainRef, speechRmsRef, videoVolume, onVideoVolumeChange, videoMuted, onVideoMutedChange, limiter, onLimiterChange, limiterReductionRef, outroVolume, onOutroVolumeChange, showFileSection = true }) => {
  const set = (patch: Partial<MusicParams>) => onChange({ ...value, ...patch });
  const setSc = (patch: Partial<MusicParams['sidechain']>) =>
    onChange({ ...value, sidechain: { ...value.sidechain, ...patch } });
  const setLim = (patch: Partial<LimiterParams>) =>
    onLimiterChange({ ...limiter, ...patch });
  const [fxTab, setFxTab] = useState<FxSubTab>('sidechain');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Re-render at ~30fps so the live meters update.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 33);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      {showFileSection && (
      <Section title="Music File">
        <input
          ref={fileInputRef}
          type="file"
          accept={AUDIO_EXTENSIONS.join(',') + ',audio/*'}
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onPickFile(f);
            if (fileInputRef.current) fileInputRef.current.value = '';
          }}
        />
        {hasMusic ? (
          <>
            <div style={{ color: '#aaa', fontSize: 11, marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              ♪ {musicName ?? 'music'}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={() => fileInputRef.current?.click()}
                style={{ flex: 1, background: '#1a1a1a', color: '#ddd', border: '1px solid #2a2a2a', padding: '6px 10px', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Replace music…
              </button>
              <button
                onClick={onClear}
                style={{ background: '#1a1a1a', color: '#aaa', border: '1px solid #2a2a2a', padding: '6px 10px', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Remove
              </button>
            </div>
          </>
        ) : (
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{ width: '100%', background: '#1f6feb', color: '#fff', border: 'none', padding: '6px 10px', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Upload music…
          </button>
        )}
      </Section>
      )}

      <Section title="Mixer">
        <div style={{ color: '#888', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>Video</div>
        <VolumeRow
          volume={videoVolume}
          muted={videoMuted}
          onVolumeChange={onVideoVolumeChange}
          onMutedChange={onVideoMutedChange}
        />
        <div style={{ color: '#888', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, marginTop: 6 }}>Music</div>
        <VolumeRow
          volume={value.volume}
          muted={value.muted}
          onVolumeChange={(volume) => set({ volume })}
          onMutedChange={(muted) => set({ muted })}
        />
        <div style={{ color: '#888', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, marginTop: 6 }}>Outro</div>
        <Slider label="volume" value={outroVolume} min={0} max={1} step={0.05} onChange={onOutroVolumeChange} />
      </Section>

      <TabBar<FxSubTab>
        tabs={[
          { value: 'sidechain', label: 'Sidechain' },
          { value: 'limiter',   label: 'Limiter' },
        ]}
        value={fxTab}
        onChange={setFxTab}
        variant="sub"
      />

      {fxTab === 'sidechain' && (
        <Section title="Sidechain (speech ducks music)">
          <Toggle label="enabled" value={value.sidechain.enabled} onChange={(enabled) => setSc({ enabled })} />
          <Slider
            label="threshold"
            value={value.sidechain.threshold}
            min={0} max={1} step={0.01}
            onChange={(threshold) => setSc({ threshold })}
          />
          <Slider
            label="amount"
            value={value.sidechain.amount}
            min={0} max={1} step={0.01}
            onChange={(amount) => setSc({ amount })}
          />
          <Slider
            label="attack ms"
            value={value.sidechain.attackMs}
            min={5} max={500} step={5}
            ticks={[50, 100, 200]}
            onChange={(attackMs) => setSc({ attackMs: Math.round(attackMs) })}
          />
          <Slider
            label="release ms"
            value={value.sidechain.releaseMs}
            min={20} max={2000} step={10}
            ticks={[200, 500, 1000]}
            onChange={(releaseMs) => setSc({ releaseMs: Math.round(releaseMs) })}
          />
          <BandMeter label="speech" value={speechRmsRef.current} />
          {/* duck gain is 0..1 where 1 = no ducking; show as inverted "ducking %" */}
          <BandMeter label="duck" value={1 - duckGainRef.current} />
        </Section>
      )}

      {fxTab === 'limiter' && (
        <Section title="Limiter (boosts video/voice)">
          <Toggle label="enabled" value={limiter.enabled} onChange={(enabled) => setLim({ enabled })} />
          <Slider
            label="input dB"
            value={limiter.inputGainDb}
            min={-12} max={24} step={0.5}
            ticks={[0, 6, 12, 18]}
            onChange={(inputGainDb) => setLim({ inputGainDb })}
          />
          <Slider
            label="threshold dB"
            value={limiter.thresholdDb}
            min={-30} max={0} step={0.5}
            ticks={[-24, -12, -6]}
            onChange={(thresholdDb) => setLim({ thresholdDb })}
          />
          <Slider
            label="release ms"
            value={Math.round(limiter.releaseSec * 1000)}
            min={50} max={1000} step={10}
            ticks={[100, 250, 500]}
            onChange={(ms) => setLim({ releaseSec: Math.max(0.05, ms / 1000) })}
          />
          <Slider
            label="output dB"
            value={limiter.outputGainDb}
            min={-12} max={12} step={0.5}
            ticks={[-6, 0, 6]}
            onChange={(outputGainDb) => setLim({ outputGainDb })}
          />
          {/* gain reduction: 0 dB at rest, negative when limiting; show as 0..1 magnitude. */}
          <BandMeter label="reduction" value={Math.min(1, Math.max(0, -limiterReductionRef.current / 12))} />
        </Section>
      )}
    </>
  );
};
