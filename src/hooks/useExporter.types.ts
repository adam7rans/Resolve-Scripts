import type React from 'react';
import type { CaptionShaderRenderer } from '../lib/CaptionShaderRenderer';
import type { AudioSource } from '../lib/AudioSource';
import type { BackgroundRenderer } from '../lib/BackgroundRenderer';
import type { VideoRenderer } from '../lib/VideoRenderer';
import type {
  ExportParams,
  CaptionStyle,
  CaptionShaderParams,
  AudioReactivityParams,
  BackgroundParams,
  DitherParams,
  VideoShaderParams,
  MusicTimelineClip,
} from '../lib/types';
import type { CaptionMode, TranscriptData } from '../lib/transcript';
import type { ProjectTaskStatus } from '../lib/constants';
import type { JumpCutGap } from './useJumpCuts';
import type { Toast } from '../components/StatusToast';
import type { MusicParams } from '../lib/MusicPlayer';
import type { LimiterParams } from '../lib/AudioSource';

export interface ExporterRefs {
  activeProjectIdRef: React.MutableRefObject<string | null>;
  bgRendererRef: React.MutableRefObject<BackgroundRenderer | null>;
  videoRendererRef: React.MutableRefObject<VideoRenderer | null>;
  videoElRef: React.MutableRefObject<HTMLVideoElement | null>;
  audioElRef: React.MutableRefObject<HTMLAudioElement | null>;
  audioSourceRef: React.MutableRefObject<AudioSource | null>;
  activeExportParamsRef: React.MutableRefObject<ExportParams>;
  exportingRef: React.MutableRefObject<boolean>;
  startRef: React.MutableRefObject<number>;
  jumpCutGapListRef: React.MutableRefObject<JumpCutGap[]>;
}

export interface ExporterState {
  bg: BackgroundParams;
  bgDither: DitherParams;
  vid: VideoShaderParams;
  bgLayerOn: boolean;
  bgOffMode: 'grid' | 'color';
  bgOffColor: string;
  videoLayerOn: boolean;
  captionsLayerOn: boolean;
  musicLayerOn: boolean;
  jumpCutsEnabled: boolean;
  audioReactivity: AudioReactivityParams;
  music: MusicParams;
  limiter: LimiterParams;
  mediaVolume: number;
  outroVolume: number;
  musicTimelineClips: MusicTimelineClip[];
  captionMode: CaptionMode;
  captionStyle: CaptionStyle;
  captionShader: CaptionShaderParams;
  transcript: TranscriptData | null;
  videoInfo: { name: string; duration: number; w: number; h: number } | null;
  audioInfo: { name: string; duration: number } | null;
  cropToGuide: boolean;
  activeGuide: string | null;
  availableGuides: readonly { key: string; w: number; h: number; label: string }[];
  previewFrame: { x: number; y: number; w: number; h: number };
}

export interface ExporterCallbacks {
  setPlaying: (v: boolean) => void;
  setProjectStatus: (s: ProjectTaskStatus) => void;
  addToast: (message: string, type?: Toast['type'], sticky?: boolean) => number;
  updateToast: (id: number, message: string, type: Toast['type']) => void;
  fitPreviewBack: () => void;
}

export interface ExportRangeLike {
  start: number;
  end: number;
  outroDuration: number;
}

export interface ExportGuide {
  key: string;
  w: number;
  h: number;
  label: string;
}

export interface ExportGap {
  start: number;
  end: number;
}

export interface ExportKeptSegment {
  srcStart: number;
  srcEnd: number;
  outStart: number;
}

export interface ExportTiming {
  activeGapsForExport: ExportGap[];
  kept: ExportKeptSegment[];
  contentDuration: number;
  duration: number;
  total: number;
  musicOutputStartTime: number;
  outToSrc: (tOut: number) => { src: number; inOutro: boolean };
}

export interface ExportRenderFrame {
  w: number;
  h: number;
  crop: null | { x: number; y: number; w: number; h: number };
}

export interface ExportRenderResources {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  invertCanvas: HTMLCanvasElement | null;
  invertCtx: CanvasRenderingContext2D | null;
  bgRenderer: BackgroundRenderer | null;
  videoRenderer: VideoRenderer | null;
  capRenderer: CaptionShaderRenderer | null;
  capOffscreen: HTMLCanvasElement | null;
}

export interface CreatedProjectExport {
  exportId: string;
  folder: string;
}

export interface RenderExportFramesArgs {
  refs: ExporterRefs;
  state: ExporterState;
  callbacks: ExporterCallbacks;
  signal: AbortSignal;
  onProgress: (done: number, total: number) => void;
  projectId: string;
  created: CreatedProjectExport;
  exportBaseName: string;
  params: ExportParams;
  range: ExportRangeLike;
  width: number;
  height: number;
  preserveAlpha: boolean;
  renderFrame: ExportRenderFrame;
  timing: ExportTiming;
  video: HTMLVideoElement | null;
  audio: AudioSource | null;
  resources: ExportRenderResources;
}
