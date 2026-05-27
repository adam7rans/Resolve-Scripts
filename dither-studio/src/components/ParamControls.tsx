import React from 'react';
import { Section, Slider, Toggle, ColorInput, Select } from './Controls';
import {
  MAX_VIDEO_GRADIENT_STOPS,
  withGradientStops,
  type BackgroundParams,
  type DitherParams,
  type VideoGradientStop,
  type VideoShaderParams,
} from '../lib/types';
import { DITHER_TYPES } from '../shaders/ditherShader';

interface WithReset { onReset?: () => void }

const DITHER_OPTIONS = Object.entries(DITHER_TYPES).map(([k, v]) => ({
  label: k.replace(/_/g, ' ').toLowerCase(),
  value: v,
}));

export const DitherControls: React.FC<{ value: DitherParams; onChange: (v: DitherParams) => void } & WithReset> = ({ value, onChange, onReset }) => {
  const set = (patch: Partial<DitherParams>) => onChange({ ...value, ...patch });
  return (
    <Section title="Dither" onReset={onReset}>
      <Toggle label="enabled" value={value.enabled} onChange={(v) => set({ enabled: v })} />
      <Select
        label="type"
        value={value.ditherType}
        options={DITHER_OPTIONS}
        onChange={(v) => set({ ditherType: parseInt(v, 10) as DitherParams['ditherType'] })}
      />
      <Slider label="scale" value={value.ditherScale} min={0.1} max={8} step={0.05} onChange={(v) => set({ ditherScale: v })} />
      <Slider label="contrast" value={value.contrast} min={0} max={4} step={0.01} onChange={(v) => set({ contrast: v })} />
      <Slider label="brightness" value={value.brightness} min={0} max={2} step={0.01} onChange={(v) => set({ brightness: v })} />
      <Slider label="threshold" value={value.threshold} min={0} max={1} step={0.01} onChange={(v) => set({ threshold: v })} />
      <Slider label="levels" value={value.levels} min={2} max={16} step={1} onChange={(v) => set({ levels: Math.round(v) })} />
      <ColorInput label="color A" value={value.colorA} onChange={(v) => set({ colorA: v })} />
      <ColorInput label="color B" value={value.colorB} onChange={(v) => set({ colorB: v })} />
    </Section>
  );
};

export const BackgroundControls: React.FC<{ value: BackgroundParams; onChange: (v: BackgroundParams) => void } & WithReset> = ({ value, onChange, onReset }) => {
  const set = (patch: Partial<BackgroundParams>) => onChange({ ...value, ...patch });
  return (
    <Section title="Background noise" onReset={onReset}>
      <Select
        label="noise type"
        value={value.noiseType}
        options={[
          { label: 'value', value: 'value' },
          { label: 'simplex', value: 'simplex' },
          { label: 'worley', value: 'worley' },
        ]}
        onChange={(v) => set({ noiseType: v as BackgroundParams['noiseType'] })}
      />
      <Slider label="complexity" value={value.complexity} min={1} max={8} step={1} onChange={(v) => set({ complexity: Math.round(v) })} />
      <Slider label="speed" value={value.speed} min={0} max={5} step={0.01} onChange={(v) => set({ speed: v })} />
      <Slider label="scale" value={value.scale} min={0.1} max={5} step={0.01} onChange={(v) => set({ scale: v })} />
      <Slider label="warp" value={value.warp} min={0} max={3} step={0.01} onChange={(v) => set({ warp: v })} />
      <Slider label="contrast" value={value.contrast} min={0.1} max={4} step={0.01} onChange={(v) => set({ contrast: v })} />
      <Slider label="bias" value={value.bias} min={-0.5} max={0.5} step={0.01} onChange={(v) => set({ bias: v })} />
      <Slider label="rotation" value={value.rotation} min={-180} max={180} step={1} onChange={(v) => set({ rotation: v })} />
      <Toggle label="auto rotate" value={value.autoRotate} onChange={(v) => set({ autoRotate: v })} />
      <Slider label="rotate speed" value={value.autoRotateSpeed} min={-90} max={90} step={0.5} onChange={(v) => set({ autoRotateSpeed: v })} />
      <ColorInput label="color A" value={value.colorA} onChange={(v) => set({ colorA: v })} />
      <ColorInput label="color B" value={value.colorB} onChange={(v) => set({ colorB: v })} />
    </Section>
  );
};

