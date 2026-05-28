import type React from 'react';
import type { TranscriptData } from '../../lib/transcript';
import type { CustomCut } from '../../lib/fillerDetector';
import type { EditorMode, EditorSubTab } from '../../lib/constants';

export type SkipGap = { startMs: number; endMs: number; key: string; kind?: 'silence' | 'custom'; label?: string };

export interface EditorPanelProps {
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
