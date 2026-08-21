const fs = require('fs');
const path = require('path');

const WATERMARK_POSITIONS = Object.freeze([
  'top-left', 'top-center', 'top-right',
  'center-left', 'center', 'center-right',
  'bottom-left', 'bottom-center', 'bottom-right'
]);

const DEFAULT_WATERMARK = Object.freeze({
  position: 'bottom-right',
  opacity: 0.78
});

function number(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function normalizeWatermark(input = {}) {
  return {
    position: WATERMARK_POSITIONS.includes(input.position) ? input.position : DEFAULT_WATERMARK.position,
    opacity: clamp(number(input.opacity, DEFAULT_WATERMARK.opacity), 0.5, 1)
  };
}

function watermarkRenderWidth(outputWidth) {
  return clamp(Math.round(number(outputWidth, 1920) * 0.16), 160, 512);
}

function watermarkMargin(outputWidth, outputHeight) {
  return clamp(Math.round(Math.min(number(outputWidth, 1920), number(outputHeight, 1080)) * 0.028), 16, 64);
}

function overlayXY(position, margin) {
  const safeMargin = Math.max(0, Math.round(number(margin, 24)));
  const horizontal = position.includes('left') ? String(safeMargin)
    : position.includes('right') ? `W-w-${safeMargin}`
      : '(W-w)/2';
  const vertical = position.includes('top') ? String(safeMargin)
    : position.includes('bottom') ? `H-h-${safeMargin}`
      : '(H-h)/2';
  return { x: horizontal, y: vertical };
}

function watermarkAssetPath({ isPackaged, resourcesPath, projectRoot }) {
  const assetPath = isPackaged
    ? path.join(resourcesPath, 'branding', 'EMXCLIPSWATERMARK-render.png')
    : path.join(projectRoot, 'build', 'branding', 'EMXCLIPSWATERMARK-render.png');
  if (!fs.existsSync(assetPath)) {
    throw new Error(`Permanent EMX Clips watermark resource is missing: ${assetPath}`);
  }
  return assetPath;
}

module.exports = {
  WATERMARK_POSITIONS,
  DEFAULT_WATERMARK,
  clamp,
  normalizeWatermark,
  watermarkRenderWidth,
  watermarkMargin,
  overlayXY,
  watermarkAssetPath
};
