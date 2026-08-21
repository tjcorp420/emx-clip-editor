/**
 * End-to-end playback validation against the real renderer.
 *
 * tests/playback-clock-smoke.mjs proves the clock module and the wiring
 * contract. This harness boots the actual built renderer in Electron, imports
 * real H.264 media through the real file picker, adds it to the real timeline
 * and drives the real transport - then watches video.currentTime for the
 * signature of the V1.11.4 bug.
 *
 * What the bug looked like, and how it is told apart from legitimate motion:
 *
 *   - BUG (drift re-seek): while playing steadily, with no transport action and
 *     no source change, the element is seeked BACKWARDS by a bounded amount
 *     (~0.75s, the old drift limit) onto a lagging playhead, repeatedly. This is
 *     the repeated section, and each seek is an audio tick.
 *   - LEGITIMATE (boundary rewind): at a clip boundary between two clips that
 *     share one source file, the shared element is rewound to the incoming
 *     clip's trimStart. That is a large one-off rewind, not a drift correction.
 *   - LEGITIMATE (user transport): scrubs and Play/Pause issued by this harness.
 *     Each is announced with __emxMarkTransport() so it is excluded.
 *
 * Media is generated on the fly with the bundled FFmpeg binary.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { app, BrowserWindow } = require('electron');

const root = path.join(__dirname, '..');
const ffmpeg = path.join(root, 'build', 'native', 'ffmpeg.exe');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'emx-playback-'));

/** Backward jumps smaller than this are drift corrections, not clip rewinds. */
const DRIFT_SEEK_MAX = 2.0;

function finish(code, message) {
  if (message) console[code === 0 ? 'log' : 'error'](message);
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
  app.exit(code);
}

function makeClip(name, source, tone, seconds) {
  const out = path.join(tmp, name);
  const result = spawnSync(ffmpeg, [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'lavfi', '-i', `${source}=size=480x270:rate=30:duration=${seconds}`,
    '-f', 'lavfi', '-i', `sine=frequency=${tone}:duration=${seconds}`,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '30', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '64k', '-shortest', out
  ], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`ffmpeg failed for ${name}: ${result.stderr}`);
  return fs.readFileSync(out).toString('base64');
}

