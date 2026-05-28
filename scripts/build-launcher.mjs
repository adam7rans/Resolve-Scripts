import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const appName = 'CAST';
const buildDir = path.join(repoRoot, 'launcher', 'build');
const appBundle = path.join(buildDir, `${appName}.app`);
const iconSource = path.join(repoRoot, 'branding', 'cast-icon.svg');
const iconPath = path.join(buildDir, `${appName}.icns`);

function rmrf(target) {
  fs.rmSync(target, { recursive: true, force: true });
}

function ensureDir(target) {
  fs.mkdirSync(target, { recursive: true });
}

function run(cmd, args, options = {}) {
  execFileSync(cmd, args, { stdio: 'pipe', ...options });
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\"'\"'`)}'`;
}

function renderMasterPng() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cast-icon-'));
  const outPng = path.join(tmpDir, 'cast-icon.png');
  try {
    run('rsvg-convert', ['-w', '1024', '-h', '1024', iconSource, '-o', outPng]);
    if (fs.existsSync(outPng)) return outPng;
  } catch {}
  try {
    run('qlmanage', ['-t', '-s', '1024', '-o', tmpDir, iconSource]);
    const png = fs.readdirSync(tmpDir).find((name) => name.endsWith('.png'));
    if (png) return path.join(tmpDir, png);
  } catch {}
  throw new Error('Failed to rasterize launcher icon. Install librsvg: brew install librsvg');
}

function buildIcon() {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cast-iconset-'));
  const iconsetDir = path.join(workDir, `${appName}.iconset`);
  const tempIcns = path.join(workDir, `${appName}.icns`);
  ensureDir(iconsetDir);
  const masterPng = renderMasterPng();
  const sizes = [
    ['icon_16x16.png', 16],
    ['icon_16x16@2x.png', 32],
    ['icon_32x32.png', 32],
    ['icon_32x32@2x.png', 64],
    ['icon_128x128.png', 128],
    ['icon_128x128@2x.png', 256],
    ['icon_256x256.png', 256],
    ['icon_256x256@2x.png', 512],
    ['icon_512x512.png', 512],
    ['icon_512x512@2x.png', 1024],
  ];
  for (const [name, size] of sizes) {
    run('sips', ['-z', String(size), String(size), masterPng, '--out', path.join(iconsetDir, name)]);
  }
  run('iconutil', ['-c', 'icns', iconsetDir, '-o', tempIcns]);
  fs.copyFileSync(tempIcns, iconPath);
}

function buildRunnerScript() {
  const runnerPath = path.join(appBundle, 'Contents', 'Resources', 'cast-launcher.sh');
  const launchLog = '$HOME/Library/Logs/CAST/launcher.log';
  const buildLog = '$HOME/Library/Logs/CAST/build.log';
  const script = `#!/bin/zsh
set -euo pipefail
REPO_DIR=${shellQuote(repoRoot)}
HOST="\${CAST_HOST:-127.0.0.1}"
PORT="\${CAST_PORT:-4312}"
APP_URL="http://\${HOST}:\${PORT}/"
mkdir -p "$HOME/Library/Logs/CAST"

is_up() {
  curl --silent --fail "$APP_URL" >/dev/null 2>&1
}

if [ ! -f "$REPO_DIR/dist/index.html" ]; then
  /bin/zsh -lc "cd ${shellQuote(repoRoot)} && npm run build" >>${buildLog} 2>&1
fi

if ! is_up; then
  nohup /bin/zsh -lc "cd ${shellQuote(repoRoot)} && CAST_HOST=\\"$HOST\\" CAST_PORT=\\"$PORT\\" npm run start:app" >>${launchLog} 2>&1 &
  for _ in {1..80}; do
    if is_up; then
      break
    fi
    sleep 0.25
  done
fi

open "$APP_URL"
`;
  fs.writeFileSync(runnerPath, script, { mode: 0o755 });
}

function buildAppletBundle() {
  const scriptSource = path.join(buildDir, 'cast-launcher.applescript');
  const applescript = `on run
  set runnerPath to POSIX path of ((path to me as text) & "Contents:Resources:cast-launcher.sh")
  do shell script "/bin/zsh " & quoted form of runnerPath & " >/dev/null 2>&1 &"
end run
`;
  fs.writeFileSync(scriptSource, applescript);
  run('osacompile', ['-o', appBundle, scriptSource]);
}

ensureDir(buildDir);
rmrf(appBundle);
buildIcon();
buildAppletBundle();
ensureDir(path.join(appBundle, 'Contents', 'Resources'));
rmrf(path.join(appBundle, 'Contents', 'Resources', 'Assets.car'));
buildRunnerScript();
fs.copyFileSync(iconPath, path.join(appBundle, 'Contents', 'Resources', 'applet.icns'));
fs.copyFileSync(iconPath, path.join(appBundle, 'Contents', 'Resources', `${appName}.icns`));

console.log(`Built launcher: ${appBundle}`);
