import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const nodeBin = process.execPath;
const launcherBuilder = path.join(repoRoot, 'scripts', 'build-launcher.mjs');
const sourceApp = path.join(repoRoot, 'launcher', 'build', 'CAST.app');
const applicationsDir = path.join(process.env.HOME || '', 'Applications');
const targetApp = path.join(applicationsDir, 'CAST.app');

execFileSync(nodeBin, [launcherBuilder], { cwd: repoRoot, stdio: 'inherit' });
fs.mkdirSync(applicationsDir, { recursive: true });
fs.rmSync(targetApp, { recursive: true, force: true });
execFileSync('cp', ['-R', sourceApp, targetApp], { stdio: 'inherit' });

console.log(`Installed launcher: ${targetApp}`);
