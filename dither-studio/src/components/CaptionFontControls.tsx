import React from 'react';
import { ColorInput, Section, Select, Slider, Toggle } from './Controls';
import { CAPTION_FONT_OPTIONS } from '../lib/constants';
import type { CaptionStyle } from '../lib/types';
import { toHex } from '../lib/captionColor';

type Props = { value: CaptionStyle; onChange: (v: CaptionStyle) => void; onReset?: () => void };

export const CaptionTypeControls: React.FC<Props> = ({ value, onChange, onReset }) => {
  const set = (patch: Partial<CaptionStyle>) => onChange({ ...value, ...patch });
  return (
    <Section title="Caption type" onReset={onReset}>
      <Select
        label="underline"
        value={value.underlineMode ?? (value.underlineEnabled === false ? 'off' : 'draw')}
        options={[
          { label: 'off', value: 'off' },
          { label: 'draw', value: 'draw' },
          { label: 'fade', value: 'fade' },
        ]}
        onChange={(underlineMode) => set({ underlineMode: underlineMode as CaptionStyle['underlineMode'] })}
      />
      <Slider
        label="fade ms"
        value={value.underlineFadeMs ?? 150}
        min={0}
        max={300}
        step={10}
        ticks={[100, 200]}
        onChange={(underlineFadeMs) => set({ underlineFadeMs: Math.round(underlineFadeMs) })}
      />
      <Toggle label="word highlight" value={value.wordHighlightEnabled} onChange={(wordHighlightEnabled) => set({ wordHighlightEnabled })} />
      <Toggle label="shadow" value={value.shadowEnabled !== false} onChange={(shadowEnabled) => set({ shadowEnabled })} />
      <ColorInput label="active color" value={toHex(value.color)} onChange={(color) => set({ color })} />
      <Slider
        label="active opacity"
        value={value.colorOpacity ?? 1}
        min={0} max={1} step={0.01}
        onChange={(colorOpacity) => set({ colorOpacity })}
      />
      <ColorInput label="dim color" value={toHex(value.dimColor)} onChange={(dimColor) => set({ dimColor })} />
      <Slider
        label="dim opacity"
        value={value.dimColorOpacity ?? 1}
        min={0} max={1} step={0.01}
        onChange={(dimColorOpacity) => set({ dimColorOpacity })}
      />
      <Select
        label="line split"
        value={value.lineSplitMode ?? 'sentence'}
        options={[
          { label: 'sentence (.!?)',  value: 'sentence' },
          { label: 'balanced',        value: 'balanced' },
          { label: 'max words',       value: 'words' },
          { label: 'max chars',       value: 'chars' },
          { label: 'max seconds',     value: 'duration' },
        ]}
        onChange={(lineSplitMode) => set({ lineSplitMode: lineSplitMode as CaptionStyle['lineSplitMode'] })}
      />
      {value.lineSplitMode === 'balanced' && (
        <Slider
          label="target words"
          value={value.lineTargetWords ?? 6}
          min={2} max={15} step={1}
          ticks={[4, 6, 8]}
          onChange={(lineTargetWords) => set({ lineTargetWords: Math.max(1, Math.round(lineTargetWords)) })}
        />
      )}
      {value.lineSplitMode === 'words' && (
        <Slider
          label="max words"
          value={value.lineMaxWords ?? 8}
          min={1} max={20} step={1}
          onChange={(lineMaxWords) => set({ lineMaxWords: Math.max(1, Math.round(lineMaxWords)) })}
        />
      )}
      {value.lineSplitMode === 'chars' && (
        <Slider
          label="max chars"
          value={value.lineMaxChars ?? 60}
          min={10} max={140} step={1}
          ticks={[40, 60, 80]}
          onChange={(lineMaxChars) => set({ lineMaxChars: Math.max(1, Math.round(lineMaxChars)) })}
        />
      )}
      {value.lineSplitMode === 'duration' && (
        <Slider
          label="max seconds"
          value={value.lineMaxSeconds ?? 3}
          min={0.5} max={10} step={0.1}
          ticks={[1, 2, 3, 5]}
          onChange={(lineMaxSeconds) => set({ lineMaxSeconds: Math.max(0.1, lineMaxSeconds) })}
        />
      )}
    </Section>
  );
};

export const CaptionFontControls: React.FC<Props> = ({ value, onChange, onReset }) => {
  const set = (patch: Partial<CaptionStyle>) => onChange({ ...value, ...patch });
  return (
    <Section title="Caption font" onReset={onReset}>
      <Select
        label="family"
        value={value.fontFamily}
        options={CAPTION_FONT_OPTIONS}
        onChange={(fontFamily) => set({ fontFamily })}
      />
      <Slider label="line size" value={value.lineFontSize} min={12} max={96} step={1} onChange={(v) => set({ lineFontSize: Math.round(v) })} />
      <Slider label="word size" value={value.wordFontSize} min={16} max={160} step={1} onChange={(v) => set({ wordFontSize: Math.round(v) })} />
      <Slider label="weight" value={value.fontWeight} min={300} max={900} step={100} onChange={(v) => set({ fontWeight: Math.round(v / 100) * 100 })} />
      <Slider label="tracking" value={value.letterSpacing} min={0} max={0.2} step={0.005} onChange={(v) => set({ letterSpacing: v })} />
      <Slider label="line height" value={value.lineHeight} min={0.9} max={2.2} step={0.05} onChange={(v) => set({ lineHeight: v })} />
      <Slider label="line width %" value={value.lineMaxWidth} min={10} max={100} step={1} onChange={(v) => set({ lineMaxWidth: Math.round(v) })} />
      <Slider label="horizontal pos" value={value.horizontalPosition} min={0} max={100} step={1} onChange={(v) => set({ horizontalPosition: Math.round(v) })} />
      <Slider label="vertical pos" value={value.verticalPosition} min={0} max={100} step={1} onChange={(v) => set({ verticalPosition: Math.round(v) })} />
      <Select
        label="justify"
        value={value.textAlign}
        options={[
          { label: 'left', value: 'left' },
          { label: 'center', value: 'center' },
          { label: 'right', value: 'right' },
        ]}
        onChange={(textAlign) => set({ textAlign: textAlign as CaptionStyle['textAlign'] })}
      />
    </Section>
  );
};
