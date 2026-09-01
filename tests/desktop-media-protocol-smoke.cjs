const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const { app, BrowserWindow, protocol, net } = require('electron');

const scheme = 'emx-media-smoke';
const token = 'fixture';
const requests = [];

protocol.registerSchemesAsPrivileged([{
  scheme,
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true }
}]);

function makeFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'emx-desktop-media-'));
  const filePath = path.join(dir, 'fixture.mp4');
  const ffmpeg = process.env.EMX_FFMPEG_PATH || require('ffmpeg-static');
  const result = spawnSync(ffmpeg, [
    '-y', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=30', '-t', '2',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', filePath
  ], { encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error(`Could not create video fixture: ${result.stderr}`);
  return filePath;
}

function finish(code, message) {
  if (message) console[code === 0 ? 'log' : 'error'](message);
  app.exit(code);
}

(async () => {
  const fixturePath = process.env.EMX_MEDIA_SMOKE_PATH || makeFixture();
  assert.ok(fs.existsSync(fixturePath), `Desktop media fixture is missing: ${fixturePath}`);
  await app.whenReady();
  protocol.handle(scheme, request => {
    requests.push({ method: request.method, range: request.headers.get('range') || '' });
    const range = request.headers.get('range');
    return net.fetch(pathToFileURL(fixturePath).toString(), range ? { headers: { Range: range } } : undefined).then(response => {
      const headers = new Headers(response.headers);
      headers.set('Access-Control-Allow-Origin', '*');
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    });
  });

  const window = new BrowserWindow({
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: false, webSecurity: true }
  });
  await window.loadURL('data:text/html,<title>EMX desktop media smoke</title>');
  const result = await window.webContents.executeJavaScript(`
    new Promise(resolve => {
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.preload = 'metadata';
      video.crossOrigin = 'anonymous';
      const fail = () => resolve({ ok: false, code: video.error && video.error.code, message: video.error && video.error.message });
      video.addEventListener('error', fail, { once: true });
      video.addEventListener('loadedmetadata', async () => {
        try {
          await video.play();
          await new Promise(resolveFrame => setTimeout(resolveFrame, 120));
          video.pause();
          const playedTime = video.currentTime;
          video.currentTime = .5;
          await new Promise((resolveSeek, rejectSeek) => {
            video.addEventListener('seeked', resolveSeek, { once: true });
            video.addEventListener('error', () => rejectSeek(new Error('video error while seeking')), { once: true });
          });
          const canvas = document.createElement('canvas');
          canvas.width = 160; canvas.height = 90;
          canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
          const thumbnail = canvas.toDataURL('image/jpeg');
          resolve({ ok: video.videoWidth > 0 && video.videoHeight > 0 && playedTime > 0 && thumbnail.startsWith('data:image/jpeg;base64,'), duration: video.duration, currentTime: video.currentTime, width: video.videoWidth, height: video.videoHeight });
        } catch (error) {
          resolve({ ok: false, message: String(error && error.message || error) });
        }
      }, { once: true });
      video.src = '${scheme}://local/${token}';
    })
  `, true);
  window.destroy();
  assert.ok(result.ok, `Native media protocol did not load/play/seek a video: ${JSON.stringify(result)}; requests=${JSON.stringify(requests)}`);
  assert.ok(requests.length > 0, 'The custom protocol did not receive a media request.');
  finish(0, `EMX DESKTOP MEDIA PROTOCOL SMOKE: PASS (${requests.length} request(s), ${result.duration.toFixed(2)}s)`);
})().catch(error => finish(1, error.stack || String(error)));
