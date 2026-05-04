import express from 'express';
import multer from 'multer';
import cors from 'cors';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { runTranscriptionPipeline, runAudioTranscriptionPipeline, type TranscribeEvent } from './transcribe.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECTS_DIR = path.resolve(__dirname, '../../projects');
fs.mkdirSync(PROJECTS_DIR, { recursive: true });
const PROJECT_FILE = 'project.json';
const SETTINGS_FILE = 'settings.json';
const CAPTION_FILE = 'caption.json';
const LEGACY_TRANSCRIPT_FILE = 'transcript.json';

const app = express();
app.use(cors());
app.use(express.json({ limit: '25mb' }));

// ── SSE client registry ───────────────────────────────────────────────────────
const sseClients = new Map<string, Set<(e: TranscribeEvent) => void>>();

function emit(id: string, event: TranscribeEvent) {
  sseClients.get(id)?.forEach(fn => fn(event));
}

// ── helpers ───────────────────────────────────────────────────────────────────
function slugify(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'project';
}
function safeFilename(name: string): string {
  const ext = path.extname(name).toLowerCase();
  const base = path.basename(name, ext).trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-|-$/g, '') || 'video';
  return `${base}${ext || '.mp4'}`;
}
function safeAudioFilename(name: string): string {
  const ext = path.extname(name).toLowerCase();
  const base = path.basename(name, ext).trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-|-$/g, '') || 'audio';
  return `${base}${ext || '.mp3'}`;
}
function safeMusicFilename(name: string): string {
  const ext = path.extname(name).toLowerCase();
  const base = path.basename(name, ext).trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-|-$/g, '') || 'music';
  // Prefix with `music-` so it never collides with the speech audio file.
  return `music-${base}${ext || '.mp3'}`;
}
function safePngFilename(name: string): string {
  const ext = path.extname(name).toLowerCase();
  const base = path.basename(name, ext).trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-|-$/g, '') || 'frame';
  return `${base}.png`;
}
function uniqueSlug(base: string): string {
  let s = base, n = 1;
  while (fs.existsSync(path.join(PROJECTS_DIR, s))) s = `${base}-${n++}`;
  return s;
}
function projectDir(id: string) { return path.join(PROJECTS_DIR, id); }
function exportDir(id: string, exportId: string) { return path.join(projectDir(id), 'exports', exportId); }
function readProject(id: string): any | null {
  const p = path.join(projectDir(id), PROJECT_FILE);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf-8')) : null;
}
function writeProject(id: string, data: any) {
  fs.writeFileSync(path.join(projectDir(id), PROJECT_FILE), JSON.stringify(data, null, 2));
}
const SETTINGS_KEYS = new Set([
  'background', 'backgroundDither', 'video', 'captionMode', 'captionStyle', 'layers',
  'guides', 'activeGuide', 'cropToGuide', 'exportBackground', 'exportVideo', 'ui',
  'audioReactivity', 'mathFigure', 'exportAudio', 'music',
]);
function readSettings(id: string, project?: any): any {
  const p = path.join(projectDir(id), SETTINGS_FILE);
  if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf-8'));

  // Backward compatibility for early builds that saved settings into project.json.
  const source = project ?? readProject(id);
  if (!source) return {};
  const settings: any = {};
  for (const key of SETTINGS_KEYS) {
    if (source[key] !== undefined) settings[key] = source[key];
  }
  return settings;
}
function writeSettings(id: string, data: any) {
  fs.writeFileSync(path.join(projectDir(id), SETTINGS_FILE), JSON.stringify(data, null, 2));
}
function captionPath(id: string): string {
  const dir = projectDir(id);
  const proj = readProject(id);
  if (proj?.captionFile) return path.join(dir, proj.captionFile);
  if (proj?.transcriptFile) return path.join(dir, proj.transcriptFile);
  return path.join(dir, LEGACY_TRANSCRIPT_FILE);
}
function hasCaption(id: string, project?: any): boolean {
  const dir = projectDir(id);
  const proj = project ?? readProject(id);
  if (proj?.captionFile && fs.existsSync(path.join(dir, proj.captionFile))) return true;
  if (proj?.transcriptFile && fs.existsSync(path.join(dir, proj.transcriptFile))) return true;
  return fs.existsSync(path.join(dir, LEGACY_TRANSCRIPT_FILE));
}
function clearCaptions(id: string) {
  for (const name of [CAPTION_FILE, LEGACY_TRANSCRIPT_FILE]) {
    try { fs.unlinkSync(path.join(projectDir(id), name)); } catch {}
  }
}
function projectMeta(id: string) {
  const proj = readProject(id);
  if (!proj) return null;
  return {
    id,
    name: proj.name || id,
    createdAt: proj.createdAt,
    updatedAt: proj.updatedAt,
    mediaType: proj.mediaType || (proj.audioFile ? 'audio' : proj.videoFile ? 'video' : null),
    hasVideo: !!(proj.videoFile && fs.existsSync(path.join(projectDir(id), proj.videoFile))),
    hasAudio: !!(proj.audioFile && fs.existsSync(path.join(projectDir(id), proj.audioFile))),
    hasMusic: !!(proj.musicFile && fs.existsSync(path.join(projectDir(id), proj.musicFile))),
    hasTranscript: hasCaption(id, proj),
  };
}

