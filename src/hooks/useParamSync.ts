import { useEffect } from 'react';
import type { BackgroundRenderer } from '../lib/BackgroundRenderer';
import type { VideoRenderer } from '../lib/VideoRenderer';
import type { AudioSource } from '../lib/AudioSource';
import type { MusicPlayer } from '../lib/MusicPlayer';
import type {
  BackgroundParams, DitherParams, VideoShaderParams,
  ExportParams, AudioReactivityParams, MicroTimeline,
} from '../lib/types';
import type { MusicParams } from '../lib/MusicPlayer';

/** Sync a value into a ref each time it changes. */
function useSyncRef<T>(ref: React.MutableRefObject<T>, value: T) {
  useEffect(() => { ref.current = value; }, [value]);
}

// ── ref-sync bundle ───────────────────────────────────────────────────────────
interface SyncRefs {
  bgLayerOnRef: React.MutableRefObject<boolean>;
  videoLayerOnRef: React.MutableRefObject<boolean>;
  audioReactivityRef: React.MutableRefObject<AudioReactivityParams>;
  musicRef: React.MutableRefObject<MusicParams>;
  playingRef: React.MutableRefObject<boolean>;
  playheadRef: React.MutableRefObject<number>;
  activeExportParamsRef: React.MutableRefObject<ExportParams>;
  timelineDurationRef: React.MutableRefObject<number>;
  selectedClipRef: React.MutableRefObject<MicroTimeline | null>;
  activeProjectIdRef: React.MutableRefObject<string | null>;
}

interface SyncValues {
  bgLayerOn: boolean;
  videoLayerOn: boolean;
  audioReactivity: AudioReactivityParams;
  music: MusicParams;
  playing: boolean;
  playheadSecond: number;
  activeExportParams: ExportParams;
  timelineDuration: number;
  selectedClip: MicroTimeline | null;
  activeProjectId: string | null;
}

export function useRefSync(refs: SyncRefs, values: SyncValues) {
  useSyncRef(refs.bgLayerOnRef, values.bgLayerOn);
  useSyncRef(refs.videoLayerOnRef, values.videoLayerOn);
  useSyncRef(refs.audioReactivityRef, values.audioReactivity);
  useSyncRef(refs.musicRef, values.music);
  useSyncRef(refs.playingRef, values.playing);
  useSyncRef(refs.playheadRef, values.playheadSecond);
  useSyncRef(refs.activeExportParamsRef, values.activeExportParams);
  useSyncRef(refs.timelineDurationRef, values.timelineDuration);
  useSyncRef(refs.selectedClipRef, values.selectedClip);
  useSyncRef(refs.activeProjectIdRef, values.activeProjectId);
}

// ── param-push effects ────────────────────────────────────────────────────────
interface ParamPushRefs {
  bgRendererRef: React.MutableRefObject<BackgroundRenderer | null>;
  videoRendererRef: React.MutableRefObject<VideoRenderer | null>;
  videoElRef: React.MutableRefObject<HTMLVideoElement | null>;
  audioElRef: React.MutableRefObject<HTMLAudioElement | null>;
  audioSourceRef: React.MutableRefObject<AudioSource | null>;
  musicPlayerRef: React.MutableRefObject<MusicPlayer | null>;
  musicDuckGainRef: React.MutableRefObject<number>;
  exportingRef: React.MutableRefObject<boolean>;
}

interface ParamPushValues {
  bg: BackgroundParams;
  bgDither: DitherParams;
  vid: VideoShaderParams;
  muted: boolean;
  mediaVolume: number;
  limiter: import('../lib/AudioSource').LimiterParams;
  music: MusicParams;
  musicLayerOn: boolean;
  videoInfo: { name: string; duration: number; w: number; h: number } | null;
  audioInfo: { name: string; duration: number } | null;
  previewFrameW: number;
  previewFrameH: number;
  verticalVideo: boolean;
  activeGuide: string | null;
  setActiveGuide: React.Dispatch<React.SetStateAction<import('../lib/constants').GuideKey | null>>;
  setCropToGuide: React.Dispatch<React.SetStateAction<boolean>>;
}

export function useParamPush(refs: ParamPushRefs, values: ParamPushValues) {
  const {
    bgRendererRef, videoRendererRef, videoElRef, audioElRef,
    audioSourceRef, musicPlayerRef, musicDuckGainRef, exportingRef,
  } = refs;
  const {
    bg, bgDither, vid, muted, mediaVolume, limiter,
    music, musicLayerOn, videoInfo, audioInfo,
    previewFrameW, previewFrameH, verticalVideo, activeGuide,
    setActiveGuide, setCropToGuide,
  } = values;

  // Push music volume/mute into the player
  useEffect(() => {
    musicPlayerRef.current?.setVolume(music.volume, music.muted || !musicLayerOn || muted);
    if (!music.sidechain.enabled) {
      musicPlayerRef.current?.resetDuck();
      musicDuckGainRef.current = 1;
    }
  }, [music.volume, music.muted, music.sidechain.enabled, musicLayerOn, muted]);

  useEffect(() => { bgRendererRef.current?.setParams(bg); }, [bg]);
  useEffect(() => { bgRendererRef.current?.setDitherParams(bgDither); }, [bgDither]);
  useEffect(() => { videoRendererRef.current?.setParams(vid); }, [vid]);

  useEffect(() => {
    if (videoElRef.current) videoElRef.current.muted = muted;
    if (audioElRef.current) audioElRef.current.muted = muted;
    audioSourceRef.current?.setMuted(muted);
  }, [muted]);

  useEffect(() => {
    const v = Math.max(0, Math.min(1, mediaVolume));
    if (videoElRef.current) videoElRef.current.volume = v;
    if (audioElRef.current) audioElRef.current.volume = v;
  }, [mediaVolume, videoInfo, audioInfo]);

  useEffect(() => {
    audioSourceRef.current?.setLimiter(limiter);
  }, [limiter, videoInfo, audioInfo]);

  useEffect(() => {
    if (exportingRef.current) return;
    const w = Math.max(1, Math.floor(previewFrameW));
    const h = Math.max(1, Math.floor(previewFrameH));
    bgRendererRef.current?.setSize(w, h);
    videoRendererRef.current?.setSize(w, h);
  }, [previewFrameW, previewFrameH]);

  // Reset guide when switching to vertical video
  useEffect(() => {
    if (!verticalVideo || activeGuide !== '1920x1080') return;
    setActiveGuide(null);
    setCropToGuide(false);
  }, [verticalVideo, activeGuide]);
}
