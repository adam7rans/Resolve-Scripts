import { useEffect, useRef } from 'react';
import { useUndoHistory } from './useUndoHistory';
import type {
  BackgroundParams, DitherParams, VideoShaderParams, ExportParams,
  CaptionStyle, AudioReactivityParams, CaptionShaderParams, MicroTimeline,
} from '../lib/types';
import type { CaptionMode } from '../lib/transcript';
import type { LimiterParams } from '../lib/AudioSource';
import type { MusicParams } from '../lib/MusicPlayer';
import type { GuideKey } from '../lib/constants';
import type { CustomCut } from '../lib/fillerDetector';
import type React from 'react';

export type SettingsSnapshot = {
  bg: BackgroundParams; bgDither: DitherParams; vid: VideoShaderParams;
  audioReactivity: AudioReactivityParams; music: MusicParams; limiter: LimiterParams;
  captionMode: CaptionMode; captionStyle: CaptionStyle; captionShader: CaptionShaderParams;
  bgLayerOn: boolean; bgOffMode: 'grid' | 'color'; bgOffColor: string;
  videoLayerOn: boolean; captionsLayerOn: boolean; musicLayerOn: boolean;
  activeGuide: GuideKey | null; cropToGuide: boolean;
  bgExport: ExportParams; vidExport: ExportParams;
  microTimelines: MicroTimeline[]; selectedClipId: string | null;
  customCuts: CustomCut[];
  jumpCutsEnabled: boolean; jumpCutGapMs: number;
  jumpCutPaddingMs: number; customCutPaddingMs: number;
  showSilenceGaps: boolean; showFillerCuts: boolean; showManualCuts: boolean;
  muted: boolean; mediaVolume: number; outroVolume: number;
};

export interface UndoState extends SettingsSnapshot {}

export interface UndoSetters {
  setBg: React.Dispatch<React.SetStateAction<BackgroundParams>>;
  setBgDither: React.Dispatch<React.SetStateAction<DitherParams>>;
  setVid: React.Dispatch<React.SetStateAction<VideoShaderParams>>;
  setAudioReactivity: React.Dispatch<React.SetStateAction<AudioReactivityParams>>;
  setMusic: React.Dispatch<React.SetStateAction<MusicParams>>;
  setLimiter: React.Dispatch<React.SetStateAction<LimiterParams>>;
  setCaptionMode: React.Dispatch<React.SetStateAction<CaptionMode>>;
  setCaptionStyle: React.Dispatch<React.SetStateAction<CaptionStyle>>;
  setCaptionShader: React.Dispatch<React.SetStateAction<CaptionShaderParams>>;
  setBgLayerOn: React.Dispatch<React.SetStateAction<boolean>>;
  setBgOffMode: React.Dispatch<React.SetStateAction<'grid' | 'color'>>;
  setBgOffColor: React.Dispatch<React.SetStateAction<string>>;
  setVideoLayerOn: React.Dispatch<React.SetStateAction<boolean>>;
  setCaptionsLayerOn: React.Dispatch<React.SetStateAction<boolean>>;
  setMusicLayerOn: React.Dispatch<React.SetStateAction<boolean>>;
  setActiveGuide: React.Dispatch<React.SetStateAction<GuideKey | null>>;
  setCropToGuide: React.Dispatch<React.SetStateAction<boolean>>;
  setBgExport: React.Dispatch<React.SetStateAction<ExportParams>>;
  setVidExport: React.Dispatch<React.SetStateAction<ExportParams>>;
  setMicroTimelines: React.Dispatch<React.SetStateAction<MicroTimeline[]>>;
  setSelectedClipId: React.Dispatch<React.SetStateAction<string | null>>;
  setCustomCuts: React.Dispatch<React.SetStateAction<CustomCut[]>>;
  setJumpCutsEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  setJumpCutGapMs: React.Dispatch<React.SetStateAction<number>>;
  setJumpCutPaddingMs: React.Dispatch<React.SetStateAction<number>>;
  setCustomCutPaddingMs: React.Dispatch<React.SetStateAction<number>>;
  setShowSilenceGaps: React.Dispatch<React.SetStateAction<boolean>>;
  setShowFillerCuts: React.Dispatch<React.SetStateAction<boolean>>;
  setShowManualCuts: React.Dispatch<React.SetStateAction<boolean>>;
  setMuted: React.Dispatch<React.SetStateAction<boolean>>;
  setMediaVolume: React.Dispatch<React.SetStateAction<number>>;
  setOutroVolume: React.Dispatch<React.SetStateAction<number>>;
}

