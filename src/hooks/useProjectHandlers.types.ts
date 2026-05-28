import type React from 'react';
import type { AudioSource, LimiterParams } from '../lib/AudioSource';
import type { MusicPlayer, MusicParams } from '../lib/MusicPlayer';
import type {
  AudioReactivityParams,
  BackgroundParams,
  CaptionShaderParams,
  CaptionStyle,
  DitherParams,
  ExportParams,
  MicroTimeline,
  MusicAsset,
  MusicTimelineClip,
  VideoShaderParams,
} from '../lib/types';
import type { CaptionMode, ClipCaptionEdits, TranscriptData } from '../lib/transcript';
import type { AudioSubTab, BgSubTab, CaptionsSubTab, EditorMode, EditorSubTab, GuideKey, MainTab, ProjectTaskStatus, VideoShaderSubTab, VideoSubTab } from '../lib/constants';
import type { VideoRenderer } from '../lib/VideoRenderer';
import type { ProjectMeta } from '../lib/projectApi';
import type { Toast } from '../components/StatusToast';

export interface ProjectHandlerRefs {
  mediaElRef: React.MutableRefObject<HTMLMediaElement | null>;
  videoElRef: React.MutableRefObject<HTMLVideoElement | null>;
  audioElRef: React.MutableRefObject<HTMLAudioElement | null>;
  audioSourceRef: React.MutableRefObject<AudioSource | null>;
  videoRendererRef: React.MutableRefObject<VideoRenderer | null>;
  musicElRef: React.MutableRefObject<HTMLAudioElement | null>;
  musicPlayerRef: React.MutableRefObject<MusicPlayer | null>;
}

export interface ProjectHandlerSetters {
  setProjects: React.Dispatch<React.SetStateAction<ProjectMeta[]>>;
  setActiveProjectId: React.Dispatch<React.SetStateAction<string | null>>;
  setProjectStatus: (state: ProjectTaskStatus) => void;
  setMainTab: React.Dispatch<React.SetStateAction<MainTab>>;
  setBgSubTab: React.Dispatch<React.SetStateAction<BgSubTab>>;
  setVideoSubTab: React.Dispatch<React.SetStateAction<VideoSubTab>>;
  setVideoShaderSubTab: React.Dispatch<React.SetStateAction<VideoShaderSubTab>>;
  setAudioSubTab: React.Dispatch<React.SetStateAction<AudioSubTab>>;
  setCaptionsSubTab: React.Dispatch<React.SetStateAction<CaptionsSubTab>>;
  setEditorSubTab: React.Dispatch<React.SetStateAction<EditorSubTab>>;
  setEditorMode: React.Dispatch<React.SetStateAction<EditorMode>>;
  setBg: React.Dispatch<React.SetStateAction<BackgroundParams>>;
  setBgDither: React.Dispatch<React.SetStateAction<DitherParams>>;
  setVid: React.Dispatch<React.SetStateAction<VideoShaderParams>>;
  setBgExport: React.Dispatch<React.SetStateAction<ExportParams>>;
  setVidExport: React.Dispatch<React.SetStateAction<ExportParams>>;
  setActiveGuide: React.Dispatch<React.SetStateAction<GuideKey | null>>;
  setCropToGuide: React.Dispatch<React.SetStateAction<boolean>>;
  setBgLayerOn: React.Dispatch<React.SetStateAction<boolean>>;
  setBgOffMode: React.Dispatch<React.SetStateAction<'grid' | 'color'>>;
  setBgOffColor: React.Dispatch<React.SetStateAction<string>>;
  setVideoLayerOn: React.Dispatch<React.SetStateAction<boolean>>;
  setCaptionsLayerOn: React.Dispatch<React.SetStateAction<boolean>>;
  setMusicLayerOn: React.Dispatch<React.SetStateAction<boolean>>;
  setCaptionMode: React.Dispatch<React.SetStateAction<CaptionMode>>;
  setCaptionStyle: React.Dispatch<React.SetStateAction<CaptionStyle>>;
  setCaptionShader: React.Dispatch<React.SetStateAction<CaptionShaderParams>>;
  setMuted: React.Dispatch<React.SetStateAction<boolean>>;
  setMediaVolume: React.Dispatch<React.SetStateAction<number>>;
  setOutroVolume: React.Dispatch<React.SetStateAction<number>>;
  setVideoInfo: React.Dispatch<React.SetStateAction<{ name: string; duration: number; w: number; h: number } | null>>;
  setAudioInfo: React.Dispatch<React.SetStateAction<{ name: string; duration: number } | null>>;
  setPlayheadSecond: React.Dispatch<React.SetStateAction<number>>;
  setTranscript: React.Dispatch<React.SetStateAction<TranscriptData | null>>;
  setTranscriptName: React.Dispatch<React.SetStateAction<string | null>>;
  setCaptionClipEdits: React.Dispatch<React.SetStateAction<Record<string, ClipCaptionEdits>>>;
  setPlaying: React.Dispatch<React.SetStateAction<boolean>>;
  setAudioReactivity: React.Dispatch<React.SetStateAction<AudioReactivityParams>>;
  setMusicInfo: React.Dispatch<React.SetStateAction<{ name: string } | null>>;
  setMusic: React.Dispatch<React.SetStateAction<MusicParams>>;
  setMusicLibrary: React.Dispatch<React.SetStateAction<MusicAsset[]>>;
  setMusicAssetDurations: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  setSelectedMusicAssetIds: React.Dispatch<React.SetStateAction<string[]>>;
  setMusicTimelineClips: React.Dispatch<React.SetStateAction<MusicTimelineClip[]>>;
  setSelectedMusicClipId: React.Dispatch<React.SetStateAction<string | null>>;
  setLimiter: React.Dispatch<React.SetStateAction<LimiterParams>>;
  setMicroTimelines: React.Dispatch<React.SetStateAction<MicroTimeline[]>>;
  setSelectedClipId: React.Dispatch<React.SetStateAction<string | null>>;
  setSelectedFullSegmentId: React.Dispatch<React.SetStateAction<string | null>>;
  setPendingClipStart: React.Dispatch<React.SetStateAction<number | null>>;
  setCustomCuts: React.Dispatch<React.SetStateAction<import('../lib/fillerDetector').CustomCut[]>>;
  setJumpCutGapOverrides: React.Dispatch<React.SetStateAction<Record<string, { startMs: number; endMs: number }>>>;
  setJumpCutGapDisabled: React.Dispatch<React.SetStateAction<Record<string, true>>>;
  setSelectedGapKey: React.Dispatch<React.SetStateAction<string | null>>;
  setJumpCutsEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  setJumpCutGapMs: React.Dispatch<React.SetStateAction<number>>;
  setJumpCutPaddingMs: React.Dispatch<React.SetStateAction<number>>;
  setCustomCutPaddingMs: React.Dispatch<React.SetStateAction<number>>;
  setShowSilenceGaps: React.Dispatch<React.SetStateAction<boolean>>;
  setShowFillerCuts: React.Dispatch<React.SetStateAction<boolean>>;
  setShowManualCuts: React.Dispatch<React.SetStateAction<boolean>>;
  setShowAudioTracks: React.Dispatch<React.SetStateAction<boolean>>;
  addToast: (message: string, type?: Toast['type'], sticky?: boolean) => number;
}
