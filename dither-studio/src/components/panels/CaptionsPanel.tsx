import React from 'react';
import {
  DEFAULT_CAPTION_STYLE, DEFAULT_CAPTION_SHADER,
  type CaptionStyle, type CaptionShaderParams,
} from '../../lib/types';
import type { CaptionMode, TranscriptData } from '../../lib/transcript';
import type { CaptionsSubTab } from '../../lib/constants';
import { Section, Slider, Toggle } from '../Controls';
import { TabBar } from '../Tabs';
import { PillToggle } from '../LayerToggle';
import { CaptionFontControls, CaptionTypeControls } from '../CaptionFontControls';
import { CaptionsEditor } from '../CaptionsEditor';

interface Props {
  captionsSubTab: CaptionsSubTab;
  setCaptionsSubTab: React.Dispatch<React.SetStateAction<CaptionsSubTab>>;
  transcript: TranscriptData | null;
  transcriptName: string | null;
  captionMode: CaptionMode;
  setCaptionMode: React.Dispatch<React.SetStateAction<CaptionMode>>;
  captionStyle: CaptionStyle;
  setCaptionStyle: React.Dispatch<React.SetStateAction<CaptionStyle>>;
  captionShader: CaptionShaderParams;
  setCaptionShader: React.Dispatch<React.SetStateAction<CaptionShaderParams>>;
  onPickTranscript: React.ChangeEventHandler<HTMLInputElement>;
  onEditorUpdate: (data: TranscriptData) => void;
}

export const CaptionsPanel: React.FC<Props> = ({
  captionsSubTab, setCaptionsSubTab,
  transcript, transcriptName,
  captionMode, setCaptionMode,
  captionStyle, setCaptionStyle,
  captionShader, setCaptionShader,
  onPickTranscript, onEditorUpdate,
}) => (
  <>
    <TabBar<CaptionsSubTab>
      tabs={[
        { value: 'editor', label: 'Editor' },
        { value: 'type',   label: 'Type' },
        { value: 'font',   label: 'Font' },
        { value: 'shader', label: 'Shader' },
      ]}
      value={captionsSubTab}
      onChange={setCaptionsSubTab}
      variant="sub"
    />

    {captionsSubTab === 'editor' && (
      <>
        <Section title="Source">
          {transcript ? (
            <>
              <div style={{ color: '#aaa', marginBottom: 6 }}>
                {transcriptName}<br />
                {transcript.utterances.length} utterance{transcript.utterances.length === 1 ? '' : 's'}
              </div>
              <label style={{
                display: 'inline-block', padding: '4px 10px', background: '#222',
                color: '#ddd', borderRadius: 3, cursor: 'pointer', fontSize: 11,
              }}>
                Replace caption JSON…
                <input type="file" accept="application/json,.json" onChange={onPickTranscript} style={{ display: 'none' }} />
              </label>
            </>
          ) : (
            <>
              <div style={{ color: '#aaa', marginBottom: 8 }}>
                Load a caption JSON (word-level timestamps in ms — same format as
                <code> w3rk17/src/content/talk-transcript-trimmed.json</code>).
              </div>
              <label style={{
                display: 'inline-block', padding: '6px 12px', background: '#1f6feb',
                color: '#fff', borderRadius: 3, cursor: 'pointer',
              }}>
                Choose caption JSON…
                <input type="file" accept="application/json,.json" onChange={onPickTranscript} style={{ display: 'none' }} />
              </label>
            </>
          )}
        </Section>
        <Section title="Editor">
          <CaptionsEditor transcript={transcript} onUpdate={onEditorUpdate} />
        </Section>
      </>
    )}

    {captionsSubTab === 'type' && (
      <>
        <Section title="Caption type">
          <div style={{ display: 'flex', gap: 6 }}>
            <PillToggle label="Line mode" on={captionMode === 'line'} onClick={() => setCaptionMode('line')} />
            <PillToggle label="Word mode" on={captionMode === 'word'} onClick={() => setCaptionMode('word')} />
          </div>
        </Section>
        <CaptionTypeControls value={captionStyle} onChange={setCaptionStyle} onReset={() => setCaptionStyle(DEFAULT_CAPTION_STYLE)} />
      </>
    )}

    {captionsSubTab === 'font' && (
      <CaptionFontControls value={captionStyle} onChange={setCaptionStyle} onReset={() => setCaptionStyle(DEFAULT_CAPTION_STYLE)} />
    )}

    {captionsSubTab === 'shader' && (
      <Section title="Shader (sine wave)" onReset={() => setCaptionShader(DEFAULT_CAPTION_SHADER)}>
        <Toggle
          label="enabled"
          value={captionShader.enabled}
          onChange={(enabled) => setCaptionShader({ ...captionShader, enabled })}
        />
        <Slider
          label="speed"
          value={captionShader.speed}
          min={0} max={20} step={0.1}
          ticks={[2, 5, 10]}
          onChange={(speed) => setCaptionShader({ ...captionShader, speed })}
        />
        <Slider
          label="frequency"
          value={captionShader.frequency}
          min={0} max={40} step={0.5}
          ticks={[4, 10, 20]}
          onChange={(frequency) => setCaptionShader({ ...captionShader, frequency })}
        />
        <Slider
          label="amplitude"
          value={captionShader.amplitude}
          min={0} max={0.2} step={0.001}
          ticks={[0.01, 0.05, 0.1]}
          onChange={(amplitude) => setCaptionShader({ ...captionShader, amplitude })}
        />
        <Slider
          label="angle°"
          value={captionShader.angleDeg}
          min={0} max={360} step={1}
          ticks={[0, 90, 180, 270]}
          onChange={(angleDeg) => setCaptionShader({ ...captionShader, angleDeg: Math.round(angleDeg) })}
        />
      </Section>
    )}
  </>
);
