import { BASE, fetchJson } from './projectApi.shared';

interface CreateProjectExportInput {
  prefix: string;
  width: number;
  height: number;
  fps: number;
  totalFrames: number;
  exportMode?: 'master' | 'web';
  preserveAlpha?: boolean;
  startTime?: number;
  duration?: number;
  baseDuration?: number;
  outroDuration?: number;
  musicOutputStartTime?: number;
  keptSegments?: Array<{ srcStart: number; srcEnd: number }>;
  layers: Record<string, boolean>;
  musicTimelineClips?: Array<{
    id: string;
    assetId: string;
    trackIndex: 0 | 1;
    startSecond: number;
    durationSecond: number;
    sourceOffsetSecond: number;
    fadeInSecond: number;
    fadeOutSecond: number;
    color: string;
  }>;
  musicSnapshot?: Record<string, any>;
  limiter?: Record<string, any>;
  ui?: {
    mediaVolume?: number;
    outroVolume?: number;
  };
}

export async function createProjectExport(
  id: string,
  data: CreateProjectExportInput,
): Promise<{ ok: boolean; exportId: string; folder: string }> {
  return fetchJson(`${BASE}/projects/${id}/exports`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(data),
  }, 'Failed to create project export folder');
}

export async function uploadExportFrame(id: string, exportId: string, filename: string, blob: Blob): Promise<void> {
  const form = new FormData();
  form.append('filename', filename);
  form.append('frame', blob, filename);
  const res = await fetch(`${BASE}/projects/${id}/exports/${exportId}/frame`, { method: 'POST', body: form });
  if (!res.ok) throw new Error(`Failed to save ${filename}`);
}

export async function finishProjectExport(
  id: string,
  exportId: string,
): Promise<{ ok: boolean; folder: string; videoFile?: string; error?: string }> {
  return fetchJson(`${BASE}/projects/${id}/exports/${exportId}/finish`, { method: 'POST' }, 'Failed to finish project export');
}

export async function openExportFolder(id: string, exportId: string): Promise<void> {
  await fetch(`${BASE}/projects/${id}/exports/${exportId}/open`, { method: 'POST' });
}
