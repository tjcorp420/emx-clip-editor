const assert = require('assert');
const path = require('path');
const { EXPORT_FOLDER_NAME, safeExportName, exportDirectory, defaultExportPath } = require('../electron/export-paths.cjs');

const videos = path.resolve('C:\\Users\\Example\\Videos');
assert.strictEqual(exportDirectory(videos), path.join(videos, EXPORT_FOLDER_NAME));
assert.strictEqual(defaultExportPath(videos, 'My TikTok.mp4'), path.join(videos, EXPORT_FOLDER_NAME, 'My TikTok.mp4'));
assert.strictEqual(safeExportName('..\\unsafe:name'), 'unsafe_name.mp4');
assert.strictEqual(safeExportName('result.MP4'), 'result.MP4');
assert.throws(()=>exportDirectory('relative-videos'));

const main = require('fs').readFileSync(path.join(__dirname, '..', 'electron', 'main.cjs'), 'utf8');
assert.ok(main.includes('fs.mkdirSync(outputDirectory,{recursive:true})'), 'The dedicated export folder must be created before the save dialog opens.');
assert.ok(main.includes("ipcMain.handle('emx:open-path'"), 'The completion screen must be able to open its verified MP4.');

console.log('EMX EXPORT PATHS SMOKE: PASS');
