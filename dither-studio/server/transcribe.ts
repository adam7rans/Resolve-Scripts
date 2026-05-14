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
  | { type: 'chaptering'; message: string }
  | { type: 'polling'; status: string; message: string }
  | { type: 'done'; message: string }
  | { type: 'error'; message: string };

type AssemblyAITranscriptWord = {
  text?: string;
  start?: number;
  end?: number;
};

type AssemblyAITranscriptUtterance = {
  speaker?: string | null;
  start?: number;
  end?: number;
  text?: string;
  words?: AssemblyAITranscriptWord[];
};

type AssemblyAITranscriptResponse = {
  id: string;
  status: string;
  text?: string;
  error?: string;
  utterances?: AssemblyAITranscriptUtterance[];
};

type AssemblyAIParagraphWord = {
  text?: string;
  start?: number;
  end?: number;
  speaker?: string | null;
};

type AssemblyAIParagraph = {
  text?: string;
  start?: number;
  end?: number;
  confidence?: number;
  words?: AssemblyAIParagraphWord[];
};

type AssemblyAIParagraphsResponse = {
  paragraphs?: AssemblyAIParagraph[];
};

type ChapterSummary = {
  headline: string;
  gist: string;
  summary: string;
};

type CaptionChapter = ChapterSummary & {
  start: number;
  end: number;
  text: string;
};

const CHAPTER_PARAGRAPH_STEP = Math.max(1, Number.parseInt(process.env.ASSEMBLYAI_CHAPTER_PARAGRAPHS ?? '2', 10) || 2);
const CHAPTER_LLM_MODEL = process.env.ASSEMBLYAI_CHAPTER_MODEL?.trim() || 'claude-sonnet-4-6';

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

async function pollJob(key: string, id: string, onStatus: (s: string) => void): Promise<AssemblyAITranscriptResponse> {
  while (true) {
    const res = await fetch(`${API_BASE}/transcript/${id}`, { headers: { authorization: key } });
    if (!res.ok) throw new Error(`Poll failed: ${res.status}`);
    const data = await res.json() as AssemblyAITranscriptResponse;
    onStatus(data.status);
    if (data.status === 'completed') return data;
    if (data.status === 'error') throw new Error(data.error || 'Transcription error');
    await new Promise(r => setTimeout(r, 3000));
  }
}

async function getParagraphs(key: string, transcriptId: string): Promise<AssemblyAIParagraph[]> {
  const res = await fetch(`${API_BASE}/transcript/${transcriptId}/paragraphs`, {
    headers: { authorization: key },
  });
  if (!res.ok) throw new Error(`Paragraph export failed: ${res.status}`);
  const data = await res.json() as AssemblyAIParagraphsResponse;
  return Array.isArray(data.paragraphs) ? data.paragraphs : [];
}

function groupParagraphsIntoChapters(paragraphs: AssemblyAIParagraph[]): Array<{ start: number; end: number; text: string }> {
  const chapters: Array<{ start: number; end: number; text: string }> = [];
  for (let i = 0; i < paragraphs.length; i += CHAPTER_PARAGRAPH_STEP) {
    const group = paragraphs.slice(i, i + CHAPTER_PARAGRAPH_STEP);
    if (!group.length) continue;
    const start = group[0]?.start ?? 0;
    const end = group[group.length - 1]?.end ?? start;
    const text = group.map((p) => (p.text || '').trim()).filter(Boolean).join(' ').trim();
    if (!text) continue;
    chapters.push({ start, end, text });
  }
  return chapters;
}

function normalizeGatewayContent(content: unknown): string {
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string') {
          return String((part as { text: string }).text);
        }
        return '';
      })
      .join('')
      .trim();
  }
  return '';
}

function parseChapterSummary(raw: string): ChapterSummary {
  const cleaned = raw.trim();
  const fencedMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const jsonText = (fencedMatch?.[1] || cleaned).trim();
  const parsed = JSON.parse(jsonText) as Partial<ChapterSummary>;
  return {
    headline: typeof parsed.headline === 'string' ? parsed.headline.trim() : '',
    gist: typeof parsed.gist === 'string' ? parsed.gist.trim() : '',
    summary: typeof parsed.summary === 'string' ? parsed.summary.trim() : '',
  };
}

async function summarizeChapter(key: string, chapterText: string): Promise<ChapterSummary> {
  const prompt = [
    'Return JSON only.',
    'Summarize this transcript section into the following shape:',
    '{"headline":"A single-sentence headline","gist":"A few words","summary":"One concise paragraph"}',
    '',
    'Transcript section:',
    chapterText,
  ].join('\n');

  const res = await fetch('https://llm-gateway.assemblyai.com/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: key, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: CHAPTER_LLM_MODEL,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 500,
    }),
  });
  if (!res.ok) throw new Error(`Chapter summary failed: ${res.status}`);

  const data = await res.json() as {
    choices?: Array<{ message?: { content?: unknown } }>;
  };
  const content = normalizeGatewayContent(data.choices?.[0]?.message?.content);
  if (!content) throw new Error('Chapter summary was empty');
  return parseChapterSummary(content);
}

async function buildChapters(
  key: string,
  transcriptId: string,
  transcriptText: string,
  onEvent: (e: TranscribeEvent) => void,
): Promise<CaptionChapter[]> {
  onEvent({ type: 'chaptering', message: 'Generating chapters…' });
  const paragraphs = await getParagraphs(key, transcriptId);
  const grouped = groupParagraphsIntoChapters(paragraphs);
  if (!grouped.length) {
    const fallbackText = transcriptText.trim();
    if (!fallbackText) return [];
    grouped.push({ start: 0, end: 0, text: fallbackText });
  }
  const chapters: CaptionChapter[] = [];

  for (let i = 0; i < grouped.length; i += 1) {
    const group = grouped[i];
    onEvent({
      type: 'chaptering',
      message: `Generating chapters… (${i + 1}/${grouped.length})`,
    });
    const summary = await summarizeChapter(key, group.text);
    chapters.push({
      ...summary,
      start: group.start,
      end: group.end,
      text: group.text,
    });
  }

  return chapters;
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

  let chapters: CaptionChapter[] = [];
  try {
    chapters = await buildChapters(key, tid, data.text || '', onEvent);
  } catch (err: any) {
    onEvent({
      type: 'chaptering',
      message: `Chapters unavailable — saving transcript without chapters (${err.message || String(err)})`,
    });
  }

  // Shape to match dither-studio parseTranscript
  const utterances = data.utterances || [];
  const speakers = [...new Set<string>(utterances.map((u) => u.speaker).filter(Boolean) as string[])].sort();
  const outData = {
    speakers,
    text: data.text || '',
    chapterSource: 'assemblyai-llm-paragraphs',
    chapterConfig: {
      paragraphsPerChapter: CHAPTER_PARAGRAPH_STEP,
      model: CHAPTER_LLM_MODEL,
    },
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
