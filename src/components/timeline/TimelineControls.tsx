import React, { useState } from 'react';
import type { MicroTimeline } from '../../lib/types';
import { btn, btnPrimary, btnDanger, fmt } from './timelineUtils';

interface Props {
  microTimelines: MicroTimeline[];
  timelineItemLabel: 'clip' | 'chunk';
  clipEditingEnabled: boolean;
  selectedClip: MicroTimeline | null;
  onSelectClip: (id: string | null) => void;
  onPlayheadChange: (playhead: number) => void;
  onRenameClip?: (id: string, name: string) => void;
  pendingClipStart: number | null;
  onAddStart?: () => void;
  onAddEnd?: () => void;
  onCancelPending?: () => void;
  onDeleteClip?: (id: string) => void;
  onFocusClip: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetView: () => void;
  followPlayhead: boolean;
  onToggleFollow: () => void;
  showAudioTracks?: boolean;
  onToggleAudioTracks?: (() => void) | undefined;
  skipGapsEnabled: boolean;
  selectedGapKey: string | null;
  skipGapDisabled: Record<string, true>;
  skipGapOverrides: Record<string, { startMs: number; endMs: number }>;
  onToggleGapDisabled: ((key: string) => void) | undefined;
  onResetAllSkipGaps: (() => void) | undefined;
  outroEnabled: boolean | undefined;
  onToggleOutro: (() => void) | undefined;
}

