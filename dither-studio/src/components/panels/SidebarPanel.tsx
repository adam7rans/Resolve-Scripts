import React from 'react';
import type { AudioBands, LimiterParams } from '../../lib/AudioSource';
import type { MusicParams } from '../../lib/MusicPlayer';
import type {
  BackgroundParams, DitherParams, VideoShaderParams, ExportParams,
  CaptionStyle, AudioReactivityParams, CaptionShaderParams,
} from '../../lib/types';
import type { CaptionMode, TranscriptData } from '../../lib/transcript';
import type { CustomCut } from '../../lib/fillerDetector';
import type {
  MainTab, BgSubTab, VideoSubTab, VideoShaderSubTab, AudioSubTab, CaptionsSubTab,
  ProjectTaskStatus, GuideKey,
} from '../../lib/constants';
import { GUIDES } from '../../lib/constants';
import type { ProjectMeta } from '../../lib/projectApi';
import { TabBar } from '../Tabs';
import { LayerToggle, PillToggle } from '../LayerToggle';
import { ProjectBar } from '../ProjectBar';
import { ProjectStatusPanel } from '../ProjectStatusPanel';
import { ReactivityControls } from '../ReactivityControls';
import { MusicControls } from '../MusicControls';
import { ExportPanel } from '../ExportPanel';
import { ImportPresetPanel } from '../ImportPresetPanel';
import { BackgroundPanel } from './BackgroundPanel';
import { VideoPanel } from './VideoPanel';
import { CaptionsPanel } from './CaptionsPanel';
import { EditorPanel } from './EditorPanel';

