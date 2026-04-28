export interface ProjectMeta {
  id: string;
  name: string;
  createdAt: string;
  updatedAt?: string;
  hasVideo: boolean;
  hasTranscript: boolean;
}

export interface ProjectData extends ProjectMeta {
  videoFile?: string;
  [key: string]: any;
}

const BASE = '/api';

export async function listProjects(): Promise<ProjectMeta[]> {
  const res = await fetch(`${BASE}/projects`);
  if (!res.ok) return [];
  return res.json();
}

export async function createProject(name: string): Promise<{ id: string; name: string }> {
  const res = await fetch(`${BASE}/projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error('Failed to create project');
  return res.json();
}

export async function getProject(id: string): Promise<ProjectData> {
  const res = await fetch(`${BASE}/projects/${id}`);
  if (!res.ok) throw new Error('Project not found');
  return res.json();
}

export async function saveSettings(id: string, settings: Record<string, any>): Promise<void> {
  await fetch(`${BASE}/projects/${id}/settings`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(settings),
  });
}

export async function uploadVideo(
  id: string,
  file: File,
  onProgress?: (pct: number) => void,
): Promise<{ ok: boolean; filename: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${BASE}/projects/${id}/video`);
    if (onProgress) {
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      });
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve(JSON.parse(xhr.responseText));
      else reject(new Error(`Upload failed: ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error('Network error'));
    const form = new FormData();
    form.append('video', file);
    xhr.send(form);
  });
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

export async function getTranscript(id: string): Promise<any | null> {
  const res = await fetch(`${BASE}/projects/${id}/transcript`);
  if (!res.ok) return null;
  return res.json();
}

export function openEventStream(
  id: string,
  onEvent: (event: { type: string; message: string; [k: string]: any }) => void,
): () => void {
  const es = new EventSource(`${BASE}/projects/${id}/stream`);
  es.onmessage = (e) => {
    try { onEvent(JSON.parse(e.data)); } catch {}
  };
  return () => es.close();
}
