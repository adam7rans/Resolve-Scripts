import React from 'react';
import type { AudioSubTab } from '../../lib/constants';
import type { SidebarPanelProps } from './SidebarPanel.types';
import { TabBar } from '../Tabs';
import { ReactivityControls } from '../ReactivityControls';
import { MusicControls } from '../MusicControls';
import { MusicLibraryControls } from '../MusicLibraryControls';
import { ExportPanel } from '../ExportPanel';
import { ImportPresetPanel } from '../ImportPresetPanel';
import { BackgroundPanel } from './BackgroundPanel';
import { VideoPanel } from './VideoPanel';
import { CaptionsPanel } from './CaptionsPanel';
import { EditorPanel } from './EditorPanel';

export const SidebarContent: React.FC<SidebarPanelProps> = (p) => (
  <div style={{ overflowY: 'auto', padding: 10, flex: '1 1 0', minHeight: 0 }}>
    {p.mainTab === 'background' && (
      <BackgroundPanel
        bg={p.bg}
        setBg={p.setBg}
        bgDither={p.bgDither}
        setBgDither={p.setBgDither}
        bgSubTab={p.bgSubTab}
        setBgSubTab={p.setBgSubTab}
        addToast={p.addToast}
        bgLayerOn={p.bgLayerOn}
        bgOffMode={p.bgOffMode}
        setBgOffMode={p.setBgOffMode}
        bgOffColor={p.bgOffColor}
        setBgOffColor={p.setBgOffColor}
      />
    )}

    {p.mainTab === 'video' && (
      <VideoPanel
        vid={p.vid}
        setVid={p.setVid}
        videoSubTab={p.videoSubTab}
        setVideoSubTab={p.setVideoSubTab}
        videoShaderSubTab={p.videoShaderSubTab}
        setVideoShaderSubTab={p.setVideoShaderSubTab}
        invertFinalOutput={p.invertFinalOutput}
        setInvertFinalOutput={p.setInvertFinalOutput}
        videoInfo={p.videoInfo}
        audioInfo={p.audioInfo}
        audioMode={p.audioMode}
        onPickFile={p.onPickFile}
        onDrop={p.onDrop}
        onImportNativeMedia={p.onImportNativeMedia}
      />
    )}

    {p.mainTab === 'captions' && (
      <CaptionsPanel
        captionsSubTab={p.captionsSubTab}
        setCaptionsSubTab={p.setCaptionsSubTab}
        transcript={p.transcript}
        transcriptName={p.transcriptName}
        captionMode={p.captionMode}
        setCaptionMode={p.setCaptionMode}
        captionStyle={p.captionStyle}
        setCaptionStyle={p.setCaptionStyle}
        captionShader={p.captionShader}
        setCaptionShader={p.setCaptionShader}
        onPickTranscript={p.onPickTranscript}
        onEditorUpdate={p.onEditorUpdate}
      />
    )}

    {p.mainTab === 'audio' && (
      <>
        <TabBar<AudioSubTab>
          tabs={[
            { value: 'music', label: 'Music' },
            { value: 'mixer', label: 'Mixer' },
            { value: 'reactivity', label: 'Reactivity' },
          ]}
          value={p.audioSubTab}
          onChange={p.setAudioSubTab}
          variant="sub"
        />
        {p.audioSubTab === 'music' && (
          <MusicLibraryControls
            assets={p.musicLibrary}
            durations={p.musicAssetDurations}
            selectedAssetIds={p.selectedMusicAssetIds}
            onSelectedAssetIdsChange={p.setSelectedMusicAssetIds}
            onPickFiles={p.onPickMusicFiles}
            onDeleteAsset={p.onDeleteMusicAsset}
            onAutoArrangeSelected={p.onAutoArrangeSelectedMusic}
            arrangedClipCount={p.musicTimelineClips.length}
            showAudioTracks={p.showAudioTracks}
            onToggleShowAudioTracks={p.setShowAudioTracks}
            onClearTimeline={p.onClearMusicTimeline}
            selectedMusicClip={p.selectedMusicClip}
            selectedMusicClipName={p.selectedMusicClipName}
            onUpdateSelectedClip={p.onUpdateSelectedMusicClip}
            onDeleteSelectedClip={p.onDeleteSelectedMusicClip}
          />
        )}
        {p.audioSubTab === 'reactivity' && (
          <ReactivityControls value={p.audioReactivity} onChange={p.setAudioReactivity} hasAudio={!!p.audioInfo} bandsRef={p.lastBandsRef} />
        )}
        {p.audioSubTab === 'mixer' && (
          <MusicControls
            value={p.music}
            onChange={p.setMusic}
            hasMusic={p.musicLibrary.length > 0 || !!p.musicInfo}
            musicName={p.musicLibrary[0]?.originalName ?? p.musicInfo?.name ?? null}
            onPickFile={p.onPickMusicFile}
            onClear={p.onClearMusic}
            duckGainRef={p.musicDuckGainRef}
            speechRmsRef={p.speechRmsRef}
            videoVolume={p.mediaVolume}
            onVideoVolumeChange={p.setMediaVolume}
            videoMuted={p.muted}
            onVideoMutedChange={p.setMuted}
            limiter={p.limiter}
            onLimiterChange={p.setLimiter}
            limiterReductionRef={p.limiterReductionRef}
            outroVolume={p.outroVolume}
            onOutroVolumeChange={p.setOutroVolume}
            showFileSection={false}
          />
        )}
      </>
    )}

    {p.mainTab === 'editor' && (
      <EditorPanel
        editorSubTab={p.editorSubTab}
        setEditorSubTab={p.setEditorSubTab}
        editorMode={p.editorMode}
        setEditorMode={p.setEditorMode}
        clipCount={p.clipCount}
        fullChunkCount={p.fullChunkCount}
        fullChunkSpanSec={p.fullChunkSpanSec}
        mediaDuration={p.mediaDuration}
        transcript={p.transcript}
        hasMedia={!!(p.videoInfo || p.audioInfo)}
        playheadSecond={p.playheadSecond}
        jumpCutsEnabled={p.jumpCutsEnabled}
        setJumpCutsEnabled={p.setJumpCutsEnabled}
        jumpCutGapMs={p.jumpCutGapMs}
        setJumpCutGapMs={p.setJumpCutGapMs}
        jumpCutPaddingMs={p.jumpCutPaddingMs}
        setJumpCutPaddingMs={p.setJumpCutPaddingMs}
        customCuts={p.customCuts}
        customCutPaddingMs={p.customCutPaddingMs}
        setCustomCutPaddingMs={p.setCustomCutPaddingMs}
        showSilenceGaps={p.showSilenceGaps}
        setShowSilenceGaps={p.setShowSilenceGaps}
        showFillerCuts={p.showFillerCuts}
        setShowFillerCuts={p.setShowFillerCuts}
        showManualCuts={p.showManualCuts}
        setShowManualCuts={p.setShowManualCuts}
        onAddCustomCuts={p.onAddCustomCuts}
        onClearCustomCuts={p.onClearCustomCuts}
        pendingCustomCutStartMs={p.pendingCustomCutStartMs}
        onStartCustomCut={p.onStartCustomCut}
        onFinishCustomCut={p.onFinishCustomCut}
        onCancelPendingCustomCut={p.onCancelPendingCustomCut}
        selectedGap={p.selectedGap}
        selectedGapDisabled={p.selectedGapDisabled}
        selectedGapHasOverride={p.selectedGapHasOverride}
        onAdjustSelectedGap={p.onAdjustSelectedGap}
        onToggleSelectedGapDisabled={p.onToggleSelectedGapDisabled}
        onResetSelectedGap={p.onResetSelectedGap}
        onRemoveSelectedCustomCut={p.onRemoveSelectedCustomCut}
      />
    )}

    {p.mainTab === 'export' && (
      <>
        <ExportPanel
          params={p.activeExportParams}
          onChange={p.setActiveExportParams}
          onExport={p.exportComposition}
          lockedDuration={p.videoInfo?.duration ?? p.audioInfo?.duration}
          layerSummary={p.exportLayerSummary}
          clipName={p.selectedClipName}
        />
        <ImportPresetPanel
          projects={p.projects}
          activeProjectId={p.activeProjectId}
          currentSettings={p.currentPresetSettings}
          onApplySettings={p.onApplyPresetSettings}
          addToast={p.addToast}
        />
      </>
    )}
  </div>
);
