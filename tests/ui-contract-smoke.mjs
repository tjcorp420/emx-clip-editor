import fs from 'node:fs';
import assert from 'node:assert/strict';

const s=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');

for(const token of [
  'id="undoLastBtn"',
  'id="undoBtn"',
  'id="redoBtn"',
  'data-action="delete"',
  'DELETE CLIP',
  "addEventListener('pointerdown'",
  "addEventListener('pointerup'",
  'id="renderPercent"',
  'id="topTask"',
  'id="aiRepairBtn"',
  'id="aiProcessBtn"',
  'autoEnsureAiReady',
  'EMX MANAGED / FRIEND READY',
  'Remove Voices',
  'Game Audio Focus',
  'id="mediaSearch"',
  'id="mediaGrid"',
  'id="mediaCompact"',
  'id="mediaListView"',
  'id="mediaContext"',
  'PERMANENT EMX CLIPS WATERMARK',
  'id="watermarkPosition"',
  'id="watermarkOpacity"',
  'min=".5"',
  'id="mediaSelectionBar"',
  'id="addSelectedMedia"',
  'id="removeSelectedMedia"',
  'id="folderModeModal"',
  'id="folderImportAll"',
  'id="folderSetDefault"',
  'Ctrl/Shift',
  'id="updateIndicator"',
  'id="insUpdates"',
  'id="checkUpdatesBtn"',
  'id="downloadUpdateBtn"',
  'id="installUpdateBtn"',
  'id="appVersionLabel"',
  'notifyManualUpdateCheck',
  'is already up to date.',
  'hydrateUpdateCenter'
]){
  assert.ok(s.includes(token),`Missing UI contract token: ${token}`);
}

assert.ok(!s.includes('id="aiSetupBtn"'),'V1.7.1 must not restore the old manual Audio AI install button.');

for (const retiredCustomization of [
  'id="watermarkEnabled"',
  'id="watermarkChoose"',
  'id="watermarkText"',
  'id="watermarkMode"',
  'id="watermarkColor"',
  'id="watermarkSize"',
  'id="watermarkMargin"'
]) {
  assert.ok(!s.includes(retiredCustomization), `Permanent watermark must not expose ${retiredCustomization}.`);
}

for (const token of [
  'selectedMediaIds:new Set()',
  'selectedClipIds:new Set()',
  'selectIds({',
  'timelineClipAtTime',
  'previewRequestId',
  'selectImportMedia',
  'importFolderMedia',
  'Set as Default Import Folder',
  '50%–100%'
]) {
  assert.ok(s.includes(token), `V1.9.0 selection/import contract missing ${token}.`);
}

for (const token of [
  'id="filterImage"',
  'id="overlayLane"',
  'id="addOverlayTrack"',
  'id="previewOverlayLayer"',
  'id="previewTransitionVideo"',
  'id="clipVisualPreset"',
  'id="transitionOut"',
  'Cross Fade',
  'updateOverlayPreview',
  'configureCrossFade',
  'overlayClips:[]'
]) {
  assert.ok(s.includes(token), `V1.9 visual editing contract missing ${token}.`);
}

console.log('EMX UI CONTRACT SMOKE TEST: PASS');
