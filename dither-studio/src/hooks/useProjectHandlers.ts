import type React from 'react';
import { AudioSource } from '../lib/AudioSource';
import { MusicPlayer, DEFAULT_MUSIC_PARAMS } from '../lib/MusicPlayer';
import {
  DEFAULT_BACKGROUND, DEFAULT_DITHER, DEFAULT_VIDEO, DEFAULT_EXPORT,
  DEFAULT_CAPTION_STYLE, DEFAULT_AUDIO_REACTIVITY, DEFAULT_CAPTION_SHADER,
  normalizeVideoShaderParams,
  type BackgroundParams, type DitherParams, type VideoShaderParams, type ExportParams, type CaptionStyle,
  type AudioReactivityParams, type CaptionShaderParams, type MicroTimeline,
} from '../lib/types';
import { DEFAULT_LIMITER, type LimiterParams } from '../lib/AudioSource';
import type { MusicParams } from '../lib/MusicPlayer';
import { parseTranscript, type CaptionMode, type TranscriptData, type ClipCaptionEdits } from '../lib/transcript';
import type { ProjectTaskStatus, MainTab, BgSubTab, VideoSubTab, VideoShaderSubTab, AudioSubTab, GuideKey, CaptionsSubTab } from '../lib/constants';
import { snapToExportResolution } from '../lib/layoutUtils';
import type { VideoRenderer } from '../lib/VideoRenderer';
import {
  listProjects, createProject, getProject,
  getVideoUrl, getAudioUrl, getMusicUrl, getTranscript,
  type ProjectMeta,
} from '../lib/projectApi';
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
  setProjectStatus: (s: ProjectTaskStatus) => void;
  setMainTab: React.Dispatch<React.SetStateAction<MainTab>>;
  setBgSubTab: React.Dispatch<React.SetStateAction<BgSubTab>>;
  setVideoSubTab: React.Dispatch<React.SetStateAction<VideoSubTab>>;
  setVideoShaderSubTab: React.Dispatch<React.SetStateAction<VideoShaderSubTab>>;
  setAudioSubTab: React.Dispatch<React.SetStateAction<AudioSubTab>>;
  setCaptionsSubTab: React.Dispatch<React.SetStateAction<CaptionsSubTab>>;
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
  setLimiter: React.Dispatch<React.SetStateAction<LimiterParams>>;
  setMicroTimelines: React.Dispatch<React.SetStateAction<MicroTimeline[]>>;
  setSelectedClipId: React.Dispatch<React.SetStateAction<string | null>>;
  setPendingClipStart: React.Dispatch<React.SetStateAction<number | null>>;
  setCustomCuts: React.Dispatch<React.SetStateAction<import('../lib/fillerDetector').CustomCut[]>>;
  setJumpCutsEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  setJumpCutGapMs: React.Dispatch<React.SetStateAction<number>>;
  setJumpCutPaddingMs: React.Dispatch<React.SetStateAction<number>>;
  setCustomCutPaddingMs: React.Dispatch<React.SetStateAction<number>>;
  setShowSilenceGaps: React.Dispatch<React.SetStateAction<boolean>>;
  setShowFillerCuts: React.Dispatch<React.SetStateAction<boolean>>;
  addToast: (message: string, type?: Toast['type'], sticky?: boolean) => number;
}

