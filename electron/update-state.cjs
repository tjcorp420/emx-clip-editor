const UPDATE_STATES = Object.freeze({
  READY: 'READY',
  CHECKING: 'CHECKING FOR UPDATE',
  UP_TO_DATE: 'UP TO DATE',
  AVAILABLE: 'UPDATE AVAILABLE',
  DOWNLOADING: 'DOWNLOADING',
  VERIFYING: 'VERIFYING',
  READY_TO_INSTALL: 'READY TO INSTALL',
  INSTALLING: 'INSTALLING',
  RESTARTING: 'RESTARTING',
  FAILED: 'UPDATE FAILED',
  OFFLINE: 'OFFLINE'
});

function finite(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function normalizeProgress(progress = {}) {
  const total = Math.max(0, finite(progress.total));
  const transferred = clamp(finite(progress.transferred), 0, total || Number.MAX_SAFE_INTEGER);
  const percent = clamp(finite(progress.percent, total ? transferred / total * 100 : 0), 0, 100);
  return {
    percent,
    transferred,
    total,
    bytesPerSecond: Math.max(0, finite(progress.bytesPerSecond))
  };
}

function isOfflineError(error) {
  const message = String(error?.message || error || '').toLowerCase();
  return /enotfound|econnrefused|enetunreach|eai_again|network|offline|timed out|timeout|socket hang up/.test(message);
}

function releaseNotesText(releaseNotes) {
  if (Array.isArray(releaseNotes)) {
    return releaseNotes.map(note => typeof note === 'string' ? note : note?.note || '').filter(Boolean).join('\n\n');
  }
  return typeof releaseNotes === 'string' ? releaseNotes : '';
}

module.exports = {
  UPDATE_STATES,
  normalizeProgress,
  isOfflineError,
  releaseNotesText
};
