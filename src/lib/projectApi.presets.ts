import type { PresetData, PresetMeta } from './projectApi.types';
import { BASE, fetchJson } from './projectApi.shared';

export async function listPresets(): Promise<PresetMeta[]> {
  const res = await fetch(`${BASE}/presets`);
  if (!res.ok) return [];
  return res.json();
}

export async function createPreset(name: string, settings: Record<string, any>): Promise<PresetMeta> {
  return fetchJson(`${BASE}/presets`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, settings }),
  }, 'Failed to create preset');
}

export async function getPreset(id: string): Promise<PresetData> {
  return fetchJson(`${BASE}/presets/${id}`, undefined, 'Preset not found');
}
