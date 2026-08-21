const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const updater = fs.readFileSync(path.join(root, 'electron', 'updater.cjs'), 'utf8');
const main = fs.readFileSync(path.join(root, 'electron', 'main.cjs'), 'utf8');
const preload = fs.readFileSync(path.join(root, 'electron', 'preload.cjs'), 'utf8');
const builder = fs.readFileSync(path.join(root, 'electron-builder.config.cjs'), 'utf8');

for (const token of [
  'autoUpdater.autoDownload = false',
  "autoUpdater.autoInstallEvent = 'manual'",
  'autoUpdater.disableWebInstaller = true',
  "autoUpdater.quitAndInstall(true, true)",
  'update-downloaded',
  'download-progress'
]) {
  assert.ok(updater.includes(token), `Missing updater safety contract: ${token}`);
}

for (const token of [
  "ipcMain.handle('emx:update-status'",
  "ipcMain.handle('emx:update-check'",
  "ipcMain.handle('emx:update-download'",
  "ipcMain.handle('emx:update-install'",
  'watermarkAssetPath({'
]) {
  assert.ok(main.includes(token), `Missing main-process contract: ${token}`);
}

for (const token of ['updateStatus()', 'checkForUpdates()', 'downloadUpdate()', 'installUpdate()', 'onUpdateEvent(callback)']) {
  assert.ok(preload.includes(token), `Missing preload bridge: ${token}`);
}

assert.ok(builder.includes("EMX_ALLOW_INSECURE_LOCAL_UPDATE_TEST === '1'"), 'Loopback HTTP must require an explicit test-only flag.');
assert.ok(builder.includes('isLoopbackHttp'), 'Loopback HTTP test feed must not enable arbitrary insecure URLs.');
assert.ok(builder.includes('must be HTTPS. HTTP is allowed only for an explicit loopback smoke test.'), 'Production updater feeds must require HTTPS.');
assert.ok(builder.includes('extraMetadata'), 'Packaged update status must include release metadata.');
assert.ok(updater.includes('emxRelease?.signing'), 'Packaged Update Center must report the intended signing state.');
assert.ok(!updater.includes('setFeedURL'), 'Renderer-controlled update URLs are not allowed.');
assert.ok(!preload.includes('setUpdateUrl'), 'Preload must not expose a custom update URL setter.');

console.log('EMX UPDATE SERVICE CONTRACT: PASS');
