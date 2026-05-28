import React from 'react';
import {
  DEFAULT_BACKGROUND, DEFAULT_DITHER,
  type BackgroundParams, type DitherParams,
} from '../../lib/types';
import { PRESETS } from '../../lib/presets';
import { Section, Select, ColorInput } from '../Controls';
import { BackgroundControls, DitherControls } from '../ParamControls';
import { TabBar } from '../Tabs';
import type { BgSubTab } from '../../lib/constants';

interface Props {
  bg: BackgroundParams;
  setBg: React.Dispatch<React.SetStateAction<BackgroundParams>>;
  bgDither: DitherParams;
  setBgDither: React.Dispatch<React.SetStateAction<DitherParams>>;
  bgSubTab: BgSubTab;
  setBgSubTab: React.Dispatch<React.SetStateAction<BgSubTab>>;
  addToast: (message: string, type?: 'info' | 'success' | 'error' | 'progress') => number;
  bgLayerOn: boolean;
  bgOffMode: 'grid' | 'color';
  setBgOffMode: React.Dispatch<React.SetStateAction<'grid' | 'color'>>;
  bgOffColor: string;
  setBgOffColor: React.Dispatch<React.SetStateAction<string>>;
}

export const BackgroundPanel: React.FC<Props> = ({
  bg, setBg, bgDither, setBgDither, bgSubTab, setBgSubTab, addToast,
  bgLayerOn, bgOffMode, setBgOffMode, bgOffColor, setBgOffColor,
}) => (
  <>
    {!bgLayerOn && (
      <Section title="Off state">
        <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
          <button
            onClick={() => setBgOffMode('grid')}
            style={{
              flex: 1, padding: '4px 0', border: '1px solid #333', borderRadius: 3,
              background: bgOffMode === 'grid' ? '#1f6feb' : 'transparent',
              color: bgOffMode === 'grid' ? '#fff' : '#888',
              cursor: 'pointer', fontFamily: 'inherit', fontSize: 11,
              textTransform: 'uppercase', letterSpacing: 0.5,
            }}
          >
            Transparency
          </button>
          <button
            onClick={() => setBgOffMode('color')}
            style={{
              flex: 1, padding: '4px 0', border: '1px solid #333', borderRadius: 3,
              background: bgOffMode === 'color' ? '#1f6feb' : 'transparent',
              color: bgOffMode === 'color' ? '#fff' : '#888',
              cursor: 'pointer', fontFamily: 'inherit', fontSize: 11,
              textTransform: 'uppercase', letterSpacing: 0.5,
            }}
          >
            Solid Color
          </button>
        </div>
        {bgOffMode === 'color' && (
          <ColorInput label="color" value={bgOffColor} onChange={setBgOffColor} />
        )}
      </Section>
    )}
    <Section title="Preset">
      <Select
        label="load"
        value={''}
        options={[
          { label: '— pick a preset —', value: '' },
          ...PRESETS.map((p) => ({ label: p.name, value: p.name })),
        ]}
        onChange={(name) => {
          const p = PRESETS.find((x) => x.name === name);
          if (p) { setBg(p.background); setBgDither(p.dither); }
        }}
      />
      <button
        onClick={() => {
          setBg(DEFAULT_BACKGROUND);
          setBgDither(DEFAULT_DITHER);
          addToast('Background reset to defaults', 'success');
        }}
        style={{
          alignSelf: 'flex-start',
          padding: '6px 10px',
          background: '#222',
          color: '#ddd',
          border: '1px solid #333',
          borderRadius: 3,
          cursor: 'pointer',
          fontFamily: 'inherit',
          fontSize: 12,
        }}
      >
        Reset to defaults
      </button>
    </Section>
    <TabBar<BgSubTab>
      tabs={[
        { value: 'noise', label: 'Noise' },
        { value: 'dither', label: 'Dither' },
      ]}
      value={bgSubTab}
      onChange={setBgSubTab}
      variant="sub"
    />
    {bgSubTab === 'noise' && <BackgroundControls value={bg} onChange={setBg} onReset={() => setBg(DEFAULT_BACKGROUND)} />}
    {bgSubTab === 'dither' && <DitherControls value={bgDither} onChange={setBgDither} onReset={() => setBgDither(DEFAULT_DITHER)} />}
  </>
);
