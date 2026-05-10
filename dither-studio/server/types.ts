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
  limiter?: any;
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
    muted: boolean;
    mediaVolume: number;
  };
}
