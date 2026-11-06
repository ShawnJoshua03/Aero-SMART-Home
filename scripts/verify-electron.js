// Run against a disposable profile in two separate Electron processes.
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'smart-home-electron-'));
try {
  for (const stage of ['interactions', 'restart']) {
    const result = spawnSync(require('electron'), [path.join(__dirname, 'verify-electron-app.js'), profile, stage], { stdio: 'inherit', timeout: 30000 });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exitCode = 1;
    if (process.exitCode) break;
  }
} finally {
  fs.rmSync(profile, { recursive: true, force: true });
}