export const TimelineControls: React.FC<Props> = ({
  microTimelines, timelineItemLabel, clipEditingEnabled, selectedClip, onSelectClip, onPlayheadChange, onRenameClip,
  pendingClipStart, onAddStart, onAddEnd, onCancelPending, onDeleteClip,
  onFocusClip, onZoomIn, onZoomOut, onResetView, followPlayhead, onToggleFollow,
  showAudioTracks, onToggleAudioTracks,
  skipGapsEnabled, selectedGapKey, skipGapDisabled, skipGapOverrides,
  onToggleGapDisabled, onResetAllSkipGaps,
  outroEnabled, onToggleOutro,
}) => {
  const [editingName, setEditingName] = useState<string | null>(null);

  return (
    <>
      {/* clip list — clicking empty space deselects */}
      {microTimelines.length > 0 && (
        <div
          style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 2, minHeight: 28 }}
          onClick={() => onSelectClip(null)}
          title={`Click empty space to deselect ${timelineItemLabel}`}
        >
          {microTimelines.map((mt) => {
            const isSel = mt.id === selectedClip?.id;
            return (
              <button
                key={mt.id}
                onClick={(e) => { e.stopPropagation(); if (isSel) onPlayheadChange(mt.startSecond); else onSelectClip(mt.id); }}
                onDoubleClick={() => {
                  if (clipEditingEnabled && onRenameClip) setEditingName(mt.id);
                }}
                style={{
                  ...btn,
                  background: isSel ? mt.color + '33' : '#1a1a1a',
                  borderColor: isSel ? mt.color : '#2a2a2a',
                  color: isSel ? '#fff' : '#aaa',
                  position: 'relative',
                  paddingLeft: 14,
                }}
              >
                <span style={{
                  position: 'absolute', left: 4, top: '50%', transform: 'translateY(-50%)',
                  width: 6, height: 6, borderRadius: '50%', background: mt.color,
                }} />
                {editingName === mt.id ? (
                  <input
                    autoFocus
                    defaultValue={mt.name}
                    onClick={(e) => e.stopPropagation()}
                    onBlur={(e) => {
                      onRenameClip?.(mt.id, e.target.value || mt.name);
                      setEditingName(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        onRenameClip?.(mt.id, (e.target as HTMLInputElement).value || mt.name);
                        setEditingName(null);
                      }
                      if (e.key === 'Escape') setEditingName(null);
                    }}
                    style={{
                      background: 'transparent', border: 'none', color: 'inherit',
                      fontSize: 'inherit', fontFamily: 'inherit', width: 60, outline: 'none',
                      borderBottom: '1px solid #888',
                    }}
                  />
                ) : (
                  <span>{mt.name} ({fmt(mt.endSecond - mt.startSecond)})</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* control buttons */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
        {clipEditingEnabled && onAddStart && onAddEnd && onCancelPending && (
          <>
            {pendingClipStart === null ? (
              <button style={btnPrimary} onClick={onAddStart} title="Mark clip start at the current playhead">+ Start</button>
            ) : (
              <>
                <button style={{ ...btn, background: '#ffd60a22', borderColor: '#ffd60a', color: '#ffd60a' }} disabled>
                  Start @ {fmt(pendingClipStart)}
                </button>
                <button style={btnPrimary} onClick={onAddEnd} title="Mark clip end at the current playhead">+ End</button>
                <button style={btn} onClick={onCancelPending}>Cancel</button>
              </>
            )}
            <span style={{ width: 1, background: '#333', margin: '0 2px' }} />
          </>
        )}

        {selectedClip && (
          <>
            <button
              style={btnPrimary}
              onClick={onFocusClip}
              title={`Zoom so the selected ${timelineItemLabel} fills ~90% of the timeline`}
            >
              {timelineItemLabel === 'clip' ? 'Focus Clip' : 'Focus Chunk'}
            </button>
            {clipEditingEnabled && onDeleteClip && (
              <button style={btnDanger} onClick={() => onDeleteClip(selectedClip.id)} title="Delete the selected clip">Delete</button>
            )}
          </>
        )}

        <button style={btn} onClick={onZoomIn} title="Zoom in">Zoom In</button>
        <button style={btn} onClick={onZoomOut} title="Zoom out">Zoom Out</button>
        <button style={btn} onClick={onResetView} title="Show the full duration">Reset</button>
        <button
          style={{
            ...btn,
            background: followPlayhead ? '#1f6feb33' : '#1a1a1a',
            borderColor: followPlayhead ? '#1f6feb' : '#2a2a2a',
            color: followPlayhead ? '#fff' : '#aaa',
          }}
          onClick={onToggleFollow}
          title={followPlayhead ? 'Following playhead — click to stop' : 'Auto-scroll the timeline to follow the playhead when zoomed in'}
        >
          {followPlayhead ? '⏵ Following' : '⏵ Follow'}
        </button>

        {onToggleAudioTracks && (
          <button
            style={{
              ...btn,
              background: showAudioTracks ? '#8b5cf633' : '#1a1a1a',
              borderColor: showAudioTracks ? '#8b5cf6' : '#2a2a2a',
              color: showAudioTracks ? '#fff' : '#aaa',
            }}
            onClick={onToggleAudioTracks}
            title={showAudioTracks ? 'Hide audio tracks' : 'Show audio tracks'}
          >
            {showAudioTracks ? 'Hide Audio' : 'Show Audio'}
          </button>
        )}

        {skipGapsEnabled && selectedGapKey && onToggleGapDisabled && (() => {
          const isDisabled = !!skipGapDisabled[selectedGapKey];
          return (
            <button
              style={{
                ...btn,
                borderColor: isDisabled ? '#9aa' : '#ff453a',
                color: isDisabled ? '#ddd' : '#ff453a',
                background: isDisabled ? '#9aa1' : '#ff453a22',
              }}
              onClick={() => onToggleGapDisabled(selectedGapKey)}
              title={isDisabled ? 'Restore this silence block (will be skipped again)' : 'Delete this silence block (no longer skipped)'}
            >
              {isDisabled ? '↺ Restore silence' : '✕ Delete silence'}
            </button>
          );
        })()}

        {skipGapsEnabled && (Object.keys(skipGapOverrides).length > 0 || Object.keys(skipGapDisabled).length > 0) && onResetAllSkipGaps && (
          <button
            style={{ ...btn, borderColor: '#5ac8fa', color: '#5ac8fa', background: '#5ac8fa18' }}
            onClick={onResetAllSkipGaps}
            title="Revert all manual silence-gap edits and restore all deleted silence blocks"
          >
            Reset silence edits ({Object.keys(skipGapOverrides).length + Object.keys(skipGapDisabled).length})
          </button>
        )}

        {onToggleOutro && (
          <button
            style={{
              ...btn,
              marginLeft: 'auto',
              background: outroEnabled ? '#eb6f1f44' : '#1a1a1a',
              borderColor: outroEnabled ? '#eb6f1f' : '#2a2a2a',
              color: outroEnabled ? '#fff' : '#aaa'
            }}
            onClick={onToggleOutro}
            title="Add a 5-second frozen-frame extension at the end of the video"
          >
            {outroEnabled ? '✓ Outro (5s)' : '+ Outro'}
          </button>
        )}
      </div>
    </>
  );
};
