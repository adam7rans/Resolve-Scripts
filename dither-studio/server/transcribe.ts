import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_KEY_PATHS = [
  path.join(__dirname, '../../.assemblyai_key'),
  path.join(__dirname, '../../../.assemblyai_key'),
];
const API_BASE = 'https://api.assemblyai.com/v2';
const CAPTION_FILE = 'caption.json';

export type TranscribeEvent =
  | { type: 'video_saved'; message: string }
  | { type: 'caption_saved'; message: string }
  | { type: 'audio_extracting'; message: string }
  | { type: 'audio_extracted'; message: string }
  | { type: 'uploading'; message: string }
  | { type: 'submitted'; message: string }
  | { type: 'polling'; status: string; message: string }
  | { type: 'done'; message: string }
  | { type: 'error'; message: string };

function readApiKey(): string {
  const envKey = process.env.ASSEMBLYAI_API_KEY?.trim();
  if (envKey) return envKey;
  const keyPath = API_KEY_PATHS.find((p) => fs.existsSync(p));
  if (!keyPath) throw new Error(`Missing AssemblyAI API key. Set ASSEMBLYAI_API_KEY or add .assemblyai_key beside the projects folder.`);
  return fs.readFileSync(keyPath, 'utf-8').trim();
}

function extractAudio(videoPath: string, audioPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', [
      '-y', '-loglevel', 'error',
      '-i', videoPath,
      '-vn', '-c:a', 'aac', '-b:a', '128k', audioPath,
    ]);
    proc.on('close', (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)));
    proc.on('error', reject);
  });
}

async function uploadAudio(key: string, audioPath: string): Promise<string> {
  const data = fs.readFileSync(audioPath);
  const res = await fetch(`${API_BASE}/upload`, {
    method: 'POST',
    headers: { authorization: key, 'content-type': 'application/octet-stream' },
    body: data,
  });
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
  const json = await res.json() as { upload_url: string };
  return json.upload_url;
}

async function submitJob(key: string, audioUrl: string): Promise<string> {
  const res = await fetch(`${API_BASE}/transcript`, {
    method: 'POST',
    headers: { authorization: key, 'content-type': 'application/json' },
    body: JSON.stringify({ audio_url: audioUrl, speaker_labels: true, punctuate: true, format_text: true }),
  });
  if (!res.ok) throw new Error(`Submit failed: ${res.status}`);
  const json = await res.json() as { id: string };
  return json.id;
}

async function pollJob(key: string, id: string, onStatus: (s: string) => void): Promise<any> {
  while (true) {
    const res = await fetch(`${API_BASE}/transcript/${id}`, { headers: { authorization: key } });
    if (!res.ok) throw new Error(`Poll failed: ${res.status}`);
    const data = await res.json() as { status: string; error?: string };
    onStatus(data.status);
    if (data.status === 'completed') return data;
    if (data.status === 'error') throw new Error((data as any).error || 'Transcription error');
    await new Promise(r => setTimeout(r, 3000));
  }
}

async function runFromAudioFile(
  audioPath: string,
  transcriptPath: string,
  onEvent: (e: TranscribeEvent) => void,
): Promise<void> {
  const key = readApiKey();
  onEvent({ type: 'uploading', message: 'Uploading to AssemblyAI…' });
  const audioUrl = await uploadAudio(key, audioPath);

  onEvent({ type: 'submitted', message: 'Transcription job submitted…' });
  const tid = await submitJob(key, audioUrl);

  const data = await pollJob(key, tid, (status) => {
    onEvent({ type: 'polling', status, message: `Transcribing… (${status})` });
  });

  // Shape to match dither-studio parseTranscript
  const utterances = (data as any).utterances || [];
  const speakers = [...new Set<string>(utterances.map((u: any) => u.speaker).filter(Boolean))].sort();
  const outData = {
    speakers,
    utterances: utterances.map((u: any) => ({
      speaker: u.speaker,
      start: u.start || 0,
      end: u.end || 0,
      text: u.text || '',
      words: (u.words || []).map((w: any) => ({ text: w.text || '', start: w.start || 0, end: w.end || 0 })),
    })),
  };
  fs.writeFileSync(transcriptPath, JSON.stringify(outData, null, 2));
  onEvent({ type: 'done', message: '✓ Captions ready!' });
}

export async function runTranscriptionPipeline(
  videoPath: string,
  projectDir: string,
  onEvent: (e: TranscribeEvent) => void,
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
  onEvent: (e: TranscribeEvent) => void,
): Promise<void> {
  const transcriptPath = path.join(projectDir, CAPTION_FILE);
  try {
    onEvent({ type: 'audio_extracted', message: 'Audio ready — sending to AssemblyAI' });
    await runFromAudioFile(audioPath, transcriptPath, onEvent);
  } catch (err: any) {
    onEvent({ type: 'error', message: err.message || String(err) });
  }
}
