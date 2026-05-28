import React, { useMemo, useRef, useState } from 'react';
import { Row, Section, Slider, Toggle } from './Controls';
import type { ExportParams } from '../lib/types';
import { buildExportBaseName } from '../lib/exporter';
import { openExportFolder } from '../lib/projectApi';

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
  clipName?: string;
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

export const ExportPanel: React.FC<ExportPanelProps> = ({
  params, onChange, onExport, lockedDuration, exportLabel = 'Render export', layerSummary, clipName,
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
  const outroDuration = params.outroEnabled ? 5 : 0;
  const totalFrames = Math.max(1, Math.ceil((end - start + outroDuration) * params.fps));
  const exportBaseName = useMemo(
    () => buildExportBaseName(params.filenamePrefix, start, end),
    [params.filenamePrefix, start, end],
  );
  const exportMode = params.exportMode ?? 'master';

  const set = (patch: Partial<ExportParams>) => onChange({ ...params, ...patch });

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

  const handleOpenFolder = async () => {
    if (!folder) return;
    // folder format: "projects/PROJECT_ID/exports/EXPORT_ID/FILE.mp4" or "projects/PROJECT_ID/exports/EXPORT_ID"
    const parts = folder.split('/');
    const projectId = parts[1];
    const exportId = parts[3];
    if (projectId && exportId) {
      await openExportFolder(projectId, exportId);
    }
  };

  return (
    <Section title="Export">
      <Slider label="width" value={params.width} min={64} max={7680} step={1} onChange={(v) => set({ width: Math.round(v) })} />
      <Slider label="height" value={params.height} min={64} max={4320} step={1} onChange={(v) => set({ height: Math.round(v) })} />
      <Slider label="fps" value={params.fps} min={1} max={120} step={1} onChange={(v) => set({ fps: Math.round(v) })} />

      <Row label="mode">
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          <button
            onClick={() => set({ exportMode: 'master' })}
            style={{
              padding: '4px 10px',
              background: exportMode === 'master' ? '#1f6feb' : '#111',
              color: exportMode === 'master' ? '#fff' : '#aaa',
              border: `1px solid ${exportMode === 'master' ? '#1f6feb' : '#333'}`,
              borderRadius: 3,
              cursor: 'pointer',
            }}
          >
            master
          </button>
          <button
            onClick={() => set({ exportMode: 'web' })}
            style={{
              padding: '4px 10px',
              background: exportMode === 'web' ? '#1f6feb' : '#111',
              color: exportMode === 'web' ? '#fff' : '#aaa',
              border: `1px solid ${exportMode === 'web' ? '#1f6feb' : '#333'}`,
              borderRadius: 3,
              cursor: 'pointer',
            }}
          >
            web
          </button>
        </div>
      </Row>

      <Toggle
        label="invert final output"
        value={!!params.invertFinalOutput}
        onChange={(v) => set({ invertFinalOutput: v })}
      />

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
        {params.width === 1080 && params.height === 1080 ? '' : ' (Note: Active Crop Guide may override these)'}
      </div>
      <div style={{ marginTop: 4, color: '#666', fontSize: 11 }}>
        Set the time range using the timeline beneath the preview.
      </div>
      <div style={{ marginTop: 4, color: '#666', fontSize: 11, lineHeight: 1.4 }}>
        {exportMode === 'master'
          ? 'Master mode keeps the high-fidelity stitch path for editing / archival outputs.'
          : 'Web mode targets upload-friendly delivery sizes. If the background layer is off, it preserves alpha and exports a transparent web format.'}
      </div>
      {params.invertFinalOutput && (
        <div style={{ marginTop: 4, color: '#777', fontSize: 11, lineHeight: 1.4 }}>
          Final invert is on. Preview and export both apply the inversion after all layers are composited.
        </div>
      )}
      {layerSummary && <div style={{ marginTop: 4, color: '#777', lineHeight: 1.4 }}>Layers: {layerSummary}</div>}
      {clipName && <div style={{ marginTop: 4, color: '#1f6feb', fontSize: 11 }}>Exporting: {clipName}</div>}

      <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
        <button
          onClick={handleExport}
          disabled={exporting}
          style={{
            position: 'relative',
            flex: 1, padding: '8px 12px',
            background: exporting ? '#222' : '#1f6feb',
            color: '#fff', border: 'none', borderRadius: 3,
            cursor: exporting ? 'wait' : 'pointer',
            overflow: 'hidden',
          }}
        >
          {exporting && (
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: `${((progress?.done ?? 0) / (progress?.total ?? 1)) * 100}%`,
                background: '#1f6feb',
                opacity: 0.4,
                transition: 'width 100ms linear',
              }}
            />
          )}
          <span style={{ position: 'relative', zIndex: 1 }}>
            {exporting ? `Exporting ${progress?.done ?? 0} / ${progress?.total ?? totalFrames}` : exportLabel}
          </span>
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
      {folder && (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ color: '#30d158' }}>Saved to {folder}</div>
          <button
            onClick={handleOpenFolder}
            style={{
              alignSelf: 'flex-start',
              padding: '6px 12px',
              background: '#333',
              color: '#eee',
              border: '1px solid #444',
              borderRadius: 3,
              cursor: 'pointer',
              fontSize: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span role="img" aria-label="folder">📂</span> Open Folder
          </button>
        </div>
      )}
      <div style={{ color: '#666', marginTop: 6, lineHeight: 1.5 }}>
        Frames: <code>{exportBaseName}_00001.png</code> … inside this project export folder.<br />
        CAST renders frames first, then automatically stitches the final video beside them.
      </div>
    </Section>
  );
};
