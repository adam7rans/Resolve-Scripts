import React from 'react';
import { MICRO_TIMELINE_COLORS, type MicroTimeline, type ExportParams } from '../lib/types';

interface ClipHandlersDeps {
  microTimelines: MicroTimeline[];
  setMicroTimelines: React.Dispatch<React.SetStateAction<MicroTimeline[]>>;
  selectedClipId: string | null;
  setSelectedClipId: React.Dispatch<React.SetStateAction<string | null>>;
  pendingClipStart: number | null;
  setPendingClipStart: React.Dispatch<React.SetStateAction<number | null>>;
  playheadSecond: number;
  setPlayheadSecond: React.Dispatch<React.SetStateAction<number>>;
  mediaElRef: React.RefObject<HTMLMediaElement | null>;
  handleSeekPlayhead: (sec: number) => void;
  setBaseExportParams: React.Dispatch<React.SetStateAction<ExportParams>>;
}

export function useClipHandlers(deps: ClipHandlersDeps) {
  const {
    microTimelines, setMicroTimelines,
    selectedClipId, setSelectedClipId,
    pendingClipStart, setPendingClipStart,
    playheadSecond, setPlayheadSecond,
    mediaElRef, handleSeekPlayhead,
    setBaseExportParams,
  } = deps;

  const handleClipRangeChange = (id: string, s: number, e: number) => {
    setMicroTimelines(prev => prev.map(mt =>
      mt.id === id ? { ...mt, startSecond: s, endSecond: e } : mt
    ));
  };

  const handleAddClipStart = () => {
    setPendingClipStart(playheadSecond);
  };

  const handleAddClipEnd = () => {
    if (pendingClipStart === null) return;
    const s = Math.min(pendingClipStart, playheadSecond);
    const e = Math.max(pendingClipStart, playheadSecond);
    if (e - s < 0.1) return;
    const newClip: MicroTimeline = {
      id: crypto.randomUUID(),
      name: `Clip ${microTimelines.length + 1}`,
      startSecond: s,
      endSecond: e,
      color: MICRO_TIMELINE_COLORS[microTimelines.length % MICRO_TIMELINE_COLORS.length],
    };
    setMicroTimelines(prev => [...prev, newClip]);
    setSelectedClipId(newClip.id);
    setPendingClipStart(null);
  };

  const handleDeleteClip = (id: string) => {
    setMicroTimelines(prev => {
      const next = prev.filter(mt => mt.id !== id);
      if (selectedClipId === id) {
        setSelectedClipId(next[0]?.id ?? null);
      }
      return next;
    });
  };

  const handleRenameClip = (id: string, name: string) => {
    setMicroTimelines(prev => prev.map(mt => mt.id === id ? { ...mt, name } : mt));
  };

  const handleTimelineSeek = (sec: number) => {
    if (mediaElRef.current) handleSeekPlayhead(sec);
    else setPlayheadSecond(sec);
  };

  const handleToggleOutro = () => {
    setBaseExportParams(p => ({ ...p, outroEnabled: !p.outroEnabled }));
  };

  return {
    handleClipRangeChange,
    handleAddClipStart,
    handleAddClipEnd,
    handleDeleteClip,
    handleRenameClip,
    handleTimelineSeek,
    handleToggleOutro,
  };
}
