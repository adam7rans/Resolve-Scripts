import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import {
  exportDir,
  readProject,
  readSettings,
} from '../helpers.js';
import {
  buildAudioPipeline,
  resolveExportCodecs,
} from './exportRoutes.audio.js';

async function runFfmpeg(args: string[]) {
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
      const details = stderr.trim()
        || stdout.trim()
        || `ffmpeg exited with code ${code ?? 'unknown'}${signal ? ` (signal ${signal})` : ''}`;
      reject(new Error(details));
    });
  });
}

export function cleanupExportFrames(dir: string) {
  let deletedFrames = 0;
  for (const entry of fs.readdirSync(dir)) {
    if (!entry.toLowerCase().endsWith('.png')) continue;
    fs.unlinkSync(path.join(dir, entry));
    deletedFrames += 1;
  }
  return deletedFrames;
}

export async function stitchVideo(projectId: string, exportId: string) {
  const proj = readProject(projectId);
  if (!proj) return null;
  const settings = readSettings(projectId, proj);
  const dir = exportDir(projectId, exportId);
  const manifestPath = path.join(dir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) return null;

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  const prefix = (manifest.prefix || '').trim();
  const { fps, startTime, duration } = manifest;
  const keptSegments: Array<{ srcStart: number; srcEnd: number }> =
    Array.isArray(manifest.keptSegments) ? manifest.keptSegments : [];
  const hasKeptSegments = keptSegments.length > 0;
  const manifestMusicTimelineClips = Array.isArray(manifest?.musicTimelineClips)
    ? manifest.musicTimelineClips
    : null;
  const manifestMusic = manifest?.musicSnapshot && typeof manifest.musicSnapshot === 'object'
    ? manifest.musicSnapshot
    : null;
  const manifestLimiter = manifest?.limiter && typeof manifest.limiter === 'object'
    ? manifest.limiter
    : null;
  const manifestUi = manifest?.ui && typeof manifest.ui === 'object'
    ? manifest.ui
    : null;
  const musicOutputStartTime = typeof manifest?.musicOutputStartTime === 'number'
    ? manifest.musicOutputStartTime
    : 0;

  const exportMode = manifest?.exportMode === 'web' ? 'web' : 'master';
  const wantAlpha = exportMode === 'web'
    ? manifest?.preserveAlpha === true
    : manifest?.layers?.background === false;
  const ext = exportMode === 'web'
    ? (wantAlpha ? 'webm' : 'mp4')
    : (wantAlpha ? 'mov' : 'mp4');
  const outName = prefix || proj.name?.trim() || 'video';
  const outPath = path.join(dir, `${outName}.${ext}`);
  const inputPrefix = prefix.replace(/ +/g, '-').replace(/ /g, '-');
  const pattern = path.join(dir, `${inputPrefix ? `${inputPrefix}_` : '_'}%05d.png`);
  const ffmpegArgs: string[] = ['-y', '-framerate', String(fps), '-i', pattern];
  const audioPipeline = buildAudioPipeline({
    projectId,
    project: proj,
    settings,
    manifest: {
      ...manifest,
      musicTimelineClips: manifestMusicTimelineClips,
      musicSnapshot: manifestMusic,
      limiter: manifestLimiter,
      ui: manifestUi,
    },
    startTime,
    duration,
    keptSegments,
    hasKeptSegments,
    musicOutputStartTime,
  });
  const { videoCodec, audioCodec } = resolveExportCodecs(exportMode, wantAlpha);
  ffmpegArgs.push(...audioPipeline.ffmpegArgs);
  if (audioPipeline.filterComplex) {
    ffmpegArgs.push('-filter_complex', audioPipeline.filterComplex);
  }
  ffmpegArgs.push(...audioPipeline.audioMap, ...videoCodec, ...audioCodec, outPath);

  console.log(`[export] Stitching video (alpha=${wantAlpha}): ffmpeg ${ffmpegArgs.map((arg) => JSON.stringify(arg)).join(' ')}`);
  try {
    await runFfmpeg(ffmpegArgs);
    console.log(`[export] Video stitched successfully: ${outPath}`);
    return `${prefix || 'video'}.${ext}`;
  } catch (err) {
    console.error('[export] FFMPEG failed:', err);
    throw err;
  }
}