export function useAppUndoRedo(
  state: UndoState,
  setters: UndoSetters,
  activeProjectId: string | null,
) {
  const history = useUndoHistory<SettingsSnapshot>();

  // Always-current refs so the keyboard handler never holds a stale closure.
  const stateRef = useRef(state);
  stateRef.current = state;

  const settersRef = useRef(setters);
  settersRef.current = setters;

  const historyRef = useRef(history);
  historyRef.current = history;

  const restore = (snap: SettingsSnapshot) => {
    const s = settersRef.current;
    s.setBg(snap.bg); s.setBgDither(snap.bgDither); s.setVid(snap.vid);
    s.setAudioReactivity(snap.audioReactivity); s.setMusic(snap.music); s.setLimiter(snap.limiter);
    s.setCaptionMode(snap.captionMode); s.setCaptionStyle(snap.captionStyle); s.setCaptionShader(snap.captionShader);
    s.setBgLayerOn(snap.bgLayerOn); s.setBgOffMode(snap.bgOffMode); s.setBgOffColor(snap.bgOffColor);
    s.setVideoLayerOn(snap.videoLayerOn); s.setCaptionsLayerOn(snap.captionsLayerOn); s.setMusicLayerOn(snap.musicLayerOn);
    s.setActiveGuide(snap.activeGuide); s.setCropToGuide(snap.cropToGuide);
    s.setBgExport(snap.bgExport); s.setVidExport(snap.vidExport);
    s.setMicroTimelines(snap.microTimelines); s.setSelectedClipId(snap.selectedClipId);
    s.setCustomCuts(snap.customCuts);
    s.setJumpCutsEnabled(snap.jumpCutsEnabled); s.setJumpCutGapMs(snap.jumpCutGapMs);
    s.setJumpCutPaddingMs(snap.jumpCutPaddingMs); s.setCustomCutPaddingMs(snap.customCutPaddingMs);
    s.setShowSilenceGaps(snap.showSilenceGaps); s.setShowFillerCuts(snap.showFillerCuts); s.setShowManualCuts(snap.showManualCuts);
    s.setMuted(snap.muted); s.setMediaVolume(snap.mediaVolume); s.setOutroVolume(snap.outroVolume);
  };
  const restoreRef = useRef(restore);
  restoreRef.current = restore;

  const getLatest = () => stateRef.current;

  // Push on any parameter change. push() captures the pre-change state on the
  // first call in each debounce window, so undo always restores the right snapshot.
  const {
    bg, bgDither, vid, audioReactivity, music, limiter,
    captionMode, captionStyle, captionShader,
    bgLayerOn, bgOffMode, bgOffColor, videoLayerOn, captionsLayerOn, musicLayerOn,
    activeGuide, cropToGuide, bgExport, vidExport,
    microTimelines, selectedClipId, customCuts,
    jumpCutsEnabled, jumpCutGapMs, jumpCutPaddingMs, customCutPaddingMs,
    showSilenceGaps, showFillerCuts, showManualCuts, muted, mediaVolume, outroVolume,
  } = state;

  useEffect(() => {
    history.push(getLatest);
  }, [ // eslint-disable-line react-hooks/exhaustive-deps
    bg, bgDither, vid, audioReactivity, music, limiter,
    captionMode, captionStyle, captionShader,
    bgLayerOn, bgOffMode, bgOffColor, videoLayerOn, captionsLayerOn, musicLayerOn,
    activeGuide, cropToGuide, bgExport, vidExport,
    microTimelines, selectedClipId, customCuts,
    jumpCutsEnabled, jumpCutGapMs, jumpCutPaddingMs, customCutPaddingMs,
    showSilenceGaps, showFillerCuts, showManualCuts, muted, mediaVolume, outroVolume,
  ]);

  // Clear history on project switch so undo doesn't cross project boundaries.
  useEffect(() => {
    history.clear();
  }, [activeProjectId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard: Cmd/Ctrl+Z = undo, Cmd/Ctrl+Shift+Z = redo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return;
      const ae = document.activeElement as HTMLElement | null;
      const isTextEntry =
        ae?.tagName === 'TEXTAREA' ||
        ae?.isContentEditable ||
        (ae?.tagName === 'INPUT' && !['range', 'checkbox', 'radio', 'button', 'color', 'file'].includes((ae as HTMLInputElement).type));
      if (isTextEntry) return;
      e.preventDefault();
      if (e.shiftKey) {
        historyRef.current.redo(getLatest, restoreRef.current);
      } else {
        historyRef.current.undo(getLatest, restoreRef.current);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return { canUndo: history.canUndo, canRedo: history.canRedo };
}
