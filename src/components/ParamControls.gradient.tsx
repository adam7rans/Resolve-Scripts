import React from 'react';
import { Section, Slider, Toggle, ColorInput, Select } from './Controls';
import { MAX_VIDEO_GRADIENT_STOPS, withGradientStops, type VideoGradientStop, type VideoShaderParams } from '../lib/types';

interface WithReset {
  onReset?: () => void;
}

const RAD_PER_DEG = Math.PI / 180;
const GRADIENT_TYPE_OPTIONS = [
  { label: 'linear', value: 0 },
  { label: 'radial', value: 1 },
];
const BLEND_MODE_OPTIONS = [
  { label: 'normal', value: 0 },
  { label: 'multiply', value: 1 },
  { label: 'screen', value: 2 },
  { label: 'overlay', value: 3 },
];

const nextGradientStopId = () => `stop-${Math.random().toString(36).slice(2, 8)}`;

function hexToRgb(hex: string): [number, number, number] {
  const cleaned = hex.replace('#', '').trim();
  const value = cleaned.length === 3 ? cleaned.split('').map((char) => char + char).join('') : cleaned.padEnd(6, '0').slice(0, 6);
  const num = Number.parseInt(value, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function gradientPreviewCss(stops: VideoGradientStop[]): string {
  return `linear-gradient(90deg, ${stops.map((stop) => {
    const [r, g, b] = hexToRgb(stop.color);
    return `rgba(${r}, ${g}, ${b}, ${stop.opacity}) ${Math.round(stop.position * 100)}%`;
  }).join(', ')})`;
}

export const VideoGradientSection: React.FC<{ value: VideoShaderParams; onChange: (value: VideoShaderParams) => void } & WithReset> = ({ value, onChange, onReset }) => {
  const set = (patch: Partial<VideoShaderParams>) => onChange({ ...value, ...patch });
  const [selectedStopId, setSelectedStopId] = React.useState<string | null>(value.gradientStops[0]?.id ?? null);

  React.useEffect(() => {
    if (!value.gradientStops.length) return void setSelectedStopId(null);
    if (!selectedStopId || !value.gradientStops.some((stop) => stop.id === selectedStopId)) setSelectedStopId(value.gradientStops[0].id);
  }, [selectedStopId, value.gradientStops]);

  const selectedStopIndex = Math.max(0, value.gradientStops.findIndex((stop) => stop.id === selectedStopId));
  const selectedStop = value.gradientStops[selectedStopIndex] ?? value.gradientStops[0];
  const setStops = (stops: VideoGradientStop[]) => onChange(withGradientStops(value, stops));
  const updateSelectedStop = (patch: Partial<VideoGradientStop>) => selectedStop && setStops(value.gradientStops.map((stop) => (stop.id === selectedStop.id ? { ...stop, ...patch } : stop)));

  const addStop = () => {
    if (value.gradientStops.length >= MAX_VIDEO_GRADIENT_STOPS || !selectedStop) return;
    const currentStop = value.gradientStops[selectedStopIndex];
    const previousStop = value.gradientStops[selectedStopIndex - 1];
    const nextStop = value.gradientStops[selectedStopIndex + 1];
    const insertAfterCurrent = !!nextStop;
    const start = insertAfterCurrent ? currentStop.position : (previousStop?.position ?? 0);
    const end = insertAfterCurrent ? nextStop.position : currentStop.position;
    const newStop: VideoGradientStop = { id: nextGradientStopId(), color: currentStop.color, opacity: currentStop.opacity, position: Math.max(0, Math.min(1, start + (end - start) * 0.5)) };
    const nextStops = [...value.gradientStops];
    nextStops.splice(insertAfterCurrent ? selectedStopIndex + 1 : selectedStopIndex, 0, newStop);
    setSelectedStopId(newStop.id);
    setStops(nextStops);
  };

  const removeSelectedStop = () => {
    if (!selectedStop || value.gradientStops.length <= 2) return;
    const nextStops = value.gradientStops.filter((stop) => stop.id !== selectedStop.id);
    setSelectedStopId(nextStops[Math.min(selectedStopIndex, nextStops.length - 1)]?.id ?? null);
    setStops(nextStops);
  };

  return (
    <Section title="Gradient" onReset={onReset} enabled={value.gradientEnabled} onToggle={(enabled) => set({ gradientEnabled: enabled })}>
      {value.gradientEnabled && (
        <>
          <Select label="type" value={value.gradientType} options={GRADIENT_TYPE_OPTIONS} onChange={(next) => set({ gradientType: parseInt(next, 10) })} />
          <Select label="blend" value={value.gradientBlendMode} options={BLEND_MODE_OPTIONS} onChange={(next) => set({ gradientBlendMode: parseInt(next, 10) })} />
          <Toggle label="show guide" value={value.gradientGuideVisible} onChange={(next) => set({ gradientGuideVisible: next })} />
          <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr 60px', gap: 8, alignItems: 'center' }}>
            <span style={{ color: '#aaa' }}>stops</span>
            <div>
              <div style={{ position: 'relative', height: 28, borderRadius: 6, border: '1px solid #333', background: gradientPreviewCss(value.gradientStops), boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.04)' }}>
                {value.gradientStops.map((stop) => (
                  <button key={stop.id} onClick={() => setSelectedStopId(stop.id)} title={`${Math.round(stop.position * 100)}%`} style={{ position: 'absolute', left: `calc(${stop.position * 100}% - 7px)`, top: '50%', width: 14, height: 14, transform: 'translateY(-50%)', borderRadius: 999, border: stop.id === selectedStop?.id ? '2px solid #fff' : '1px solid rgba(255,255,255,0.7)', background: stop.color, opacity: Math.max(0.2, stop.opacity), boxShadow: stop.id === selectedStop?.id ? '0 0 0 2px rgba(31,111,235,0.45)' : '0 1px 4px rgba(0,0,0,0.5)', cursor: 'pointer' }} />
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, color: '#666', fontSize: 10 }}>
                <span>0%</span>
                <span>{value.gradientStops.length}/{MAX_VIDEO_GRADIENT_STOPS}</span>
                <span>100%</span>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <button onClick={addStop} disabled={value.gradientStops.length >= MAX_VIDEO_GRADIENT_STOPS} style={{ background: value.gradientStops.length >= MAX_VIDEO_GRADIENT_STOPS ? '#222' : '#1f6feb', color: value.gradientStops.length >= MAX_VIDEO_GRADIENT_STOPS ? '#666' : '#fff', border: 'none', borderRadius: 3, padding: '3px 0', cursor: value.gradientStops.length >= MAX_VIDEO_GRADIENT_STOPS ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontSize: 11 }}>Add</button>
              <button onClick={removeSelectedStop} disabled={value.gradientStops.length <= 2} style={{ background: value.gradientStops.length <= 2 ? '#181818' : '#2a1616', color: value.gradientStops.length <= 2 ? '#666' : '#f29b9b', border: '1px solid #333', borderRadius: 3, padding: '3px 0', cursor: value.gradientStops.length <= 2 ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontSize: 11 }}>Remove</button>
            </div>
          </div>
          {selectedStop && (
            <>
              <ColorInput label={`stop ${selectedStopIndex + 1}`} value={selectedStop.color} onChange={(next) => updateSelectedStop({ color: next })} />
              <Slider label="stop opacity" value={selectedStop.opacity} min={0} max={1} step={0.01} onChange={(next) => updateSelectedStop({ opacity: next })} />
              <Slider label="stop position" value={selectedStop.position * 100} min={0} max={100} step={1} onChange={(next) => updateSelectedStop({ position: next / 100 })} />
            </>
          )}
          <Slider label="opacity" value={value.gradientOpacity} min={0} max={1} step={0.01} onChange={(next) => set({ gradientOpacity: next })} />
          {value.gradientType === 0 && <Slider label="angle" value={value.gradientAngle / RAD_PER_DEG} min={0} max={360} step={1} onChange={(next) => set({ gradientAngle: next * RAD_PER_DEG })} />}
          <Slider label="scale" value={value.gradientScale} min={0.1} max={5} step={0.05} onChange={(next) => set({ gradientScale: next })} />
          <Slider label="offset X" value={value.gradientOffsetX} min={-1} max={1} step={0.01} onChange={(next) => set({ gradientOffsetX: next })} />
          <Slider label="offset Y" value={value.gradientOffsetY} min={-1} max={1} step={0.01} onChange={(next) => set({ gradientOffsetY: next })} />
        </>
      )}
    </Section>
  );
};
