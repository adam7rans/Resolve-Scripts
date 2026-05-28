export type TranscribeEvent =
  | { type: 'video_saved'; message: string }
  | { type: 'caption_saved'; message: string }
  | { type: 'audio_extracting'; message: string }
  | { type: 'audio_extracted'; message: string }
  | { type: 'uploading'; message: string }
  | { type: 'submitted'; message: string }
  | { type: 'chaptering'; message: string }
  | { type: 'polling'; status: string; message: string }
  | { type: 'done'; message: string }
  | { type: 'error'; message: string };

export type AssemblyAITranscriptWord = {
  text?: string;
  start?: number;
  end?: number;
};

export type AssemblyAITranscriptUtterance = {
  speaker?: string | null;
  start?: number;
  end?: number;
  text?: string;
  words?: AssemblyAITranscriptWord[];
};

export type AssemblyAITranscriptResponse = {
  id: string;
  status: string;
  text?: string;
  error?: string;
  utterances?: AssemblyAITranscriptUtterance[];
};

export type AssemblyAIParagraphWord = {
  text?: string;
  start?: number;
  end?: number;
  speaker?: string | null;
};

export type AssemblyAIParagraph = {
  text?: string;
  start?: number;
  end?: number;
  confidence?: number;
  words?: AssemblyAIParagraphWord[];
};

export type AssemblyAIParagraphsResponse = {
  paragraphs?: AssemblyAIParagraph[];
};

export type ChapterSummary = {
  headline: string;
  gist: string;
  summary: string;
};

export type CaptionChapter = ChapterSummary & {
  start: number;
  end: number;
  text: string;
};
