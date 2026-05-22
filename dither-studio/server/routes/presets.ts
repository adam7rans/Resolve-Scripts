import { Router } from 'express';
import * as fs from 'fs';
import {
  PRESETS_DIR,
  presetMeta,
  readPreset,
  slugify,
  uniquePresetSlug,
  writePreset,
} from '../helpers.js';

export const presetRoutes = Router();

presetRoutes.get('/', (_req, res) => {
  if (!fs.existsSync(PRESETS_DIR)) {
    res.json([]);
    return;
  }
  const items = fs.readdirSync(PRESETS_DIR)
    .filter((name) => name.endsWith('.json'))
    .map((name) => name.replace(/\.json$/i, ''))
    .map((id) => presetMeta(id))
    .filter((preset): preset is NonNullable<typeof preset> => !!preset)
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  res.json(items);
});

presetRoutes.post('/', (req, res) => {
  const { name, settings } = req.body as { name?: string; settings?: Record<string, any> };
  if (!name?.trim()) {
    res.status(400).json({ error: 'Name required' });
    return;
  }
  if (!settings || typeof settings !== 'object') {
    res.status(400).json({ error: 'Settings required' });
    return;
  }
  const id = uniquePresetSlug(slugify(name));
  const now = new Date().toISOString();
  writePreset(id, {
    id,
    name: name.trim(),
    createdAt: now,
    updatedAt: now,
    ...settings,
  });
  res.json({ id, name: name.trim(), createdAt: now, updatedAt: now });
});

presetRoutes.get('/:id', (req, res) => {
  const preset = readPreset(req.params.id);
  if (!preset) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json(preset);
});
