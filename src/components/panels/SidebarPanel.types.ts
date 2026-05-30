import type React from 'react';
import type { AudioBands, LimiterParams } from '../../lib/AudioSource';
import type { MusicParams } from '../../lib/MusicPlayer';
import type {
  BackgroundParams,
  DitherParams,
  VideoShaderParams,
  ExportParams,
  CaptionStyle,
  AudioReactivityParams,
  CaptionShaderParams,
  MusicAsset,
  MusicTimelineClip,
} from '../../lib/types';
import type { CaptionMode, TranscriptData } from '../../lib/transcript';
import type { CustomCut } from '../../lib/fillerDetector';
import type {
  MainTab,
  BgSubTab,
  VideoSubTab,
  VideoShaderSubTab,
  AudioSubTab,
  CaptionsSubTab,
  EditorMode,
  EditorSubTab,
  ProjectTaskStatus,
  GuideKey,
} from '../../lib/constants';
import type { ProjectMeta } from '../../lib/projectApi';

export interface SidebarPanelProps {
  projects: ProjectMeta[];
  activeProjectId: string | null;
  activeProject: ProjectMeta | undefined;
  projectStatus: ProjectTaskStatus;
  onSelectProject: (id: string) => Promise<void>;
  onCreateProject: (name: string) => Promise<void>;
  videoInfo: { name: string; duration: number; w: number; h: number } | null;
  audioInfo: { name: string; duration: number } | null;
  audioMode: boolean;
  playheadSecond: number;
  mediaDuration: number;
  playing: boolean;
  togglePlay: () => void;
  muted: boolean;
  setMuted: React.Dispatch<React.SetStateAction<boolean>>;
  editorSubTab: EditorSubTab;
  setEditorSubTab: React.Dispatch<React.SetStateAction<EditorSubTab>>;
  editorMode: EditorMode;
  setEditorMode: React.Dispatch<React.SetStateAction<EditorMode>>;
  clipCount: number;
  fullChunkCount: number;
  fullChunkSpanSec: number;
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
  activeGuide: GuideKey | null;
  setActiveGuide: React.Dispatch<React.SetStateAction<GuideKey | null>>;
  cropToGuide: boolean;
  setCropToGuide: React.Dispatch<React.SetStateAction<boolean>>;
  availableGuides: readonly { key: string; w: number; h: number; label: string }[];
  mainTab: MainTab;
  setMainTab: React.Dispatch<React.SetStateAction<MainTab>>;
  bg: BackgroundParams;
  setBg: React.Dispatch<React.SetStateAction<BackgroundParams>>;
  bgDither: DitherParams;
  setBgDither: React.Dispatch<React.SetStateAction<DitherParams>>;
  bgSubTab: BgSubTab;
  setBgSubTab: React.Dispatch<React.SetStateAction<BgSubTab>>;
  vid: VideoShaderParams;
  setVid: React.Dispatch<React.SetStateAction<VideoShaderParams>>;
  videoSubTab: VideoSubTab;
  setVideoSubTab: React.Dispatch<React.SetStateAction<VideoSubTab>>;
  videoShaderSubTab: VideoShaderSubTab;
  setVideoShaderSubTab: React.Dispatch<React.SetStateAction<VideoShaderSubTab>>;
  invertFinalOutput: boolean;
  setInvertFinalOutput: (value: boolean) => void;
  onPickFile: React.ChangeEventHandler<HTMLInputElement>;
  onDrop: React.DragEventHandler<HTMLDivElement>;
  onImportNativeMedia: () => void;
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
  audioSubTab: AudioSubTab;
  setAudioSubTab: React.Dispatch<React.SetStateAction<AudioSubTab>>;
  audioReactivity: AudioReactivityParams;
  setAudioReactivity: React.Dispatch<React.SetStateAction<AudioReactivityParams>>;
  lastBandsRef: React.MutableRefObject<AudioBands>;
  music: MusicParams;
  setMusic: React.Dispatch<React.SetStateAction<MusicParams>>;
  musicInfo: { name: string } | null;
  musicLibrary: MusicAsset[];
  musicAssetDurations: Record<string, number>;
  selectedMusicAssetIds: string[];
  setSelectedMusicAssetIds: React.Dispatch<React.SetStateAction<string[]>>;
  musicTimelineClips: MusicTimelineClip[];
  selectedMusicClip: MusicTimelineClip | null;
  selectedMusicClipName: string | null;
  showAudioTracks: boolean;
  setShowAudioTracks: React.Dispatch<React.SetStateAction<boolean>>;
  onPickMusicFiles: (files: File[]) => void;
  onDeleteMusicAsset: (assetId: string) => void;
  onAutoArrangeSelectedMusic: () => void;
  onUpdateSelectedMusicClip: (patch: Partial<MusicTimelineClip>) => void;
  onDeleteSelectedMusicClip: () => void;
  onClearMusicTimeline: () => void;
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
  activeExportParams: ExportParams;
  setActiveExportParams: React.Dispatch<React.SetStateAction<ExportParams>>;
  exportComposition: (onProgress: (done: number, total: number) => void, signal: AbortSignal) => Promise<string>;
  exportLayerSummary: string;
  selectedClipName: string | undefined;
  currentPresetSettings: Record<string, any>;
  onApplyPresetSettings: (data: Record<string, any>) => void;
  addToast: (message: string, type?: 'info' | 'success' | 'error' | 'progress', sticky?: boolean) => number;
}
