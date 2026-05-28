import type React from 'react';
import type { MicroTimeline, MusicTimelineClip } from '../../lib/types';

// ── constants ─────────────────────────────────────────────────────────────────
export const HANDLE_W = 10;
export const OUTRO_DUR = 5;
export const MIN_VIEW_SEC = 0.05;

// ── utilities ─────────────────────────────────────────────────────────────────
export function clamp(v: number, mn: number, mx: number) { return Math.min(mx, Math.max(mn, v)); }

export function fmt(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}

// ── types ─────────────────────────────────────────────────────────────────────
export type DragKind =
  | null
  | { kind: 'clip-start' | 'clip-end'; id: string }
  | { kind: 'music-move'; id: string; offset: number }
  | { kind: 'music-fade-in' | 'music-fade-out'; id: string }
  | { kind: 'gap-start' | 'gap-end'; key: string }
  | 'play'
  | 'scroll';

export interface PreviewTimelineProps {
  duration: number;
  playhead: number;
  onPlayheadChange: (playhead: number) => void;
  outroEnabled?: boolean;
  onToggleOutro?: () => void;
  microTimelines: MicroTimeline[];
  timelineItemLabel?: 'clip' | 'chunk';
  clipEditingEnabled?: boolean;
  musicTimelineClips?: MusicTimelineClip[];
  musicClipLabels?: Record<string, string>;
  musicDuration?: number;
  musicPlayhead?: number;
  selectedMusicClipId?: string | null;
  showAudioTracks?: boolean;
  selectedId: string | null;
  pendingClipStart: number | null;
  onSelectClip: (id: string | null) => void;
  onSelectMusicClip?: (id: string | null) => void;
  onMusicPlayheadChange?: (playhead: number) => void;
  onClipRangeChange?: (id: string, start: number, end: number) => void;
  onMoveMusicClip?: (id: string, start: number, trackIndex?: 0 | 1) => void;
  onAdjustMusicClipFade?: (id: string, kind: 'fadeInSecond' | 'fadeOutSecond', value: number) => void;
  onAddStart?: () => void;
  onAddEnd?: () => void;
  onCancelPending?: () => void;
  onDeleteClip?: (id: string) => void;
  onRenameClip?: (id: string, name: string) => void;
  onToggleAudioTracks?: () => void;
  skipGapsEnabled?: boolean;
  skipGaps?: Array<{ startMs: number; endMs: number; key: string }>;
  /** Effective skip zones after padding is applied — drawn as bright inner stripe */
  skipGapsEffective?: Array<{ startMs: number; endMs: number; key: string }>;
  skipGapOverrides?: Record<string, { startMs: number; endMs: number }>;
  skipGapDisabled?: Record<string, true>;
  selectedGapKey?: string | null;
  onSelectGap?: (key: string | null) => void;
  onToggleGapDisabled?: (key: string) => void;
  onAdjustSkipGap?: (key: string, startMs: number, endMs: number) => void;
  onResetSkipGap?: (key: string) => void;
  onResetAllSkipGaps?: () => void;
}

// ── button styles ─────────────────────────────────────────────────────────────
export const btn: React.CSSProperties = {
  background: '#1a1a1a', color: '#ddd', border: '1px solid #2a2a2a',
  padding: '4px 8px', borderRadius: 3, cursor: 'pointer', fontSize: 11,
  fontFamily: 'inherit',
};
export const btnPrimary: React.CSSProperties = { ...btn, background: '#1f6feb22', borderColor: '#1f6feb', color: '#fff' };
export const btnDanger: React.CSSProperties = { ...btn, background: '#ff453a22', borderColor: '#ff453a', color: '#ff453a' };
