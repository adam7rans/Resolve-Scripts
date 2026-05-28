import React from 'react';
import { clamp, fmt, type PreviewTimelineProps } from './timelineUtils';
import { ClipTrackOverlay } from './ClipTrackOverlay';
import { MusicTrackOverlay } from './MusicTrackOverlay';
import { SkipGapOverlay } from './SkipGapOverlay';
import { TimelineControls } from './TimelineControls';
import { usePreviewTimelineState } from './usePreviewTimelineState';

export type { PreviewTimelineProps };

export const PreviewTimeline: React.FC<PreviewTimelineProps> = ({
  duration, playhead, onPlayheadChange,
  outroEnabled, onToggleOutro,
  microTimelines, timelineItemLabel = 'clip', clipEditingEnabled = true, musicTimelineClips = [], musicClipLabels = {}, musicDuration, musicPlayhead, selectedMusicClipId = null, showAudioTracks = false, selectedId, pendingClipStart,
  onSelectClip, onSelectMusicClip, onMusicPlayheadChange, onClipRangeChange, onMoveMusicClip, onAdjustMusicClipFade,
  onAddStart, onAddEnd, onCancelPending, onDeleteClip, onRenameClip,
  onToggleAudioTracks,
  skipGapsEnabled = false, skipGaps = [], skipGapsEffective = [],
  skipGapOverrides = {}, onAdjustSkipGap, onResetSkipGap, onResetAllSkipGaps,
  skipGapDisabled = {}, selectedGapKey = null, onSelectGap, onToggleGapDisabled,
}) => {
  const timeline = usePreviewTimelineState({
    duration, playhead, onPlayheadChange, outroEnabled, onToggleOutro, microTimelines, timelineItemLabel, clipEditingEnabled,
    musicTimelineClips, musicClipLabels, musicDuration, musicPlayhead, selectedMusicClipId, showAudioTracks, selectedId, pendingClipStart,
    onSelectClip, onSelectMusicClip, onMusicPlayheadChange, onClipRangeChange, onMoveMusicClip, onAdjustMusicClipFade,
    onAddStart, onAddEnd, onCancelPending, onDeleteClip, onRenameClip, onToggleAudioTracks,
    skipGapsEnabled, skipGaps, skipGapsEffective, skipGapOverrides, skipGapDisabled, selectedGapKey, onSelectGap, onToggleGapDisabled, onAdjustSkipGap, onResetSkipGap, onResetAllSkipGaps,
  });

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 4,
      padding: '6px 10px 8px', background: '#0a0a0a',
      borderTop: '1px solid #1f1f1f', flexShrink: 0,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#888' }}>
        <span>view {fmt(timeline.viewStart)} – {fmt(timeline.viewEnd)} ({fmt(timeline.viewSpan)})</span>
        <span style={{ color: '#ddd' }}>
          {fmt(playhead)}
          {timeline.selectedClip && (
            <span style={{ color: '#888' }}> · {timeline.selectedClip.name} {fmt(timeline.selectedClip.endSecond - timeline.selectedClip.startSecond)}</span>
          )}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>
            {timeline.selectedClip
              ? <>{timeline.selectedClip.name}: {fmt(timeline.selectedClip.startSecond)} → {fmt(timeline.selectedClip.endSecond)}</>
              : `${microTimelines.length} ${timelineItemLabel}${microTimelines.length !== 1 ? 's' : ''}`
            }
          </span>
          {skipGapsEnabled && timeline.skippedSec > 0 && (
            <span style={{ background: '#2a2a2a', padding: '2px 6px', borderRadius: 4, color: '#aaa' }}>
              Final: <span style={{ color: '#fff' }}>{fmt(timeline.finalDur)}</span> <span style={{ color: '#eb6f1f' }}>(−{fmt(timeline.skippedSec)} cut)</span>
            </span>
          )}
        </span>
      </div>

      <div
        onPointerDown={timeline.onTrackDown}
        style={{
          position: 'relative',
          height: 18,
          background: '#0f0f0f',
          border: '1px solid #202020',
          borderRadius: 4,
          userSelect: 'none',
          cursor: 'ew-resize',
        }}
      >
        {timeline.playheadVisible && (
          <div
            onPointerDown={timeline.onPlayheadHandleDown}
            title={`Playhead ${fmt(playhead)} — drag to scrub`}
            style={{
              position: 'absolute',
              left: `calc(${timeline.visPlay}% - 8px)`,
              top: 1,
              width: 16,
              height: 14,
              borderRadius: 999,
              background: '#ffffff',
              boxShadow: '0 0 8px rgba(255,255,255,0.45)',
              cursor: 'grab',
              zIndex: 8,
            }}
          />
        )}
      </div>

      {/* range track */}
      <div
        ref={timeline.trackRef}
        onPointerDown={timeline.onTrackDown}
        style={{
          position: 'relative', height: 24, background: '#161616',
          border: '1px solid #2a2a2a', borderRadius: 4,
          userSelect: 'none', cursor: 'ew-resize',
        }}
      >
        <ClipTrackOverlay
          microTimelines={microTimelines}
          selectedId={selectedId}
          selectedClip={timeline.selectedClip}
          editHandlesEnabled={clipEditingEnabled}
          outroEnabled={outroEnabled}
          pendingClipStart={timeline.pendingClipStart}
          secToPct={timeline.secToPct}
          timeAtClientX={timeline.timeAtClientX}
          onSelectClip={onSelectClip}
          onPlayheadChange={onPlayheadChange}
          setDragKind={timeline.setDragKind}
          startDrag={timeline.startDrag}
        />

        {/* skip-silence gaps */}
        {skipGapsEnabled && skipGaps.length > 0 && (
          <SkipGapOverlay
            skipGaps={skipGaps}
            skipGapsEffective={skipGapsEffective}
            skipGapOverrides={skipGapOverrides}
            skipGapDisabled={skipGapDisabled}
            selectedGapKey={selectedGapKey}
            hoverGapKey={timeline.hoverGapKey}
            onHoverGap={timeline.setHoverGapKey}
            dragKind={timeline.dragKind}
            secToPct={timeline.secToPct}
            timeAtClientX={timeline.timeAtClientX}
            onSelectGap={onSelectGap}
            onPlayheadChange={onPlayheadChange}
            startDrag={timeline.startDrag}
            onResetSkipGap={onResetSkipGap}
          />
        )}

        {/* playhead */}
        {timeline.playheadVisible && (
          <div style={{
            position: 'absolute', left: `calc(${timeline.visPlay}% - 1px)`,
            top: -20, bottom: -3, width: 2,
            background: '#fff', boxShadow: '0 0 4px rgba(255,255,255,0.7)',
            pointerEvents: 'none', zIndex: 5,
          }} />
        )}
      </div>

      {showAudioTracks && (
        <div
          ref={timeline.musicTrackRef}
          style={{
            position: 'relative',
            border: '1px solid #2a2a2a',
            borderRadius: 4,
            overflow: 'hidden',
            background: '#101010',
          }}
        >
          <MusicTrackOverlay
            clips={musicTimelineClips}
            clipLabels={musicClipLabels}
            selectedMusicClipId={selectedMusicClipId}
            dragKind={timeline.dragKind}
            secToPct={timeline.musicSecToPct}
            timeAtClientX={timeline.musicTimeAtClientX}
            onSelectMusicClip={(id) => {
              onSelectGap?.(null);
              onSelectMusicClip?.(id);
            }}
            onPlayheadChange={(next) => (onMusicPlayheadChange ?? onPlayheadChange)(next)}
            startDrag={timeline.startDrag}
          />
          {timeline.musicPlayheadVisible && (
            <div style={{
              position: 'absolute', left: `calc(${timeline.musicVisPlay}% - 1px)`,
              top: 0, bottom: 0, width: 2,
              background: '#fff', boxShadow: '0 0 4px rgba(255,255,255,0.7)',
              pointerEvents: 'none', zIndex: 5,
            }} />
          )}
        </div>
      )}

      {/* horizontal scroll bar */}
      <div
        ref={timeline.scrollRef}
        onPointerDown={timeline.onScrollDown}
        style={{
          position: 'relative', height: 10, background: '#0d0d0d',
          border: '1px solid #222', borderRadius: 5,
          cursor: 'pointer', userSelect: 'none',
        }}
      >
        <div style={{
          position: 'absolute', left: `${timeline.scrollThumbLeftPct}%`, width: `${timeline.scrollThumbPct}%`,
          top: 0, bottom: 0,
          background: timeline.dragKind === 'scroll' ? '#4a4a4a' : '#3a3a3a',
          borderRadius: 5, minWidth: 18, pointerEvents: 'none',
        }} />
      </div>

      <TimelineControls
        microTimelines={microTimelines}
        timelineItemLabel={timelineItemLabel}
        clipEditingEnabled={clipEditingEnabled}
        selectedClip={timeline.selectedClip}
        onSelectClip={onSelectClip}
        onPlayheadChange={onPlayheadChange}
        onRenameClip={onRenameClip}
        pendingClipStart={timeline.pendingClipStart}
        onAddStart={onAddStart}
        onAddEnd={onAddEnd}
        onCancelPending={onCancelPending}
        onDeleteClip={onDeleteClip}
        onFocusClip={timeline.focusClip}
        onZoomIn={timeline.zoomIn}
        onZoomOut={timeline.zoomOut}
        onResetView={timeline.resetView}
        followPlayhead={timeline.followPlayhead}
        onToggleFollow={() => timeline.setFollowPlayhead((value) => !value)}
        showAudioTracks={showAudioTracks}
        onToggleAudioTracks={onToggleAudioTracks}
        skipGapsEnabled={skipGapsEnabled}
        selectedGapKey={selectedGapKey}
        skipGapDisabled={skipGapDisabled}
        skipGapOverrides={skipGapOverrides}
        onToggleGapDisabled={onToggleGapDisabled}
        onResetAllSkipGaps={onResetAllSkipGaps}
        outroEnabled={outroEnabled}
        onToggleOutro={onToggleOutro}
      />
    </div>
  );
};
