import type React from 'react';
import type { AudioSource } from '../lib/AudioSource';
import type { MusicPlayer } from '../lib/MusicPlayer';
import type { ExportParams } from '../lib/types';
import type { AudioSubTab, MainTab, ProjectTaskStatus } from '../lib/constants';
import type { VideoRenderer } from '../lib/VideoRenderer';
import type { ProjectMeta } from '../lib/projectApi';
import type { TranscriptData } from '../lib/transcript';
import type { Toast } from '../components/StatusToast';

export interface MediaLoaderRefs {
  mediaElRef: React.MutableRefObject<HTMLMediaElement | null>;
  videoElRef: React.MutableRefObject<HTMLVideoElement | null>;
  audioElRef: React.MutableRefObject<HTMLAudioElement | null>;
  audioSourceRef: React.MutableRefObject<AudioSource | null>;
  videoRendererRef: React.MutableRefObject<VideoRenderer | null>;
  musicElRef: React.MutableRefObject<HTMLAudioElement | null>;
  musicPlayerRef: React.MutableRefObject<MusicPlayer | null>;
  videoBlobUrlRef: React.MutableRefObject<string | null>;
  audioBlobUrlRef: React.MutableRefObject<string | null>;
  activeProjectIdRef: React.MutableRefObject<string | null>;
}

export interface MediaLoaderSetters {
  setProjects: React.Dispatch<React.SetStateAction<ProjectMeta[]>>;
  setProjectStatus: (state: ProjectTaskStatus) => void;
  setMainTab: React.Dispatch<React.SetStateAction<MainTab>>;
  setAudioSubTab: React.Dispatch<React.SetStateAction<AudioSubTab>>;
  setPlaying: React.Dispatch<React.SetStateAction<boolean>>;
  setVideoInfo: React.Dispatch<React.SetStateAction<{ name: string; duration: number; w: number; h: number } | null>>;
  setAudioInfo: React.Dispatch<React.SetStateAction<{ name: string; duration: number } | null>>;
  setPlayheadSecond: React.Dispatch<React.SetStateAction<number>>;
  setTranscript: React.Dispatch<React.SetStateAction<TranscriptData | null>>;
  setTranscriptName: React.Dispatch<React.SetStateAction<string | null>>;
  setVidExport: React.Dispatch<React.SetStateAction<ExportParams>>;
  setBgExport: React.Dispatch<React.SetStateAction<ExportParams>>;
  setMusicInfo: React.Dispatch<React.SetStateAction<{ name: string } | null>>;
  setMusicLayerOn: React.Dispatch<React.SetStateAction<boolean>>;
  addToast: (message: string, type?: Toast['type'], sticky?: boolean) => number;
  updateToast: (id: number, message: string, type: Toast['type']) => void;
}