// ── routes ────────────────────────────────────────────────────────────────────

// List projects
app.get('/api/projects', (_req, res) => {
  if (!fs.existsSync(PROJECTS_DIR)) return void res.json([]);
  const items = fs.readdirSync(PROJECTS_DIR)
    .filter(d => fs.existsSync(path.join(PROJECTS_DIR, d, 'project.json')))
    .map(id => projectMeta(id))
    .filter(Boolean)
    .sort((a: any, b: any) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  res.json(items);
});

// Create project
app.post('/api/projects', (req, res) => {
  const { name } = req.body as { name?: string };
  if (!name?.trim()) return void res.status(400).json({ error: 'Name required' });
  const id = uniqueSlug(slugify(name));
  fs.mkdirSync(projectDir(id), { recursive: true });
  const now = new Date().toISOString();
  writeProject(id, { id, name: name.trim(), createdAt: now, updatedAt: now });
  writeSettings(id, {});
  res.json({ id, name: name.trim() });
});

// Get project
app.get('/api/projects/:id', (req, res) => {
  const proj = readProject(req.params.id);
  if (!proj) return void res.status(404).json({ error: 'Not found' });
  const id = req.params.id;
  res.json({
    ...proj,
    ...readSettings(id, proj),
    mediaType: proj.mediaType || (proj.audioFile ? 'audio' : proj.videoFile ? 'video' : null),
    hasVideo: !!(proj.videoFile && fs.existsSync(path.join(projectDir(id), proj.videoFile))),
    hasAudio: !!(proj.audioFile && fs.existsSync(path.join(projectDir(id), proj.audioFile))),
    hasMusic: !!(proj.musicFile && fs.existsSync(path.join(projectDir(id), proj.musicFile))),
    hasTranscript: hasCaption(id, proj),
  });
});

// Save UI/shader/export settings (debounced from frontend)
app.put('/api/projects/:id/settings', (req, res) => {
  const proj = readProject(req.params.id);
  if (!proj) return void res.status(404).json({ error: 'Not found' });
  writeSettings(req.params.id, { ...readSettings(req.params.id, proj), ...req.body });
  writeProject(req.params.id, { ...proj, updatedAt: new Date().toISOString() });
  res.json({ ok: true });
});

// Upload video — save to project folder, then kick off transcription pipeline
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const dir = projectDir(req.params.id);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => cb(null, safeFilename(file.originalname)),
  }),
  limits: { fileSize: 10 * 1024 * 1024 * 1024 },
});

app.post('/api/projects/:id/video', upload.single('video'), (req, res) => {
  const id = req.params.id;
  const proj = readProject(id);
  if (!proj || !req.file) return void res.status(400).json({ error: 'Bad request' });

  proj.videoFile = req.file.filename;
  proj.originalVideoName = req.file.originalname;
  proj.mediaType = 'video';
  proj.importedAt = new Date().toISOString();
  proj.updatedAt = proj.importedAt;
  delete proj.audioFile;
  delete proj.originalAudioName;
  delete proj.transcriptFile;
  delete proj.captionFile;
  writeProject(id, proj);
  emit(id, { type: 'video_saved', message: 'Video imported into project folder' });

  // Start pipeline async — don't await
  runTranscriptionPipeline(req.file.path, projectDir(id), (event) => {
    emit(id, event);
    if (event.type === 'done') {
      const p = readProject(id);
      if (p) {
        p.captionFile = CAPTION_FILE;
        p.updatedAt = new Date().toISOString();
        writeProject(id, p);
      }
    }
  });

  res.json({ ok: true, filename: req.file.filename });
});

// Upload audio — save to project folder, then kick off audio-only transcription.
const audioUpload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const dir = projectDir(req.params.id);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => cb(null, safeAudioFilename(file.originalname)),
  }),
  limits: { fileSize: 10 * 1024 * 1024 * 1024 },
});

