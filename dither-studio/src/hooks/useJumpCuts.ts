import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TranscriptData } from '../lib/transcript';

export type JumpCutGap = { startMs: number; endMs: number; key: string };

export function useJumpCuts(transcript: TranscriptData | null) {
  const [jumpCutsEnabled, setJumpCutsEnabled] = useState(false);
  const [jumpCutGapMs, setJumpCutGapMs] = useState(300);
  const [jumpCutPaddingMs, setJumpCutPaddingMs] = useState(0);
  // user-edited overrides for individual silence gaps; key = `${baseStartMs}|${baseEndMs}` of the auto-detected gap
  const [jumpCutGapOverrides, setJumpCutGapOverrides] = useState<Record<string, { startMs: number; endMs: number }>>({});
  // disabled silence gaps — kept visible but not skipped during playback
  const [jumpCutGapDisabled, setJumpCutGapDisabled] = useState<Record<string, true>>({});
  // currently selected silence gap (for delete/restore actions)
  const [selectedGapKey, setSelectedGapKey] = useState<string | null>(null);

  const jumpCutsEnabledRef = useRef(false);
  const jumpCutGapListRef = useRef<JumpCutGap[]>([]);

  useEffect(() => { jumpCutsEnabledRef.current = jumpCutsEnabled; }, [jumpCutsEnabled]);

  const jumpCutGapsBase = useMemo(() => {
    if (!transcript) return [] as JumpCutGap[];
    const words: Array<{ start: number; end: number }> = [];
    for (const u of transcript.utterances) {
      if (u.words) for (const w of u.words) words.push(w);
    }
    words.sort((a, b) => a.start - b.start);
    const gaps: JumpCutGap[] = [];
    for (let i = 0; i < words.length - 1; i++) {
      const gapStart = words[i].end;
      const gapEnd = words[i + 1].start;
      if (gapEnd - gapStart >= jumpCutGapMs) {
        gaps.push({ startMs: gapStart, endMs: gapEnd, key: `${gapStart}|${gapEnd}` });
      }
    }
    return gaps;
  }, [transcript, jumpCutGapMs]);

  const jumpCutGaps = useMemo(() => {
    return jumpCutGapsBase.map(g => {
      const o = jumpCutGapOverrides[g.key];
      return o ? { startMs: o.startMs, endMs: o.endMs, key: g.key } : g;
    });
  }, [jumpCutGapsBase, jumpCutGapOverrides]);

  // Effective gaps = raw gaps with symmetrical padding applied to each side.
  // These are the actual skip zones used for playback and export.
  const jumpCutGapsEffective = useMemo(() => {
    return jumpCutGaps
      .map(g => ({
        ...g,
        startMs: g.startMs + jumpCutPaddingMs,
        endMs: g.endMs - jumpCutPaddingMs,
      }))
      .filter(g => g.endMs - g.startMs > 20); // drop gaps that padding has consumed entirely
  }, [jumpCutGaps, jumpCutPaddingMs]);

  // RAF loop should never see disabled gaps
  useEffect(() => {
    jumpCutGapListRef.current = jumpCutGapsEffective.filter(g => !jumpCutGapDisabled[g.key]);
  }, [jumpCutGapsEffective, jumpCutGapDisabled]);

  const handleAdjustGap = useCallback((key: string, startMs: number, endMs: number) => {
    setJumpCutGapOverrides(prev => ({
      ...prev,
      [key]: { startMs: Math.round(startMs), endMs: Math.round(endMs) },
    }));
  }, []);

  const handleResetGap = useCallback((key: string) => {
    setJumpCutGapOverrides(prev => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const handleResetAllGaps = useCallback(() => {
    setJumpCutGapOverrides({});
    setJumpCutGapDisabled({});
  }, []);

  const handleToggleGapDisabled = useCallback((key: string) => {
    setJumpCutGapDisabled(prev => {
      const next = { ...prev };
      if (next[key]) delete next[key];
      else next[key] = true;
      return next;
    });
  }, []);

  const handleSelectGap = useCallback((key: string | null) => {
    setSelectedGapKey(key);
  }, []);

  // Delete/Backspace to disable (or re-enable) the selected silence block
  useEffect(() => {
    if (!jumpCutsEnabled || !selectedGapKey) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const ae = document.activeElement;
      if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || (ae as HTMLElement).isContentEditable)) return;
      e.preventDefault();
      handleToggleGapDisabled(selectedGapKey);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [jumpCutsEnabled, selectedGapKey, handleToggleGapDisabled]);

  return {
    jumpCutsEnabled, setJumpCutsEnabled,
    jumpCutGapMs, setJumpCutGapMs,
    jumpCutPaddingMs, setJumpCutPaddingMs,
    jumpCutGapOverrides,
    jumpCutGapDisabled,
    selectedGapKey,
    jumpCutGaps,
    jumpCutGapsEffective,
    jumpCutsEnabledRef,
    jumpCutGapListRef,
    handleAdjustGap,
    handleResetGap,
    handleResetAllGaps,
    handleToggleGapDisabled,
    handleSelectGap,
  };
}
