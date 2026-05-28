import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import type {
  AssemblyAIParagraph,
  AssemblyAIParagraphsResponse,
  AssemblyAITranscriptResponse,
} from './transcribe.types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_KEY_PATHS = [
  path.join(__dirname, '../../.assemblyai_key'),
  path.join(__dirname, '../../../.assemblyai_key'),
];
const API_BASE = 'https://api.assemblyai.com/v2';

export function readApiKey(): string {
  const envKey = process.env.ASSEMBLYAI_API_KEY?.trim();
  if (envKey) return envKey;
  const keyPath = API_KEY_PATHS.find((candidate) => fs.existsSync(candidate));
  if (!keyPath) {
    throw new Error(
      'Missing AssemblyAI API key. Set ASSEMBLYAI_API_KEY or add .assemblyai_key beside the projects folder.',
    );
  }
  return fs.readFileSync(keyPath, 'utf-8').trim();
}

export function extractAudio(videoPath: string, audioPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', [
      '-y', '-loglevel', 'error',
      '-i', videoPath,
      '-vn', '-c:a', 'aac', '-b:a', '128k', audioPath,
    ]);
    proc.on('close', (code) => (
      code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`))
    ));
    proc.on('error', reject);
  });
}

export async function uploadAudio(key: string, audioPath: string): Promise<string> {
  const data = fs.readFileSync(audioPath);
  const res = await fetch(`${API_BASE}/upload`, {
    method: 'POST',
    headers: {
      authorization: key,
      'content-type': 'application/octet-stream',
    },
    body: data,
  });
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
  const json = await res.json() as { upload_url: string };
  return json.upload_url;
}

export async function submitJob(key: string, audioUrl: string): Promise<string> {
  const res = await fetch(`${API_BASE}/transcript`, {
    method: 'POST',
    headers: {
      authorization: key,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      audio_url: audioUrl,
      speaker_labels: true,
      punctuate: true,
      format_text: true,
    }),
  });
  if (!res.ok) throw new Error(`Submit failed: ${res.status}`);
  const json = await res.json() as { id: string };
  return json.id;
}

export async function pollJob(
  key: string,
  id: string,
  onStatus: (status: string) => void,
): Promise<AssemblyAITranscriptResponse> {
  while (true) {
    const res = await fetch(`${API_BASE}/transcript/${id}`, {
      headers: { authorization: key },
    });
    if (!res.ok) throw new Error(`Poll failed: ${res.status}`);
    const data = await res.json() as AssemblyAITranscriptResponse;
    onStatus(data.status);
    if (data.status === 'completed') return data;
    if (data.status === 'error') {
      throw new Error(data.error || 'Transcription error');
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
}

export async function getParagraphs(
  key: string,
  transcriptId: string,
): Promise<AssemblyAIParagraph[]> {
  const res = await fetch(`${API_BASE}/transcript/${transcriptId}/paragraphs`, {
    headers: { authorization: key },
  });
  if (!res.ok) throw new Error(`Paragraph export failed: ${res.status}`);
  const data = await res.json() as AssemblyAIParagraphsResponse;
  return Array.isArray(data.paragraphs) ? data.paragraphs : [];
}