app.post('/api/projects/:id/audio', audioUpload.single('audio'), (req, res) => {
  const id = req.params.id;
  const proj = readProject(id);
  if (!proj || !req.file) return void res.status(400).json({ error: 'Bad request' });

  proj.audioFile = req.file.filename;
  proj.originalAudioName = req.file.originalname;
  proj.mediaType = 'audio';
  proj.importedAt = new Date().toISOString();
  proj.updatedAt = proj.importedAt;
  delete proj.videoFile;
  delete proj.transcriptFile;
  delete proj.captionFile;
  writeProject(id, proj);
  emit(id, { type: 'video_saved', message: 'Audio imported into project folder' });

  runAudioTranscriptionPipeline(req.file.path, projectDir(id), (event) => {
    emit(id, event);
    if (event.type === 'done') {
      const p = readProject(id);
      if (p) {
        p.captionFile = CAPTION_FILE;
        p.updatedAt = new Date().toISOString();
        writeProject(id, p);
      }
    }
  });

  res.json({ ok: true, filename: req.file.filename });
});

// Serve audio with range-request support
app.get('/api/projects/:id/audio', (req, res) => {
  const proj = readProject(req.params.id);
  if (!proj?.audioFile) return void res.status(404).json({ error: 'No audio' });
  const ap = path.join(projectDir(req.params.id), proj.audioFile);
  if (!fs.existsSync(ap)) return void res.status(404).json({ error: 'File not found' });

  const stat = fs.statSync(ap);
  const total = stat.size;
  const ext = path.extname(proj.audioFile).toLowerCase();
  const mime =
    ext === '.wav' ? 'audio/wav' :
    ext === '.m4a' ? 'audio/mp4' :
    ext === '.flac' ? 'audio/flac' :
    ext === '.ogg' ? 'audio/ogg' :
    ext === '.opus' ? 'audio/ogg' :
    ext === '.aac' ? 'audio/aac' :
    'audio/mpeg';
  const range = req.headers.range;

  if (range) {
    const [s, e] = range.replace(/bytes=/, '').split('-');
    const start = parseInt(s, 10);
    const end = e ? parseInt(e, 10) : total - 1;
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${total}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': end - start + 1,
      'Content-Type': mime,
    });
    fs.createReadStream(ap, { start, end }).pipe(res);
  } else {
    res.writeHead(200, { 'Content-Length': total, 'Content-Type': mime, 'Accept-Ranges': 'bytes' });
    fs.createReadStream(ap).pipe(res);
  }
});

// Upload backing music — saved to the project folder; no transcription.
const musicUpload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const dir = projectDir(req.params.id);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => cb(null, safeMusicFilename(file.originalname)),
  }),
  limits: { fileSize: 1024 * 1024 * 1024 }, // 1 GB cap
});

app.post('/api/projects/:id/music', musicUpload.single('music'), (req, res) => {
  const id = req.params.id;
  const proj = readProject(id);
  if (!proj || !req.file) return void res.status(400).json({ error: 'Bad request' });

  // Replace any existing music file so we don't accumulate orphans.
  if (proj.musicFile && proj.musicFile !== req.file.filename) {
    try { fs.unlinkSync(path.join(projectDir(id), proj.musicFile)); } catch {}
  }
  proj.musicFile = req.file.filename;
  proj.originalMusicName = req.file.originalname;
  proj.updatedAt = new Date().toISOString();
  writeProject(id, proj);

  res.json({ ok: true, filename: req.file.filename, originalName: req.file.originalname });
});

// Serve music with range-request support (same MIME table as audio).
app.get('/api/projects/:id/music', (req, res) => {
  const proj = readProject(req.params.id);
  if (!proj?.musicFile) return void res.status(404).json({ error: 'No music' });
  const mp = path.join(projectDir(req.params.id), proj.musicFile);
  if (!fs.existsSync(mp)) return void res.status(404).json({ error: 'File not found' });

  const stat = fs.statSync(mp);
  const total = stat.size;
  const ext = path.extname(proj.musicFile).toLowerCase();
  const mime =
    ext === '.wav' ? 'audio/wav' :
    ext === '.m4a' ? 'audio/mp4' :
    ext === '.flac' ? 'audio/flac' :
    ext === '.ogg' ? 'audio/ogg' :
    ext === '.opus' ? 'audio/ogg' :
    ext === '.aac' ? 'audio/aac' :
    'audio/mpeg';
  const range = req.headers.range;

  if (range) {
    const [s, e] = range.replace(/bytes=/, '').split('-');
    const start = parseInt(s, 10);
    const end = e ? parseInt(e, 10) : total - 1;
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${total}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': end - start + 1,
      'Content-Type': mime,
    });
    fs.createReadStream(mp, { start, end }).pipe(res);
  } else {
    res.writeHead(200, { 'Content-Length': total, 'Content-Type': mime, 'Accept-Ranges': 'bytes' });
    fs.createReadStream(mp).pipe(res);
  }
});

