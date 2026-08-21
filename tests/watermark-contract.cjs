const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  WATERMARK_POSITIONS,
  normalizeWatermark,
  watermarkRenderWidth,
  watermarkMargin,
  overlayXY,
  watermarkAssetPath
} = require('../electron/branding.cjs');

assert.deepStrictEqual(WATERMARK_POSITIONS, [
  'top-left', 'top-center', 'top-right',
  'center-left', 'center', 'center-right',
  'bottom-left', 'bottom-center', 'bottom-right'
]);
assert.strictEqual(normalizeWatermark({ opacity: 0, position: 'top-left' }).opacity, 0.5);
assert.strictEqual(normalizeWatermark({ opacity: 4, position: 'bottom-center' }).opacity, 1);
assert.strictEqual(normalizeWatermark({ opacity: 0.65, position: 'invalid' }).position, 'bottom-right');
assert.strictEqual(watermarkRenderWidth(1920), 307);
assert.ok(watermarkMargin(1920, 1080) >= 16);
assert.deepStrictEqual(overlayXY('top-center', 24), { x: '(W-w)/2', y: '24' });
assert.deepStrictEqual(overlayXY('center-left', 24), { x: '24', y: '(H-h)/2' });

const asset = watermarkAssetPath({
  isPackaged: false,
  resourcesPath: '',
  projectRoot: path.join(__dirname, '..')
});
assert.ok(fs.existsSync(asset));
assert.ok(asset.endsWith(path.join('build', 'branding', 'EMXCLIPSWATERMARK-render.png')));

console.log('EMX PERMANENT WATERMARK CONTRACT: PASS');