interface Props {
  // project
  projects: ProjectMeta[];
  activeProjectId: string | null;
  activeProject: ProjectMeta | undefined;
  projectStatus: ProjectTaskStatus;
  onSelectProject: (id: string) => Promise<void>;
  onCreateProject: (name: string) => Promise<void>;
  // media info
  videoInfo: { name: string; duration: number; w: number; h: number } | null;
  audioInfo: { name: string; duration: number } | null;
  audioMode: boolean;
  playheadSecond: number;
  // playback
  playing: boolean;
  togglePlay: () => void;
  muted: boolean;
  setMuted: React.Dispatch<React.SetStateAction<boolean>>;
  // jump cuts
  transcript: TranscriptData | null;
  transcriptName: string | null;
  jumpCutsEnabled: boolean;
  setJumpCutsEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  jumpCutGapMs: number;
  setJumpCutGapMs: React.Dispatch<React.SetStateAction<number>>;
  jumpCutPaddingMs: number;
  setJumpCutPaddingMs: React.Dispatch<React.SetStateAction<number>>;
  customCuts: CustomCut[];
  customCutPaddingMs: number;
  setCustomCutPaddingMs: React.Dispatch<React.SetStateAction<number>>;
  showSilenceGaps: boolean;
  setShowSilenceGaps: React.Dispatch<React.SetStateAction<boolean>>;
  showFillerCuts: boolean;
  setShowFillerCuts: React.Dispatch<React.SetStateAction<boolean>>;
  showManualCuts: boolean;
  setShowManualCuts: React.Dispatch<React.SetStateAction<boolean>>;
  onAddCustomCuts: (cuts: CustomCut[]) => void;
  onClearCustomCuts: () => void;
  pendingCustomCutStartMs: number | null;
  onStartCustomCut: (playheadMs: number) => void;
  onFinishCustomCut: (playheadMs: number) => void;
  onCancelPendingCustomCut: () => void;
  selectedGap: { startMs: number; endMs: number; key: string; kind?: 'silence' | 'custom'; label?: string } | null;
  selectedGapDisabled: boolean;
  selectedGapHasOverride: boolean;
  onAdjustSelectedGap: (startMs: number, endMs: number) => void;
  onToggleSelectedGapDisabled: (key: string) => void;
  onResetSelectedGap: (key: string) => void;
  onRemoveSelectedCustomCut: (key: string) => void;
  // layers
  bgLayerOn: boolean;
  setBgLayerOn: React.Dispatch<React.SetStateAction<boolean>>;
  bgOffMode: 'grid' | 'color';
  setBgOffMode: React.Dispatch<React.SetStateAction<'grid' | 'color'>>;
  bgOffColor: string;
  setBgOffColor: React.Dispatch<React.SetStateAction<string>>;
  videoLayerOn: boolean;
  setVideoLayerOn: React.Dispatch<React.SetStateAction<boolean>>;
  captionsLayerOn: boolean;
  setCaptionsLayerOn: React.Dispatch<React.SetStateAction<boolean>>;
  musicLayerOn: boolean;
  setMusicLayerOn: React.Dispatch<React.SetStateAction<boolean>>;
  // guides
  activeGuide: GuideKey | null;
  setActiveGuide: React.Dispatch<React.SetStateAction<GuideKey | null>>;
  cropToGuide: boolean;
  setCropToGuide: React.Dispatch<React.SetStateAction<boolean>>;
  availableGuides: readonly { key: string; w: number; h: number; label: string }[];
  // tabs
  mainTab: MainTab;
  setMainTab: React.Dispatch<React.SetStateAction<MainTab>>;
  // background tab
  bg: BackgroundParams;
  setBg: React.Dispatch<React.SetStateAction<BackgroundParams>>;
  bgDither: DitherParams;
  setBgDither: React.Dispatch<React.SetStateAction<DitherParams>>;
  bgSubTab: BgSubTab;
  setBgSubTab: React.Dispatch<React.SetStateAction<BgSubTab>>;
  // video tab
  vid: VideoShaderParams;
  setVid: React.Dispatch<React.SetStateAction<VideoShaderParams>>;
  videoSubTab: VideoSubTab;
  setVideoSubTab: React.Dispatch<React.SetStateAction<VideoSubTab>>;
  videoShaderSubTab: VideoShaderSubTab;
  setVideoShaderSubTab: React.Dispatch<React.SetStateAction<VideoShaderSubTab>>;
  invertFinalOutput: boolean;
  setInvertFinalOutput: (value: boolean) => void;
  onPickFile: React.ChangeEventHandler<HTMLInputElement>;
  onImportNativeMedia: () => void;
  // captions tab
  captionsSubTab: CaptionsSubTab;
  setCaptionsSubTab: React.Dispatch<React.SetStateAction<CaptionsSubTab>>;
  captionMode: CaptionMode;
  setCaptionMode: React.Dispatch<React.SetStateAction<CaptionMode>>;
  captionStyle: CaptionStyle;
  setCaptionStyle: React.Dispatch<React.SetStateAction<CaptionStyle>>;
  captionShader: CaptionShaderParams;
  setCaptionShader: React.Dispatch<React.SetStateAction<CaptionShaderParams>>;
  onPickTranscript: React.ChangeEventHandler<HTMLInputElement>;
  onEditorUpdate: (data: TranscriptData) => void;
  // audio tab
  audioSubTab: AudioSubTab;
  setAudioSubTab: React.Dispatch<React.SetStateAction<AudioSubTab>>;
  audioReactivity: AudioReactivityParams;
  setAudioReactivity: React.Dispatch<React.SetStateAction<AudioReactivityParams>>;
  lastBandsRef: React.MutableRefObject<AudioBands>;
  music: MusicParams;
  setMusic: React.Dispatch<React.SetStateAction<MusicParams>>;
  musicInfo: { name: string } | null;
  onPickMusicFile: (f: File) => void;
  onClearMusic: () => void;
  musicDuckGainRef: React.MutableRefObject<number>;
  speechRmsRef: React.MutableRefObject<number>;
  mediaVolume: number;
  setMediaVolume: React.Dispatch<React.SetStateAction<number>>;
  limiter: LimiterParams;
  setLimiter: React.Dispatch<React.SetStateAction<LimiterParams>>;
  limiterReductionRef: React.MutableRefObject<number>;
  outroVolume: number;
  setOutroVolume: React.Dispatch<React.SetStateAction<number>>;
  // export tab
  activeExportParams: ExportParams;
  setActiveExportParams: React.Dispatch<React.SetStateAction<ExportParams>>;
  exportComposition: (onProgress: (done: number, total: number) => void, signal: AbortSignal) => Promise<string>;
  exportLayerSummary: string;
  selectedClipName: string | undefined;
  currentPresetSettings: Record<string, any>;
  onApplyPresetSettings: (data: Record<string, any>) => void;
  // toasts
  addToast: (message: string, type?: 'info' | 'success' | 'error' | 'progress', sticky?: boolean) => number;
}

