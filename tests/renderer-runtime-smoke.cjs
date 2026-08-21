const assert = require('node:assert/strict');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');

function finish(code, message) {
  if (message) console[code === 0 ? 'log' : 'error'](message);
  app.exit(code);
}

(async () => {
  app.commandLine.appendSwitch('disable-gpu');
  await app.whenReady();
  const errors = [];
  const window = new BrowserWindow({
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true }
  });
  window.webContents.on('console-message', event => {
    if (event.level === 'error') errors.push(event.message);
  });
  await window.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  await new Promise(resolve => setTimeout(resolve, 250));
  const result = await window.webContents.executeJavaScript(`(() => {
    const playhead = document.querySelector('#playhead');
    const effectCards = [...document.querySelectorAll('#effectLibrary .visual-card')];
    const filterCards = [...document.querySelectorAll('#filterLibrary .visual-card')];
    const renderModal = document.querySelector('#renderModal');
    renderModal.classList.add('show');
    document.querySelector('#renderResult').hidden = false;
    document.querySelector('#openExportVideo').hidden = false;
    document.querySelector('#openExportFolder').hidden = false;
    const renderTitleStyle = getComputedStyle(document.querySelector('#renderTitle'));
    const renderHeadStyle = getComputedStyle(document.querySelector('.render-head'));
    return {
      version: document.querySelector('#appVersionLabel')?.textContent || '',
      effectLane: Boolean(document.querySelector('#effectLane')),
      effectCards: effectCards.length,
      effectsDraggable: effectCards.every(card => card.draggable),
      filtersDisabledWithoutSelection: filterCards.every(card => card.disabled),
      playheadPointerEvents: getComputedStyle(playhead).pointerEvents,
      resolution: document.querySelector('#exportResolution')?.value,
      fit: document.querySelector('#exportFit')?.value,
      clipZoom: Boolean(document.querySelector('#clipZoom')),
      fullscreenControls: Boolean(document.querySelector('#fullscreenPlayPause') && document.querySelector('#fullscreenScrub')),
      exportActions: Boolean(document.querySelector('#openExportVideo') && document.querySelector('#openExportFolder')),
      exportHeadLayout: renderHeadStyle.display,
      exportTitleWrap: renderTitleStyle.whiteSpace,
      exportResultVisible: getComputedStyle(document.querySelector('#renderResult')).display,
      imageAccept: document.querySelector('#filePicker')?.accept || ''
    };
  })()`);
  window.destroy();
  assert.match(result.version, /V1\.11\.4/);
  assert.equal(result.effectLane, true);
  assert.equal(result.effectCards, 15);
  assert.equal(result.effectsDraggable, true);
  assert.equal(result.filtersDisabledWithoutSelection, true);
  assert.equal(result.playheadPointerEvents, 'auto');
  assert.equal(result.resolution, '1080x1920');
  assert.equal(result.fit, 'contain');
  assert.equal(result.clipZoom, true);
  assert.equal(result.fullscreenControls, true);
  assert.equal(result.exportActions, true);
  assert.equal(result.exportHeadLayout, 'flex');
  assert.equal(result.exportTitleWrap, 'nowrap');
  assert.equal(result.exportResultVisible, 'grid');
  assert.match(result.imageAccept, /image\/png/);
  assert.deepEqual(errors, [], `Renderer console errors: ${errors.join('\n')}`);
  finish(0, 'EMX RENDERER RUNTIME SMOKE: PASS');
})().catch(error => finish(1, error.stack || String(error)));
