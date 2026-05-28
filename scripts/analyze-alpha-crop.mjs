#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

function usage() {
  console.error(
    [
      'Usage:',
      '  node scripts/analyze-alpha-crop.mjs <export-dir> [more-export-dirs...] [--threshold=16] [--step=1] [--pad=0] [--pad-left=0] [--pad-right=0] [--pad-top=0] [--pad-bottom=0] [--no-pin-bottom]',
      '',
      'Notes:',
      '  - Reads manifest.json from each export dir and scans the PNG alpha output.',
      '  - Reports the union bounding box across all analyzed frames/directories.',
      '  - By default the bottom edge is pinned to the full frame height, since this',
      '    project wants the performer grounded to the bottom edge.',
    ].join('\n'),
  );
}

function parseArgs(argv) {
  const dirs = [];
  const opts = {
    threshold: 16,
    step: 1,
    padLeft: 0,
    padRight: 0,
    padTop: 0,
    padBottom: 0,
    pinBottom: true,
  };

  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      usage();
      process.exit(0);
    }
    if (!arg.startsWith('--')) {
      dirs.push(path.resolve(arg));
      continue;
    }
    if (arg === '--no-pin-bottom') {
      opts.pinBottom = false;
      continue;
    }
    const [flag, rawValue] = arg.split('=');
    const value = Number(rawValue);
    switch (flag) {
      case '--threshold':
        opts.threshold = Number.isFinite(value) ? Math.max(0, Math.min(255, value)) : opts.threshold;
        break;
      case '--step':
        opts.step = Number.isFinite(value) ? Math.max(1, Math.floor(value)) : opts.step;
        break;
      case '--pad':
        if (Number.isFinite(value)) {
          const v = Math.max(0, Math.floor(value));
          opts.padLeft = v;
          opts.padRight = v;
          opts.padTop = v;
          opts.padBottom = v;
        }
        break;
      case '--pad-left':
        opts.padLeft = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : opts.padLeft;
        break;
      case '--pad-right':
        opts.padRight = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : opts.padRight;
        break;
      case '--pad-top':
        opts.padTop = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : opts.padTop;
        break;
      case '--pad-bottom':
        opts.padBottom = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : opts.padBottom;
        break;
      default:
        console.error(`Unknown option: ${arg}`);
        usage();
        process.exit(1);
    }
  }

  if (dirs.length === 0) {
    usage();
    process.exit(1);
  }

  return { dirs, opts };
}

function readManifest(dir) {
  const manifestPath = path.join(dir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`No manifest.json found in ${dir}`);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (!manifest.prefix || !manifest.width || !manifest.height) {
    throw new Error(`Manifest missing prefix/width/height in ${manifestPath}`);
  }
  return manifest;
}

function buildPattern(dir, prefix) {
  return path.join(dir, `${prefix}_%05d.png`);
}

