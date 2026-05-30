import React from 'react';
import { Section, Slider, Toggle, ColorInput, Select } from './Controls';
import {
  type BackgroundParams,
  type DitherParams,
  type VideoShaderParams,
} from '../lib/types';
import { DITHER_TYPES } from '../shaders/ditherShader';
import { VideoGradientSection } from './ParamControls.gradient';
export { VideoGradientSection } from './ParamControls.gradient';

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
      <Slider label="scale" value={value.positionScale} min={0.1} max={3} step={0.01} onChange={(v) => set({ positionScale: v })} />
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
