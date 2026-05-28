import type { ProjectData, ProjectMeta } from './projectApi.types';
import { BASE, fetchJson } from './projectApi.shared';

export async function listProjects(): Promise<ProjectMeta[]> {
  const res = await fetch(`${BASE}/projects`);
  if (!res.ok) return [];
  return res.json();
}

export async function createProject(name: string): Promise<{ id: string; name: string }> {
  return fetchJson(`${BASE}/projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  }, 'Failed to create project');
}

export async function getProject(id: string): Promise<ProjectData> {
  return fetchJson(`${BASE}/projects/${id}`, undefined, 'Project not found');
}

export async function saveSettings(id: string, settings: Record<string, any>): Promise<void> {
  await fetch(`${BASE}/projects/${id}/settings`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(settings),
  });
}
