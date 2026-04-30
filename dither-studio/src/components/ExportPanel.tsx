import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Row, Section, Slider } from './Controls';
import type { ExportParams } from '../lib/types';

export interface ExportPanelProps {
  params: ExportParams;
  onChange: (p: ExportParams) => void;
  onExport: (
    onProgress: (done: number, total: number) => void,
    signal: AbortSignal,
  ) => Promise<string | void>;
  lockedDuration?: number;
  exportLabel?: string;
  layerSummary?: string;
  playheadSecond?: number;
  onSeekPlayhead?: (second: number) => void;
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

function formatTime(sec: number) {
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}:${r.toFixed(2).padStart(5, '0')}`;
}

export const ExportPanel: React.FC<ExportPanelProps> = ({
  params, onChange, onExport, lockedDuration, exportLabel = 'Export PNG sequence', layerSummary, playheadSecond, onSeekPlayhead,
}) => {
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [folder, setFolder] = useState<string | null>(null);
  const [cancelled, setCancelled] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const totalDuration = useMemo(() => {
    if (lockedDuration !== undefined) return Math.max(0.01, lockedDuration);
    return Math.max(0.01, params.endSecond ?? params.duration);
  }, [lockedDuration, params.duration, params.endSecond]);
  const minGap = useMemo(() => Math.max(0.01, 1 / Math.max(1, params.fps)), [params.fps]);
  const start = clamp(params.startSecond, 0, Math.max(0, totalDuration - minGap));
  const fallbackEnd = params.endSecond ?? Math.min(totalDuration, start + Math.max(minGap, params.duration));
  const end = clamp(fallbackEnd, start + minGap, totalDuration);
  const totalFrames = Math.max(1, Math.ceil((end - start) * params.fps));
  const playhead = clamp(playheadSecond ?? start, start, end);

  const set = (patch: Partial<ExportParams>) => onChange({ ...params, ...patch });
  const seekInRange = (sec: number) => {
    if (!onSeekPlayhead) return;
    onSeekPlayhead(clamp(sec, start, end));
  };
  const setRange = (nextStart: number, nextEnd: number) => {
    const s = clamp(nextStart, 0, Math.max(0, totalDuration - minGap));
    const e = clamp(nextEnd, s + minGap, totalDuration);
    onChange({
      ...params,
      startSecond: s,
      endSecond: e,
      duration: Math.max(minGap, e - s),
    });
  };

  const rangeTrackRef = useRef<HTMLDivElement | null>(null);
  const playheadTrackRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<null | 'start' | 'end'>(null);
  const seekDragRef = useRef(false);

  const secondsFromClientX = (el: HTMLDivElement | null, x: number) => {
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    if (r.width <= 0) return 0;
    const pct = clamp((x - r.left) / r.width, 0, 1);
    return pct * totalDuration;
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (dragRef.current) {
        const sec = secondsFromClientX(rangeTrackRef.current, e.clientX);
        if (dragRef.current === 'start') setRange(sec, end);
        else setRange(start, sec);
      }
      if (seekDragRef.current && onSeekPlayhead) {
        const sec = secondsFromClientX(playheadTrackRef.current, e.clientX);
        seekInRange(sec);
      }
    };
    const onUp = () => {
      dragRef.current = null;
      seekDragRef.current = false;
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [end, start, onSeekPlayhead, totalDuration, minGap]);

  const onRangeTrackDown: React.MouseEventHandler<HTMLDivElement> = (e) => {
    const sec = secondsFromClientX(rangeTrackRef.current, e.clientX);
    const distToStart = Math.abs(sec - start);
    const distToEnd = Math.abs(sec - end);
    dragRef.current = distToStart <= distToEnd ? 'start' : 'end';
    if (dragRef.current === 'start') setRange(sec, end);
    else setRange(start, sec);
  };

  const onPlayheadTrackDown: React.MouseEventHandler<HTMLDivElement> = (e) => {
    if (!onSeekPlayhead) return;
    seekDragRef.current = true;
    seekInRange(secondsFromClientX(playheadTrackRef.current, e.clientX));
  };

  const handleExport = async () => {
    setError(null);
    setFolder(null);
    setCancelled(false);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      setExporting(true);
      setProgress({ done: 0, total: totalFrames });
      const exportFolder = await onExport((done, total) => setProgress({ done, total }), ctrl.signal);
      if (exportFolder) setFolder(exportFolder);
    } catch (e: any) {
      if (e?.name === 'AbortError' || ctrl.signal.aborted) setCancelled(true);
      else setError(String(e?.message ?? e));
    } finally {
      setExporting(false);
      abortRef.current = null;
    }
  };

  return (
    <Section title="Export">
      <Slider label="width" value={params.width} min={64} max={7680} step={1} onChange={(v) => set({ width: Math.round(v) })} />
      <Slider label="height" value={params.height} min={64} max={4320} step={1} onChange={(v) => set({ height: Math.round(v) })} />
      <Slider label="fps" value={params.fps} min={1} max={120} step={1} onChange={(v) => set({ fps: Math.round(v) })} />

      <div style={{ marginTop: 8, marginBottom: 6, color: '#aaa', fontSize: 11 }}>Time range</div>
      <div
        ref={rangeTrackRef}
        onMouseDown={onRangeTrackDown}
        style={{
          position: 'relative',
          height: 24,
          borderRadius: 4,
          background: '#1a1a1a',
          border: '1px solid #333',
          cursor: 'ew-resize',
          userSelect: 'none',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: `${(start / totalDuration) * 100}%`,
            width: `${((end - start) / totalDuration) * 100}%`,
            top: 0,
            bottom: 0,
            background: '#1f6feb55',
            borderLeft: '1px solid #1f6feb',
            borderRight: '1px solid #1f6feb',
          }}
        />
        <div
          onMouseDown={(e) => { e.stopPropagation(); dragRef.current = 'start'; }}
          style={{
            position: 'absolute',
            left: `${(start / totalDuration) * 100}%`,
            top: '50%',
            width: 10,
            height: 10,
            transform: 'translate(-50%, -50%)',
            borderRadius: '50%',
            background: '#1f6feb',
            boxShadow: '0 0 0 2px #0c0c0c',
            cursor: 'ew-resize',
          }}
        />
        <div
          onMouseDown={(e) => { e.stopPropagation(); dragRef.current = 'end'; }}
          style={{
            position: 'absolute',
            left: `${(end / totalDuration) * 100}%`,
            top: '50%',
            width: 10,
            height: 10,
            transform: 'translate(-50%, -50%)',
            borderRadius: '50%',
            background: '#1f6feb',
            boxShadow: '0 0 0 2px #0c0c0c',
            cursor: 'ew-resize',
          }}
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#777', marginTop: 4, fontSize: 10 }}>
        <span>start {formatTime(start)}</span>
        <span>end {formatTime(end)}</span>
      </div>

      <>
        <div style={{ marginTop: 10, marginBottom: 6, color: '#aaa', fontSize: 11 }}>Playback timeline</div>
        <div
          ref={playheadTrackRef}
          onMouseDown={onPlayheadTrackDown}
          style={{
            position: 'relative',
            height: 20,
            borderRadius: 4,
            background: '#262626',
            border: '1px solid #333',
            cursor: onSeekPlayhead ? 'ew-resize' : 'default',
            userSelect: 'none',
            opacity: onSeekPlayhead ? 1 : 0.65,
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: `${(start / totalDuration) * 100}%`,
              background: '#00000066',
            }}
          />
          <div
            style={{
              position: 'absolute',
              right: 0,
              top: 0,
              bottom: 0,
              width: `${((totalDuration - end) / totalDuration) * 100}%`,
              background: '#00000066',
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: `${(playhead / totalDuration) * 100}%`,
              top: -3,
              bottom: -3,
              width: 2,
              transform: 'translateX(-50%)',
              background: '#f5f5f5',
              boxShadow: '0 0 6px rgba(255,255,255,0.35)',
            }}
          />
        </div>
        <div style={{ color: '#777', marginTop: 4, fontSize: 10 }}>
          current {formatTime(playhead)} {onSeekPlayhead ? '' : '(load video to scrub)'}
        </div>
      </>

      <Row label="prefix">
        <input
          type="text"
          value={params.filenamePrefix}
          onChange={(e) => set({ filenamePrefix: e.target.value })}
          style={{ width: '100%', background: '#0a0a0a', color: '#ddd', border: '1px solid #333', padding: '2px 4px' }}
        />
        <span />
      </Row>

      <div style={{ marginTop: 6, color: '#888' }}>
        {totalFrames} frames @ {params.width}×{params.height}
        {lockedDuration !== undefined ? ` (video: ${totalDuration.toFixed(2)}s)` : ''}
      </div>
      {layerSummary && <div style={{ marginTop: 4, color: '#777', lineHeight: 1.4 }}>Layers: {layerSummary}</div>}

      <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
        <button
          onClick={handleExport}
          disabled={exporting}
          style={{
            flex: 1, padding: '8px 12px', background: exporting ? '#222' : '#1f6feb',
            color: '#fff', border: 'none', borderRadius: 3, cursor: exporting ? 'wait' : 'pointer',
          }}
        >
          {exporting ? `Exporting ${progress?.done ?? 0} / ${progress?.total ?? totalFrames}` : exportLabel}
        </button>
        {exporting && (
          <button
            onClick={() => abortRef.current?.abort()}
            style={{
              padding: '8px 12px', background: '#a33', color: '#fff',
              border: 'none', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Cancel
          </button>
        )}
      </div>

      {error && <div style={{ color: '#ff6b6b', marginTop: 6 }}>{error}</div>}
      {cancelled && <div style={{ color: '#eb6f1f', marginTop: 6 }}>Export cancelled.</div>}
      {folder && <div style={{ color: '#30d158', marginTop: 6 }}>Saved to {folder}</div>}
      <div style={{ color: '#666', marginTop: 6, lineHeight: 1.5 }}>
        Files: <code>{params.filenamePrefix}_00001.png</code> … inside this project folder.<br />
        In Resolve: Media Pool → Import → enable "Image Sequence" → select first frame.
      </div>
    </Section>
  );
};