export function createHandleCreateProject(refs: ProjectHandlerRefs, setters: ProjectHandlerSetters) {
  return async (name: string) => {
    const { mediaElRef, videoElRef, audioElRef, audioSourceRef, videoRendererRef, musicElRef, musicPlayerRef } = refs;
    const s = setters;
    try {
      const p = await createProject(name);
      const updated = await listProjects();
      s.setProjects(updated);
      s.setActiveProjectId(p.id);
      s.setMainTab('video');
      s.setBgSubTab('noise');
      s.setVideoSubTab('shader');
      s.setVideoShaderSubTab('image');
      s.setCaptionsSubTab('editor');
      s.setBg(DEFAULT_BACKGROUND);
      s.setBgDither(DEFAULT_DITHER);
      s.setVid(DEFAULT_VIDEO);
      s.setBgExport({ ...DEFAULT_EXPORT, filenamePrefix: 'bg' });
      s.setVidExport({ ...DEFAULT_EXPORT, filenamePrefix: 'talking' });
      s.setActiveGuide(null);
      s.setCropToGuide(false);
      s.setBgLayerOn(true);
      s.setVideoLayerOn(true);
      s.setCaptionsLayerOn(true);
      s.setCaptionMode('line');
      s.setCaptionStyle(DEFAULT_CAPTION_STYLE);
      s.setCaptionShader(DEFAULT_CAPTION_SHADER);
      s.setMuted(false);
      s.setMediaVolume(1);
      s.setVideoInfo(null);
      s.setAudioInfo(null);
      s.setPlayheadSecond(0);
      s.setTranscript(null);
      s.setTranscriptName(null);
      s.setCaptionClipEdits({});
      s.setPlaying(false);
      mediaElRef.current?.pause();
      videoElRef.current = null;
      audioElRef.current = null;
      mediaElRef.current = null;
      audioSourceRef.current?.dispose();
      audioSourceRef.current = null;
      videoRendererRef.current?.setVideo(null);
      s.setAudioReactivity(DEFAULT_AUDIO_REACTIVITY);
      musicElRef.current?.pause();
      musicPlayerRef.current?.dispose();
      musicPlayerRef.current = null;
      musicElRef.current = null;
      s.setMusicInfo(null);
      s.setMusic(DEFAULT_MUSIC_PARAMS);
      s.setLimiter(DEFAULT_LIMITER);
      s.setMusicLayerOn(true);
      s.setProjectStatus({ kind: 'success', message: `Project "${p.name}" created`, detail: `Folder: projects/${p.id}` });
      s.addToast(`Project "${p.name}" created`, 'success');
    } catch { s.addToast('Failed to create project', 'error'); }
  };
}

