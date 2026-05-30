import { Router } from 'express';
import * as fs from 'fs';
import type { TranscribeEvent } from '../transcribe.js';
import {
  PROJECTS_DIR, projectDir, projectMeta, uniqueSlug, slugify,
  readProject, writeProject, readSettings, writeSettings,
  captionPath, hasCaption, sseClients,
} from '../helpers.js';

export const projectRoutes = Router();

// List projects
projectRoutes.get('/', (_req, res) => {
  if (!fs.existsSync(PROJECTS_DIR)) {
    res.json([]);
    return;
  }
  const items = fs.readdirSync(PROJECTS_DIR)
    .filter(d => fs.existsSync(`${PROJECTS_DIR}/${d}/project.json`))
    .map(id => projectMeta(id))
    .filter((p): p is NonNullable<typeof p> => !!p)
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  res.json(items);
});

// Create project
projectRoutes.post('/', (req, res) => {
  const { name } = req.body as { name?: string };
  if (!name?.trim()) {
    res.status(400).json({ error: 'Name required' });
    return;
  }
  const id = uniqueSlug(slugify(name));
  fs.mkdirSync(projectDir(id), { recursive: true });
  const now = new Date().toISOString();
  writeProject(id, { id, name: name.trim(), createdAt: now, updatedAt: now });
  writeSettings(id, {});
  res.json({ id, name: name.trim() });
});

// Get project
projectRoutes.get('/:id', (req, res) => {
  const id = req.params.id;
  const proj = readProject(id);
  if (!proj) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const settings = readSettings(id, proj);
  const pDir = projectDir(id);
  res.json({
    ...proj,
    ...settings,
    mediaType: proj.mediaType || (proj.audioFile ? 'audio' : proj.videoFile ? 'video' : null),
    hasVideo: !!(proj.videoFile && fs.existsSync(`${pDir}/${proj.videoFile}`)),
    hasAudio: !!(proj.audioFile && fs.existsSync(`${pDir}/${proj.audioFile}`)),
    hasMusic:
      (Array.isArray(proj.musicFiles) && proj.musicFiles.some((asset) => fs.existsSync(`${pDir}/${asset.filename}`))) ||
      !!(proj.musicFile && fs.existsSync(`${pDir}/${proj.musicFile}`)),
    hasTranscript: hasCaption(id, proj),
  });
});

// Save UI/shader/export settings (debounced from frontend)
// Accept both PUT (normal auto-save) and POST (sendBeacon on page close).
projectRoutes.post('/:id/settings', settingsHandler);
projectRoutes.put('/:id/settings', settingsHandler);
function settingsHandler(req: import('express').Request, res: import('express').Response) {
  const id = req.params.id as string;
  const proj = readProject(id);
  if (!proj) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  writeSettings(id, { ...readSettings(id, proj), ...(req.body as any) });
  writeProject(id, { ...proj, updatedAt: new Date().toISOString() });
  res.json({ ok: true });
}

// Get transcript JSON
projectRoutes.get('/:id/transcript', (req, res) => {
  const id = req.params.id as string;
  const tp = captionPath(id);
  if (!fs.existsSync(tp)) {
    res.status(404).json({ error: 'No transcript' });
    return;
  }
  res.json(JSON.parse(fs.readFileSync(tp, 'utf-8')));
});

// SSE stream for background task progress
projectRoutes.get('/:id/stream', (req, res) => {
  const id = req.params.id;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (event: TranscribeEvent) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };
  if (!sseClients.has(id)) sseClients.set(id, new Set());
  sseClients.get(id)!.add(send);

  // Heartbeat to keep connection alive
  const hb = setInterval(() => res.write(': ping\n\n'), 15000);
  req.on('close', () => {
    clearInterval(hb);
    sseClients.get(id)?.delete(send);
  });
});