// videoShader.ts (the shader used on the live site for the talking video)
// is one big fragment shader. We split it into subtabs by section:
//   Levels   - blackPoint / whitePoint / brightness / contrast
//   Tone     - shadows / midtones / highlights
//   Color    - exposure / gamma / saturation / clarity
//   Distort  - rotation / scale + sine-wave UV distortion
//   Dither   - dither type / scale / thresholds + colors

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
  const value = cleaned.length === 3
    ? cleaned.split('').map((char) => char + char).join('')
    : cleaned.padEnd(6, '0').slice(0, 6);
  const num = Number.parseInt(value, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function gradientPreviewCss(stops: VideoGradientStop[]): string {
  const parts = stops.map((stop) => {
    const [r, g, b] = hexToRgb(stop.color);
    return `rgba(${r}, ${g}, ${b}, ${stop.opacity}) ${Math.round(stop.position * 100)}%`;
  });
  return `linear-gradient(90deg, ${parts.join(', ')})`;
}

export const VideoGradientSection: React.FC<{ value: VideoShaderParams; onChange: (v: VideoShaderParams) => void } & WithReset> = ({ value, onChange, onReset }) => {
  const set = (patch: Partial<VideoShaderParams>) => onChange({ ...value, ...patch });
  const [selectedStopId, setSelectedStopId] = React.useState<string | null>(value.gradientStops[0]?.id ?? null);

  React.useEffect(() => {
    if (!value.gradientStops.length) {
      setSelectedStopId(null);
      return;
    }
    if (!selectedStopId || !value.gradientStops.some((stop) => stop.id === selectedStopId)) {
      setSelectedStopId(value.gradientStops[0].id);
    }
  }, [selectedStopId, value.gradientStops]);

  const selectedStopIndex = Math.max(0, value.gradientStops.findIndex((stop) => stop.id === selectedStopId));
  const selectedStop = value.gradientStops[selectedStopIndex] ?? value.gradientStops[0];

  const setStops = (stops: VideoGradientStop[]) => {
    onChange(withGradientStops(value, stops));
  };

  const updateSelectedStop = (patch: Partial<VideoGradientStop>) => {
    if (!selectedStop) return;
    setStops(value.gradientStops.map((stop) => (
      stop.id === selectedStop.id ? { ...stop, ...patch } : stop
    )));
  };

  const addStop = () => {
    if (value.gradientStops.length >= MAX_VIDEO_GRADIENT_STOPS || !selectedStop) return;
    const currentIndex = selectedStopIndex;
    const currentStop = value.gradientStops[currentIndex];
    const previousStop = value.gradientStops[currentIndex - 1];
    const nextStop = value.gradientStops[currentIndex + 1];

    const insertAfterCurrent = !!nextStop;
    const start = insertAfterCurrent ? currentStop.position : (previousStop?.position ?? 0);
    const end = insertAfterCurrent ? nextStop.position : currentStop.position;
    const position = Math.max(0, Math.min(1, start + (end - start) * 0.5));
    const newStop: VideoGradientStop = {
      id: nextGradientStopId(),
      color: currentStop.color,
      opacity: currentStop.opacity,
      position,
    };

    const nextStops = [...value.gradientStops];
    nextStops.splice(insertAfterCurrent ? currentIndex + 1 : currentIndex, 0, newStop);
    setSelectedStopId(newStop.id);
    setStops(nextStops);
  };

  const removeSelectedStop = () => {
    if (!selectedStop || value.gradientStops.length <= 2) return;
    const nextStops = value.gradientStops.filter((stop) => stop.id !== selectedStop.id);
    const nextSelected = nextStops[Math.min(selectedStopIndex, nextStops.length - 1)];
    setSelectedStopId(nextSelected?.id ?? null);
    setStops(nextStops);
  };

  return (
    <Section title="Gradient" onReset={onReset} enabled={value.gradientEnabled} onToggle={(v) => set({ gradientEnabled: v })}>
      {value.gradientEnabled && (
        <>
          <Select label="type" value={value.gradientType} options={GRADIENT_TYPE_OPTIONS} onChange={(v) => set({ gradientType: parseInt(v, 10) })} />
          <Select label="blend" value={value.gradientBlendMode} options={BLEND_MODE_OPTIONS} onChange={(v) => set({ gradientBlendMode: parseInt(v, 10) })} />
          <Toggle label="show guide" value={value.gradientGuideVisible} onChange={(v) => set({ gradientGuideVisible: v })} />
          <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr 60px', gap: 8, alignItems: 'center' }}>
            <span style={{ color: '#aaa' }}>stops</span>
            <div>
              <div
                style={{
                  position: 'relative',
                  height: 28,
                  borderRadius: 6,
                  border: '1px solid #333',
                  background: gradientPreviewCss(value.gradientStops),
                  boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.04)',
                }}
              >
                {value.gradientStops.map((stop) => (
                  <button
                    key={stop.id}
                    onClick={() => setSelectedStopId(stop.id)}
                    title={`${Math.round(stop.position * 100)}%`}
                    style={{
                      position: 'absolute',
                      left: `calc(${stop.position * 100}% - 7px)`,
                      top: '50%',
                      width: 14,
                      height: 14,
                      transform: 'translateY(-50%)',
                      borderRadius: 999,
                      border: stop.id === selectedStop?.id ? '2px solid #fff' : '1px solid rgba(255,255,255,0.7)',
                      background: stop.color,
                      opacity: Math.max(0.2, stop.opacity),
                      boxShadow: stop.id === selectedStop?.id ? '0 0 0 2px rgba(31,111,235,0.45)' : '0 1px 4px rgba(0,0,0,0.5)',
                      cursor: 'pointer',
                    }}
                  />
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, color: '#666', fontSize: 10 }}>
                <span>0%</span>
                <span>{value.gradientStops.length}/{MAX_VIDEO_GRADIENT_STOPS}</span>
                <span>100%</span>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <button
                onClick={addStop}
                disabled={value.gradientStops.length >= MAX_VIDEO_GRADIENT_STOPS}
                style={{
                  background: value.gradientStops.length >= MAX_VIDEO_GRADIENT_STOPS ? '#222' : '#1f6feb',
                  color: value.gradientStops.length >= MAX_VIDEO_GRADIENT_STOPS ? '#666' : '#fff',
                  border: 'none',
                  borderRadius: 3,
                  padding: '3px 0',
                  cursor: value.gradientStops.length >= MAX_VIDEO_GRADIENT_STOPS ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                  fontSize: 11,
                }}
              >
                Add
              </button>
              <button
                onClick={removeSelectedStop}
                disabled={value.gradientStops.length <= 2}
                style={{
                  background: value.gradientStops.length <= 2 ? '#181818' : '#2a1616',
                  color: value.gradientStops.length <= 2 ? '#666' : '#f29b9b',
                  border: '1px solid #333',
                  borderRadius: 3,
                  padding: '3px 0',
                  cursor: value.gradientStops.length <= 2 ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                  fontSize: 11,
                }}
              >
                Remove
              </button>
            </div>
          </div>
          {selectedStop && (
            <>
              <ColorInput label={`stop ${selectedStopIndex + 1}`} value={selectedStop.color} onChange={(v) => updateSelectedStop({ color: v })} />
              <Slider label="stop opacity" value={selectedStop.opacity} min={0} max={1} step={0.01} onChange={(v) => updateSelectedStop({ opacity: v })} />
              <Slider
                label="stop position"
                value={selectedStop.position * 100}
                min={0}
                max={100}
                step={1}
                onChange={(v) => updateSelectedStop({ position: v / 100 })}
              />
            </>
          )}
          <Slider label="opacity" value={value.gradientOpacity} min={0} max={1} step={0.01} onChange={(v) => set({ gradientOpacity: v })} />
          {value.gradientType === 0 && (
            <Slider label="angle" value={value.gradientAngle / RAD_PER_DEG} min={0} max={360} step={1} onChange={(v) => set({ gradientAngle: v * RAD_PER_DEG })} />
          )}
          <Slider label="scale" value={value.gradientScale} min={0.1} max={5} step={0.05} onChange={(v) => set({ gradientScale: v })} />
          <Slider label="offset X" value={value.gradientOffsetX} min={-1} max={1} step={0.01} onChange={(v) => set({ gradientOffsetX: v })} />
          <Slider label="offset Y" value={value.gradientOffsetY} min={-1} max={1} step={0.01} onChange={(v) => set({ gradientOffsetY: v })} />
        </>
      )}
    </Section>
  );
};

export const VideoLevelsSection: React.FC<{ value: VideoShaderParams; onChange: (v: VideoShaderParams) => void } & WithReset> = ({ value, onChange, onReset }) => {
  const set = (patch: Partial<VideoShaderParams>) => onChange({ ...value, ...patch });
  return (
    <Section title="Levels" onReset={onReset}>
      <Slider label="black point" value={value.blackPoint} min={0} max={0.5} step={0.005} onChange={(v) => set({ blackPoint: v })} />
      <Slider label="white point" value={value.whitePoint} min={0.5} max={1} step={0.005} onChange={(v) => set({ whitePoint: v })} />
      <Slider label="brightness" value={value.brightness} min={0} max={3} step={0.01} onChange={(v) => set({ brightness: v })} />
      <Slider label="contrast" value={value.contrast} min={0} max={4} step={0.01} onChange={(v) => set({ contrast: v })} />
    </Section>
  );
};

export const VideoToneSection: React.FC<{ value: VideoShaderParams; onChange: (v: VideoShaderParams) => void } & WithReset> = ({ value, onChange, onReset }) => {
  const set = (patch: Partial<VideoShaderParams>) => onChange({ ...value, ...patch });
  return (
    <Section title="Tone" onReset={onReset}>
      <Slider label="shadows" value={value.shadows} min={-0.5} max={0.5} step={0.01} onChange={(v) => set({ shadows: v })} />
      <Slider label="midtones" value={value.midtones} min={-0.5} max={0.5} step={0.01} onChange={(v) => set({ midtones: v })} />
      <Slider label="highlights" value={value.highlights} min={-0.5} max={0.5} step={0.01} onChange={(v) => set({ highlights: v })} />
    </Section>
  );
};

export const VideoColorSection: React.FC<{ value: VideoShaderParams; onChange: (v: VideoShaderParams) => void } & WithReset> = ({ value, onChange, onReset }) => {
  const set = (patch: Partial<VideoShaderParams>) => onChange({ ...value, ...patch });
  return (
    <Section title="Color" onReset={onReset}>
      <Slider label="exposure" value={value.exposure} min={-3} max={3} step={0.05} onChange={(v) => set({ exposure: v })} />
      <Slider label="gamma" value={value.gamma} min={0.2} max={3} step={0.01} onChange={(v) => set({ gamma: v })} />
      <Slider label="saturation" value={value.saturation} min={0} max={3} step={0.01} onChange={(v) => set({ saturation: v })} />
      <Slider label="clarity" value={value.clarity} min={-1} max={1} step={0.01} onChange={(v) => set({ clarity: v })} />
    </Section>
  );
};

export const VideoImageSection: React.FC<{ value: VideoShaderParams; onChange: (v: VideoShaderParams) => void } & WithReset> = ({ value, onChange, onReset }) => {
  const set = (patch: Partial<VideoShaderParams>) => onChange({ ...value, ...patch });
  return (
    <Section title="Image" onReset={onReset}>
      <Slider label="brightness" value={value.brightness} min={0} max={3} step={0.01} onChange={(v) => set({ brightness: v })} />
      <Slider label="contrast" value={value.contrast} min={0} max={4} step={0.01} onChange={(v) => set({ contrast: v })} />
      <Slider label="exposure" value={value.exposure} min={-3} max={3} step={0.05} onChange={(v) => set({ exposure: v })} />
      <Slider label="shadows" value={value.shadows} min={-0.5} max={0.5} step={0.01} onChange={(v) => set({ shadows: v })} />
      <Slider label="highlights" value={value.highlights} min={-0.5} max={0.5} step={0.01} onChange={(v) => set({ highlights: v })} />
      <Slider label="saturation" value={value.saturation} min={0} max={3} step={0.01} onChange={(v) => set({ saturation: v })} />
    </Section>
  );
};

export const VideoRezSection: React.FC<{ value: VideoShaderParams; onChange: (v: VideoShaderParams) => void } & WithReset> = ({ value, onChange, onReset }) => {
  const set = (patch: Partial<VideoShaderParams>) => onChange({ ...value, ...patch });
  return (
    <Section title="Rez" onReset={onReset} enabled={value.rezEnabled} onToggle={(v) => set({ rezEnabled: v })}>
      {value.rezEnabled && (
        <>
          <Slider label="cell width" value={value.rezCellWidth} min={1} max={128} step={1} onChange={(v) => set({ rezCellWidth: Math.round(v) })} />
          <Slider label="cell height" value={value.rezCellHeight} min={1} max={128} step={1} onChange={(v) => set({ rezCellHeight: Math.round(v) })} />
          <Slider label="mix" value={value.rezMix} min={0} max={1} step={0.01} onChange={(v) => set({ rezMix: v })} />
          <Slider label="color steps" value={value.rezColorLevels} min={2} max={64} step={1} onChange={(v) => set({ rezColorLevels: Math.round(v) })} />
          <Slider label="sample jitter" value={value.rezJitter} min={0} max={1} step={0.01} onChange={(v) => set({ rezJitter: v })} />
        </>
      )}
    </Section>
  );
};

export const VideoPositionSection: React.FC<{ value: VideoShaderParams; onChange: (v: VideoShaderParams) => void } & WithReset> = ({ value, onChange, onReset }) => {
  const set = (patch: Partial<VideoShaderParams>) => onChange({ ...value, ...patch });
  return (
    <Section title="Position" onReset={onReset}>
      <Slider label="horizontal" value={value.positionX} min={-1} max={1} step={0.005} onChange={(v) => set({ positionX: v })} />
      <Slider label="vertical" value={value.positionY} min={-1} max={1} step={0.005} onChange={(v) => set({ positionY: v })} />
      <Slider
        label="rotation"
        value={value.positionRotation / RAD_PER_DEG}
        min={0} max={360} step={0.5}
        onChange={(v) => set({ positionRotation: v * RAD_PER_DEG })}
      />
    </Section>
  );
};

export const VideoDistortionSection: React.FC<{ value: VideoShaderParams; onChange: (v: VideoShaderParams) => void } & WithReset> = ({ value, onChange, onReset }) => {
  const set = (patch: Partial<VideoShaderParams>) => onChange({ ...value, ...patch });
  return (
    <Section title="Distortion (UV)" onReset={onReset}>
      <Slider
        label="rotation°"
        value={value.rotation / RAD_PER_DEG}
        min={-180} max={180} step={0.5}
        onChange={(v) => set({ rotation: v * RAD_PER_DEG })}
      />
      <Slider label="scale" value={value.scale} min={0.1} max={3} step={0.01} onChange={(v) => set({ scale: v })} />
      <Slider label="wave freq" value={value.distortionFrequency} min={0} max={200} step={0.5} onChange={(v) => set({ distortionFrequency: v })} />
      <Slider label="wave amp" value={value.distortionAmplitude} min={0} max={0.1} step={0.001} onChange={(v) => set({ distortionAmplitude: v })} />
      <Slider label="wave speed" value={value.distortionSpeed} min={-5} max={5} step={0.05} onChange={(v) => set({ distortionSpeed: v })} />
      <Slider label="wave angle" value={value.distortionAngle} min={0} max={Math.PI * 2} step={0.01} onChange={(v) => set({ distortionAngle: v })} />
    </Section>
  );
};

export const VideoDitherSection: React.FC<{ value: VideoShaderParams; onChange: (v: VideoShaderParams) => void } & WithReset> = ({ value, onChange, onReset }) => {
  const set = (patch: Partial<VideoShaderParams>) => onChange({ ...value, ...patch });
  return (
    <Section title="Dither" onReset={onReset}>
      <Toggle label="enabled" value={value.ditherEnabled} onChange={(v) => set({ ditherEnabled: v })} />
      <Select
        label="type"
        value={value.ditherType}
        options={DITHER_OPTIONS}
        onChange={(v) => set({ ditherType: parseInt(v, 10) })}
      />
      <Slider label="scale" value={value.ditherScale} min={0.1} max={8} step={0.05} onChange={(v) => set({ ditherScale: v })} />
      <Slider label="threshold" value={value.threshold} min={0} max={1} step={0.01} onChange={(v) => set({ threshold: v })} />
      <Slider label="alpha thresh" value={value.alphaThreshold} min={0} max={1} step={0.01} onChange={(v) => set({ alphaThreshold: v })} />
      {/* color mode toggle */}
      <div style={{ display: 'flex', gap: 4, margin: '8px 0 6px' }}>
        <button
          onClick={() => set({ ditherGradient: false })}
          style={{
            flex: 1, padding: '4px 0', border: '1px solid #333', borderRadius: 3,
            background: !value.ditherGradient ? '#1f6feb' : 'transparent',
            color: !value.ditherGradient ? '#fff' : '#888',
            cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5,
          }}
        >
          Single Color
        </button>
        <button
          onClick={() => set({ ditherGradient: true })}
          style={{
            flex: 1, padding: '4px 0', border: '1px solid #333', borderRadius: 3,
            background: value.ditherGradient ? '#1f6feb' : 'transparent',
            color: value.ditherGradient ? '#fff' : '#888',
            cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5,
          }}
        >
          Gradient
        </button>
      </div>
      {!value.ditherGradient && (
        <ColorInput label="color" value={value.ditherColor} onChange={(v) => set({ ditherColor: v })} />
      )}
      {value.ditherGradient && (
        <>
          <ColorInput label="color A" value={value.ditherGradientColorA} onChange={(v) => set({ ditherGradientColorA: v })} />
          <ColorInput label="color B" value={value.ditherGradientColorB} onChange={(v) => set({ ditherGradientColorB: v })} />
          <Slider
            label="angle"
            value={value.ditherGradientAngle / RAD_PER_DEG}
            min={0} max={360} step={1}
            onChange={(v) => set({ ditherGradientAngle: v * RAD_PER_DEG })}
          />
          <Slider label="spread" value={value.ditherGradientScale} min={0.1} max={5} step={0.05} onChange={(v) => set({ ditherGradientScale: v })} />
          <Slider label="offset X" value={value.ditherGradientOffsetX} min={-1} max={1} step={0.01} onChange={(v) => set({ ditherGradientOffsetX: v })} />
          <Slider label="offset Y" value={value.ditherGradientOffsetY} min={-1} max={1} step={0.01} onChange={(v) => set({ ditherGradientOffsetY: v })} />
        </>
      )}
    </Section>
  );
};
