import React from 'react';
import type { TranscriptData } from '../../lib/transcript';
import type { CustomCut } from '../../lib/fillerDetector';
import { detectFillerCuts } from '../../lib/fillerDetector';
import type { EditorMode, EditorSubTab } from '../../lib/constants';
import { TabBar } from '../Tabs';
import { Section, Slider } from '../Controls';
import { fmt } from '../timeline/timelineUtils';

type SkipGap = { startMs: number; endMs: number; key: string; kind?: 'silence' | 'custom'; label?: string };

interface Props {
  editorSubTab: EditorSubTab;
  setEditorSubTab: React.Dispatch<React.SetStateAction<EditorSubTab>>;
  editorMode: EditorMode;
  setEditorMode: React.Dispatch<React.SetStateAction<EditorMode>>;
  clipCount: number;
  fullChunkCount: number;
  fullChunkSpanSec: number;
  mediaDuration: number;
  transcript: TranscriptData | null;
  hasMedia: boolean;
  playheadSecond: number;
  jumpCutsEnabled: boolean;
  setJumpCutsEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  jumpCutGapMs: number;
  setJumpCutGapMs: React.Dispatch<React.SetStateAction<number>>;
  jumpCutPaddingMs: number;
  setJumpCutPaddingMs: React.Dispatch<React.SetStateAction<number>>;
  customCuts: CustomCut[];
  customCutPaddingMs: number;
  setCustomCutPaddingMs: React.Dispatch<React.SetStateAction<number>>;
  showSilenceGaps: boolean;
  setShowSilenceGaps: React.Dispatch<React.SetStateAction<boolean>>;
  showFillerCuts: boolean;
  setShowFillerCuts: React.Dispatch<React.SetStateAction<boolean>>;
  showManualCuts: boolean;
  setShowManualCuts: React.Dispatch<React.SetStateAction<boolean>>;
  onAddCustomCuts: (cuts: CustomCut[]) => void;
  onClearCustomCuts: () => void;
  pendingCustomCutStartMs: number | null;
  onStartCustomCut: (playheadMs: number) => void;
  onFinishCustomCut: (playheadMs: number) => void;
  onCancelPendingCustomCut: () => void;
  selectedGap: SkipGap | null;
  selectedGapDisabled: boolean;
  selectedGapHasOverride: boolean;
  onAdjustSelectedGap: (startMs: number, endMs: number) => void;
  onToggleSelectedGapDisabled: (key: string) => void;
  onResetSelectedGap: (key: string) => void;
  onRemoveSelectedCustomCut: (key: string) => void;
}

const fieldStyle: React.CSSProperties = {
  width: '100%',
  background: '#0a0a0a',
  color: '#ddd',
  border: '1px solid #333',
  padding: '6px 8px',
  borderRadius: 3,
  fontFamily: 'inherit',
  fontSize: 12,
};

const buttonStyle: React.CSSProperties = {
  background: '#1a1a1a',
  color: '#ddd',
  border: '1px solid #2a2a2a',
  padding: '6px 10px',
  borderRadius: 3,
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 12,
};

const primaryButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  background: '#1f6feb22',
  borderColor: '#1f6feb',
  color: '#fff',
};

const dangerButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  background: '#ff453a22',
  borderColor: '#ff453a',
  color: '#ff8b84',
};

function formatGapKind(gap: SkipGap): string {
  if (gap.kind !== 'custom') return 'silence gap';
  if (gap.key.startsWith('filler:')) return 'filler cut';
  if (gap.key.startsWith('stutter:')) return 'stutter cut';
  if (gap.key.startsWith('editorial:')) return 'manual skip';
  return 'custom cut';
}

