import { Router } from 'express';
import multer from 'multer';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import {
  exportDir,
  safePngFilename,
  slugify,
  readProject,
  writeProject,
} from '../helpers.js';
import { cleanupExportFrames, stitchVideo } from './exportRoutes.stitch.js';

export const exportRoutes = Router();

// ── routes ────────────────────────────────────────────────────────────────────

// Create export session
exportRoutes.post('/:id/exports', (req, res) => {
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

// Upload a single PNG frame
exportRoutes.post('/:id/exports/:exportId/frame', frameUpload.single('frame'), (req, res) => {
  const id = req.params.id as string;
  const proj = readProject(id);
  if (!proj || !req.file) {
    res.status(400).json({ error: 'Bad request' });
    return;
  }

  const eid = slugify(req.params.exportId as string);
  const dir = exportDir(id, eid);
  if (!fs.existsSync(dir)) {
    res.status(404).json({ error: 'Export folder not found' });
    return;
  }

  const filename = safePngFilename(String(req.body?.filename || req.file.originalname || 'frame.png'));
  fs.writeFileSync(path.join(dir, filename), req.file.buffer);
  res.json({ ok: true, filename });
});

// Finish export — stitch video with FFMPEG
exportRoutes.post('/:id/exports/:exportId/finish', async (req, res) => {
  const id = req.params.id as string;
  const proj = readProject(id);
  if (!proj) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  const eid = slugify(req.params.exportId as string);
  const dir = exportDir(id, eid);
  if (!fs.existsSync(dir)) {
    res.status(404).json({ error: 'Export folder not found' });
    return;
  }

  const manifestPath = path.join(dir, 'manifest.json');
  const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) : {};
  fs.writeFileSync(manifestPath, JSON.stringify({
    ...manifest,
    status: 'complete',
    completedAt: new Date().toISOString(),
  }, null, 2));

  let videoFile = null;
  let stitchError = null;
  let deletedFrames = 0;
  try {
    videoFile = await stitchVideo(id, eid);
    if (videoFile) {
      const updatedManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      if (updatedManifest?.exportMode === 'web') {
        deletedFrames = cleanupExportFrames(dir);
      }
      fs.writeFileSync(manifestPath, JSON.stringify({
        ...updatedManifest,
        videoFile,
        cleanedFramesAt: deletedFrames > 0 ? new Date().toISOString() : updatedManifest.cleanedFramesAt,
        deletedFrameCount: (updatedManifest.deletedFrameCount || 0) + deletedFrames,
      }, null, 2));
    }
  } catch (err) {
    console.error('Stitching failed', err);
    stitchError = err instanceof Error ? err.message : String(err);
    const logPath = path.join(dir, 'stitch-error.log');
    fs.writeFileSync(logPath, `${new Date().toISOString()}\n${stitchError}\n\n`);
  }

  if (stitchError) {
    res.json({ ok: false, error: `Video stitching failed: ${stitchError}`, folder: `projects/${id}/exports/${eid}` });
    return;
  }

  proj.updatedAt = new Date().toISOString();
  writeProject(id, proj);
  res.json({ ok: true, folder: `projects/${id}/exports/${eid}`, videoFile });
});

// Open a local folder in the OS file explorer
exportRoutes.post('/:id/exports/:exportId/open', (req, res) => {
  const id = req.params.id as string;
  const eid = req.params.exportId as string;
  const dir = path.resolve(exportDir(id, eid));

  console.log(`[shell] Open request for project=${id} export=${eid}`);
  console.log(`[shell] Resolved directory: ${dir}`);

  if (!fs.existsSync(dir)) {
    console.error(`[shell] Directory does not exist: ${dir}`);
    res.status(404).json({ error: 'Folder not found' });
    return;
  }

  const platform = process.platform;
  // NOTE: exec is used intentionally — `open`/`xdg-open` need shell resolution,
  // and `dir` is a server-controlled path derived from the project directory.
  const openCmd = platform === 'win32' ? `start ""` : platform === 'darwin' ? 'open' : 'xdg-open';

  console.log(`[shell] Executing: ${openCmd} "${dir}"`);
  exec(`${openCmd} "${dir}"`, (err) => {
    if (err) {
      console.error('[shell] Failed to open folder:', err);
      res.status(500).json({ error: 'Failed to open folder' });
      return;
    }
    res.json({ ok: true });
  });
});
