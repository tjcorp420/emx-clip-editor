const path = require('path');

const EXPORT_FOLDER_NAME = 'EMX Clip Studio Exports';

function safeExportName(suggestedName) {
  const candidate = path.basename(String(suggestedName || '')).replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim();
  if (!candidate) return `EMX_Clip_${Date.now()}.mp4`;
  return candidate.toLowerCase().endsWith('.mp4') ? candidate : `${candidate}.mp4`;
}

function exportDirectory(videosPath) {
  if (typeof videosPath !== 'string' || !path.isAbsolute(videosPath)) {
    throw new Error('A valid Windows Videos folder is required.');
  }
  return path.join(videosPath, EXPORT_FOLDER_NAME);
}

function defaultExportPath(videosPath, suggestedName) {
  return path.join(exportDirectory(videosPath), safeExportName(suggestedName));
}

module.exports = { EXPORT_FOLDER_NAME, safeExportName, exportDirectory, defaultExportPath };
