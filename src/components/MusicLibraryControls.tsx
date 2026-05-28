import React, { useMemo, useRef } from 'react';
import type { MusicAsset, MusicTimelineClip } from '../lib/types';
import { Section, Slider, Toggle } from './Controls';

function fmt(sec: number | undefined) {
  if (!Number.isFinite(sec ?? NaN)) return '--:--';
  const total = Math.max(0, sec ?? 0);
  const m = Math.floor(total / 60);
  const s = total - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

export const MusicLibraryControls: React.FC<{
  assets: MusicAsset[];
  durations: Record<string, number>;
  selectedAssetIds: string[];
  onSelectedAssetIdsChange: (ids: string[]) => void;
  onPickFiles: (files: File[]) => void;
  onDeleteAsset: (assetId: string) => void;
  onAutoArrangeSelected: () => void;
  arrangedClipCount: number;
  showAudioTracks: boolean;
  onToggleShowAudioTracks: (value: boolean) => void;
  onClearTimeline: () => void;
  selectedMusicClip: MusicTimelineClip | null;
  selectedMusicClipName: string | null;
  onUpdateSelectedClip: (patch: Partial<MusicTimelineClip>) => void;
  onDeleteSelectedClip: () => void;
}> = ({
  assets,
  durations,
  selectedAssetIds,
  onSelectedAssetIdsChange,
  onPickFiles,
  onDeleteAsset,
  onAutoArrangeSelected,
  arrangedClipCount,
  showAudioTracks,
  onToggleShowAudioTracks,
  onClearTimeline,
  selectedMusicClip,
  selectedMusicClipName,
  onUpdateSelectedClip,
  onDeleteSelectedClip,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const allSelected = assets.length > 0 && selectedAssetIds.length === assets.length;
  const selectedCount = selectedAssetIds.length;
  const selectedDuration = useMemo(
    () => selectedAssetIds.reduce((sum, id) => sum + (durations[id] ?? 0), 0),
    [durations, selectedAssetIds],
  );

  return (
    <>
      <Section title="Music Library">
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*,.mp3,.wav,.m4a,.flac,.ogg,.opus,.aac"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            if (files.length > 0) onPickFiles(files);
            if (fileInputRef.current) fileInputRef.current.value = '';
          }}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          style={{ width: '100%', background: '#1f6feb', color: '#fff', border: 'none', padding: '6px 10px', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit' }}
        >
          Upload music files…
        </button>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', color: '#888', fontSize: 12 }}>
          <span>{assets.length} file{assets.length === 1 ? '' : 's'}</span>
          <span>{selectedCount} selected</span>
          {selectedCount > 0 && <span>{fmt(selectedDuration)}</span>}
        </div>
        {assets.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button
              onClick={() => onSelectedAssetIdsChange(allSelected ? [] : assets.map((asset) => asset.id))}
              style={{ background: '#1a1a1a', color: '#ddd', border: '1px solid #2a2a2a', padding: '6px 10px', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              {allSelected ? 'Clear selection' : 'Select all'}
            </button>
            <button
              onClick={onAutoArrangeSelected}
              disabled={selectedCount === 0}
              style={{ background: selectedCount === 0 ? '#1a1a1a' : '#1f6feb22', color: selectedCount === 0 ? '#666' : '#fff', border: `1px solid ${selectedCount === 0 ? '#2a2a2a' : '#1f6feb'}`, padding: '6px 10px', borderRadius: 3, cursor: selectedCount === 0 ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}
            >
              Auto arrange selected
            </button>
          </div>
        )}
        {assets.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
            {assets.map((asset) => {
              const selected = selectedAssetIds.includes(asset.id);
              return (
                <div
                  key={asset.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '20px 1fr auto auto',
                    gap: 8,
                    alignItems: 'center',
                    padding: '6px 8px',
                    border: '1px solid #262626',
                    borderRadius: 4,
                    background: selected ? '#1f6feb18' : '#111',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={(e) => {
                      if (e.target.checked) onSelectedAssetIdsChange([...selectedAssetIds, asset.id]);
                      else onSelectedAssetIdsChange(selectedAssetIds.filter((id) => id !== asset.id));
                    }}
                  />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: '#ddd', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {asset.originalName}
                    </div>
                    <div style={{ color: '#777', fontSize: 11 }}>{fmt(durations[asset.id])}</div>
                  </div>
                  <button
                    onClick={() => onSelectedAssetIdsChange(selected ? selectedAssetIds.filter((id) => id !== asset.id) : [...selectedAssetIds, asset.id])}
                    style={{ background: '#1a1a1a', color: '#aaa', border: '1px solid #2a2a2a', padding: '4px 8px', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11 }}
                  >
                    {selected ? 'Deselect' : 'Select'}
                  </button>
                  <button
                    onClick={() => onDeleteAsset(asset.id)}
                    style={{ background: '#2a1313', color: '#ff8b84', border: '1px solid #5a2a2a', padding: '4px 8px', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11 }}
                  >
                    Delete
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <Section title="Timeline">
        <Toggle label="show audio tracks" value={showAudioTracks} onChange={onToggleShowAudioTracks} />
        <div style={{ color: '#888', fontSize: 12 }}>
          {arrangedClipCount} arranged clip{arrangedClipCount === 1 ? '' : 's'}
        </div>
        {arrangedClipCount > 0 && (
          <button
            onClick={onClearTimeline}
            style={{ alignSelf: 'flex-start', background: '#1a1a1a', color: '#ddd', border: '1px solid #2a2a2a', padding: '6px 10px', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Clear arranged clips
          </button>
        )}
      </Section>

      <Section title="Selected music clip">
        {selectedMusicClip ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ color: '#aaa', fontSize: 12, minWidth: 0 }}>
                {selectedMusicClipName ?? 'clip'} · track {selectedMusicClip.trackIndex + 1}
              </div>
              <button
                onClick={onDeleteSelectedClip}
                style={{ background: '#2a1313', color: '#ff8b84', border: '1px solid #5a2a2a', padding: '4px 8px', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, flexShrink: 0 }}
              >
                Delete clip
              </button>
            </div>
            <Slider
              label="track"
              value={selectedMusicClip.trackIndex + 1}
              min={1}
              max={2}
              step={1}
              onChange={(value) => onUpdateSelectedClip({ trackIndex: (Math.round(value) - 1) as 0 | 1 })}
            />
            <Slider
              label="start sec"
              value={selectedMusicClip.startSecond}
              min={0}
              max={7200}
              step={0.1}
              onChange={(value) => onUpdateSelectedClip({ startSecond: value })}
            />
            <Slider
              label="fade in"
              value={selectedMusicClip.fadeInSecond}
              min={0}
              max={Math.max(0, selectedMusicClip.durationSecond)}
              step={0.1}
              onChange={(value) => onUpdateSelectedClip({ fadeInSecond: value })}
            />
            <Slider
              label="fade out"
              value={selectedMusicClip.fadeOutSecond}
              min={0}
              max={Math.max(0, selectedMusicClip.durationSecond)}
              step={0.1}
              onChange={(value) => onUpdateSelectedClip({ fadeOutSecond: value })}
            />
          </>
        ) : (
          <div style={{ color: '#777', fontSize: 12 }}>
            Select an arranged music clip on the timeline to edit its fades and track.
          </div>
        )}
      </Section>
    </>
  );
};
