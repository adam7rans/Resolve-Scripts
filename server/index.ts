import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { projectRoutes } from './routes/projects.js';
import { mediaRoutes } from './routes/media.js';
import { exportRoutes } from './routes/exports.js';
import { presetRoutes } from './routes/presets.js';
import { APP_HOST, APP_NAME, APP_PORT, DIST_DIR } from './helpers.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '25mb' }));

// Mount route modules
app.use('/api/projects', projectRoutes);
app.use('/api/projects', mediaRoutes);
app.use('/api/projects', exportRoutes);
app.use('/api/presets', presetRoutes);

const serveStaticApp = process.env.CAST_SERVE_STATIC === '1' || process.env.CAST_SERVE_STATIC === 'true';
if (serveStaticApp && fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  app.get(/^\/(?!api(?:\/|$)).*/, (_req, res) => {
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
}

app.listen(APP_PORT, APP_HOST, () => {
  const baseUrl = `http://${APP_HOST}:${APP_PORT}`;
  console.log(`${APP_NAME} ${serveStaticApp ? 'app' : 'API'} -> ${baseUrl}`);
});
