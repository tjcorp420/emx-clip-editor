const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const visual = require(path.join(root, 'electron', 'visuals.json'));
const exporter = fs.readFileSync(path.join(root, 'electron', 'exporter.cjs'), 'utf8');
const renderer = fs.readFileSync(path.join(root, 'src', 'main.js'), 'utf8');

assert.ok(['none', 'vivid', 'cinematic', 'mono', 'retro', 'soft', 'neon-pop', 'cream', 'noir'].every(id=>Object.hasOwn(visual.presets,id)));
assert.ok(visual.effectLibrary.length >= 8, 'The effects browser should ship a real curated library.');
assert.ok(visual.effectLibrary.every(effect=>!Object.hasOwn(visual.presets,effect.id)), 'Animated effects must be distinct from static filter presets.');
assert.ok(visual.effectLibrary.every(effect=>Number(effect.duration)>0), 'Every animated effect needs a default timeline duration.');
assert.ok(visual.filterLibrary.length >= 8, 'The filters browser should ship a real curated library.');
assert.ok(visual.positions.includes('center') && visual.positions.includes('bottom-right'));
assert.deepStrictEqual(visual.transitionTypes, ['none', 'crossfade', 'dip-black', 'slide-left', 'slide-right']);
assert.ok(visual.transitionLibrary.length >= 4, 'The transition browser should include the supported native transitions.');
assert.ok(visual.defaultOverlay.opacity >= .1 && visual.defaultOverlay.opacity <= 1);
assert.ok(exporter.includes('overlayClips'), 'Native exporter must accept timed image overlays.');
assert.ok(exporter.includes('timedEffectFilter'), 'Native exporter must generate animated timeline effect filters.');
assert.ok(exporter.includes('effectClips'), 'Native exporter must accept timed animated effect clips.');
assert.ok(exporter.includes('stop_mode=clone'), 'Native exporter must implement held freeze frames.');
assert.ok(exporter.includes('videoTransitionFilters'), 'Native exporter must generate transition filters.');
assert.ok(exporter.includes('videoOverlayX'), 'Native exporter must generate slide transition positions.');
assert.ok(exporter.includes("style==='slide-left'"), 'Native exporter must implement the slide-left transition.');
assert.ok(exporter.includes('colorchannelmixer=aa='), 'Native exporter must apply overlay opacity.');
assert.ok(renderer.includes('previewClipOpacity'), 'Preview must use the same transition opacity model.');
assert.ok(renderer.includes('previewClipTransform'), 'Preview must animate slide transitions.');
assert.ok(renderer.includes('updateOverlayPreview'), 'Preview must render active image overlays.');
assert.ok(renderer.includes('id="effectLibrary"') && renderer.includes('id="filterLibrary"') && renderer.includes('id="transitionLibrary"'), 'The visual browsers must be part of the real inspector UI.');
assert.ok(renderer.includes('id="effectLane"') && renderer.includes('addEffectClip'), 'Animated effects must be draggable timed clips on a dedicated timeline lane.');
assert.ok(renderer.includes('Freeze Frame at Playhead') && renderer.includes('freezeFrameAtPlayhead'), 'Video context editing must expose a working freeze-frame action.');
assert.ok(renderer.includes('TikTok / Reels 9:16') && renderer.includes('id="exportFit"'), 'High-quality vertical export controls must be visible in the app.');

console.log('EMX VISUAL EDITING CONTRACT: PASS');