// Save a manually supplied caption/transcript JSON into the project folder.
app.put('/api/projects/:id/caption', (req, res) => {
  const id = req.params.id;
  const proj = readProject(id);
  if (!proj) return void res.status(404).json({ error: 'Not found' });

  clearCaptions(id);
  fs.writeFileSync(path.join(projectDir(id), CAPTION_FILE), JSON.stringify(req.body, null, 2));
  proj.captionFile = CAPTION_FILE;
  proj.updatedAt = new Date().toISOString();
  writeProject(id, proj);
  emit(id, { type: 'caption_saved', message: 'Caption JSON saved to project folder' });
  res.json({ ok: true, filename: CAPTION_FILE });
});

// Create and write browser-rendered PNG sequence exports into the project folder.
app.post('/api/projects/:id/exports', (req, res) => {
  const id = req.params.id;
  const proj = readProject(id);
  if (!proj) return void res.status(404).json({ error: 'Not found' });

  const prefix = slugify(String(req.body?.prefix || 'export'));
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const exportId = slugify(`${stamp}-${prefix}`);
  const dir = exportDir(id, exportId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({
    status: 'exporting',
    createdAt: new Date().toISOString(),
    ...req.body,
  }, null, 2));
  res.json({ ok: true, exportId, folder: `projects/${id}/exports/${exportId}` });
});

const frameUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 128 * 1024 * 1024 },
});

app.post('/api/projects/:id/exports/:exportId/frame', frameUpload.single('frame'), (req, res) => {
  const id = req.params.id;
  const proj = readProject(id);
  if (!proj || !req.file) return void res.status(400).json({ error: 'Bad request' });

  const exportId = slugify(req.params.exportId);
  const dir = exportDir(id, exportId);
  if (!fs.existsSync(dir)) return void res.status(404).json({ error: 'Export folder not found' });

  const filename = safePngFilename(String(req.body?.filename || req.file.originalname || 'frame.png'));
  fs.writeFileSync(path.join(dir, filename), req.file.buffer);
  res.json({ ok: true, filename });
});

app.post('/api/projects/:id/exports/:exportId/finish', (req, res) => {
  const id = req.params.id;
  const proj = readProject(id);
  if (!proj) return void res.status(404).json({ error: 'Not found' });

  const exportId = slugify(req.params.exportId);
  const dir = exportDir(id, exportId);
  if (!fs.existsSync(dir)) return void res.status(404).json({ error: 'Export folder not found' });

  const manifestPath = path.join(dir, 'manifest.json');
  const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) : {};
  fs.writeFileSync(manifestPath, JSON.stringify({
    ...manifest,
    status: 'complete',
    completedAt: new Date().toISOString(),
  }, null, 2));
  proj.updatedAt = new Date().toISOString();
  writeProject(id, proj);
  res.json({ ok: true, folder: `projects/${id}/exports/${exportId}` });
});

// Serve video with range-request support for scrubbing
app.get('/api/projects/:id/video', (req, res) => {
  const proj = readProject(req.params.id);
  if (!proj?.videoFile) return void res.status(404).json({ error: 'No video' });
  const vp = path.join(projectDir(req.params.id), proj.videoFile);
  if (!fs.existsSync(vp)) return void res.status(404).json({ error: 'File not found' });

  const stat = fs.statSync(vp);
  const total = stat.size;
  const ext = path.extname(proj.videoFile).toLowerCase();
  const mime = ext === '.mov' ? 'video/quicktime' : 'video/mp4';
  const range = req.headers.range;

  if (range) {
    const [s, e] = range.replace(/bytes=/, '').split('-');
    const start = parseInt(s, 10);
    const end = e ? parseInt(e, 10) : total - 1;
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${total}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': end - start + 1,
      'Content-Type': mime,
    });
    fs.createReadStream(vp, { start, end }).pipe(res);
  } else {
    res.writeHead(200, { 'Content-Length': total, 'Content-Type': mime, 'Accept-Ranges': 'bytes' });
    fs.createReadStream(vp).pipe(res);
  }
});

// Get transcript JSON
app.get('/api/projects/:id/transcript', (req, res) => {
  const tp = captionPath(req.params.id);
  if (!fs.existsSync(tp)) return void res.status(404).json({ error: 'No transcript' });
  res.json(JSON.parse(fs.readFileSync(tp, 'utf-8')));
});

// SSE stream for background task progress
app.get('/api/projects/:id/stream', (req, res) => {
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

app.listen(3001, () => console.log('Dither Studio API → http://localhost:3001'));