export const EditorPanel: React.FC<Props> = ({
  editorSubTab,
  setEditorSubTab,
  editorMode,
  setEditorMode,
  clipCount,
  fullChunkCount,
  fullChunkSpanSec,
  mediaDuration,
  transcript, hasMedia, playheadSecond,
  jumpCutsEnabled, setJumpCutsEnabled,
  jumpCutGapMs, setJumpCutGapMs,
  jumpCutPaddingMs, setJumpCutPaddingMs,
  customCuts, customCutPaddingMs, setCustomCutPaddingMs,
  showSilenceGaps, setShowSilenceGaps,
  showFillerCuts, setShowFillerCuts,
  showManualCuts, setShowManualCuts,
  onAddCustomCuts, onClearCustomCuts,
  pendingCustomCutStartMs, onStartCustomCut, onFinishCustomCut, onCancelPendingCustomCut,
  selectedGap, selectedGapDisabled, selectedGapHasOverride,
  onAdjustSelectedGap, onToggleSelectedGapDisabled, onResetSelectedGap, onRemoveSelectedCustomCut,
}) => {
  const selectedStartSec = selectedGap ? selectedGap.startMs / 1000 : 0;
  const selectedEndSec = selectedGap ? selectedGap.endMs / 1000 : 0;
  const fillerCuts = customCuts.filter((cut) => cut.key.startsWith('filler:') || cut.key.startsWith('stutter:'));
  const manualCuts = customCuts.filter((cut) => !cut.key.startsWith('filler:') && !cut.key.startsWith('stutter:'));

  return (
    <>
      <TabBar<EditorSubTab>
        tabs={[
          { value: 'edits', label: 'Edits' },
          { value: 'mode', label: 'Mode' },
        ]}
        value={editorSubTab}
        onChange={setEditorSubTab}
        variant="sub"
      />

      {editorSubTab === 'mode' ? (
        <>
          <TabBar<EditorMode>
            tabs={[
              { value: 'clips', label: 'Clips' },
              { value: 'full', label: 'Full' },
            ]}
            value={editorMode}
            onChange={setEditorMode}
            variant="sub"
          />

          <Section title="Export mode">
            <div style={{ color: '#aaa', fontSize: 12, lineHeight: 1.5 }}>
              {editorMode === 'clips'
                ? 'Timeline pills and export range follow your saved colored clips.'
                : 'Timeline pills and export range follow back-to-back full-video chunks for safer long-form rendering.'}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
              <div style={{ padding: '8px 10px', border: '1px solid #2a2a2a', borderRadius: 4, background: '#121212' }}>
                <div style={{ color: '#666', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 }}>Clips</div>
                <div style={{ color: '#fff', fontSize: 18, marginTop: 4 }}>{clipCount}</div>
                <div style={{ color: '#888', fontSize: 11, marginTop: 2 }}>saved project clips</div>
              </div>
              <div style={{ padding: '8px 10px', border: '1px solid #2a2a2a', borderRadius: 4, background: '#121212' }}>
                <div style={{ color: '#666', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 }}>Full</div>
                <div style={{ color: '#fff', fontSize: 18, marginTop: 4 }}>{fullChunkCount}</div>
                <div style={{ color: '#888', fontSize: 11, marginTop: 2 }}>
                  back-to-back {Math.max(1, Math.round(fullChunkSpanSec / 60))} min chunks
                </div>
              </div>
            </div>
            <div style={{ color: '#777', fontSize: 11, marginTop: 8 }}>
              Full runtime: {fmt(mediaDuration)}
            </div>
          </Section>
        </>
      ) : (
        <>
          <Section title="Skip silence" enabled={showSilenceGaps} onToggle={transcript ? setShowSilenceGaps : undefined}>
            <Slider
              label="min gap ms"
              value={jumpCutGapMs}
              min={50}
              max={2000}
              step={50}
              ticks={[150, 300, 600, 1000]}
              onChange={(value) => setJumpCutGapMs(Math.max(50, Math.round(value)))}
            />
            <Slider
              label="tighten ms"
              value={jumpCutPaddingMs}
              min={0}
              max={1000}
              step={50}
              ticks={[100, 300, 600]}
              onChange={(value) => setJumpCutPaddingMs(Math.max(0, Math.round(value)))}
            />
          </Section>

          <Section title="Skip filler words" enabled={showFillerCuts} onToggle={customCuts.length > 0 || !!transcript ? setShowFillerCuts : undefined}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={() => transcript && onAddCustomCuts(detectFillerCuts(transcript))}
                disabled={!transcript}
                style={{ ...primaryButtonStyle, opacity: transcript ? 1 : 0.5, cursor: transcript ? 'pointer' : 'not-allowed' }}
              >
                ✂ Skip filler words
              </button>
              <span style={{ color: '#888', fontSize: 12 }}>
                {fillerCuts.length > 0 ? `${fillerCuts.length} filler skip${fillerCuts.length === 1 ? '' : 's'}` : 'no filler skips yet'}
              </span>
              {customCuts.length > 0 && (
                <button onClick={onClearCustomCuts} style={buttonStyle}>
                  Clear custom skips
                </button>
              )}
            </div>
            {customCuts.length > 0 && (
              <Slider
                label="tighten ms"
                value={customCutPaddingMs}
                min={0}
                max={500}
                step={10}
                ticks={[50, 100, 200, 300]}
                onChange={(value) => setCustomCutPaddingMs(Math.max(0, Math.round(value)))}
              />
            )}
          </Section>

          <Section title="Manual skip areas" enabled={showManualCuts} onToggle={customCuts.length > 0 || hasMedia ? setShowManualCuts : undefined}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {pendingCustomCutStartMs === null ? (
                <button
                  onClick={() => onStartCustomCut(playheadSecond * 1000)}
                  disabled={!hasMedia}
                  style={{ ...primaryButtonStyle, opacity: hasMedia ? 1 : 0.5, cursor: hasMedia ? 'pointer' : 'not-allowed' }}
                >
                  + Skip start
                </button>
              ) : (
                <>
                  <button style={{ ...buttonStyle, borderColor: '#ffd60a', color: '#ffd60a', background: '#ffd60a22', cursor: 'default' }} disabled>
                    Start @ {fmt(pendingCustomCutStartMs / 1000)}
                  </button>
                  <button onClick={() => onFinishCustomCut(playheadSecond * 1000)} style={primaryButtonStyle}>
                    + Skip end
                  </button>
                  <button onClick={onCancelPendingCustomCut} style={buttonStyle}>
                    Cancel
                  </button>
                </>
              )}
              <span style={{ color: '#888', fontSize: 12 }}>Playhead: {fmt(playheadSecond)}</span>
              <span style={{ color: '#888', fontSize: 12 }}>
                {manualCuts.length > 0 ? `${manualCuts.length} manual skip${manualCuts.length === 1 ? '' : 's'}` : 'no manual skips yet'}
              </span>
            </div>
          </Section>

          <Section title="Selected skip area">
            {selectedGap ? (
              <>
                <div style={{ color: '#aaa', fontSize: 12, lineHeight: 1.45 }}>
                  {formatGapKind(selectedGap)}
                  {selectedGap.label ? ` · ${selectedGap.label}` : ''}
                  {selectedGapDisabled ? ' · disabled' : ''}
                  {selectedGapHasOverride ? ' · edited' : ''}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, color: '#aaa', fontSize: 11 }}>
                    Start sec
                    <input
                      type="number"
                      step={0.01}
                      min={0}
                      value={Number(selectedStartSec.toFixed(2))}
                      onChange={(e) => {
                        const nextStartSec = Number(e.target.value);
                        if (!Number.isFinite(nextStartSec)) return;
                        onAdjustSelectedGap(Math.max(0, Math.round(nextStartSec * 1000)), selectedGap.endMs);
                      }}
                      style={fieldStyle}
                    />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, color: '#aaa', fontSize: 11 }}>
                    End sec
                    <input
                      type="number"
                      step={0.01}
                      min={0}
                      value={Number(selectedEndSec.toFixed(2))}
                      onChange={(e) => {
                        const nextEndSec = Number(e.target.value);
                        if (!Number.isFinite(nextEndSec)) return;
                        onAdjustSelectedGap(selectedGap.startMs, Math.max(0, Math.round(nextEndSec * 1000)));
                      }}
                      style={fieldStyle}
                    />
                  </label>
                </div>
                <div style={{ color: '#888', fontSize: 11 }}>
                  {fmt(selectedStartSec)} → {fmt(selectedEndSec)} ({((selectedGap.endMs - selectedGap.startMs) / 1000).toFixed(2)}s)
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button onClick={() => onToggleSelectedGapDisabled(selectedGap.key)} style={buttonStyle}>
                    {selectedGapDisabled ? 'Restore skip' : 'Disable skip'}
                  </button>
                  {selectedGapHasOverride && (
                    <button onClick={() => onResetSelectedGap(selectedGap.key)} style={buttonStyle}>
                      Reset edit
                    </button>
                  )}
                  {selectedGap.kind === 'custom' && (
                    <button onClick={() => onRemoveSelectedCustomCut(selectedGap.key)} style={dangerButtonStyle}>
                      Delete custom skip
                    </button>
                  )}
                </div>
              </>
            ) : (
              <div style={{ color: '#777', fontSize: 12, lineHeight: 1.45 }}>
                Select a skip area on the timeline to edit its start and end timestamps here.
              </div>
            )}
          </Section>
        </>
      )}
    </>
  );
};