(async () => {
  if (!fs.existsSync(ffmpeg)) return finish(1, `Bundled FFmpeg not found at ${ffmpeg}. Run npm run prepare:native.`);

  const clipA = makeClip('clipA.mp4', 'testsrc2', 440, 6);
  const clipB = makeClip('clipB.mp4', 'smptebars', 660, 6);

  app.commandLine.appendSwitch('disable-gpu');
  app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
  await app.whenReady();

  const consoleErrors = [];
  const window = new BrowserWindow({
    show: false,
    width: 1600,
    height: 950,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true }
  });
  window.webContents.on('console-message', event => {
    if (event.level === 'error') consoleErrors.push(event.message);
  });
  await window.loadFile(path.join(root, 'dist', 'index.html'));
  await new Promise(resolve => setTimeout(resolve, 400));

  const run = js => window.webContents.executeJavaScript(js);
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // ---- install the in-page probe -----------------------------------------
  await run(`(() => {
    const $ = id => document.querySelector('#' + id);
    const video = $('previewVideo');
    const probe = {
      samples: [], backwardSeeks: [], seekEvents: 0,
      lastSrc: '', lastMediaId: '', lastTime: -1, quietUntil: 0, recording: false
    };
    const blank = ms => { probe.quietUntil = Math.max(probe.quietUntil, performance.now() + ms); };
    for (const event of ['emptied', 'loadstart', 'loadedmetadata']) {
      video.addEventListener(event, () => blank(500));
    }
    video.addEventListener('seeking', () => { if (probe.recording) probe.seekEvents++; });

    const readTimeline = () => {
      const m = /^(\\d+):(\\d+)\\.(\\d+)/.exec(($('timeReadout').textContent || '').trim());
      return m ? (+m[1]) * 60 + (+m[2]) + (+m[3]) / 100 : 0;
    };

    setInterval(() => {
      if (!probe.recording) return;
      const now = performance.now();
      const src = video.currentSrc || '';
      const mediaId = video.dataset.mediaId || '';
      const ct = Number(video.currentTime) || 0;
      const sameSource = src === probe.lastSrc && mediaId === probe.lastMediaId;
      if (sameSource && !video.paused && probe.lastTime >= 0 && now > probe.quietUntil
          && ct < probe.lastTime - 0.08) {
        probe.backwardSeeks.push({
          from: +probe.lastTime.toFixed(3),
          to: +ct.toFixed(3),
          delta: +(probe.lastTime - ct).toFixed(3)
        });
      }
      probe.lastSrc = src; probe.lastMediaId = mediaId; probe.lastTime = ct;
      const snap = window.__emxPlaybackSnapshot ? window.__emxPlaybackSnapshot() : {};
      probe.samples.push({
        ct: +ct.toFixed(3), paused: video.paused, timeline: readTimeline(),
        clock: +(snap.clock || 0).toFixed(3), src: snap.clockSource || '',
        clip: (snap.activeClipId || '').slice(0, 4), playing: snap.timelinePlaying,
        rej: snap.clockRejection || '-', settled: snap.loadSettled, rs: video.readyState,
        vMed: (snap.mediaId || '').slice(0, 4), cMed: (snap.activeClipMediaId || '').slice(0, 4),
        cStart: snap.activeClipStart,
        dur: Number.isFinite(video.duration) ? +video.duration.toFixed(2) : String(video.duration),
        seekEnd: video.seekable.length ? +video.seekable.end(0).toFixed(2) : -1,
        netState: video.networkState,
        quiet: now > probe.quietUntil
      });
    }, 50);

    window.__emxMarkTransport = () => blank(700);
    window.__emxStartRecording = () => {
      probe.samples = []; probe.backwardSeeks = []; probe.seekEvents = 0;
      probe.lastSrc = ''; probe.lastMediaId = ''; probe.lastTime = -1;
      probe.recording = true; blank(400);
    };
    window.__emxStopRecording = () => {
      probe.recording = false;
      const s = probe.samples;
      return {
        samples: s.length,
        // A bounded backward jump during steady playback is the bug.
        driftSeeks: probe.backwardSeeks.filter(x => x.delta < ${DRIFT_SEEK_MAX}),
        // A large one-off rewind at a shared-source clip boundary is legitimate.
        boundaryRewinds: probe.backwardSeeks.filter(x => x.delta >= ${DRIFT_SEEK_MAX}).length,
        seekEvents: probe.seekEvents,
        advanced: s.length ? Math.max(...s.map(x => x.timeline)) - s[0].timeline : 0,
        timelineMode: $('timelineModeBadge').style.display !== 'none',
        finalReadout: $('timeReadout').textContent,
        trace: s.map(x => x.timeline),
        ctTrace: s.map(x => x.ct),
        detail: s
      };
    };
    window.__emxImport = async (name, b64) => {
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const dt = new DataTransfer();
      dt.items.add(new File([bytes], name, { type: 'video/mp4' }));
      const picker = $('filePicker');
      picker.files = dt.files;
      picker.dispatchEvent(new Event('change', { bubbles: true }));
    };
    return true;
  })()`);

  /** Any deliberate transport action is announced so it is not mistaken for the bug. */
  const transport = async js => {
    await run(`window.__emxMarkTransport()`);
    return run(js);
  };
  const clickPlay = () => transport(`document.querySelector('#playPause').click()`);
  const pauseIfPlaying = () => transport(
    `(() => { const v = document.querySelector('#previewVideo');
       if (!v.paused) document.querySelector('#playPause').click(); return true; })()`);
  const resetToStart = async () => { await transport(`document.querySelector('#toStart').click()`); await sleep(500); };
  const scrub = (id, values) => transport(`(() => {
    const s = document.querySelector('#${id}');
    s.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    for (const value of ${JSON.stringify(values)}) {
      s.value = value;
      s.dispatchEvent(new Event('input', { bubbles: true }));
    }
    s.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    s.dispatchEvent(new Event('change', { bubbles: true }));  // duplicate finalize
    return true;
  })()`);

  // ---- import both clips through the real picker --------------------------
  await run(`window.__emxImport('clipA.mp4', ${JSON.stringify(clipA)})`);
  await sleep(2500);
  await run(`window.__emxImport('clipB.mp4', ${JSON.stringify(clipB)})`);
  await sleep(2500);
  assert.equal(await run(`document.querySelectorAll('#mediaList [data-add]').length`), 2,
    'both clips must import through the real picker');

  // ---- add both to the timeline ------------------------------------------
  // Re-query between clicks: adding re-renders the media list, so a cached
  // button reference would be detached and its click would never bubble.
  await run(`(() => {
    const ids = [...document.querySelectorAll('#mediaList [data-add]')].map(b => b.dataset.add);
    return ids;
  })()`).then(async ids => {
    for (const id of ids) {
      await run(`document.querySelector('#mediaList [data-add="${id}"]').click()`);
      await sleep(700);
    }
  });
  await sleep(1200);

  const timeline = await run(`(() => ({
    clips: document.querySelectorAll('#videoLane .clip').length,
    sources: new Set([...document.querySelectorAll('#videoLane .clip')].map(c => c.dataset.clip)).size,
    readout: document.querySelector('#timeReadout').textContent
  }))()`);
  assert.ok(timeline.clips >= 2, `both clips must land on the timeline (got ${timeline.clips})`);
  console.log(`\ntimeline: ${timeline.clips} clips, ${timeline.readout}`);

  const results = {};
  const record = async (name, drive, settleMs) => {
    await resetToStart();
    await run(`window.__emxStartRecording()`);
    await drive();
    await sleep(settleMs);
    results[name] = await run(`window.__emxStopRecording()`);
    await pauseIfPlaying();
    await sleep(300);
  };

  // 1. Plain Play, straight through a clip boundary.
  await record('plainPlay', clickPlay, 6500);

  // 2. Drag scrubber -> release (pointerup AND change) -> immediately Play.
  //    Watch for a long window: the abandoned-load race took several seconds to
  //    surface, so a short settle silently passed while the bug was still there.
  await record('scrubThenPlay', async () => {
    await scrub('scrub', [1, 2, 3, 4]);
    await clickPlay();
  }, 9000);

  // 3. Play -> seek -> Play, 20 times.
  await record('playSeekPlay20', async () => {
    for (let i = 0; i < 20; i++) {
      await clickPlay();
      await scrub('scrub', [(0.4 + (i % 7) * 0.9).toFixed(2)]);
      await clickPlay();
      await sleep(120);
    }
  }, 2500);

  // 4. Resources preview <-> Timeline preview, repeatedly, then Play.
  //    A timeline clip hands ownership back on pointerdown, not click.
  await record('previewSwitching', async () => {
    for (let i = 0; i < 10; i++) {
      await transport(`document.querySelector('#mediaList [data-preview]').click()`);
      await sleep(200);
      await transport(`(() => {
        const c = document.querySelector('#videoLane .clip');
        if (!c) return false;
        c.dispatchEvent(new PointerEvent('pointerdown',
          { bubbles: true, cancelable: true, button: 0, isPrimary: true }));
        return true;
      })()`);
      await sleep(200);
    }
    await clickPlay();
  }, 3500);

  // 5. Fullscreen scrubber -> Play.
  await record('fullscreenScrubThenPlay', async () => {
    await scrub('fullscreenScrub', [2.5]);
    await transport(`document.querySelector('#fullscreenPlayPause').click()`);
  }, 3500);

  window.destroy();

  // ---- report + assertions ------------------------------------------------
  console.log('\nEMX PLAYBACK RUNTIME VALIDATION');
  for (const [name, r] of Object.entries(results)) {
    const ok = r.driftSeeks.length === 0 && r.advanced > 0.4 && r.timelineMode;
    console.log(
      `  ${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(24)} advanced=${r.advanced.toFixed(2)}s  ` +
      `driftSeeks=${r.driftSeeks.length}  boundaryRewinds=${r.boundaryRewinds}  ` +
      `seeks=${r.seekEvents}  timelineMode=${r.timelineMode}  ${r.finalReadout}` +
      (r.driftSeeks.length ? `\n         drift: ${JSON.stringify(r.driftSeeks.slice(0, 5))}` : '')
    );
    // Locate any point where the TIMELINE itself moved backwards. The element
    // rewinding at a shared-source boundary is fine; the playhead going
    // backwards is not.
    const drops = [];
    for (let i = 1; i < r.trace.length; i++) {
      const a = r.detail[i - 1], b = r.detail[i];
      // Only a drop with no transport action in flight is a real regression.
      if (r.trace[i] < r.trace[i - 1] - 0.15 && a.quiet && b.quiet) {
        drops.push(
          `timeline ${r.trace[i - 1]}->${r.trace[i]} | ct ${a.ct}->${b.ct} | ` +
          `clock ${a.clock}->${b.clock} | src ${a.src}->${b.src} | ` +
          `clip ${a.clip}->${b.clip} | playing ${a.playing}->${b.playing}`);
      }
    }
    r.timelineDrops = drops;
    if (drops.length) console.log('         timelineDrops: ' + drops.join(' | '));
    if (drops.length && name === 'scrubThenPlay') {
      const at = r.trace.findIndex((t, i) => i > 0 && t < r.trace[i - 1] - 0.15);
      console.log('         window around drop:');
      for (const d of r.detail.slice(Math.max(0, at - 6), at + 4)) {
        console.log(`           tl=${d.timeline} ct=${d.ct} clk=${d.clock} src=${d.src} settled=${d.settled} vMed=${d.vMed} clipMed=${d.cMed} clipStart=${d.cStart} dur=${d.dur} seekEnd=${d.seekEnd} net=${d.netState}`);
      }
    }
  }

  for (const [name, r] of Object.entries(results)) {
    assert.deepEqual(r.timelineDrops, [],
      `${name}: the timeline playhead moved backwards during playback`);
    assert.equal(r.driftSeeks.length, 0,
      `${name}: the primary video was seeked backwards during steady playback - ` +
      `that is the repeated-section bug: ${JSON.stringify(r.driftSeeks.slice(0, 5))}`);
    assert.ok(r.advanced > 0.4, `${name}: playback must advance (got ${r.advanced.toFixed(2)}s)`);
    assert.equal(r.timelineMode, true, `${name}: must remain in Timeline preview`);
    assert.ok(r.seekEvents < 60, `${name}: seek count ${r.seekEvents} indicates a seek storm`);
  }
  // Synthetic PointerEvents register no active pointer, so the drag handlers'
  // setPointerCapture() throws. That is an artifact of scripted dispatch, not a
  // product defect - real pointer input always has an active pointer id.
  const realErrors = consoleErrors.filter(m => !/setPointerCapture/.test(m));
  assert.deepEqual(realErrors, [], `Renderer console errors: ${realErrors.join('\n')}`);

  finish(0, '\nEMX PLAYBACK RUNTIME VALIDATION: PASS');
})().catch(error => finish(1, error.stack || String(error)));
