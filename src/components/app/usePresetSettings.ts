import { useMemo } from 'react';
import type React from 'react';
import { DEFAULT_AUDIO_REACTIVITY, DEFAULT_BACKGROUND, DEFAULT_CAPTION_SHADER, DEFAULT_CAPTION_STYLE, DEFAULT_DITHER, DEFAULT_EXPORT, DEFAULT_VIDEO, normalizeVideoShaderParams } from '../../lib/types';
import { DEFAULT_LIMITER } from '../../lib/AudioSource';
import { DEFAULT_MUSIC_PARAMS } from '../../lib/MusicPlayer';

interface Args {
  state: {
    bg: typeof DEFAULT_BACKGROUND;
    bgDither: typeof DEFAULT_DITHER;
    vid: typeof DEFAULT_VIDEO;
    audioReactivity: typeof DEFAULT_AUDIO_REACTIVITY;
    music: typeof DEFAULT_MUSIC_PARAMS;
    limiter: typeof DEFAULT_LIMITER;
    captionMode: string;
    captionStyle: typeof DEFAULT_CAPTION_STYLE;
    captionShader: typeof DEFAULT_CAPTION_SHADER;
    bgLayerOn: boolean;
    videoLayerOn: boolean;
    captionsLayerOn: boolean;
    musicLayerOn: boolean;
    bgOffMode: 'grid' | 'color';
    bgOffColor: string;
    activeGuide: string | null;
    cropToGuide: boolean;
    bgExport: typeof DEFAULT_EXPORT;
    vidExport: typeof DEFAULT_EXPORT;
  };
  setters: {
    setBg: React.Dispatch<React.SetStateAction<typeof DEFAULT_BACKGROUND>>;
    setBgDither: React.Dispatch<React.SetStateAction<typeof DEFAULT_DITHER>>;
    setVid: React.Dispatch<React.SetStateAction<typeof DEFAULT_VIDEO>>;
    setAudioReactivity: React.Dispatch<React.SetStateAction<typeof DEFAULT_AUDIO_REACTIVITY>>;
    setMusic: React.Dispatch<React.SetStateAction<typeof DEFAULT_MUSIC_PARAMS>>;
    setLimiter: React.Dispatch<React.SetStateAction<typeof DEFAULT_LIMITER>>;
    setCaptionMode: React.Dispatch<React.SetStateAction<any>>;
    setCaptionStyle: React.Dispatch<React.SetStateAction<typeof DEFAULT_CAPTION_STYLE>>;
    setCaptionShader: React.Dispatch<React.SetStateAction<typeof DEFAULT_CAPTION_SHADER>>;
    setBgLayerOn: React.Dispatch<React.SetStateAction<boolean>>;
    setVideoLayerOn: React.Dispatch<React.SetStateAction<boolean>>;
    setCaptionsLayerOn: React.Dispatch<React.SetStateAction<boolean>>;
    setMusicLayerOn: React.Dispatch<React.SetStateAction<boolean>>;
    setBgOffMode: React.Dispatch<React.SetStateAction<'grid' | 'color'>>;
    setBgOffColor: React.Dispatch<React.SetStateAction<string>>;
    setActiveGuide: React.Dispatch<React.SetStateAction<any>>;
    setCropToGuide: React.Dispatch<React.SetStateAction<boolean>>;
    setBgExport: React.Dispatch<React.SetStateAction<typeof DEFAULT_EXPORT>>;
    setVidExport: React.Dispatch<React.SetStateAction<typeof DEFAULT_EXPORT>>;
  };
}

export function usePresetSettings({ state, setters }: Args) {
  const currentPresetSettings = useMemo(
    () => ({
      background: state.bg,
      backgroundDither: state.bgDither,
      video: state.vid,
      audioReactivity: state.audioReactivity,
      music: state.music,
      limiter: state.limiter,
      captionMode: state.captionMode,
      captionStyle: state.captionStyle,
      captionShader: state.captionShader,
      layers: {
        background: state.bgLayerOn,
        video: state.videoLayerOn,
        captions: state.captionsLayerOn,
        music: state.musicLayerOn,
        bgOffMode: state.bgOffMode,
        bgOffColor: state.bgOffColor,
      },
      activeGuide: state.activeGuide,
      cropToGuide: state.cropToGuide,
      exportBackground: state.bgExport,
      exportVideo: state.vidExport,
    }),
    [state],
  );

  const applyPresetSettings = (data: Record<string, any>) => {
    if (data.background) setters.setBg(data.background);
    if (data.backgroundDither) setters.setBgDither(data.backgroundDither);
    if (data.video) setters.setVid(normalizeVideoShaderParams(data.video));
    if (data.audioReactivity) setters.setAudioReactivity({ ...DEFAULT_AUDIO_REACTIVITY, ...data.audioReactivity });
    if (data.captionMode) setters.setCaptionMode(data.captionMode);
    if (data.captionStyle) setters.setCaptionStyle({ ...DEFAULT_CAPTION_STYLE, ...data.captionStyle });
    if (data.captionShader) setters.setCaptionShader({ ...DEFAULT_CAPTION_SHADER, ...data.captionShader });
    if (data.limiter) setters.setLimiter({ ...DEFAULT_LIMITER, ...data.limiter });
    if (data.music) {
      setters.setMusic({
        ...DEFAULT_MUSIC_PARAMS,
        ...data.music,
        sidechain: { ...DEFAULT_MUSIC_PARAMS.sidechain, ...(data.music.sidechain ?? {}) },
      });
    }
    if (data.layers) {
      if (typeof data.layers.background === 'boolean') setters.setBgLayerOn(data.layers.background);
      if (typeof data.layers.video === 'boolean') setters.setVideoLayerOn(data.layers.video);
      if (typeof data.layers.captions === 'boolean') setters.setCaptionsLayerOn(data.layers.captions);
      if (typeof data.layers.music === 'boolean') setters.setMusicLayerOn(data.layers.music);
      if (data.layers.bgOffMode === 'grid' || data.layers.bgOffMode === 'color') setters.setBgOffMode(data.layers.bgOffMode);
      if (typeof data.layers.bgOffColor === 'string') setters.setBgOffColor(data.layers.bgOffColor);
    }
    if (data.activeGuide === null || typeof data.activeGuide === 'string') setters.setActiveGuide(data.activeGuide);
    if (typeof data.cropToGuide === 'boolean') setters.setCropToGuide(data.cropToGuide);
    if (data.exportBackground) setters.setBgExport({ ...DEFAULT_EXPORT, ...data.exportBackground });
    if (data.exportVideo) setters.setVidExport({ ...DEFAULT_EXPORT, ...data.exportVideo });
  };

  return { currentPresetSettings, applyPresetSettings };
}
