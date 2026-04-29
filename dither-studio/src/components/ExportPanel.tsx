import React, { useState } from 'react';
import { Section, Slider, Row } from './Controls';
import type { ExportParams } from '../lib/types';

export interface ExportPanelProps {
  params: ExportParams;
  onChange: (p: ExportParams) => void;
  onExport: (onProgress: (done: number, total: number) => void) => Promise<string | void>;
  /** if provided, locks duration to this (e.g. video length) */
  lockedDuration?: number;
  exportLabel?: string;
  layerSummary?: string;
}

export const ExportPanel: React.FC<ExportPanelProps> = ({
  params, onChange, onExport, lockedDuration, exportLabel = 'Export PNG sequence', layerSummary,
}) => {
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [folder, setFolder] = useState<string | null>(null);

  const set = (patch: Partial<ExportParams>) => onChange({ ...params, ...patch });

  const dur = lockedDuration ?? params.duration;
  const totalFrames = Math.max(1, Math.ceil(dur * params.fps));

  const handleExport = async () => {
    setError(null);
    setFolder(null);
    try {
      setExporting(true);
      setProgress({ done: 0, total: totalFrames });
      const exportFolder = await onExport((done, total) => setProgress({ done, total }));
      if (exportFolder) setFolder(exportFolder);
    } catch (e: any) {
      if (e?.name !== 'AbortError') setError(String(e?.message ?? e));
    } finally {
      setExporting(false);
    }
  };

  return (
    <Section title="Export">
      <Slider label="width" value={params.width} min={64} max={7680} step={1} onChange={(v) => set({ width: Math.round(v) })} />
      <Slider label="height" value={params.height} min={64} max={4320} step={1} onChange={(v) => set({ height: Math.round(v) })} />
      <Slider label="fps" value={params.fps} min={1} max={120} step={1} onChange={(v) => set({ fps: Math.round(v) })} />
      {lockedDuration === undefined && (
        <Slider label="duration (s)" value={params.duration} min={0.1} max={600} step={0.1} onChange={(v) => set({ duration: v })} />
      )}
      <Slider label="start (s)" value={params.startSecond} min={0} max={Math.max(0.1, dur)} step={0.01} onChange={(v) => set({ startSecond: v })} />
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
        {lockedDuration !== undefined ? ` (locked to video: ${dur.toFixed(2)}s)` : ''}
      </div>
      {layerSummary && (
        <div style={{ marginTop: 4, color: '#777', lineHeight: 1.4 }}>
          Layers: {layerSummary}
        </div>
      )}
      <button
        onClick={handleExport}
        disabled={exporting}
        style={{
          marginTop: 8, padding: '8px 12px', background: exporting ? '#222' : '#1f6feb',
          color: '#fff', border: 'none', borderRadius: 3, cursor: exporting ? 'wait' : 'pointer',
        }}
      >
        {exporting ? `Exporting ${progress?.done ?? 0} / ${progress?.total ?? totalFrames}` : exportLabel}
      </button>
      {error && <div style={{ color: '#ff6b6b', marginTop: 6 }}>{error}</div>}
      {folder && <div style={{ color: '#30d158', marginTop: 6 }}>Saved to {folder}</div>}
      <div style={{ color: '#666', marginTop: 6, lineHeight: 1.5 }}>
        Files: <code>{params.filenamePrefix}_00001.png</code> … inside this project folder.<br />
        In Resolve: Media Pool → Import → enable "Image Sequence" → select first frame.
      </div>
    </Section>
  );
};
