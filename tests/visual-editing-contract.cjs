const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const visual = require(path.join(root, 'electron', 'visuals.json'));
const exporter = fs.readFileSync(path.join(root, 'electron', 'exporter.cjs'), 'utf8');
const renderer = fs.readFileSync(path.join(root, 'src', 'main.js'), 'utf8');

assert.deepStrictEqual(Object.keys(visual.presets), ['none', 'vivid', 'cinematic', 'mono', 'retro', 'soft']);
assert.ok(visual.positions.includes('center') && visual.positions.includes('bottom-right'));
assert.deepStrictEqual(visual.transitionTypes, ['none', 'crossfade']);
assert.ok(visual.defaultOverlay.opacity >= .1 && visual.defaultOverlay.opacity <= 1);
assert.ok(exporter.includes('overlayClips'), 'Native exporter must accept timed image overlays.');
assert.ok(exporter.includes('videoTransitionFilters'), 'Native exporter must generate transition filters.');
assert.ok(exporter.includes('colorchannelmixer=aa='), 'Native exporter must apply overlay opacity.');
assert.ok(renderer.includes('previewClipOpacity'), 'Preview must use the same transition opacity model.');
assert.ok(renderer.includes('updateOverlayPreview'), 'Preview must render active image overlays.');

console.log('EMX VISUAL EDITING CONTRACT: PASS');