export function createHandleSelectProject(refs: ProjectHandlerRefs, setters: ProjectHandlerSetters) {
  return async (id: string) => {
    const { mediaElRef, videoElRef, audioElRef, audioSourceRef, videoRendererRef, musicElRef, musicPlayerRef } = refs;
    const s = setters;
    try {
      const proj = await getProject(id);
      s.setActiveProjectId(id);
      s.setPlaying(false);
      mediaElRef.current?.pause();
      videoElRef.current = null;
      audioElRef.current = null;
      mediaElRef.current = null;
      audioSourceRef.current?.dispose();
      audioSourceRef.current = null;
      videoRendererRef.current?.setVideo(null);
      musicElRef.current?.pause();
      musicPlayerRef.current?.dispose();
      musicPlayerRef.current = null;
      musicElRef.current = null;
      s.setMusicInfo(null);
      s.setVideoInfo(null);
      s.setAudioInfo(null);
      s.setPlayheadSecond(0);
      s.setTranscript(null);
      s.setTranscriptName(null);
      s.setCaptionClipEdits(proj.captionClipEdits && typeof proj.captionClipEdits === 'object' ? proj.captionClipEdits : {});
      if (proj.background) s.setBg(proj.background);
      if (proj.backgroundDither) s.setBgDither(proj.backgroundDither);
      if (proj.video) s.setVid(normalizeVideoShaderParams(proj.video));
      if (proj.audioReactivity) s.setAudioReactivity({ ...DEFAULT_AUDIO_REACTIVITY, ...proj.audioReactivity });
      else s.setAudioReactivity(DEFAULT_AUDIO_REACTIVITY);
      if (proj.music) {
        s.setMusic({
          ...DEFAULT_MUSIC_PARAMS,
          ...proj.music,
          sidechain: { ...DEFAULT_MUSIC_PARAMS.sidechain, ...(proj.music.sidechain ?? {}) },
        });
      } else {
        s.setMusic(DEFAULT_MUSIC_PARAMS);
      }
      if (proj.limiter) s.setLimiter({ ...DEFAULT_LIMITER, ...proj.limiter });
      else s.setLimiter(DEFAULT_LIMITER);
      if (proj.captionMode) s.setCaptionMode(proj.captionMode);
      if (proj.captionStyle) s.setCaptionStyle({ ...DEFAULT_CAPTION_STYLE, ...proj.captionStyle });
      if (proj.captionShader) s.setCaptionShader({ ...DEFAULT_CAPTION_SHADER, ...proj.captionShader });
      else s.setCaptionShader(DEFAULT_CAPTION_SHADER);
      if (proj.ui) {
        if (proj.ui.mainTab) {
          if (proj.ui.mainTab === 'reactivity') {
            s.setMainTab('audio');
            s.setAudioSubTab('reactivity');
          } else if (proj.ui.mainTab === 'music') {
            s.setMainTab('audio');
            s.setAudioSubTab('music');
          } else {
            s.setMainTab(proj.ui.mainTab);
          }
        }
        if (proj.ui.bgSubTab) s.setBgSubTab(proj.ui.bgSubTab);
        if (proj.ui.videoSubTab) {
          if (proj.ui.videoSubTab === 'levels' || proj.ui.videoSubTab === 'tone' || proj.ui.videoSubTab === 'color' || proj.ui.videoSubTab === 'image' || proj.ui.videoSubTab === 'rez' || proj.ui.videoSubTab === 'distortion' || proj.ui.videoSubTab === 'dither' || proj.ui.videoSubTab === 'position') {
            s.setVideoSubTab('shader');
            s.setVideoShaderSubTab(
              proj.ui.videoSubTab === 'levels' || proj.ui.videoSubTab === 'tone' || proj.ui.videoSubTab === 'color'
                ? 'image'
                : proj.ui.videoSubTab,
            );
          } else {
            s.setVideoSubTab(proj.ui.videoSubTab);
          }
        }
        if (proj.ui.videoShaderSubTab) {
          s.setVideoShaderSubTab(
            proj.ui.videoShaderSubTab === 'levels' || proj.ui.videoShaderSubTab === 'tone' || proj.ui.videoShaderSubTab === 'color'
              ? 'image'
              : proj.ui.videoShaderSubTab,
          );
        }
        if (proj.ui.audioSubTab) s.setAudioSubTab(proj.ui.audioSubTab);
        if (proj.ui.captionsSubTab) {
          s.setCaptionsSubTab(proj.ui.captionsSubTab === 'captions' ? 'editor' : proj.ui.captionsSubTab);
        }
        if (typeof proj.ui.muted === 'boolean') s.setMuted(proj.ui.muted);
        if (typeof proj.ui.mediaVolume === 'number') s.setMediaVolume(proj.ui.mediaVolume);
        if (typeof proj.ui.outroVolume === 'number') s.setOutroVolume(proj.ui.outroVolume);
      }
      if (proj.layers) {
        s.setBgLayerOn(proj.layers.background ?? true);
        s.setVideoLayerOn(proj.layers.video ?? true);
        s.setCaptionsLayerOn(proj.layers.captions ?? true);
        s.setMusicLayerOn(proj.layers.music ?? true);
        if (proj.layers.bgOffMode) s.setBgOffMode(proj.layers.bgOffMode);
        if (proj.layers.bgOffColor) s.setBgOffColor(proj.layers.bgOffColor);
      }
      if (proj.activeGuide !== undefined) {
        s.setActiveGuide(proj.activeGuide as GuideKey | null);
      } else if (proj.guides) {
        const first = (Object.entries(proj.guides) as [GuideKey, boolean][])
          .find(([, on]) => on)?.[0] ?? null;
        s.setActiveGuide(first);
      } else {
        s.setActiveGuide(null);
      }
      if (proj.cropToGuide !== undefined) s.setCropToGuide(proj.cropToGuide);
      if (proj.exportBackground) s.setBgExport(proj.exportBackground);
      if (proj.exportVideo) s.setVidExport(proj.exportVideo);
      if (proj.microTimelines?.length) {
        s.setMicroTimelines(proj.microTimelines);
        s.setSelectedClipId(proj.selectedClipId ?? proj.microTimelines[0]?.id ?? null);
      } else {
        s.setMicroTimelines([]);
        s.setSelectedClipId(null);
      }
      s.setPendingClipStart(null);

      // custom skip ranges (filler/editorial cuts) + jump-cut prefs
      s.setCustomCuts(Array.isArray(proj.customCuts) ? proj.customCuts : []);
      if (proj.jumpCuts) {
        if (typeof proj.jumpCuts.enabled === 'boolean') s.setJumpCutsEnabled(proj.jumpCuts.enabled);
        if (typeof proj.jumpCuts.gapMs === 'number') s.setJumpCutGapMs(proj.jumpCuts.gapMs);
        if (typeof proj.jumpCuts.paddingMs === 'number') s.setJumpCutPaddingMs(proj.jumpCuts.paddingMs);
        if (typeof proj.jumpCuts.customPaddingMs === 'number') s.setCustomCutPaddingMs(proj.jumpCuts.customPaddingMs);
        if (typeof proj.jumpCuts.showSilence === 'boolean') s.setShowSilenceGaps(proj.jumpCuts.showSilence);
        if (typeof proj.jumpCuts.showFiller === 'boolean') s.setShowFillerCuts(proj.jumpCuts.showFiller);
      } else {
        s.setJumpCutsEnabled(false);
      }
      // load video if present
      if (proj.hasVideo) {
        const url = getVideoUrl(id);
        const v = document.createElement('video');
        v.src = url;
        v.muted = false; v.volume = 1; v.playsInline = true; v.preload = 'auto';
        v.addEventListener('loadedmetadata', () => {
          s.setVideoInfo({ name: proj.videoFile || 'video', duration: v.duration, w: v.videoWidth, h: v.videoHeight });
          const snap = snapToExportResolution(v.videoWidth, v.videoHeight);
          s.setVidExport((p) => {
            const nextEnd = p.endSecond === undefined ? v.duration : Math.min(v.duration, p.endSecond);
            const nextStart = Math.min(p.startSecond, Math.max(0, nextEnd - 0.01));
            return {
              ...p,
              width: snap.w,
              height: snap.h,
              startSecond: nextStart,
              endSecond: nextEnd,
              duration: Math.max(0.01, nextEnd - nextStart),
            };
          });
          videoRendererRef.current?.setVideo(v);
          videoElRef.current = v;
          mediaElRef.current = v;
          const src = new AudioSource({ element: v, url });
          audioSourceRef.current = src;
          v.currentTime = 0;
        });
      }
      // load audio if present
      if (proj.hasAudio && !proj.hasVideo) {
        const url = getAudioUrl(id);
        const a = document.createElement('audio');
        a.src = url;
        a.crossOrigin = 'anonymous';
        a.preload = 'auto';
        a.addEventListener('loadedmetadata', () => {
          const duration = a.duration;
          s.setAudioInfo({ name: proj.audioFile || 'audio', duration });
          s.setBgExport((p) => {
            const nextEnd = p.endSecond === undefined ? duration : Math.min(duration, p.endSecond);
            const nextStart = Math.min(p.startSecond, Math.max(0, nextEnd - 0.01));
            return { ...p, startSecond: nextStart, endSecond: nextEnd, duration: Math.max(0.01, nextEnd - nextStart) };
          });
          audioElRef.current = a;
          mediaElRef.current = a;
          const src = new AudioSource({ element: a, url });
          audioSourceRef.current = src;
          a.currentTime = 0;
        });
      }
      // load music if present
      if (proj.hasMusic) {
        const url = getMusicUrl(id);
        const m = document.createElement('audio');
        m.src = url;
        m.crossOrigin = 'anonymous';
        m.preload = 'auto';
        m.loop = true;
        m.addEventListener('loadedmetadata', () => {
          s.setMusicInfo({ name: proj.originalMusicName || 'music' });
          musicElRef.current = m;
          musicPlayerRef.current = new MusicPlayer(m);
        });
      }
      // load transcript if present
      if (proj.hasTranscript) {
        const data = await getTranscript(id);
        if (data) try { s.setTranscript(parseTranscript(data)); s.setTranscriptName('caption.json'); } catch { }
      }
      s.setProjectStatus({
        kind: 'success',
        message: `Loaded "${proj.name}"`,
        detail: proj.hasTranscript ? 'Caption JSON is ready' : proj.hasVideo ? 'Video imported; captions not ready yet' : `Folder: projects/${id}`,
      });
      s.addToast(`Loaded "${proj.name}"`, 'success');
    } catch { s.addToast('Failed to load project', 'error'); }
  };
}
