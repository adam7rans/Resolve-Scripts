import { Router } from 'express';
import multer from 'multer';
import * as fs from 'fs';
import * as path from 'path';
import { exec, spawn } from 'child_process';
import {
  SERVER_DIR, projectDir, exportDir, slugify, safePngFilename,
  readProject, writeProject, readSettings,
} from '../helpers.js';

export const exportRoutes = Router();

// ── stitchVideo ───────────────────────────────────────────────────────────────

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
  const manifestMusicTimelineClips = Array.isArray(manifest?.musicTimelineClips) ? manifest.musicTimelineClips : null;
  const manifestMusic = manifest?.musicSnapshot && typeof manifest.musicSnapshot === 'object' ? manifest.musicSnapshot : null;
  const manifestLimiter = manifest?.limiter && typeof manifest.limiter === 'object' ? manifest.limiter : null;
  const manifestUi = manifest?.ui && typeof manifest.ui === 'object' ? manifest.ui : null;
  const musicOutputStartTime = typeof manifest?.musicOutputStartTime === 'number' ? manifest.musicOutputStartTime : 0;

  const exportMode = manifest?.exportMode === 'web' ? 'web' : 'master';
  // Web mode explicitly asks the PNG export stage to preserve transparency;
  // master mode keeps the legacy "background off implies alpha-capable master"
  // behavior for existing editing/archive flows.
  const wantAlpha = exportMode === 'web'
    ? manifest?.preserveAlpha === true
    : manifest?.layers?.background === false;
  const ext = exportMode === 'web'
    ? (wantAlpha ? 'webm' : 'mp4')
    : (wantAlpha ? 'mov' : 'mp4');
  // Output filename: use trimmed prefix (or project name)
  const outName = prefix || proj.name?.trim() || 'video';
  const outPath = path.join(dir, `${outName}.${ext}`);
  // Input pattern: normalize multiple spaces to single dash, then convert remaining spaces to dashes
  // (frontend converts spaces when saving PNGs)
  const inputPrefix = prefix.replace(/ +/g, '-').replace(/ /g, '-');
  const pattern = path.join(dir, `${inputPrefix ? inputPrefix + '_' : '_'}%05d.png`);

  // Build FFMPEG arguments
  // Input 0: PNG sequence
  const ffmpegArgs: string[] = ['-y', '-framerate', String(fps), '-i', pattern];
  let filterComplex = '';
  let audioMap: string[] = ['-map', '0:v'];

  const audioSources: { path: string; volume: number; isOutro?: boolean }[] = [];
  const pDir = projectDir(projectId);
  const effectiveUi = manifestUi ?? settings?.ui ?? {};
  const effectiveMusic = manifestMusic ?? settings?.music ?? {};
  const effectiveLimiter = manifestLimiter ?? settings?.limiter;
  const musicLibrary = Array.isArray(proj.musicFiles)
    ? proj.musicFiles
    : (proj.musicFile ? [{ id: 'legacy-music', filename: proj.musicFile, originalName: proj.originalMusicName || proj.musicFile }] : []);
  const musicLibraryById = new Map(musicLibrary.map((asset) => [asset.id, asset]));
  const musicTimelineClips = manifestMusicTimelineClips ?? (Array.isArray((settings as any)?.musicTimelineClips) ? (settings as any).musicTimelineClips : []);

  // Source 1: Main audio (from video or audio file)
  const mainAudioFile = proj.audioFile || proj.videoFile;
  if (mainAudioFile && fs.existsSync(path.join(pDir, mainAudioFile))) {
    const vol = typeof effectiveUi?.mediaVolume === 'number' ? effectiveUi.mediaVolume : 1;
    audioSources.push({ path: path.join(pDir, mainAudioFile), volume: vol });
  }

  const musicVol = typeof effectiveMusic?.volume === 'number' ? effectiveMusic.volume : 0.5;
  const musicLayerOn = manifest?.layers && typeof manifest.layers.music === 'boolean'
    ? manifest.layers.music !== false
    : settings?.layers?.music !== false;
  const arrangedMusicSegments = musicLayerOn
    ? musicTimelineClips
        .map((clip: any, index: number) => {
          const asset = musicLibraryById.get(String(clip.assetId || ''));
          if (!asset) return null;
          const assetPath = path.join(pDir, asset.filename);
          if (!fs.existsSync(assetPath)) return null;
          const clipStart = Number(clip.startSecond ?? 0);
          const clipDuration = Math.max(0.01, Number(clip.durationSecond ?? 0));
          const clipEnd = clipStart + clipDuration;
          const visibleStart = Math.max(clipStart, musicOutputStartTime);
          const visibleEnd = Math.min(clipEnd, musicOutputStartTime + (duration || 0));
          if (!(visibleEnd > visibleStart)) return null;
          const trimStart = Math.max(0, Number(clip.sourceOffsetSecond ?? 0) + (visibleStart - clipStart));
          const visibleDuration = visibleEnd - visibleStart;
          const fadeInSecond = visibleStart <= clipStart + 0.001 ? Math.min(Math.max(0, Number(clip.fadeInSecond ?? 0)), visibleDuration) : 0;
          const fadeOutSecond = visibleEnd >= clipEnd - 0.001 ? Math.min(Math.max(0, Number(clip.fadeOutSecond ?? 0)), visibleDuration) : 0;
          return {
            id: `music_seg_${index + 1}`,
            path: assetPath,
            volume: musicVol,
            trimStart,
            visibleDuration,
            delayMs: Math.max(0, Math.round((visibleStart - musicOutputStartTime) * 1000)),
            fadeInSecond,
            fadeOutSecond,
          };
        })
        .filter(Boolean) as Array<{ id: string; path: string; volume: number; trimStart: number; visibleDuration: number; delayMs: number; fadeInSecond: number; fadeOutSecond: number; }>
    : [];

  // Fallback legacy single looping backing music when there is no arranged timeline.
  if (arrangedMusicSegments.length === 0 && musicLayerOn && proj.musicFile) {
    const musicPath = path.join(pDir, proj.musicFile);
    if (fs.existsSync(musicPath)) {
      audioSources.push({ path: musicPath, volume: musicVol });
    }
  }

  // Source 3: Outro sound
  const outroDuration = manifest.outroDuration || 0;
  if (outroDuration > 0) {
    const outroPath = path.resolve(SERVER_DIR, '../audio/bassnoise.wav');
    if (fs.existsSync(outroPath)) {
      const outroVol = typeof effectiveUi?.outroVolume === 'number' ? effectiveUi.outroVolume : 0.5;
      audioSources.push({ path: outroPath, volume: outroVol, isOutro: true });
    }
  }

  if (audioSources.length > 0 || arrangedMusicSegments.length > 0) {
    audioSources.forEach((src, i) => {
      const isMusic = i > 0 && !src.isOutro;
      const isOutro = src.isOutro;
      const isMain = i === 0 && !src.isOutro;
      if (isMusic) ffmpegArgs.push('-stream_loop', '-1');
      if (!isOutro && !isMusic && !(isMain && hasKeptSegments)) {
        ffmpegArgs.push('-ss', String(startTime || 0));
      }
      if (!(isMain && hasKeptSegments)) {
        ffmpegArgs.push('-t', String(duration || 0));
      }
      ffmpegArgs.push('-i', src.path);
    });
    arrangedMusicSegments.forEach((segment) => {
      ffmpegArgs.push('-ss', String(segment.trimStart));
      ffmpegArgs.push('-t', String(segment.visibleDuration));
      ffmpegArgs.push('-i', segment.path);
    });

    const sc = effectiveMusic?.sidechain;
    const scEnabled = sc?.enabled !== false;
    const threshold = sc?.threshold ?? 0.1;
    const ratio = 1.0 / (1.0 - (sc?.amount ?? 0.5));
    const attack = sc?.attackMs ?? 80;
    const release = sc?.releaseMs ?? 350;
    const hasMainSpeech = audioSources.some((src, i) => i === 0 && !src.isOutro);
    const hasMusicSource = arrangedMusicSegments.length > 0 || audioSources.some((src, i) => i > 0 && !src.isOutro);
    const needsSpeechTrigger = hasMainSpeech && hasMusicSource && scEnabled;

    const lim = effectiveLimiter;
    const limEnabled = lim?.enabled !== false;
    const limIn = limEnabled ? Math.pow(10, (lim?.inputGainDb ?? 0) / 20) : 1;
    const limThresh = limEnabled ? Math.max(0.063, Math.pow(10, (lim?.thresholdDb ?? -6) / 20)) : 1;
    const limOut = limEnabled ? Math.pow(10, (lim?.outputGainDb ?? 0) / 20) : 1;
    const limRelease = lim?.releaseSec ?? 0.25;

    let filter = '';

    const musicInputStartIndex = audioSources.length + 1;
    audioSources.forEach((src, i) => {
      const idx = i + 1;
      if (i === 0) {
        const n = keptSegments.length;
        let mainLabel = `[${idx}:a]`;
        if (hasKeptSegments) {
          const splitOuts: string[] = [];
          for (let j = 0; j < n; j++) splitOuts.push(`[m_src_${j}]`);
          filter += `${mainLabel}asplit=${n}${splitOuts.join('')};`;
          const concatIns: string[] = [];
          for (let j = 0; j < n; j++) {
            const seg = keptSegments[j];
            const dur = seg.srcEnd - seg.srcStart;
            // Apply 20ms fade-in/out to prevent clicks between concatenated segments.
            // (Don't fade in the very first segment, don't fade out the very last)
            const fadeDur = 0.02;
            const fIn = j > 0 ? `afade=t=in:st=0:d=${fadeDur}` : '';
            const fOut = j < n - 1 ? `afade=t=out:st=${Math.max(0, dur - fadeDur).toFixed(3)}:d=${fadeDur}` : '';
            const fadeFilters = [fIn, fOut].filter(Boolean).join(',');
            const comma = fadeFilters ? ',' : '';
            filter += `[m_src_${j}]atrim=start=${seg.srcStart.toFixed(3)}:end=${seg.srcEnd.toFixed(3)},asetpts=PTS-STARTPTS${comma}${fadeFilters}[m_seg_${j}];`;
            concatIns.push(`[m_seg_${j}]`);
          }
          filter += `${concatIns.join('')}concat=n=${n}:v=0:a=1[main_edited];`;
          mainLabel = `[main_edited]`;
        }
        filter += `${mainLabel}volume=${(src.volume * limIn).toFixed(2)}`;
        if (limEnabled) {
          filter += `,alimiter=level_in=1:level_out=1:limit=${limThresh.toFixed(3)}:attack=5:release=${(limRelease * 1000).toFixed(0)}`;
        }
        filter += `,volume=${limOut.toFixed(2)},apad=whole_dur=${duration.toFixed(3)}`;
        if (needsSpeechTrigger) {
          filter += `,asplit=2[speech_trigger][speech_mix]`;
        } else {
          filter += `[speech_mix]`;
        }
        filter += ';';
      } else if (src.isOutro) {
        const delayMs = Math.round((manifest.baseDuration || 0) * 1000);
        filter += `[${idx}:a]volume=${src.volume.toFixed(2)},adelay=${delayMs}|${delayMs}[outro_mix];`;
      } else {
        filter += `[${idx}:a]volume=${src.volume.toFixed(2)}[music_pre];`;
        if (scEnabled) {
          filter += `[music_pre][speech_trigger]sidechaincompress=threshold=${threshold}:ratio=${ratio.toFixed(2)}:attack=${attack}:release=${release}[music_mix];`;
        } else {
          filter += `[music_pre]anull[music_mix];`;
        }
      }
    });

    if (arrangedMusicSegments.length > 0) {
      const segmentLabels: string[] = [];
      arrangedMusicSegments.forEach((segment, segIndex) => {
        const inputIndex = musicInputStartIndex + segIndex;
        let chain = `[${inputIndex}:a]volume=${segment.volume.toFixed(2)}`;
        if (segment.fadeInSecond > 0) {
          chain += `,afade=t=in:st=0:d=${segment.fadeInSecond.toFixed(3)}`;
        }
        if (segment.fadeOutSecond > 0) {
          const fadeOutStart = Math.max(0, segment.visibleDuration - segment.fadeOutSecond);
          chain += `,afade=t=out:st=${fadeOutStart.toFixed(3)}:d=${segment.fadeOutSecond.toFixed(3)}`;
        }
        chain += `,adelay=${segment.delayMs}|${segment.delayMs}[${segment.id}];`;
        filter += chain;
        segmentLabels.push(`[${segment.id}]`);
      });
      if (segmentLabels.length === 1) {
        filter += `${segmentLabels[0]}anull[music_pre];`;
      } else if (segmentLabels.length > 1) {
        filter += `${segmentLabels.join('')}amix=inputs=${segmentLabels.length}:dropout_transition=0,volume=${segmentLabels.length}[music_pre];`;
      }
      if (scEnabled && needsSpeechTrigger) {
        filter += `[music_pre][speech_trigger]sidechaincompress=threshold=${threshold}:ratio=${ratio.toFixed(2)}:attack=${attack}:release=${release}[music_mix];`;
      } else {
        filter += `[music_pre]anull[music_mix];`;
      }
    }

    const mixLabels = [];
    if (audioSources.find(s => !s.isOutro && audioSources.indexOf(s) === 0)) mixLabels.push('[speech_mix]');
    if (hasMusicSource) mixLabels.push('[music_mix]');
    if (audioSources.find(s => s.isOutro)) mixLabels.push('[outro_mix]');

    filter += `${mixLabels.join('')}amix=inputs=${mixLabels.length}:dropout_transition=0`;
    filter += `,volume=${mixLabels.length},alimiter=limit=0.9[aout]`;

    filterComplex = filter;
    audioMap = ['-map', '0:v', '-map', '[aout]'];
  }

  const videoCodec = exportMode === 'web'
    ? (wantAlpha
        ? ['-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-b:v', '0', '-crf', '36', '-deadline', 'good', '-cpu-used', '3', '-row-mt', '1', '-tile-columns', '2', '-frame-parallel', '0', '-auto-alt-ref', '0']
        : [
            '-c:v', 'libx264',
            '-preset', 'slow',
            '-profile:v', 'high',
            '-level:v', '4.0',
            '-crf', '21',
            '-maxrate', '10000k',
            '-bufsize', '20000k',
            '-pix_fmt', 'yuv420p',
            '-movflags', '+faststart',
          ])
    : (wantAlpha
        ? ['-c:v', 'prores_ks', '-profile:v', '4444', '-pix_fmt', 'yuva444p10le', '-alpha_bits', '16', '-vendor', 'apl0']
        : ['-c:v', 'libx264', '-preset', 'medium', '-profile:v', 'high', '-level:v', '4.0', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart']);
  const audioCodec = exportMode === 'web'
    ? (wantAlpha ? ['-c:a', 'libopus', '-b:a', '96k'] : ['-c:a', 'aac', '-b:a', '96k'])
    : (wantAlpha ? ['-c:a', 'pcm_s16le'] : ['-c:a', 'aac', '-b:a', '192k']);
  if (filterComplex) ffmpegArgs.push('-filter_complex', filterComplex);
  ffmpegArgs.push(...audioMap, ...videoCodec, ...audioCodec, outPath);

  console.log(`[export] Stitching video (alpha=${wantAlpha}): ffmpeg ${ffmpegArgs.map((arg) => JSON.stringify(arg)).join(' ')}`);
  try {
    await runFfmpeg(ffmpegArgs);
    console.log(`[export] Video stitched successfully: ${outPath}`);
    return `${prefix || 'video'}.${ext}`;
  } catch (err) {
    console.error(`[export] FFMPEG failed:`, err);
    throw err;
  }
}

function runFfmpeg(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn('ffmpeg', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    let stdout = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
      if (stdout.length > 64_000) stdout = stdout.slice(-64_000);
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > 64_000) stderr = stderr.slice(-64_000);
    });
    child.on('error', reject);
    child.on('close', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      const details = stderr.trim() || stdout.trim() || `ffmpeg exited with code ${code ?? 'unknown'}${signal ? ` (signal ${signal})` : ''}`;
      reject(new Error(details));
    });
  });
}

function cleanupExportFrames(dir: string) {
  let deletedFrames = 0;
  for (const entry of fs.readdirSync(dir)) {
    if (!entry.toLowerCase().endsWith('.png')) continue;
    fs.unlinkSync(path.join(dir, entry));
    deletedFrames += 1;
  }
  return deletedFrames;
}

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
