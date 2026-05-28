import { Router } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import {
  CAPTION_FILE,
  captionPath,
  clearCaptions,
  emit,
  projectDir,
  readProject,
  safeAudioFilename,
  safeFilename,
  writeProject,
} from '../helpers.js';
import { registerMusicRoutes } from './mediaRoutes.music.js';
import {
  audioUpload,
  chooseNativeMediaPath,
  finalizeAudioImport,
  finalizeVideoImport,
  isAudioPath,
  moveFileIntoPlace,
  streamRangedAudio,
  videoUpload,
} from './mediaRoutes.shared.js';

export const mediaRoutes = Router();

// ── video ─────────────────────────────────────────────────────────────────────

// Upload video — save to project folder, then kick off transcription pipeline
mediaRoutes.post('/:id/video', videoUpload.single('video'), (req, res) => {
  const id = req.params.id as string;
  const proj = readProject(id);
  if (!proj || !req.file) {
    res.status(400).json({ error: 'Bad request' });
    return;
  }
  finalizeVideoImport(id, proj, req.file, res);
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
  finalizeAudioImport(id, proj, req.file, res);
});

// Native macOS import — opens a server-side file picker and moves the chosen
// file into the project folder so we do not keep a duplicate in Downloads.
mediaRoutes.post('/:id/import-native', async (req, res) => {
  const id = req.params.id as string;
  const proj = readProject(id);
  if (!proj) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  try {
    const sourcePath = await chooseNativeMediaPath();
    if (!sourcePath) {
      res.status(400).json({ error: 'Import cancelled' });
      return;
    }
    if (!fs.existsSync(sourcePath)) {
      res.status(404).json({ error: 'Selected file no longer exists' });
      return;
    }

    const originalName = path.basename(sourcePath);
    const audio = isAudioPath(sourcePath);
    const filename = audio
      ? safeAudioFilename(originalName)
      : safeFilename(originalName);
    const targetPath = path.join(projectDir(id), filename);
    fs.mkdirSync(projectDir(id), { recursive: true });
    moveFileIntoPlace(sourcePath, targetPath);

    const importedFile = { filename, originalname: originalName, path: targetPath };
    if (audio) finalizeAudioImport(id, proj, importedFile, res);
    else finalizeVideoImport(id, proj, importedFile, res);
  } catch (err) {
    console.error('[media] Native import failed:', err);
    const message = err instanceof Error ? err.message : 'Native import failed';
    res.status(500).json({ error: message });
  }
});

// Serve audio with range-request support
mediaRoutes.get('/:id/audio', (req, res) => {
  const proj = readProject(req.params.id);
  if (!proj?.audioFile) return void res.status(404).json({ error: 'No audio' });
  const ap = path.join(projectDir(req.params.id), proj.audioFile);
  if (!fs.existsSync(ap)) return void res.status(404).json({ error: 'File not found' });
  streamRangedAudio(ap, proj.audioFile, req, res);
});

registerMusicRoutes(mediaRoutes);

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
