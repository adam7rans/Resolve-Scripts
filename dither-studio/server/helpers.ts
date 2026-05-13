import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import type { TranscribeEvent } from './transcribe.js';
import type { Project, Settings } from './types';

export const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url));
export const PROJECTS_DIR = path.resolve(SERVER_DIR, '../../projects');
fs.mkdirSync(PROJECTS_DIR, { recursive: true });

export const PROJECT_FILE = 'project.json';
export const SETTINGS_FILE = 'settings.json';
export const CAPTION_FILE = 'caption.json';
export const LEGACY_TRANSCRIPT_FILE = 'transcript.json';

// ── SSE client registry ───────────────────────────────────────────────────────
export const sseClients = new Map<string, Set<(e: TranscribeEvent) => void>>();

export function emit(id: string, event: TranscribeEvent) {
  sseClients.get(id)?.forEach(fn => fn(event));
}

// ── helpers ───────────────────────────────────────────────────────────────────
export function slugify(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'project';
}
export function safeFilename(name: string): string {
  const ext = path.extname(name).toLowerCase();
  const base = path.basename(name, ext).trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-|-$/g, '') || 'video';
  return `${base}${ext || '.mp4'}`;
}
export function safeAudioFilename(name: string): string {
  const ext = path.extname(name).toLowerCase();
  const base = path.basename(name, ext).trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-|-$/g, '') || 'audio';
  return `${base}${ext || '.mp3'}`;
}
export function safeMusicFilename(name: string): string {
  const ext = path.extname(name).toLowerCase();
  const base = path.basename(name, ext).trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-|-$/g, '') || 'music';
  // Prefix with `music-` so it never collides with the speech audio file.
  return `music-${base}${ext || '.mp3'}`;
}
export function safePngFilename(name: string): string {
  const ext = path.extname(name).toLowerCase();
  const base = path.basename(name, ext).trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-|-$/g, '') || 'frame';
  return `${base}.png`;
}
export function uniqueSlug(base: string): string {
  let s = base, n = 1;
  while (fs.existsSync(path.join(PROJECTS_DIR, s))) s = `${base}-${n++}`;
  return s;
}
export function projectDir(id: string) { return path.join(PROJECTS_DIR, id); }
export function exportDir(id: string, exportId: string) { return path.join(projectDir(id), 'exports', exportId); }

// ── data access ───────────────────────────────────────────────────────────────
export function readProject(id: string): Project | null {
  const p = path.join(projectDir(id), PROJECT_FILE);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf-8')) : null;
}
export function writeProject(id: string, data: Project) {
  fs.writeFileSync(path.join(projectDir(id), PROJECT_FILE), JSON.stringify(data, null, 2));
}

const SETTINGS_KEYS = new Set([
  'background', 'backgroundDither', 'video', 'captionMode', 'captionStyle', 'layers',
  'guides', 'activeGuide', 'cropToGuide', 'exportBackground', 'exportVideo', 'ui',
  'audioReactivity', 'mathFigure', 'exportAudio', 'music',
]);

export function readSettings(id: string, project?: Project | null): Settings {
  const p = path.join(projectDir(id), SETTINGS_FILE);
  if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf-8'));

  // Backward compatibility for early builds that saved settings into project.json.
  const source = project ?? readProject(id);
  if (!source) return {};
  const settings: any = {};
  for (const key of SETTINGS_KEYS) {
    if ((source as any)[key] !== undefined) settings[key] = (source as any)[key];
  }
  return settings;
}

export function writeSettings(id: string, data: Settings) {
  fs.writeFileSync(path.join(projectDir(id), SETTINGS_FILE), JSON.stringify(data, null, 2));
}

export function captionPath(id: string): string {
  const dir = projectDir(id);
  const proj = readProject(id);
  if (proj?.captionFile) return path.join(dir, proj.captionFile);
  if (proj?.transcriptFile) return path.join(dir, proj.transcriptFile);
  return path.join(dir, LEGACY_TRANSCRIPT_FILE);
}

export function hasCaption(id: string, project?: Project | null): boolean {
  const dir = projectDir(id);
  const proj = project ?? readProject(id);
  if (proj?.captionFile && fs.existsSync(path.join(dir, proj.captionFile))) return true;
  if (proj?.transcriptFile && fs.existsSync(path.join(dir, proj.transcriptFile))) return true;
  return fs.existsSync(path.join(dir, LEGACY_TRANSCRIPT_FILE));
}

export function clearCaptions(id: string) {
  for (const name of [CAPTION_FILE, LEGACY_TRANSCRIPT_FILE]) {
    try { fs.unlinkSync(path.join(projectDir(id), name)); } catch {}
  }
}

export function projectMeta(id: string) {
  const proj = readProject(id);
  if (!proj) return null;
  const pDir = projectDir(id);
  return {
    id,
    name: proj.name || id,
    createdAt: proj.createdAt,
    updatedAt: proj.updatedAt,
    mediaType: proj.mediaType || (proj.audioFile ? 'audio' : proj.videoFile ? 'video' : null),
    hasVideo: !!(proj.videoFile && fs.existsSync(path.join(pDir, proj.videoFile))),
    hasAudio: !!(proj.audioFile && fs.existsSync(path.join(pDir, proj.audioFile))),
    hasMusic: !!(proj.musicFile && fs.existsSync(path.join(pDir, proj.musicFile))),
    hasTranscript: hasCaption(id, proj),
  };
}
