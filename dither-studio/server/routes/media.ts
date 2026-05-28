import { Router } from 'express';
import { execFile } from 'child_process';
import multer from 'multer';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { promisify } from 'util';
import { runTranscriptionPipeline, runAudioTranscriptionPipeline } from '../transcribe.js';
import {
  CAPTION_FILE, projectDir, emit,
  safeFilename, safeAudioFilename, safeMusicFilename,
  readProject, writeProject, clearCaptions, captionPath,
} from '../helpers.js';

export const mediaRoutes = Router();
const execFileAsync = promisify(execFile);
const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.m4a', '.flac', '.ogg', '.opus', '.aac']);

type ImportedMediaFile = {
  filename: string;
  originalname: string;
  path: string;
};

function deleteFileQuiet(filePath: string) {
  try { fs.unlinkSync(filePath); } catch {}
}

function cleanupReplacedMedia(id: string, previousFiles: Array<string | undefined>, nextFilename: string) {
  for (const name of previousFiles) {
    if (!name || name === nextFilename) continue;
    deleteFileQuiet(path.join(projectDir(id), name));
  }
  clearCaptions(id);
}

function finalizeVideoImport(id: string, proj: NonNullable<ReturnType<typeof readProject>>, file: ImportedMediaFile, res: { json: (body: unknown) => void }) {
  cleanupReplacedMedia(id, [proj.videoFile, proj.audioFile], file.filename);

  proj.videoFile = file.filename;
  proj.originalVideoName = file.originalname;
  proj.mediaType = 'video';
  proj.importedAt = new Date().toISOString();
  proj.updatedAt = proj.importedAt;
  delete proj.audioFile;
  delete proj.originalAudioName;
  delete proj.transcriptFile;
  delete proj.captionFile;
  writeProject(id, proj);
  emit(id, { type: 'video_saved', message: 'Video imported into project folder' });

  runTranscriptionPipeline(file.path, projectDir(id), (event) => {
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

  res.json({ ok: true, mediaType: 'video', filename: file.filename, originalName: file.originalname });
}

function finalizeAudioImport(id: string, proj: NonNullable<ReturnType<typeof readProject>>, file: ImportedMediaFile, res: { json: (body: unknown) => void }) {
  cleanupReplacedMedia(id, [proj.videoFile, proj.audioFile], file.filename);

  proj.audioFile = file.filename;
  proj.originalAudioName = file.originalname;
  proj.mediaType = 'audio';
  proj.importedAt = new Date().toISOString();
  proj.updatedAt = proj.importedAt;
  delete proj.videoFile;
  delete proj.originalVideoName;
  delete proj.transcriptFile;
  delete proj.captionFile;
  writeProject(id, proj);
  emit(id, { type: 'video_saved', message: 'Audio imported into project folder' });

  runAudioTranscriptionPipeline(file.path, projectDir(id), (event) => {
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

  res.json({ ok: true, mediaType: 'audio', filename: file.filename, originalName: file.originalname });
}

function isAudioPath(filePath: string): boolean {
  return AUDIO_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

async function chooseNativeMediaPath(): Promise<string | null> {
  if (process.platform !== 'darwin') {
    throw new Error('Native transfer import is currently supported on macOS only');
  }

  const script = [
    'try',
    'POSIX path of (choose file with prompt "Choose a video or audio file to move into this project" of type {"public.movie", "public.audio"})',
    'on error number -128',
    'return ""',
    'end try',
  ];
  const args = script.flatMap((line) => ['-e', line]);
  const { stdout } = await execFileAsync('osascript', args);
  const pickedPath = stdout.trim();
  return pickedPath || null;
}

function moveFileIntoPlace(sourcePath: string, targetPath: string) {
  if (path.resolve(sourcePath) === path.resolve(targetPath)) return;
  deleteFileQuiet(targetPath);
  try {
    fs.renameSync(sourcePath, targetPath);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== 'EXDEV') throw err;
    fs.copyFileSync(sourcePath, targetPath);
    fs.unlinkSync(sourcePath);
  }
}

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
    filename: (_req, file, cb) => cb(null, `${randomUUID().slice(0, 8)}-${safeMusicFilename(file.originalname)}`),
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
    const filename = audio ? safeAudioFilename(originalName) : safeFilename(originalName);
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

function ensureMusicLibrary(proj: NonNullable<ReturnType<typeof readProject>>) {
  if (!Array.isArray(proj.musicFiles)) {
    proj.musicFiles = [];
  }
  if (proj.musicFile) {
    const legacyExists = proj.musicFiles.some((asset) => asset.filename === proj.musicFile);
    if (!legacyExists) {
      proj.musicFiles.push({
        id: 'legacy-music',
        filename: proj.musicFile,
        originalName: proj.originalMusicName || proj.musicFile,
      });
    }
  }
  return proj.musicFiles;
}

function getMusicMime(filename: string) {
  const ext = path.extname(filename).toLowerCase();
  return ext === '.wav' ? 'audio/wav'
    : ext === '.m4a' ? 'audio/mp4'
    : ext === '.flac' ? 'audio/flac'
    : ext === '.ogg' ? 'audio/ogg'
    : ext === '.opus' ? 'audio/ogg'
    : ext === '.aac' ? 'audio/aac'
    : 'audio/mpeg';
}

function streamRangedAudio(filePath: string, filename: string, req: any, res: any) {
  const stat = fs.statSync(filePath);
  const total = stat.size;
  const mime = getMusicMime(filename);
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
    fs.createReadStream(filePath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, { 'Content-Length': total, 'Content-Type': mime, 'Accept-Ranges': 'bytes' });
    fs.createReadStream(filePath).pipe(res);
  }
}

// Upload one or more backing music files into the project library.
mediaRoutes.post('/:id/music-library', musicUpload.array('music', 64), (req, res) => {
  const id = req.params.id as string;
  const proj = readProject(id);
  const files = (req.files as ImportedMediaFile[] | undefined) ?? [];
  if (!proj || files.length === 0) {
    res.status(400).json({ error: 'Bad request' });
    return;
  }

  const library = ensureMusicLibrary(proj);
  const added = files.map((file) => {
    const asset = {
      id: randomUUID(),
      filename: file.filename,
      originalName: file.originalname,
    };
    library.push(asset);
    return asset;
  });
  proj.updatedAt = new Date().toISOString();
  writeProject(id, proj);

  res.json({ ok: true, assets: added });
});

// Backward-compatible single upload endpoint: append one file to the library.
mediaRoutes.post('/:id/music', musicUpload.single('music'), (req, res) => {
  const id = req.params.id as string;
  const proj = readProject(id);
  if (!proj || !req.file) {
    res.status(400).json({ error: 'Bad request' });
    return;
  }
  const library = ensureMusicLibrary(proj);
  const asset = {
    id: randomUUID(),
    filename: req.file.filename,
    originalName: req.file.originalname,
  };
  library.push(asset);
  proj.updatedAt = new Date().toISOString();
  writeProject(id, proj);
  res.json({ ok: true, assets: [asset], filename: req.file.filename, originalName: req.file.originalname });
});

// Delete one music asset from the project's library.
mediaRoutes.delete('/:id/music/:assetId', (req, res) => {
  const id = req.params.id as string;
  const assetId = req.params.assetId as string;
  const proj = readProject(id);
  if (!proj) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  const library = ensureMusicLibrary(proj);
  const asset = library.find((item) => item.id === assetId);
  if (!asset) {
    res.status(404).json({ error: 'Music asset not found' });
    return;
  }

  try { fs.unlinkSync(path.join(projectDir(id), asset.filename)); } catch {}
  proj.musicFiles = library.filter((item) => item.id !== assetId);
  if (asset.filename === proj.musicFile || assetId === 'legacy-music') {
    delete proj.musicFile;
    delete proj.originalMusicName;
  }
  proj.updatedAt = new Date().toISOString();
  writeProject(id, proj);
  res.json({ ok: true });
});

// Backward-compatible delete-all endpoint.
mediaRoutes.delete('/:id/music', (req, res) => {
  const id = req.params.id as string;
  const proj = readProject(id);
  if (!proj) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const library = ensureMusicLibrary(proj);
  for (const asset of library) {
    try { fs.unlinkSync(path.join(projectDir(id), asset.filename)); } catch {}
  }
  proj.musicFiles = [];
  delete proj.musicFile;
  delete proj.originalMusicName;
  proj.updatedAt = new Date().toISOString();
  writeProject(id, proj);
  res.json({ ok: true });
});

// Serve a specific music asset with range-request support.
mediaRoutes.get('/:id/music/:assetId', (req, res) => {
  const proj = readProject(req.params.id);
  if (!proj) return void res.status(404).json({ error: 'No music' });
  const library = ensureMusicLibrary(proj);
  const asset = library.find((item) => item.id === req.params.assetId);
  if (!asset) return void res.status(404).json({ error: 'No music asset' });
  const mp = path.join(projectDir(req.params.id), asset.filename);
  if (!fs.existsSync(mp)) return void res.status(404).json({ error: 'File not found' });
  streamRangedAudio(mp, asset.filename, req, res);
});

// Backward-compatible legacy music endpoint: serve the first asset if present.
mediaRoutes.get('/:id/music', (req, res) => {
  const proj = readProject(req.params.id);
  if (!proj) return void res.status(404).json({ error: 'No music' });
  const library = ensureMusicLibrary(proj);
  const asset = library[0];
  if (!asset) return void res.status(404).json({ error: 'No music' });
  const mp = path.join(projectDir(req.params.id), asset.filename);
  if (!fs.existsSync(mp)) return void res.status(404).json({ error: 'File not found' });
  streamRangedAudio(mp, asset.filename, req, res);
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
