import * as fs from 'fs';
import * as path from 'path';
import {
  extractAudio,
  pollJob,
  readApiKey,
  submitJob,
  uploadAudio,
} from './transcribe.api.js';
import { buildChapters, chapterConfig } from './transcribe.chapters.js';
import type { CaptionChapter } from './transcribe.types.js';
export type { TranscribeEvent } from './transcribe.types.js';

const CAPTION_FILE = 'caption.json';

async function runFromAudioFile(
  audioPath: string,
  transcriptPath: string,
  onEvent: (e: import('./transcribe.types.js').TranscribeEvent) => void,
): Promise<void> {
  const key = readApiKey();
  onEvent({ type: 'uploading', message: 'Uploading to AssemblyAI…' });
  const audioUrl = await uploadAudio(key, audioPath);

  onEvent({ type: 'submitted', message: 'Transcription job submitted…' });
  const tid = await submitJob(key, audioUrl);

  const data = await pollJob(key, tid, (status) => {
    onEvent({ type: 'polling', status, message: `Transcribing… (${status})` });
  });

  let chapters: CaptionChapter[] = [];
  try {
    chapters = await buildChapters(key, tid, data.text || '', onEvent);
  } catch (err: any) {
    onEvent({
      type: 'chaptering',
      message: `Chapters unavailable — saving transcript without chapters (${err.message || String(err)})`,
    });
  }

  // Shape to match CAST's parseTranscript loader.
  const utterances = data.utterances || [];
  const speakers = [...new Set<string>(utterances.map((u) => u.speaker).filter(Boolean) as string[])].sort();
  const outData = {
    speakers,
    text: data.text || '',
    chapterSource: 'assemblyai-llm-paragraphs',
    chapterConfig,
    chapters,
    utterances: utterances.map((u) => ({
      speaker: u.speaker,
      start: u.start || 0,
      end: u.end || 0,
      text: u.text || '',
      words: (u.words || []).map((w) => ({ text: w.text || '', start: w.start || 0, end: w.end || 0 })),
    })),
  };
  fs.writeFileSync(transcriptPath, JSON.stringify(outData, null, 2));
  onEvent({ type: 'done', message: '✓ Captions ready!' });
}

export async function runTranscriptionPipeline(
  videoPath: string,
  projectDir: string,
  onEvent: (e: import('./transcribe.types.js').TranscribeEvent) => void,
): Promise<void> {
  const audioPath = path.join(projectDir, '_audio.m4a');
  const transcriptPath = path.join(projectDir, CAPTION_FILE);
  try {
    onEvent({ type: 'audio_extracting', message: 'Extracting audio…' });
    await extractAudio(videoPath, audioPath);
    const mb = (fs.statSync(audioPath).size / 1e6).toFixed(1);
    onEvent({ type: 'audio_extracted', message: `Audio extracted (${mb} MB)` });
    await runFromAudioFile(audioPath, transcriptPath, onEvent);
    try { fs.unlinkSync(audioPath); } catch {}
  } catch (err: any) {
    try { fs.unlinkSync(audioPath); } catch {}
    onEvent({ type: 'error', message: err.message || String(err) });
  }
}

/**
 * For audio-only uploads — no extraction step needed; send the file straight
 * to AssemblyAI. The original audio file is kept in the project folder so the
 * preview/export pipeline can play it back and analyse it for visualisations.
 */
export async function runAudioTranscriptionPipeline(
  audioPath: string,
  projectDir: string,
  onEvent: (e: import('./transcribe.types.js').TranscribeEvent) => void,
): Promise<void> {
  const transcriptPath = path.join(projectDir, CAPTION_FILE);
  try {
    onEvent({ type: 'audio_extracted', message: 'Audio ready — sending to AssemblyAI' });
    await runFromAudioFile(audioPath, transcriptPath, onEvent);
  } catch (err: any) {
    onEvent({ type: 'error', message: err.message || String(err) });
  }
}
