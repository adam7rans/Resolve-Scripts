import { getParagraphs } from './transcribe.api.js';
import type {
  AssemblyAIParagraph,
  CaptionChapter,
  ChapterSummary,
  TranscribeEvent,
} from './transcribe.types.js';

const CHAPTER_PARAGRAPH_STEP = Math.max(
  1,
  Number.parseInt(process.env.ASSEMBLYAI_CHAPTER_PARAGRAPHS ?? '2', 10) || 2,
);
const CHAPTER_LLM_MODEL =
  process.env.ASSEMBLYAI_CHAPTER_MODEL?.trim() || 'claude-sonnet-4-6';

function groupParagraphsIntoChapters(paragraphs: AssemblyAIParagraph[]) {
  const chapters: Array<{ start: number; end: number; text: string }> = [];
  for (let i = 0; i < paragraphs.length; i += CHAPTER_PARAGRAPH_STEP) {
    const group = paragraphs.slice(i, i + CHAPTER_PARAGRAPH_STEP);
    if (!group.length) continue;
    const start = group[0]?.start ?? 0;
    const end = group[group.length - 1]?.end ?? start;
    const text = group
      .map((paragraph) => (paragraph.text || '').trim())
      .filter(Boolean)
      .join(' ')
      .trim();
    if (!text) continue;
    chapters.push({ start, end, text });
  }
  return chapters;
}

function normalizeGatewayContent(content: unknown): string {
  if (typeof content === 'string') return content.trim();
  if (!Array.isArray(content)) return '';

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

async function summarizeChapter(
  key: string,
  chapterText: string,
): Promise<ChapterSummary> {
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
    headers: {
      authorization: key,
      'content-type': 'application/json',
    },
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

export async function buildChapters(
  key: string,
  transcriptId: string,
  transcriptText: string,
  onEvent: (event: TranscribeEvent) => void,
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

export const chapterConfig = {
  paragraphsPerChapter: CHAPTER_PARAGRAPH_STEP,
  model: CHAPTER_LLM_MODEL,
};
