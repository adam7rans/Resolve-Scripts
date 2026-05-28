import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import type { Router } from 'express';
import {
  projectDir,
  readProject,
  writeProject,
} from '../helpers.js';
import {
  ensureMusicLibrary,
  musicUpload,
  streamRangedAudio,
} from './mediaRoutes.shared.js';

export function registerMusicRoutes(mediaRoutes: Router) {
  mediaRoutes.post('/:id/music-library', musicUpload.array('music', 64), (req, res) => {
    const id = req.params.id as string;
    const project = readProject(id);
    const files = (req.files as Array<{ filename: string; originalname: string }> | undefined) ?? [];
    if (!project || files.length === 0) {
      res.status(400).json({ error: 'Bad request' });
      return;
    }

    const library = ensureMusicLibrary(project);
    const added = files.map((file) => {
      const asset = {
        id: randomUUID(),
        filename: file.filename,
        originalName: file.originalname,
      };
      library.push(asset);
      return asset;
    });
    project.updatedAt = new Date().toISOString();
    writeProject(id, project);
    res.json({ ok: true, assets: added });
  });

  mediaRoutes.post('/:id/music', musicUpload.single('music'), (req, res) => {
    const id = req.params.id as string;
    const project = readProject(id);
    if (!project || !req.file) {
      res.status(400).json({ error: 'Bad request' });
      return;
    }

    const library = ensureMusicLibrary(project);
    const asset = {
      id: randomUUID(),
      filename: req.file.filename,
      originalName: req.file.originalname,
    };
    library.push(asset);
    project.updatedAt = new Date().toISOString();
    writeProject(id, project);
    res.json({
      ok: true,
      assets: [asset],
      filename: req.file.filename,
      originalName: req.file.originalname,
    });
  });

  mediaRoutes.delete('/:id/music/:assetId', (req, res) => {
    const id = req.params.id as string;
    const assetId = req.params.assetId as string;
    const project = readProject(id);
    if (!project) {
      res.status(404).json({ error: 'Not found' });
      return;
    }

    const library = ensureMusicLibrary(project);
    const asset = library.find((item) => item.id === assetId);
    if (!asset) {
      res.status(404).json({ error: 'Music asset not found' });
      return;
    }

    try { fs.unlinkSync(path.join(projectDir(id), asset.filename)); } catch {}
    project.musicFiles = library.filter((item) => item.id !== assetId);
    if (asset.filename === project.musicFile || assetId === 'legacy-music') {
      delete project.musicFile;
      delete project.originalMusicName;
    }
    project.updatedAt = new Date().toISOString();
    writeProject(id, project);
    res.json({ ok: true });
  });

  mediaRoutes.delete('/:id/music', (req, res) => {
    const id = req.params.id as string;
    const project = readProject(id);
    if (!project) {
      res.status(404).json({ error: 'Not found' });
      return;
    }

    const library = ensureMusicLibrary(project);
    for (const asset of library) {
      try { fs.unlinkSync(path.join(projectDir(id), asset.filename)); } catch {}
    }
    project.musicFiles = [];
    delete project.musicFile;
    delete project.originalMusicName;
    project.updatedAt = new Date().toISOString();
    writeProject(id, project);
    res.json({ ok: true });
  });

  mediaRoutes.get('/:id/music/:assetId', (req, res) => {
    const project = readProject(req.params.id);
    if (!project) return void res.status(404).json({ error: 'No music' });

    const library = ensureMusicLibrary(project);
    const asset = library.find((item) => item.id === req.params.assetId);
    if (!asset) return void res.status(404).json({ error: 'No music asset' });

    const musicPath = path.join(projectDir(req.params.id), asset.filename);
    if (!fs.existsSync(musicPath)) {
      return void res.status(404).json({ error: 'File not found' });
    }
    streamRangedAudio(musicPath, asset.filename, req, res);
  });

  mediaRoutes.get('/:id/music', (req, res) => {
    const project = readProject(req.params.id);
    if (!project) return void res.status(404).json({ error: 'No music' });

    const library = ensureMusicLibrary(project);
    const asset = library[0];
    if (!asset) return void res.status(404).json({ error: 'No music' });

    const musicPath = path.join(projectDir(req.params.id), asset.filename);
    if (!fs.existsSync(musicPath)) {
      return void res.status(404).json({ error: 'File not found' });
    }
    streamRangedAudio(musicPath, asset.filename, req, res);
  });
}
