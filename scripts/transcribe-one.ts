import * as fs from 'fs';
import * as path from 'path';
import { runTranscriptionPipeline } from '../server/transcribe.js';

const projectId = process.argv[2];
if (!projectId) {
  console.error('Usage: tsx scripts/transcribe-one.ts <project-id>');
  process.exit(1);
}

const projectDir = path.join(process.cwd(), 'projects', projectId);
const projectJson = JSON.parse(
  fs.readFileSync(path.join(projectDir, 'project.json'), 'utf-8'),
) as { videoFile?: string };
if (!projectJson.videoFile) {
  console.error(`Project ${projectId} has no videoFile`);
  process.exit(1);
}
const videoPath = path.join(projectDir, projectJson.videoFile);

runTranscriptionPipeline(videoPath, projectDir, (e) => {
  console.log(`[${e.type}]`, e.message || '');
  if (e.type === 'done') {
    const projPath = path.join(projectDir, 'project.json');
    const proj = JSON.parse(fs.readFileSync(projPath, 'utf-8'));
    proj.captionFile = 'caption.json';
    proj.updatedAt = new Date().toISOString();
    fs.writeFileSync(projPath, JSON.stringify(proj, null, 2));
  }
}).then(() => process.exit(0));
