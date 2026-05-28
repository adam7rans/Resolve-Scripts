import type { NativeImportResult } from './projectApi.types';
import { BASE, uploadForm } from './projectApi.shared';

export async function uploadVideo(id: string, file: File, onProgress?: (pct: number) => void): Promise<{ ok: boolean; filename: string }> {
  return uploadForm(`${BASE}/projects/${id}/video`, (form) => form.append('video', file), onProgress);
}

export async function importNativeMedia(id: string): Promise<NativeImportResult> {
  const res = await fetch(`${BASE}/projects/${id}/import-native`, { method: 'POST' });
  if (!res.ok) {
    let message = `Import failed: ${res.status}`;
    try {
      const data = await res.json() as { error?: string };
      if (data?.error) message = data.error;
    } catch {}
    throw new Error(message);
  }
  return res.json();
}

export async function uploadCaption(id: string, data: unknown): Promise<{ ok: boolean; filename: string }> {
  const res = await fetch(`${BASE}/projects/${id}/caption`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to save caption JSON');
  return res.json();
}

export function getVideoUrl(id: string): string {
  return `${BASE}/projects/${id}/video`;
}

export function getAudioUrl(id: string): string {
  return `${BASE}/projects/${id}/audio`;
}

export function getMusicUrl(id: string): string {
  return `${BASE}/projects/${id}/music`;
}

export function getMusicAssetUrl(id: string, assetId: string): string {
  return `${BASE}/projects/${id}/music/${assetId}`;
}

export async function deleteMusic(id: string): Promise<void> {
  await fetch(`${BASE}/projects/${id}/music`, { method: 'DELETE' });
}

export async function deleteMusicAsset(id: string, assetId: string): Promise<void> {
  await fetch(`${BASE}/projects/${id}/music/${assetId}`, { method: 'DELETE' });
}

export async function uploadMusic(
  id: string,
  file: File,
  onProgress?: (pct: number) => void,
): Promise<{ ok: boolean; filename: string; originalName?: string }> {
  return uploadForm(`${BASE}/projects/${id}/music`, (form) => form.append('music', file), onProgress);
}

export async function uploadMusicFiles(
  id: string,
  files: File[],
  onProgress?: (pct: number) => void,
): Promise<{ ok: boolean; assets: Array<{ id: string; filename: string; originalName: string }> }> {
  return uploadForm(`${BASE}/projects/${id}/music-library`, (form) => {
    files.forEach((file) => form.append('music', file));
  }, onProgress);
}

export async function uploadAudio(id: string, file: File, onProgress?: (pct: number) => void): Promise<{ ok: boolean; filename: string }> {
  return uploadForm(`${BASE}/projects/${id}/audio`, (form) => form.append('audio', file), onProgress);
}

export async function getTranscript(id: string): Promise<any | null> {
  const res = await fetch(`${BASE}/projects/${id}/transcript`);
  if (!res.ok) return null;
  return res.json();
}

export function openEventStream(
  id: string,
  onEvent: (event: { type: string; message: string; [key: string]: any }) => void,
): () => void {
  const source = new EventSource(`${BASE}/projects/${id}/stream`);
  source.onmessage = (event) => {
    try {
      onEvent(JSON.parse(event.data));
    } catch {}
  };
  return () => source.close();
}
