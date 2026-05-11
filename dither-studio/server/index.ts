import express from 'express';
import multer from 'multer';
import cors from 'cors';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';
import { runTranscriptionPipeline, runAudioTranscriptionPipeline, type TranscribeEvent } from './transcribe.js';
import type { Project, Settings } from './types';

const execAsync = promisify(exec);

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

/**
 * Stitch PNG sequence into an MP4 using FFMPEG.
 * Includes project audio/video-audio and backing music if available.
 */
async function stitchVideo(projectId: string, exportId: string) {
  const proj = readProject(projectId);
  if (!proj) return null;
  const settings = readSettings(projectId, proj);
  const dir = exportDir(projectId, exportId);
  const manifestPath = path.join(dir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) return null;

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  const prefix = (manifest.prefix || '').trim();
  const { fps, startTime, duration } = manifest;
  // `keptSegments`, when present, lists the source-relative time windows that
  // should be concatenated together for the audio (used by the jump-cut /
  // skip-silence feature). When absent, audio is taken as one slice via -ss/-t.
  const keptSegments: Array<{ srcStart: number; srcEnd: number }> =
    Array.isArray(manifest.keptSegments) ? manifest.keptSegments : [];
  const hasKeptSegments = keptSegments.length > 0;

  // When the background layer was OFF for the export, the PNG sequence has
  // an alpha channel. libx264/yuv420p (the .mp4 path) cannot preserve alpha
  // and would flatten transparent areas to black. Emit a ProRes 4444 .mov
  // instead, which Resolve and other NLEs accept as an alpha-capable video.
  const wantAlpha = manifest?.layers?.background === false;
  const ext = wantAlpha ? 'mov' : 'mp4';
  // Output filename: use trimmed prefix (or project name)
  const outName = prefix || proj.name?.trim() || 'video';
  const outPath = path.join(dir, `${outName}.${ext}`);
  // Input pattern: normalize multiple spaces to single dash, then convert remaining spaces to dashes
  // (frontend converts spaces when saving PNGs)
  const inputPrefix = prefix.replace(/ +/g, '-').replace(/ /g, '-');
  const pattern = path.join(dir, `${inputPrefix ? inputPrefix + '_' : '_'}%05d.png`);

  // Build FFMPEG command
  // Input 0: PNG sequence
  let inputs = `-framerate ${fps} -i "${pattern}"`;
  let filterComplex = '';
  let audioMap = '';

  const audioSources: { path: string; volume: number; isOutro?: boolean }[] = [];
  const pDir = projectDir(projectId);

  // Source 1: Main audio (from video or audio file)
  const mainAudioFile = proj.audioFile || proj.videoFile;
  if (mainAudioFile && fs.existsSync(path.join(pDir, mainAudioFile))) {
    const vol = typeof settings?.ui?.mediaVolume === 'number' ? settings.ui.mediaVolume : 1;
    audioSources.push({ path: path.join(pDir, mainAudioFile), volume: vol });
  }

  // Source 2: Backing music
  if (proj.musicFile) {
    const musicPath = path.join(pDir, proj.musicFile);
    const exists = fs.existsSync(musicPath);
    const musicVol = typeof settings?.music?.volume === 'number' ? settings.music.volume : 0.5;
    const musicLayerOn = settings?.layers?.music !== false;
    
    if (exists && musicLayerOn) {
      audioSources.push({ path: musicPath, volume: musicVol });
    }
  }

  // Source 3: Outro sound
  const outroDuration = manifest.outroDuration || 0;
  if (outroDuration > 0) {
    const outroPath = path.resolve(__dirname, '../audio/bassnoise.wav');
    if (fs.existsSync(outroPath)) {
      const outroVol = typeof settings?.ui?.outroVolume === 'number' ? settings.ui.outroVolume : 0.5;
      audioSources.push({ path: outroPath, volume: outroVol, isOutro: true });
    }
  }

  if (audioSources.length > 0) {
    audioSources.forEach((src, i) => {
      const isMusic = i > 0 && !src.isOutro;
      const isOutro = src.isOutro;
      const isMain = i === 0 && !src.isOutro;
      const loopStr = isMusic ? '-stream_loop -1 ' : '';
      // Music starts at 0:00 relative to the start handle (which is 0:00 in the output video).
      // Main audio: when we have keptSegments, we need the original source timeline so atrim
      // can address absolute timestamps — so skip -ss/-t entirely. Otherwise use -ss/-t to
      // grab the trimmed slice directly.
      const ssStr = (isOutro || isMusic) ? ''
                  : (isMain && hasKeptSegments) ? ''
                  : `-ss ${startTime || 0} `;
      const tStr = (isMain && hasKeptSegments) ? '' : `-t ${duration || 0} `;
      inputs += ` ${loopStr}${ssStr}${tStr}-i "${src.path}"`;
    });

    // We use a more flexible mixing approach to handle 1-3 sources.
    const sc = settings?.music?.sidechain;
    const scEnabled = sc?.enabled !== false;
    const threshold = sc?.threshold ?? 0.1;
    const ratio = 1.0 / (1.0 - (sc?.amount ?? 0.5));
    const attack = sc?.attackMs ?? 80;
    const release = sc?.releaseMs ?? 350;

    const lim = settings?.limiter;
    const limEnabled = lim?.enabled !== false;
    const limIn = limEnabled ? Math.pow(10, (lim?.inputGainDb ?? 0) / 20) : 1;
    const limThresh = limEnabled ? Math.max(0.063, Math.pow(10, (lim?.thresholdDb ?? -6) / 20)) : 1;
    const limOut = limEnabled ? Math.pow(10, (lim?.outputGainDb ?? 0) / 20) : 1;
    const limRelease = lim?.releaseSec ?? 0.25;

    let filter = '';
    let mixCount = 0;

    // Process each source into a named label
    audioSources.forEach((src, i) => {
      const idx = i + 1;
      if (i === 0) {
        // Main audio: optionally atrim+concat (skip-silence) -> volume -> limiter -> pad -> split
        const totalMs = Math.round(duration * 1000);
        let mainLabel = `[${idx}:a]`;
        if (hasKeptSegments) {
          // Split the source N ways, atrim each window, then concat them in order.
          const n = keptSegments.length;
          const splitOuts: string[] = [];
          for (let j = 0; j < n; j++) splitOuts.push(`[m_src_${j}]`);
          filter += `${mainLabel}asplit=${n}${splitOuts.join('')};`;
          const concatIns: string[] = [];
          for (let j = 0; j < n; j++) {
            const seg = keptSegments[j];
            filter += `[m_src_${j}]atrim=start=${seg.srcStart.toFixed(3)}:end=${seg.srcEnd.toFixed(3)},asetpts=PTS-STARTPTS[m_seg_${j}];`;
            concatIns.push(`[m_seg_${j}]`);
          }
          filter += `${concatIns.join('')}concat=n=${n}:v=0:a=1[main_edited];`;
          mainLabel = `[main_edited]`;
        }
        filter += `${mainLabel}volume=${(src.volume * limIn).toFixed(2)}`;
        if (limEnabled) {
          filter += `,alimiter=level_in=1:level_out=1:limit=${limThresh.toFixed(3)}:attack=5:release=${(limRelease * 1000).toFixed(0)}`;
        }
        // apad ensures this stream lasts for the entire duration (base + outro)
        filter += `,volume=${limOut.toFixed(2)},apad=whole_dur=${duration.toFixed(3)},asplit=2[speech_trigger][speech_mix];`;
      } else if (src.isOutro) {
        // Outro: volume -> adelay
        const delayMs = Math.round((manifest.baseDuration || 0) * 1000);
        filter += `[${idx}:a]volume=${src.volume.toFixed(2)},adelay=${delayMs}|${delayMs}[outro_mix];`;
      } else {
        // Music: volume -> sidechain compress (if enabled)
        filter += `[${idx}:a]volume=${src.volume.toFixed(2)}[music_pre];`;
        if (scEnabled) {
          filter += `[music_pre][speech_trigger]sidechaincompress=threshold=${threshold}:ratio=${ratio.toFixed(2)}:attack=${attack}:release=${release}[music_mix];`;
        } else {
          filter += `[music_pre]anull[music_mix];`;
        }
      }
    });

    // Final mix
    const mixLabels = [];
    if (audioSources.find(s => !s.isOutro && audioSources.indexOf(s) === 0)) mixLabels.push('[speech_mix]');
    if (audioSources.find(s => !s.isOutro && audioSources.indexOf(s) > 0)) mixLabels.push('[music_mix]');
    if (audioSources.find(s => s.isOutro)) mixLabels.push('[outro_mix]');

    filter += `${mixLabels.join('')}amix=inputs=${mixLabels.length}:dropout_transition=0`;
    // amix scales down volume by 1/n; scale it back up by n but leave headroom
    filter += `,volume=${mixLabels.length},alimiter=limit=0.9[aout]`;

    filterComplex = ` -filter_complex "${filter}"`;
    audioMap = '-map 0:v -map "[aout]"';
  } else {
    audioMap = '-map 0:v';
  }

  // Codec selection:
  //  - alpha export → ProRes 4444 in .mov (yuva444p10le carries alpha; PCM
  //    audio for clean NLE ingest in Resolve/Premiere/FCP).
  //  - opaque export → libx264/yuv420p in .mp4 (broad compatibility).
  const videoCodec = wantAlpha
    ? '-c:v prores_ks -profile:v 4444 -pix_fmt yuva444p10le -alpha_bits 16 -vendor apl0'
    : '-c:v libx264 -crf 18 -pix_fmt yuv420p';
  const audioCodec = wantAlpha ? '-c:a pcm_s16le' : '-c:a aac -b:a 192k';
  const cmd = `ffmpeg -y ${inputs}${filterComplex} ${audioMap} ${videoCodec} ${audioCodec} "${outPath}"`;

  console.log(`[export] Stitching video (alpha=${wantAlpha}): ${cmd}`);
  try {
    await execAsync(cmd);
    console.log(`[export] Video stitched successfully: ${outPath}`);
    return `${prefix || 'video'}.${ext}`;
  } catch (err) {
    console.error(`[export] FFMPEG failed:`, err);
    throw err;
  }
}
function readProject(id: string): Project | null {
  const p = path.join(projectDir(id), PROJECT_FILE);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf-8')) : null;
}
function writeProject(id: string, data: Project) {
  fs.writeFileSync(path.join(projectDir(id), PROJECT_FILE), JSON.stringify(data, null, 2));
}
const SETTINGS_KEYS = new Set([
  'background', 'backgroundDither', 'video', 'captionMode', 'captionStyle', 'layers',
  'guides', 'activeGuide', 'cropToGuide', 'exportBackground', 'exportVideo', 'ui',
  'audioReactivity', 'mathFigure', 'exportAudio', 'music',
]);
function readSettings(id: string, project?: Project | null): Settings {
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
function writeSettings(id: string, data: Settings) {
  fs.writeFileSync(path.join(projectDir(id), SETTINGS_FILE), JSON.stringify(data, null, 2));
}
function captionPath(id: string): string {
  const dir = projectDir(id);
  const proj = readProject(id);
  if (proj?.captionFile) return path.join(dir, proj.captionFile);
  if (proj?.transcriptFile) return path.join(dir, proj.transcriptFile);
  return path.join(dir, LEGACY_TRANSCRIPT_FILE);
}
function hasCaption(id: string, project?: Project | null): boolean {
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

// ── routes ────────────────────────────────────────────────────────────────────

// List projects
app.get('/api/projects', (_req, res) => {
  if (!fs.existsSync(PROJECTS_DIR)) {
    res.json([]);
    return;
  }
  const items = fs.readdirSync(PROJECTS_DIR)
    .filter(d => fs.existsSync(path.join(PROJECTS_DIR, d, 'project.json')))
    .map(id => projectMeta(id))
    .filter((p): p is NonNullable<typeof p> => !!p)
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  res.json(items);
});

// Create project
app.post('/api/projects', (req, res) => {
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
app.get('/api/projects/:id', (req, res) => {
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
    hasVideo: !!(proj.videoFile && fs.existsSync(path.join(pDir, proj.videoFile))),
    hasAudio: !!(proj.audioFile && fs.existsSync(path.join(pDir, proj.audioFile))),
    hasMusic: !!(proj.musicFile && fs.existsSync(path.join(pDir, proj.musicFile))),
    hasTranscript: hasCaption(id, proj),
  });
});

// Save UI/shader/export settings (debounced from frontend)
app.put('/api/projects/:id/settings', (req, res) => {
  const id = req.params.id as string;
  const proj = readProject(id);
  if (!proj) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  writeSettings(id, { ...readSettings(id, proj), ...(req.body as any) });
  writeProject(id, { ...proj, updatedAt: new Date().toISOString() });
  res.json({ ok: true });
});

// Upload video — save to project folder, then kick off transcription pipeline
const upload = multer({
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

app.post('/api/projects/:id/video', upload.single('video'), (req, res) => {
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

// Upload audio — save to project folder, then kick off audio-only transcription.
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

app.post('/api/projects/:id/audio', audioUpload.single('audio'), (req, res) => {
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
      const dir = projectDir(req.params.id as string);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => cb(null, safeMusicFilename(file.originalname)),
  }),
  limits: { fileSize: 1024 * 1024 * 1024 }, // 1 GB cap
});

app.post('/api/projects/:id/music', musicUpload.single('music'), (req, res) => {
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
app.delete('/api/projects/:id/music', (req, res) => {
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
  const id = req.params.id as string;
  const proj = readProject(id);
  if (!proj || !req.file) {
    res.status(400).json({ error: 'Bad request' });
    return;
  }

  const exportId = slugify(req.params.exportId as string);
  const dir = exportDir(id, exportId);
  if (!fs.existsSync(dir)) {
    res.status(404).json({ error: 'Export folder not found' });
    return;
  }

  const filename = safePngFilename(String(req.body?.filename || req.file.originalname || 'frame.png'));
  fs.writeFileSync(path.join(dir, filename), req.file.buffer);
  res.json({ ok: true, filename });
});

app.post('/api/projects/:id/exports/:exportId/finish', async (req, res) => {
  const id = req.params.id as string;
  const proj = readProject(id);
  if (!proj) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  const exportId = slugify(req.params.exportId as string);
  const dir = exportDir(id, exportId);
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

  // Trigger FFMPEG stitching
  let videoFile = null;
  let stitchError = null;
  try {
    videoFile = await stitchVideo(id, exportId);
    if (videoFile) {
      const updatedManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      fs.writeFileSync(manifestPath, JSON.stringify({
        ...updatedManifest,
        videoFile,
      }, null, 2));
    }
  } catch (err) {
    console.error('Stitching failed', err);
    stitchError = err instanceof Error ? err.message : String(err);
    const logPath = path.join(dir, 'stitch-error.log');
    fs.writeFileSync(logPath, `${new Date().toISOString()}\n${stitchError}\n\n`);
  }

  if (stitchError) {
    res.json({ ok: false, error: `Video stitching failed: ${stitchError}`, folder: `projects/${id}/exports/${exportId}` });
    return;
  }

  proj.updatedAt = new Date().toISOString();
  writeProject(id, proj);
  res.json({ ok: true, folder: `projects/${id}/exports/${exportId}`, videoFile });
});

// Serve video with range-request support for scrubbing
app.get('/api/projects/:id/video', (req, res) => {
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

// Get transcript JSON
app.get('/api/projects/:id/transcript', (req, res) => {
  const id = req.params.id as string;
  const tp = captionPath(id);
  if (!fs.existsSync(tp)) {
    res.status(404).json({ error: 'No transcript' });
    return;
  }
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

// Open a local folder in the OS file explorer
app.post('/api/projects/:id/exports/:exportId/open', (req, res) => {
  const id = req.params.id as string;
  const exportId = req.params.exportId as string; // Don't slugify here, use it as it comes from the URL
  const dir = path.resolve(exportDir(id, exportId));
  
  console.log(`[shell] Open request for project=${id} export=${exportId}`);
  console.log(`[shell] Resolved directory: ${dir}`);

  if (!fs.existsSync(dir)) {
    console.error(`[shell] Directory does not exist: ${dir}`);
    res.status(404).json({ error: 'Folder not found' });
    return;
  }

  const platform = process.platform;
  const cmd = platform === 'win32' ? `start ""` : platform === 'darwin' ? 'open' : 'xdg-open';
  
  console.log(`[shell] Executing: ${cmd} "${dir}"`);
  exec(`${cmd} "${dir}"`, (err) => {
    if (err) {
      console.error('[shell] Failed to open folder:', err);
      res.status(500).json({ error: 'Failed to open folder' });
      return;
    }
    res.json({ ok: true });
  });
});

app.listen(3001, () => console.log('Dither Studio API → http://localhost:3001'));