async function analyzeDirectory(dir, opts) {
  const manifest = readManifest(dir);
  const width = Math.max(1, Math.floor(manifest.width));
  const height = Math.max(1, Math.floor(manifest.height));
  const frameBytes = width * height * 4;
  const inputPattern = buildPattern(dir, String(manifest.prefix).trim());

  if (!fs.existsSync(inputPattern.replace('%05d', '00001'))) {
    throw new Error(`First frame missing for pattern ${inputPattern}`);
  }

  const ffmpegArgs = [
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    inputPattern,
  ];

  if (opts.step > 1) {
    ffmpegArgs.push(
      '-vf',
      `select=not(mod(n\\,${opts.step}))`,
      '-vsync',
      '0',
    );
  }

  ffmpegArgs.push(
    '-f',
    'rawvideo',
    '-pix_fmt',
    'rgba',
    '-',
  );

  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', ffmpegArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    let frameIndex = 0;
    let analyzedFrames = 0;
    let leftover = Buffer.alloc(0);

    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    function processFrame(frame) {
      frameIndex += 1;
      analyzedFrames += 1;

      let localMinX = width;
      let localMinY = height;
      let localMaxX = -1;
      let localMaxY = -1;

      for (let y = 0; y < height; y += 1) {
        const rowBase = y * width * 4;
        for (let x = 0; x < width; x += 1) {
          const alpha = frame[rowBase + x * 4 + 3];
          if (alpha < opts.threshold) continue;
          if (x < localMinX) localMinX = x;
          if (y < localMinY) localMinY = y;
          if (x > localMaxX) localMaxX = x;
          if (y > localMaxY) localMaxY = y;
        }
      }

      if (localMaxX >= 0) {
        if (localMinX < minX) minX = localMinX;
        if (localMinY < minY) minY = localMinY;
        if (localMaxX > maxX) maxX = localMaxX;
        if (localMaxY > maxY) maxY = localMaxY;
      }

      if (analyzedFrames % 300 === 0) {
        console.error(`[analyze-alpha-crop] ${path.basename(dir)} analyzed ${analyzedFrames} frames`);
      }
    }

    child.stdout.on('data', (chunk) => {
      leftover = leftover.length > 0 ? Buffer.concat([leftover, chunk]) : chunk;
      while (leftover.length >= frameBytes) {
        const frame = leftover.subarray(0, frameBytes);
        leftover = leftover.subarray(frameBytes);
        processFrame(frame);
      }
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `ffmpeg exited with code ${code}`));
        return;
      }
      if (maxX < 0 || maxY < 0) {
        reject(new Error(`No opaque pixels found in ${dir}`));
        return;
      }
      resolve({
        dir,
        width,
        height,
        totalDecodedFrames: frameIndex,
        analyzedFrames,
        minX,
        minY,
        maxX,
        maxY,
      });
    });
  });
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function buildSummary(results, opts) {
  const width = results[0].width;
  const height = results[0].height;
  for (const r of results) {
    if (r.width !== width || r.height !== height) {
      throw new Error('All export directories must have the same frame size for union analysis.');
    }
  }

  const union = {
    minX: Math.min(...results.map((r) => r.minX)),
    minY: Math.min(...results.map((r) => r.minY)),
    maxX: Math.max(...results.map((r) => r.maxX)),
    maxY: Math.max(...results.map((r) => r.maxY)),
  };

  const padded = {
    left: clamp(union.minX - opts.padLeft, 0, width - 1),
    top: clamp(union.minY - opts.padTop, 0, height - 1),
    right: clamp(union.maxX + opts.padRight, 0, width - 1),
    bottom: opts.pinBottom
      ? height - 1
      : clamp(union.maxY + opts.padBottom, 0, height - 1),
  };

  const cropWidth = padded.right - padded.left + 1;
  const cropHeight = padded.bottom - padded.top + 1;
  let evenWidth = cropWidth % 2 === 0 ? cropWidth : cropWidth + 1;
  let evenHeight = cropHeight % 2 === 0 ? cropHeight : cropHeight + 1;
  if (padded.left + evenWidth > width) evenWidth -= 1;
  if (padded.top + evenHeight > height) evenHeight -= 1;

  return {
    frame: { width, height },
    analyzedDirectories: results.map((r) => ({
      dir: r.dir,
      analyzedFrames: r.analyzedFrames,
      totalDecodedFrames: r.totalDecodedFrames,
      bbox: {
        left: r.minX,
        top: r.minY,
        right: r.maxX,
        bottom: r.maxY,
        width: r.maxX - r.minX + 1,
        height: r.maxY - r.minY + 1,
      },
    })),
    unionBox: {
      left: union.minX,
      top: union.minY,
      right: union.maxX,
      bottom: union.maxY,
      width: union.maxX - union.minX + 1,
      height: union.maxY - union.minY + 1,
    },
    recommendedCrop: {
      left: padded.left,
      top: padded.top,
      right: padded.right,
      bottom: padded.bottom,
      width: cropWidth,
      height: cropHeight,
      widthEven: evenWidth,
      heightEven: evenHeight,
      ffmpegCrop: `crop=${evenWidth}:${evenHeight}:${padded.left}:${padded.top}`,
      normalized: {
        left: Number((padded.left / width).toFixed(6)),
        top: Number((padded.top / height).toFixed(6)),
        right: Number((padded.right / width).toFixed(6)),
        bottom: Number((padded.bottom / height).toFixed(6)),
        width: Number((cropWidth / width).toFixed(6)),
        height: Number((cropHeight / height).toFixed(6)),
      },
      pinBottom: opts.pinBottom,
      padding: {
        left: opts.padLeft,
        right: opts.padRight,
        top: opts.padTop,
        bottom: opts.padBottom,
      },
      alphaThreshold: opts.threshold,
      frameStep: opts.step,
    },
  };
}

async function main() {
  const { dirs, opts } = parseArgs(process.argv.slice(2));
  const results = [];
  for (const dir of dirs) {
    console.error(`[analyze-alpha-crop] scanning ${dir}`);
    results.push(await analyzeDirectory(dir, opts));
  }
  const summary = buildSummary(results, opts);
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

main().catch((error) => {
  console.error(`[analyze-alpha-crop] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
