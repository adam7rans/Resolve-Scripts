export interface ProjectMeta {
  id: string;
  name: string;
  createdAt: string;
  updatedAt?: string;
  mediaType?: 'video' | 'audio' | null;
  hasVideo: boolean;
  hasAudio?: boolean;
  hasMusic?: boolean;
  hasTranscript: boolean;
}

export interface ProjectData extends ProjectMeta {
  videoFile?: string;
  musicFiles?: Array<{ id: string; filename: string; originalName: string }>;
  [key: string]: any;
}

export interface PresetMeta {
  id: string;
  name: string;
  createdAt: string;
  updatedAt?: string;
}

export interface PresetData extends PresetMeta {
  [key: string]: any;
}

export interface NativeImportResult {
  ok: boolean;
  mediaType: 'video' | 'audio';
  filename: string;
  originalName: string;
}