export const SidebarPanel: React.FC<Props> = (p) => (
  <div style={{ borderLeft: '1px solid #1f1f1f', display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, height: '100vh', background: '#0c0c0c' }}>
    {/* fixed header */}
    <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
      <ProjectBar
        projects={p.projects}
        activeId={p.activeProjectId}
        onSelect={p.onSelectProject}
        onCreate={p.onCreateProject}
      />
      <ProjectStatusPanel project={p.activeProject} status={p.projectStatus} />

      {/* media transport row 1 */}
      {(p.videoInfo || p.audioInfo) && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 10px', borderBottom: '1px solid #1f1f1f', background: '#0a0a0a' }}>
          <button
            onClick={p.togglePlay}
            style={{ background: '#1f6feb', color: '#fff', border: 'none', padding: '4px 12px', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            {p.playing ? 'Pause' : 'Play'}
          </button>
          <button
            onClick={() => p.setMuted((m) => !m)}
            title={p.muted ? 'Unmute' : 'Mute'}
            style={{ background: p.muted ? '#222' : '#1a1a1a', color: p.muted ? '#666' : '#ddd', border: '1px solid #2a2a2a', padding: '4px 8px', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            {p.muted ? '🔇' : '🔊'}
          </button>
          <span style={{ color: '#aaa', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {p.videoInfo?.name ?? p.audioInfo?.name}
          </span>
          <span style={{ color: '#666', fontSize: 11, marginLeft: 'auto', flexShrink: 0 }}>
            {p.videoInfo
              ? `${p.videoInfo.w}×${p.videoInfo.h} · ${p.videoInfo.duration.toFixed(1)}s`
              : p.audioInfo
                ? `audio · ${p.audioInfo.duration.toFixed(1)}s`
                : ''}
          </span>
        </div>
      )}

      {/* layer toggles */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 10px', borderBottom: '1px solid #1f1f1f', background: '#0a0a0a', alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ color: '#666', textTransform: 'uppercase', letterSpacing: 1, marginRight: 4 }}>Layers</span>
        <LayerToggle label="Background" on={p.bgLayerOn} onClick={() => p.setBgLayerOn((v) => !v)} />
        {!p.audioMode && <LayerToggle label="Video" on={p.videoLayerOn} onClick={() => p.setVideoLayerOn((v) => !v)} />}
        <LayerToggle label="Captions" on={p.captionsLayerOn} onClick={() => p.setCaptionsLayerOn((v) => !v)} />
        <LayerToggle label="Music" on={p.musicLayerOn} onClick={() => p.setMusicLayerOn((v) => !v)} />
      </div>

      {/* guides */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: '8px 10px', borderBottom: '1px solid #1f1f1f', background: '#0a0a0a', alignItems: 'center' }}>
        <span style={{ color: '#666', textTransform: 'uppercase', letterSpacing: 1, marginRight: 4 }}>Guides</span>
        {p.availableGuides.map((g) => (
          <PillToggle
            key={g.key}
            label={g.label}
            on={p.activeGuide === g.key}
            onClick={() => p.setActiveGuide((curr) => (curr === g.key ? null : g.key as GuideKey))}
          />
        ))}
        <span style={{ width: 1, alignSelf: 'stretch', background: '#222', margin: '0 4px' }} />
        <PillToggle
          label="Crop"
          on={p.cropToGuide}
          onClick={() => p.setCropToGuide((v) => !v)}
          activeColor="#eb6f1f"
        />
      </div>

      <TabBar<MainTab>
        tabs={[
          { value: 'background', label: 'Background' },
          { value: 'video',      label: p.audioMode ? 'Source' : 'Video' },
          { value: 'captions',   label: 'Captions' },
          { value: 'audio',      label: 'Audio' },
          { value: 'editor',     label: 'Editor' },
          { value: 'export',     label: 'Export' },
        ]}
        value={p.mainTab}
        onChange={p.setMainTab}
        variant="main"
      />
    </div>

    {/* scrollable tab content */}
    <div style={{ overflowY: 'auto', padding: 10, flex: '1 1 0', minHeight: 0 }}>
      {p.mainTab === 'background' && (
        <BackgroundPanel
          bg={p.bg} setBg={p.setBg} bgDither={p.bgDither} setBgDither={p.setBgDither}
          bgSubTab={p.bgSubTab} setBgSubTab={p.setBgSubTab} addToast={p.addToast}
          bgLayerOn={p.bgLayerOn}
          bgOffMode={p.bgOffMode} setBgOffMode={p.setBgOffMode}
          bgOffColor={p.bgOffColor} setBgOffColor={p.setBgOffColor}
        />
      )}

      {p.mainTab === 'video' && (
        <VideoPanel
          vid={p.vid} setVid={p.setVid}
          videoSubTab={p.videoSubTab} setVideoSubTab={p.setVideoSubTab}
          videoShaderSubTab={p.videoShaderSubTab} setVideoShaderSubTab={p.setVideoShaderSubTab}
          invertFinalOutput={p.invertFinalOutput} setInvertFinalOutput={p.setInvertFinalOutput}
          videoInfo={p.videoInfo} audioInfo={p.audioInfo}
          audioMode={p.audioMode} onPickFile={p.onPickFile} onImportNativeMedia={p.onImportNativeMedia}
        />
      )}

      {p.mainTab === 'captions' && (
        <CaptionsPanel
          captionsSubTab={p.captionsSubTab} setCaptionsSubTab={p.setCaptionsSubTab}
          transcript={p.transcript} transcriptName={p.transcriptName}
          captionMode={p.captionMode} setCaptionMode={p.setCaptionMode}
          captionStyle={p.captionStyle} setCaptionStyle={p.setCaptionStyle}
          captionShader={p.captionShader} setCaptionShader={p.setCaptionShader}
          onPickTranscript={p.onPickTranscript} onEditorUpdate={p.onEditorUpdate}
        />
      )}

      {p.mainTab === 'audio' && (
        <>
          <TabBar<AudioSubTab>
            tabs={[
              { value: 'music',      label: 'Mixer' },
              { value: 'reactivity', label: 'Reactivity' },
            ]}
            value={p.audioSubTab}
            onChange={p.setAudioSubTab}
            variant="sub"
          />
          {p.audioSubTab === 'reactivity' && (
            <ReactivityControls
              value={p.audioReactivity}
              onChange={p.setAudioReactivity}
              hasAudio={!!p.audioInfo}
              bandsRef={p.lastBandsRef}
            />
          )}
          {p.audioSubTab === 'music' && (
            <MusicControls
              value={p.music}
              onChange={p.setMusic}
              hasMusic={!!p.musicInfo}
              musicName={p.musicInfo?.name ?? null}
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
            />
          )}
        </>
      )}

      {p.mainTab === 'editor' && (
        <EditorPanel
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
  </div>
);
