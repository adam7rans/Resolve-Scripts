import express from 'express';
import cors from 'cors';
import { projectRoutes } from './routes/projects.js';
import { mediaRoutes } from './routes/media.js';
import { exportRoutes } from './routes/exports.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '25mb' }));

// Mount route modules
app.use('/api/projects', projectRoutes);
app.use('/api/projects', mediaRoutes);
app.use('/api/projects', exportRoutes);

app.listen(3001, () => console.log('Dither Studio API → http://localhost:3001'));
