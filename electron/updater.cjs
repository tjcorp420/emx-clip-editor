const fs = require('fs');
const path = require('path');
const { autoUpdater } = require('electron-updater');
const { UPDATE_STATES, normalizeProgress, isOfflineError, releaseNotesText } = require('./update-state.cjs');

function safeJsonRead(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

class EmxUpdateService {
  constructor({ app, sendUpdate }) {
    this.app = app;
    this.sendUpdate = sendUpdate;
    this.statePath = path.join(app.getPath('userData'), 'update-center-state.json');
    const saved = safeJsonRead(this.statePath, {});
    this.configured = false;
    this.initialized = false;
    this.state = {
      status: UPDATE_STATES.READY,
      currentVersion: app.getVersion(),
      latestVersion: null,
      channel: this.releaseChannel(),
      lastCheckedAt: saved.lastCheckedAt || null,
      releaseNotes: '',
      progress: normalizeProgress(),
      configured: false,
      signing: this.signingState(),
      message: 'Update Center is ready.'
    };
  }

  signingState() {
    try {
      const packageJson = require('../package.json');
      if (typeof packageJson?.emxRelease?.signing === 'string') return packageJson.emxRelease.signing;
      return packageJson?.build?.win?.signExecutable === false ? 'unsigned build' : 'signing configuration unknown';
    } catch {
      return 'unsigned build';
    }
  }

  releaseChannel() {
    try {
      return require('../package.json')?.emxRelease?.updateChannel || 'latest';
    } catch {
      return 'latest';
    }
  }

  updateConfigPath() {
    return path.join(process.resourcesPath, 'app-update.yml');
  }

  getState() {
    return { ...this.state, progress: { ...this.state.progress } };
  }

  persist() {
    try {
      fs.mkdirSync(path.dirname(this.statePath), { recursive: true });
      fs.writeFileSync(this.statePath, JSON.stringify({ lastCheckedAt: this.state.lastCheckedAt }, null, 2), 'utf8');
    } catch {
      // Update checks must remain usable when the last-check timestamp cannot be persisted.
    }
  }

  publish(patch = {}) {
    this.state = { ...this.state, ...patch, progress: patch.progress ? { ...patch.progress } : this.state.progress };
    this.persist();
    this.sendUpdate(this.getState());
    return this.getState();
  }

  initialize() {
    if (this.initialized) return this.getState();
    this.initialized = true;

    if (!this.app.isPackaged) {
      return this.publish({
        status: UPDATE_STATES.OFFLINE,
        configured: false,
        message: 'Updates are unavailable in development mode. Build an NSIS installer with EMX_UPDATE_BASE_URL configured.'
      });
    }

    if (!fs.existsSync(this.updateConfigPath())) {
      return this.publish({
        status: UPDATE_STATES.OFFLINE,
        configured: false,
        message: 'No production update feed is configured for this build.'
      });
    }

    this.configured = true;
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallEvent = 'manual';
    autoUpdater.disableWebInstaller = true;
    autoUpdater.logger = null;

    autoUpdater.on('checking-for-update', () => {
      this.publish({ status: UPDATE_STATES.CHECKING, message: 'Checking the configured EMX update feed…', progress: normalizeProgress() });
    });
    autoUpdater.on('update-available', info => {
      this.publish({
        status: UPDATE_STATES.AVAILABLE,
        latestVersion: info.version || null,
        releaseNotes: releaseNotesText(info.releaseNotes),
        message: `Version ${info.version || 'unknown'} is ready to download.`,
        progress: normalizeProgress()
      });
    });
    autoUpdater.on('update-not-available', info => {
      this.publish({
        status: UPDATE_STATES.UP_TO_DATE,
        latestVersion: info.version || this.app.getVersion(),
        message: 'EMX Clip Studio is up to date.',
        progress: normalizeProgress()
      });
    });
    autoUpdater.on('download-progress', progress => {
      this.publish({
        status: UPDATE_STATES.DOWNLOADING,
        progress: normalizeProgress(progress),
        message: 'Downloading the verified update package…'
      });
    });
    autoUpdater.on('update-downloaded', info => {
      this.publish({
        status: UPDATE_STATES.READY_TO_INSTALL,
        latestVersion: info.version || this.state.latestVersion,
        releaseNotes: releaseNotesText(info.releaseNotes) || this.state.releaseNotes,
        progress: normalizeProgress({ percent: 100, transferred: this.state.progress.total, total: this.state.progress.total }),
        message: 'Download verification complete. Install when you are ready to restart.'
      });
    });
    autoUpdater.on('error', error => {
      this.publish({
        status: isOfflineError(error) ? UPDATE_STATES.OFFLINE : UPDATE_STATES.FAILED,
        message: String(error?.message || error || 'Update failed.'),
        progress: normalizeProgress()
      });
    });

    return this.publish({ configured: true, status: UPDATE_STATES.READY, message: 'Ready to check the configured EMX update feed.' });
  }

  async checkForUpdates() {
    if (!this.initialized) this.initialize();
    if (!this.configured) return this.getState();
    this.publish({ status: UPDATE_STATES.CHECKING, message: 'Checking the configured EMX update feed…', progress: normalizeProgress() });
    try {
      await autoUpdater.checkForUpdates();
      this.publish({ lastCheckedAt: new Date().toISOString() });
    } catch (error) {
      this.publish({
        status: isOfflineError(error) ? UPDATE_STATES.OFFLINE : UPDATE_STATES.FAILED,
        lastCheckedAt: new Date().toISOString(),
        message: String(error?.message || error || 'Update check failed.')
      });
    }
    return this.getState();
  }

  async downloadUpdate() {
    if (!this.configured) return this.getState();
    if (this.state.status !== UPDATE_STATES.AVAILABLE) {
      return this.publish({ status: UPDATE_STATES.FAILED, message: 'Check for an available update before downloading.' });
    }
    this.publish({ status: UPDATE_STATES.DOWNLOADING, message: 'Starting verified update download…', progress: normalizeProgress() });
    try {
      await autoUpdater.downloadUpdate();
    } catch (error) {
      this.publish({ status: isOfflineError(error) ? UPDATE_STATES.OFFLINE : UPDATE_STATES.FAILED, message: String(error?.message || error || 'Update download failed.') });
    }
    return this.getState();
  }

  installAndRestart() {
    if (!this.configured || this.state.status !== UPDATE_STATES.READY_TO_INSTALL) {
      return this.publish({ status: UPDATE_STATES.FAILED, message: 'No verified update is ready to install.' });
    }
    this.publish({ status: UPDATE_STATES.INSTALLING, message: 'Installing the verified update…' });
    this.publish({ status: UPDATE_STATES.RESTARTING, message: 'Restarting EMX Clip Studio…' });
    autoUpdater.quitAndInstall(true, true);
    return this.getState();
  }
}

module.exports = { EmxUpdateService };
