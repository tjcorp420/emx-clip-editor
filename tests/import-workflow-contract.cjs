const assert = require('assert');
const fs = require('fs');
const path = require('path');

const main = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.cjs'), 'utf8');
const preload = fs.readFileSync(path.join(__dirname, '..', 'electron', 'preload.cjs'), 'utf8');
const renderer = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');

for (const token of [
  "protocol.registerSchemesAsPrivileged([{scheme:'emx-media'",
  "protocol.handle('emx-media'",
  "ipcMain.handle('emx:choose-import-folder'",
  "ipcMain.handle('emx:set-default-import-folder'",
  "ipcMain.handle('emx:select-import-media'",
  "ipcMain.handle('emx:import-folder-media'",
  "ipcMain.handle('emx:release-media-token'",
  'defaultImportFolder',
  'createMediaDescriptor',
  "request.headers.get('range')",
  'headers:{Range:range}',
  "headers.set('Access-Control-Allow-Origin','*')",
  "['.png','image/png']",
  'Video, audio, and image overlays'
]) assert.ok(main.includes(token), `Missing trusted import workflow token: ${token}`);

for (const token of [
  'chooseImportFolder()',
  'setDefaultImportFolder(folderPath)',
  'selectImportMedia()',
  'importFolderMedia(folderPath)',
  'releaseMediaToken(mediaToken)'
]) assert.ok(preload.includes(token), `Missing preload import method: ${token}`);

assert.ok(!main.includes("webSecurity:false"), 'The import workflow must not weaken Electron web security.');
assert.ok(renderer.includes("normalizeImportInput(item"), 'Renderer imports must normalize trusted desktop descriptors before File-only work.');
assert.ok(renderer.includes("String(file.type||'').startsWith('audio/')"), 'Waveform extraction must safely reject descriptor-only imports.');
assert.ok(renderer.includes('accept="video/*,audio/*,image/png,image/jpeg,image/webp,image/gif"'), 'Selective import must explicitly allow supported image overlays.');
assert.ok(renderer.includes("mediaKind(mime,name='')") && renderer.includes("return 'image'"), 'Renderer import classification must preserve image media.');
console.log('EMX IMPORT WORKFLOW CONTRACT: PASS');
