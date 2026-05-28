import { useCallback, useEffect, useMemo, useRef, useState, type SetStateAction } from 'react';
import type { TranscriptData } from '../lib/transcript';
import type { CustomCut } from '../lib/fillerDetector';

export type JumpCutGap = { startMs: number; endMs: number; key: string; kind?: 'silence' | 'custom'; label?: string };

const CUSTOM_KEY_PREFIXES = ['custom:', 'filler:', 'stutter:', 'editorial:'];
export const isCustomKey = (k: string) => CUSTOM_KEY_PREFIXES.some(p => k.startsWith(p));
export const isFillerCutKey = (k: string) => k.startsWith('filler:') || k.startsWith('stutter:');
export const isManualCutKey = (k: string) => isCustomKey(k) && !isFillerCutKey(k);

export function useJumpCuts(transcript: TranscriptData | null) {
  const [jumpCutGapMs, setJumpCutGapMs] = useState(300);
  const [jumpCutPaddingMs, setJumpCutPaddingMs] = useState(0);
  // Tighten knob for custom/filler cuts — EXPANDS each cut by N ms on each
  // side so the trailing micro-silence around a filler word also gets eaten.
  // (Inverse of jumpCutPaddingMs, which shrinks silence gaps.)
  const [customCutPaddingMs, setCustomCutPaddingMs] = useState(0);
  // user-edited overrides for individual silence gaps; key = `${baseStartMs}|${baseEndMs}` of the auto-detected gap
  const [jumpCutGapOverrides, setJumpCutGapOverrides] = useState<Record<string, { startMs: number; endMs: number }>>({});
  // disabled gaps — kept visible but not skipped during playback (works for both silence and custom cuts)
  const [jumpCutGapDisabled, setJumpCutGapDisabled] = useState<Record<string, true>>({});
  // currently selected gap (for delete/restore actions)
  const [selectedGapKey, setSelectedGapKey] = useState<string | null>(null);
  // manually added cuts — filler words, weak sentences, editorial trims
  const [customCuts, setCustomCuts] = useState<CustomCut[]>([]);
  const [pendingCustomCutStartMs, setPendingCustomCutStartMs] = useState<number | null>(null);
  // category toggles (affect both timeline rendering and playback/export)
  const [showSilenceGaps, setShowSilenceGaps] = useState(false);
  const [showFillerCuts, setShowFillerCuts] = useState(false);
  const [showManualCuts, setShowManualCuts] = useState(false);

  const jumpCutsEnabledRef = useRef(false);
  const jumpCutGapListRef = useRef<JumpCutGap[]>([]);
  const jumpCutsEnabled = showSilenceGaps || showFillerCuts || showManualCuts;
  const setJumpCutsEnabled = useCallback((value: SetStateAction<boolean>) => {
    const nextValue = typeof value === 'function'
      ? (value as (prevState: boolean) => boolean)(showSilenceGaps || showFillerCuts || showManualCuts)
      : value;
    if (!nextValue) {
      setShowSilenceGaps(false);
      setShowFillerCuts(false);
      setShowManualCuts(false);
      return;
    }
    if (transcript) setShowSilenceGaps(true);
    if (customCuts.some((cut) => isFillerCutKey(cut.key))) setShowFillerCuts(true);
    if (customCuts.some((cut) => isManualCutKey(cut.key) || !isFillerCutKey(cut.key))) setShowManualCuts(true);
  }, [customCuts, showFillerCuts, showManualCuts, showSilenceGaps, transcript]);

  useEffect(() => { jumpCutsEnabledRef.current = jumpCutsEnabled; }, [jumpCutsEnabled]);
  useEffect(() => { setPendingCustomCutStartMs(null); }, [transcript]);

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
        gaps.push({ startMs: gapStart, endMs: gapEnd, key: `${gapStart}|${gapEnd}`, kind: 'silence' });
      }
    }
    return gaps;
  }, [transcript, jumpCutGapMs]);

  // Treat user-added custom cuts as additional gaps that flow through the
  // same overrides/disabled/timeline pipeline. They use 'custom:' keys so
  // they never collide with auto-detected silences.
  const customCutGaps = useMemo<JumpCutGap[]>(() => {
    return customCuts.map(c => ({
      startMs: c.startMs,
      endMs: c.endMs,
      key: isCustomKey(c.key) ? c.key : `custom:${c.key}`,
      kind: 'custom',
      label: c.label,
    }));
  }, [customCuts]);

  const jumpCutGapsAll = useMemo(() => {
    const all = [...jumpCutGapsBase, ...customCutGaps];
    all.sort((a, b) => a.startMs - b.startMs);
    return all.map(g => {
      const o = jumpCutGapOverrides[g.key];
      return o ? { ...g, startMs: o.startMs, endMs: o.endMs } : g;
    });
  }, [jumpCutGapsBase, customCutGaps, jumpCutGapOverrides]);

  // Filtered view respecting visibility toggles — drives timeline + effective gaps
  const jumpCutGaps = useMemo(() => {
    return jumpCutGapsAll.filter(g => {
      if (g.kind === 'custom') return isFillerCutKey(g.key) ? showFillerCuts : showManualCuts;
      return showSilenceGaps;
    });
  }, [jumpCutGapsAll, showSilenceGaps, showFillerCuts, showManualCuts]);

  // Effective gaps = silence gaps get symmetrical padding; custom cuts pass
  // through as-is (they're already word-precise). These are the actual skip
  // zones used for playback and export.
  const jumpCutGapsEffective = useMemo(() => {
    return jumpCutGaps
      .map(g => g.kind === 'custom'
        // Custom/filler cuts: SHRINK by customCutPaddingMs on each side
        // (loosens the cut so more surrounding context survives)
        ? { ...g, startMs: g.startMs + customCutPaddingMs, endMs: g.endMs - customCutPaddingMs }
        // Silence gaps: SHRINK by jumpCutPaddingMs on each side
        : { ...g, startMs: g.startMs + jumpCutPaddingMs, endMs: g.endMs - jumpCutPaddingMs })
      .filter(g => g.endMs - g.startMs > 20); // drop gaps that padding has consumed entirely
  }, [jumpCutGaps, jumpCutPaddingMs, customCutPaddingMs]);

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

  const handleAddCustomCuts = useCallback((cuts: CustomCut[]) => {
    if (!cuts.length) return;
    setCustomCuts(prev => {
      const seen = new Set(prev.map(c => c.key));
      const merged = [...prev];
      for (const c of cuts) {
        if (!seen.has(c.key)) {
          merged.push(c);
          seen.add(c.key);
        }
      }
      return merged.sort((a, b) => a.startMs - b.startMs);
    });
    // Auto-enable skip so the user immediately hears the result.
    setShowFillerCuts(true);
  }, []);

  const handleClearCustomCuts = useCallback(() => {
    setCustomCuts([]);
    setPendingCustomCutStartMs(null);
    // Drop disabled/override state that was anchored to custom-cut keys.
    setJumpCutGapDisabled(prev => {
      const next: Record<string, true> = {};
      for (const k of Object.keys(prev)) if (!isCustomKey(k)) next[k] = true;
      return next;
    });
    setJumpCutGapOverrides(prev => {
      const next: typeof prev = {};
      for (const k of Object.keys(prev)) if (!isCustomKey(k)) next[k] = prev[k];
      return next;
    });
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

  const handleStartCustomCut = useCallback((playheadMs: number) => {
    setPendingCustomCutStartMs(Math.max(0, Math.round(playheadMs)));
  }, []);

  const handleCancelPendingCustomCut = useCallback(() => {
    setPendingCustomCutStartMs(null);
  }, []);

  const handleFinishCustomCut = useCallback((playheadMs: number) => {
    setPendingCustomCutStartMs((startMs) => {
      if (startMs === null) return null;
      const rawEndMs = Math.max(0, Math.round(playheadMs));
      const cutStartMs = Math.min(startMs, rawEndMs);
      const cutEndMs = Math.max(startMs, rawEndMs);
      if (cutEndMs - cutStartMs < 20) return null;
      const key = `editorial:${cutStartMs}-${cutEndMs}-${Date.now().toString(36)}`;
      setCustomCuts(prev => [...prev, { key, startMs: cutStartMs, endMs: cutEndMs, label: 'manual skip' }]
        .sort((a, b) => a.startMs - b.startMs));
      setSelectedGapKey(key);
      setShowManualCuts(true);
      return null;
    });
  }, []);

  const handleRemoveCustomCut = useCallback((key: string) => {
    setCustomCuts(prev => prev.filter(c => (isCustomKey(c.key) ? c.key : `custom:${c.key}`) !== key));
    setJumpCutGapDisabled(prev => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setJumpCutGapOverrides(prev => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setSelectedGapKey(prev => prev === key ? null : prev);
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
    customCutPaddingMs, setCustomCutPaddingMs,
    showSilenceGaps, setShowSilenceGaps,
    showFillerCuts, setShowFillerCuts,
    showManualCuts, setShowManualCuts,
    jumpCutGapOverrides,
    setJumpCutGapOverrides,
    jumpCutGapDisabled,
    setJumpCutGapDisabled,
    selectedGapKey,
    setSelectedGapKey,
    jumpCutGaps,
    jumpCutGapsEffective,
    jumpCutsEnabledRef,
    jumpCutGapListRef,
    customCuts, setCustomCuts,
    pendingCustomCutStartMs,
    handleAdjustGap,
    handleResetGap,
    handleResetAllGaps,
    handleAddCustomCuts,
    handleClearCustomCuts,
    handleStartCustomCut,
    handleCancelPendingCustomCut,
    handleFinishCustomCut,
    handleRemoveCustomCut,
    handleToggleGapDisabled,
    handleSelectGap,
  };
}
