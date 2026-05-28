export interface MusicAsset {
  id: string;
  filename: string;
  originalName: string;
}

export interface Project {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  videoFile?: string;
  originalVideoName?: string;
  audioFile?: string;
  originalAudioName?: string;
  mediaType?: 'video' | 'audio';
  importedAt?: string;
  captionFile?: string;
  transcriptFile?: string;
  musicFile?: string;
  originalMusicName?: string;
  musicFiles?: MusicAsset[];
}

export interface Settings {
  background?: any;
  backgroundDither?: any;
  video?: any;
  audioReactivity?: any;
  music?: {
    volume: number;
    muted: boolean;
    sidechain?: {
      enabled: boolean;
      threshold: number;
      amount: number;
      attackMs: number;
      releaseMs: number;
    };
  };
  musicLibraryDurations?: Record<string, number>;
  musicTimelineClips?: any[];
  limiter?: any;
  jumpCuts?: {
    enabled?: boolean;
    gapMs?: number;
    paddingMs?: number;
    customPaddingMs?: number;
    showSilence?: boolean;
    showFiller?: boolean;
    showManual?: boolean;
    overrides?: Record<string, { startMs: number; endMs: number }>;
    disabled?: Record<string, true>;
  };
  captionMode?: 'line' | 'word';
  captionStyle?: any;
  captionShader?: any;
  layers?: {
    background: boolean;
    video: boolean;
    captions: boolean;
    music: boolean;
  };
  activeGuide?: string;
  cropToGuide?: boolean;
  exportBackground?: any;
  exportVideo?: any;
  ui?: {
    mainTab: string;
    bgSubTab: string;
    videoSubTab: string;
    audioSubTab: string;
    showAudioTracks?: boolean;
    muted: boolean;
    mediaVolume: number;
  };
}
