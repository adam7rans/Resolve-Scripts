import { Router } from 'express';
import multer from 'multer';
import * as fs from 'fs';
import * as path from 'path';
import { runTranscriptionPipeline, runAudioTranscriptionPipeline } from '../transcribe.js';
import {
  CAPTION_FILE, projectDir, emit,
  safeFilename, safeAudioFilename, safeMusicFilename,
  readProject, writeProject, clearCaptions, captionPath,
} from '../helpers.js';

export const mediaRoutes = Router();

// ── multer configs ────────────────────────────────────────────────────────────
const videoUpload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const dir = projectDir(req.params.id as string);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => cb(null, safeFilename(file.originalname)),
  }),
  limits: { fileSize: 10 * 1024 * 1024 * 1024 },
});

const audioUpload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const dir = projectDir(req.params.id as string);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => cb(null, safeAudioFilename(file.originalname)),
  }),
  limits: { fileSize: 10 * 1024 * 1024 * 1024 },
});

const musicUpload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const dir = projectDir(req.params.id as string);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => cb(null, safeMusicFilename(file.originalname)),
  }),
  limits: { fileSize: 1024 * 1024 * 1024 },
});

// ── video ─────────────────────────────────────────────────────────────────────

// Upload video — save to project folder, then kick off transcription pipeline
mediaRoutes.post('/:id/video', videoUpload.single('video'), (req, res) => {
  const id = req.params.id as string;
  const proj = readProject(id);
  if (!proj || !req.file) {
    res.status(400).json({ error: 'Bad request' });
    return;
  }

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

// Serve video with range-request support for scrubbing
mediaRoutes.get('/:id/video', (req, res) => {
  const id = req.params.id as string;
  const proj = readProject(id);
  if (!proj?.videoFile) {
    res.status(404).json({ error: 'No video' });
    return;
  }
  const vp = path.join(projectDir(id), proj.videoFile);
  if (!fs.existsSync(vp)) {
    res.status(404).json({ error: 'File not found' });
    return;
  }

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

// ── audio ─────────────────────────────────────────────────────────────────────

// Upload audio — save to project folder, then kick off audio-only transcription.
mediaRoutes.post('/:id/audio', audioUpload.single('audio'), (req, res) => {
  const id = req.params.id as string;
  const proj = readProject(id);
  if (!proj || !req.file) {
    res.status(400).json({ error: 'Bad request' });
    return;
  }

  proj.audioFile = req.file.filename;
  proj.originalAudioName = req.file.originalname;
  proj.mediaType = 'audio';
  proj.importedAt = new Date().toISOString();
  proj.updatedAt = proj.importedAt;
  delete proj.videoFile;
  delete proj.originalVideoName;
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
mediaRoutes.get('/:id/audio', (req, res) => {
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

// ── music ─────────────────────────────────────────────────────────────────────

// Upload backing music — saved to the project folder; no transcription.
mediaRoutes.post('/:id/music', musicUpload.single('music'), (req, res) => {
  const id = req.params.id as string;
  const proj = readProject(id);
  if (!proj || !req.file) {
    res.status(400).json({ error: 'Bad request' });
    return;
  }

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

// Delete the project's music file (if any) and clear it from project.json.
mediaRoutes.delete('/:id/music', (req, res) => {
  const id = req.params.id as string;
  const proj = readProject(id);
  if (!proj) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  if (proj.musicFile) {
    try { fs.unlinkSync(path.join(projectDir(id), proj.musicFile)); } catch {}
    delete proj.musicFile;
    delete proj.originalMusicName;
    proj.updatedAt = new Date().toISOString();
    writeProject(id, proj);
  }
  res.json({ ok: true });
});

// Serve music with range-request support (same MIME table as audio).
mediaRoutes.get('/:id/music', (req, res) => {
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

// ── captions ──────────────────────────────────────────────────────────────────

// Save a manually supplied caption/transcript JSON into the project folder.
mediaRoutes.put('/:id/caption', (req, res) => {
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
