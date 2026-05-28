import * as fs from 'fs';
import * as path from 'path';
import { SERVER_DIR, projectDir } from '../helpers.js';
import { buildAudioFilter } from './exportRoutes.audioFilter.js';

type KeptSegment = { srcStart: number; srcEnd: number };

type BuildAudioPipelineArgs = {
  projectId: string;
  project: any;
  settings: any;
  manifest: any;
  startTime: number;
  duration: number;
  keptSegments: KeptSegment[];
  hasKeptSegments: boolean;
  musicOutputStartTime: number;
};

export function resolveExportCodecs(exportMode: 'web' | 'master', wantAlpha: boolean) {
  const videoCodec = exportMode === 'web'
    ? (wantAlpha
        ? ['-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-b:v', '0', '-crf', '36', '-deadline', 'good', '-cpu-used', '3', '-row-mt', '1', '-tile-columns', '2', '-frame-parallel', '0', '-auto-alt-ref', '0']
        : ['-c:v', 'libx264', '-preset', 'slow', '-profile:v', 'high', '-level:v', '4.0', '-crf', '21', '-maxrate', '10000k', '-bufsize', '20000k', '-pix_fmt', 'yuv420p', '-movflags', '+faststart'])
    : (wantAlpha
        ? ['-c:v', 'prores_ks', '-profile:v', '4444', '-pix_fmt', 'yuva444p10le', '-alpha_bits', '16', '-vendor', 'apl0']
        : ['-c:v', 'libx264', '-preset', 'medium', '-profile:v', 'high', '-level:v', '4.0', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart']);
  const audioCodec = exportMode === 'web'
    ? (wantAlpha ? ['-c:a', 'libopus', '-b:a', '96k'] : ['-c:a', 'aac', '-b:a', '96k'])
    : (wantAlpha ? ['-c:a', 'pcm_s16le'] : ['-c:a', 'aac', '-b:a', '192k']);
  return { videoCodec, audioCodec };
}

export function buildAudioPipeline({
  projectId,
  project,
  settings,
  manifest,
  startTime,
  duration,
  keptSegments,
  hasKeptSegments,
  musicOutputStartTime,
}: BuildAudioPipelineArgs) {
  const ffmpegArgs: string[] = [];
  let filterComplex = '';
  let audioMap: string[] = ['-map', '0:v'];
  const audioSources: Array<{ path: string; volume: number; isOutro?: boolean }> = [];
  const projectPath = projectDir(projectId);
  const effectiveUi = manifest?.ui ?? settings?.ui ?? {};
  const effectiveMusic = manifest?.musicSnapshot ?? settings?.music ?? {};
  const effectiveLimiter = manifest?.limiter ?? settings?.limiter;
  const musicLibrary = Array.isArray(project.musicFiles)
    ? project.musicFiles
    : (project.musicFile
        ? [{ id: 'legacy-music', filename: project.musicFile, originalName: project.originalMusicName || project.musicFile }]
        : []);
  const musicLibraryById = new Map(musicLibrary.map((asset: any) => [asset.id, asset]));
  const musicTimelineClips = Array.isArray(manifest?.musicTimelineClips)
    ? manifest.musicTimelineClips
    : (Array.isArray(settings?.musicTimelineClips) ? settings.musicTimelineClips : []);

  const mainAudioFile = project.audioFile || project.videoFile;
  if (mainAudioFile && fs.existsSync(path.join(projectPath, mainAudioFile))) {
    const volume = typeof effectiveUi?.mediaVolume === 'number' ? effectiveUi.mediaVolume : 1;
    audioSources.push({ path: path.join(projectPath, mainAudioFile), volume });
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
          const assetPath = path.join(projectPath, asset.filename);
          if (!fs.existsSync(assetPath)) return null;
          const clipStart = Number(clip.startSecond ?? 0);
          const clipDuration = Math.max(0.01, Number(clip.durationSecond ?? 0));
          const clipEnd = clipStart + clipDuration;
          const visibleStart = Math.max(clipStart, musicOutputStartTime);
          const visibleEnd = Math.min(clipEnd, musicOutputStartTime + (duration || 0));
          if (!(visibleEnd > visibleStart)) return null;
          const trimStart = Math.max(0, Number(clip.sourceOffsetSecond ?? 0) + (visibleStart - clipStart));
          const visibleDuration = visibleEnd - visibleStart;
          const fadeInSecond = visibleStart <= clipStart + 0.001
            ? Math.min(Math.max(0, Number(clip.fadeInSecond ?? 0)), visibleDuration)
            : 0;
          const fadeOutSecond = visibleEnd >= clipEnd - 0.001
            ? Math.min(Math.max(0, Number(clip.fadeOutSecond ?? 0)), visibleDuration)
            : 0;
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
        .filter(Boolean) as Array<{
          id: string;
          path: string;
          volume: number;
          trimStart: number;
          visibleDuration: number;
          delayMs: number;
          fadeInSecond: number;
          fadeOutSecond: number;
        }>
    : [];

  if (arrangedMusicSegments.length === 0 && musicLayerOn && project.musicFile) {
    const musicPath = path.join(projectPath, project.musicFile);
    if (fs.existsSync(musicPath)) {
      audioSources.push({ path: musicPath, volume: musicVol });
    }
  }

  const outroDuration = manifest.outroDuration || 0;
  if (outroDuration > 0) {
    const outroPath = path.resolve(SERVER_DIR, '../audio/bassnoise.wav');
    if (fs.existsSync(outroPath)) {
      const outroVol = typeof effectiveUi?.outroVolume === 'number'
        ? effectiveUi.outroVolume
        : 0.5;
      audioSources.push({ path: outroPath, volume: outroVol, isOutro: true });
    }
  }

  if (audioSources.length === 0 && arrangedMusicSegments.length === 0) {
    return { ffmpegArgs, filterComplex, audioMap };
  }

  audioSources.forEach((src, index) => {
    const isMusic = index > 0 && !src.isOutro;
    const isOutro = src.isOutro;
    const isMain = index === 0 && !src.isOutro;
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

  filterComplex = buildAudioFilter({
    audioSources,
    arrangedMusicSegments,
    keptSegments,
    hasKeptSegments,
    effectiveMusic,
    effectiveLimiter,
    manifest,
    duration,
  });
  audioMap = ['-map', '0:v', '-map', '[aout]'];
  return { ffmpegArgs, filterComplex, audioMap };
}
