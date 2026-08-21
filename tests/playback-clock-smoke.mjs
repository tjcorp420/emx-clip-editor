/**
 * Regression tests for the V1.11.4 repeated-section / ticking playback bug.
 *
 * Root cause: the timeline clock was hand-integrated from wall-clock deltas
 * clamped to 80ms per animation frame, inside an animation tick that awaited
 * media promises. Slow frames made the timeline clock permanently lag the media
 * clock, and the throttled drift correction then seeked video.currentTime
 * BACKWARDS onto the lagging playhead over and over - replaying the same short
 * section and producing an audio discontinuity on every correction.
 *
 * These tests drive the real clock module through the same conditions and
 * assert the loop can no longer produce a backward correction. The legacy
 * integrator is reproduced here as a sensitivity check, so the suite provably
 * fails if the old behaviour ever comes back.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  createTimelineClock,
  planSlaveCorrection,
  timelineTimeFromMedia,
  CLOCK_LIMITS
} from '../src/lib/timelineClock.js';
import {createPlaybackSession} from '../src/lib/playbackSession.js';
import {createScrubSession} from '../src/lib/scrubSession.js';

const renderer = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const clip = (over = {}) => ({
  id: 'c1', mediaId: 'm1', start: 0, trimStart: 0, trimEnd: 60, speed: 1, ...over
});

class FakeMediaElement {
  constructor() {
    this.currentTime = 0;
    this.paused = true;
    this.playbackRate = 1;
    this.seeks = [];
  }
  play() { this.paused = false; return Promise.resolve(); }
  pause() { this.paused = true; }
  /** The media clock always runs in real time while playing. */
  advance(seconds) { if (!this.paused) this.currentTime += seconds * this.playbackRate; }
  seekTo(t) { this.seeks.push({from: this.currentTime, to: t}); this.currentTime = t; }
  get backwardSeeks() { return this.seeks.filter(s => s.to < s.from - 1e-9); }
}

/** The V1.11.4 loop: clamped hand-integrated clock + backward drift correction. */
function runLegacyLoop({frameCostMs, frames}) {
  const el = new FakeMediaElement();
  el.play();
  let playhead = 0, last = 0, now = 0, lastResync = -Infinity;
  for (let i = 0; i < frames; i++) {
    const prev = now; now += frameCostMs;
    el.advance((now - prev) / 1000);
    playhead += Math.min(.08, (now - last) / 1000);
    last = now;
    if (Math.abs(el.currentTime - playhead) > .75 && now - lastResync > 800) {
      el.seekTo(playhead);
      lastResync = now;
    }
  }
  return {el, playhead, wall: now / 1000};
}

/** The fixed loop: the playing element owns the clock; time is derived from it. */
function runFixedLoop({frameCostMs, frames, stallFrames = new Set()}) {
  const el = new FakeMediaElement();
  // Size the source so the whole run stays inside one clip: this harness
  // measures steady-state clock behaviour, not the clip-boundary handoff.
  const c = clip({trimEnd: (frameCostMs * frames) / 1000 + 30});
  const clock = createTimelineClock();
  el.currentTime = c.trimStart;
  el.play();
  clock.reset(c.start, 0);
  let now = 0;
  for (let i = 0; i < frames; i++) {
    const prev = now; now += frameCostMs;
    if (stallFrames.has(i)) el.pause(); else el.play();
    el.advance((now - prev) / 1000);
    if (!el.paused) {
      if (clock.syncToMedia(el.currentTime, c, now) === null) clock.advanceWall(now);
    } else {
      clock.hold(now);
    }
  }
  return {el, clock, wall: now / 1000};
}

/* ---------------------------------------------------------------- *
 * Sensitivity check: the legacy loop MUST fail these assertions.
 * ---------------------------------------------------------------- */
const legacy = runLegacyLoop({frameCostMs: 250, frames: 200});
assert.ok(legacy.el.backwardSeeks.length > 0,
  'sensitivity check: the legacy clamped integrator must reproduce backward re-seeks');
assert.ok(legacy.wall - legacy.playhead > 1,
  'sensitivity check: the legacy clock must visibly lag real time');

/* ---------------------------------------------------------------- *
 * 1-4, 12: the fixed loop never replays a section, at any frame rate.
 * ---------------------------------------------------------------- */
for (const frameCostMs of [16.7, 33, 100, 250, 600]) {
  const run = runFixedLoop({frameCostMs, frames: 200});
  assert.equal(run.el.backwardSeeks.length, 0,
    `a ${frameCostMs}ms animation frame must never seek the primary video backwards`);
  assert.equal(run.el.seeks.length, 0,
    `the primary video must never be drift-seeked while it owns the clock (${frameCostMs}ms frames)`);
  assert.ok(Math.abs(run.clock.time - run.wall) < .05,
    `the timeline clock must track real time within 50ms at ${frameCostMs}ms frames, got ${(run.clock.time - run.wall).toFixed(3)}s`);
}

/* A stalled element holds the clock instead of letting it run ahead. */
const stalled = runFixedLoop({frameCostMs: 33, frames: 120, stallFrames: new Set([40, 41, 42, 43, 44])});
assert.equal(stalled.el.backwardSeeks.length, 0, 'a decode stall must not cause a backward seek');
assert.ok(stalled.clock.time <= stalled.wall + 1e-6,
  'the clock must never run ahead of real time after a stall');

/* ---------------------------------------------------------------- *
 * Clock mapping: source time <-> timeline time, including speed and trims.
 * ---------------------------------------------------------------- */
assert.equal(timelineTimeFromMedia(5, clip({start: 2, trimStart: 1})), 6,
  'timeline time must account for clip start and trimStart');
assert.equal(timelineTimeFromMedia(5, clip({start: 0, trimStart: 1, speed: 2})), 2,
  'timeline time must account for clip speed');
assert.equal(timelineTimeFromMedia(90, clip({trimEnd: 60})), null,
  'an element parked outside the trimmed window must not be trusted as the clock');
assert.equal(timelineTimeFromMedia(Number.NaN, clip()), null,
  'a NaN media time must never become the timeline clock');

/* ---------------------------------------------------------------- *
 * 11: bounded + throttled slave corrections (no audio seek storm).
 * ---------------------------------------------------------------- */
{
  let lastAt = -Infinity, corrections = 0;
  for (let frame = 0; frame < 600; frame++) {
    const now = frame * 16.7;
    const plan = planSlaveCorrection({expected: 0, actual: 5, now, lastCorrectionAt: lastAt});
    if (plan.seek) { corrections++; lastAt = plan.at; }
  }
  const wallMs = 600 * 16.7;
  const ceiling = Math.ceil(wallMs / CLOCK_LIMITS.slaveCooldownMs) + 1;
  assert.ok(corrections <= ceiling,
    `a permanently diverged slave may correct at most ${ceiling} times in ${(wallMs / 1000).toFixed(1)}s, got ${corrections}`);
  assert.ok(corrections < 600, 'a slave correction must never run on every animation frame');
}
assert.equal(planSlaveCorrection({expected: 1, actual: 1.1, now: 0}).seek, false,
  'drift inside the tolerance band must not trigger a seek');
assert.equal(planSlaveCorrection({expected: 1, actual: 9, now: 0}).seek, true,
  'a genuinely diverged slave element must still be corrected once');
assert.equal(
  planSlaveCorrection({expected: 1, actual: 9, now: 100, lastCorrectionAt: 0}).seek, false,
  'a slave correction must respect its cooldown');

/* ---------------------------------------------------------------- *
 * 13: timeline gaps advance on the wall clock and stay monotonic.
 * ---------------------------------------------------------------- */
{
  const clock = createTimelineClock();
  clock.reset(4, 0);
  let t = 4;
  for (let frame = 1; frame <= 60; frame++) {
    const next = clock.advanceWall(frame * 16.7);
    assert.ok(next >= t, 'timeline time must never move backwards across a gap');
    t = next;
  }
  assert.ok(Math.abs(t - (4 + 60 * .0167)) < .02, 'a gap must advance at real time');
}
{
  const clock = createTimelineClock();
  clock.reset(0, 0);
  clock.advanceWall(10_000);
  assert.ok(clock.time <= CLOCK_LIMITS.maxWallStep + 1e-9,
    'a suspended window must not jump the timeline clock forward');
}

/* ---------------------------------------------------------------- *
 * 1, 2, 3, 10: scrub finalizes exactly once; Play cancels delayed work.
 * ---------------------------------------------------------------- */
{
  const scrub = createScrubSession();
  const drag = scrub.begin();
  assert.equal(scrub.finish(drag), true, 'pointerup finalizes the scrub');
  assert.equal(scrub.finish(drag), false, 'change must not finalize the same scrub again');
  assert.equal(scrub.finish(drag), false, 'no third finalization from a duplicated event');
}
{
  // Rapid seeks: every superseded scrub loses ownership, only the last survives.
  const scrub = createScrubSession();
  const tokens = [];
  for (let i = 0; i < 25; i++) { scrub.cancel(); tokens.push(scrub.begin()); }
  const live = tokens.pop();
  assert.ok(tokens.every(t => !scrub.owns(t)), 'superseded rapid seeks must all lose ownership');
  assert.equal(scrub.owns(live), true, 'the newest seek owns the preview');
  scrub.cancel();
  assert.equal(scrub.owns(live), false, 'Play must invalidate delayed scrub work before starting');
}

/* ---------------------------------------------------------------- *
 * 4, 5: Play -> seek -> Play, and Resources <-> Timeline, repeated.
 * ---------------------------------------------------------------- */
{
  const playback = createPlaybackSession();
  const scrub = createScrubSession();
  const stale = [];
  for (let i = 0; i < 25; i++) {
    const run = playback.begin();
    const drag = scrub.begin();
    scrub.finish(drag);
    playback.stop();
    scrub.cancel();
    const restarted = playback.begin();
    stale.push(run);
    assert.equal(playback.owns(restarted), true, `cycle ${i}: the newest playback run must own the loop`);
    assert.ok(stale.every(t => !playback.owns(t)), `cycle ${i}: no earlier run may regain ownership`);
    assert.equal(scrub.owns(drag), false, `cycle ${i}: a finished scrub must not survive the next Play`);
    playback.stop();
  }
}
{
  const playback = createPlaybackSession();
  for (let i = 0; i < 25; i++) {
    const timeline = playback.begin();
    playback.stop();                       // Resources preview takes ownership
    assert.equal(playback.owns(timeline), false,
      `switch ${i}: a timeline loop must not resume after Resources preview takes over`);
    const back = playback.begin();         // back to Timeline preview
    assert.equal(playback.owns(back), true, `switch ${i}: Timeline preview regains a fresh session`);
    playback.stop();
  }
}

/* ---------------------------------------------------------------- *
 * Renderer contract: the fixed architecture is actually wired up.
 * ---------------------------------------------------------------- */
const need = (pattern, message) => assert.ok(
  pattern instanceof RegExp ? pattern.test(renderer) : renderer.includes(pattern), message);

need('state.timelineTimer=requestAnimationFrame(tick);\n\n    // ---- one authoritative clock ----',
  'the tick must re-arm the next animation frame before touching any media');
need(/const clockClip=state\.activeTimelineClipId\?state\.videoClips\.find/,
  'the playing clip must be resolved as the authoritative clock owner');
need('timelineClock.syncToMedia(v.currentTime,clockClip,now)',
  'timeline time must be derived from the primary media element while it plays');
need('timelineClock.hold(now)', 'the clock must hold rather than run ahead while an element cannot keep time');

// 6, 7, 8, 9: the tick must not contain a per-frame primary drift seek any more.
assert.ok(!/try\{v\.currentTime=expected\}catch/.test(renderer),
  'the animation loop must never seek the primary video onto a hand-integrated playhead');
assert.ok(!/state\.playhead\+=dt/.test(renderer),
  'the timeline clock must not be hand-integrated from clamped wall-clock deltas');
assert.ok(!/const dt=Math\.min\(\.08/.test(renderer),
  'the 80ms dt clamp that desynchronised the clocks must be gone');

// The tick must never await: awaiting is what throttled the loop below 12.5fps.
{
  const start = renderer.indexOf('  function tick(now){');
  assert.ok(start > -1, 'the timeline tick must exist');
  const body = renderer.slice(start, renderer.indexOf('\n  }\n', start));
  assert.ok(!/\bawait\b/.test(body),
    'the animation tick must not await media promises - that is what throttled the clock');
  assert.ok(!/async function tick/.test(renderer), 'the animation tick must be synchronous');
}

// Transition overlap must keep exactly one audio-producing element.
need('transitionVideo.muted=true;', 'the incoming transition element must stay muted during overlap');
need(/planSlaveCorrection\(\{\s*expected:previewSourceTime\(secondary,state\.playhead\)/,
  'the transition element must be corrected through the bounded, throttled policy');

// De-duplicated async work: no stacked preview requests or play() storms.
need(/if\(handoffPending\|\|!ownsPlayback\(\)\)return;/, 'clip handoffs must be de-duplicated');
need(/if\(!ownsPlayback\(\)\|\|!element\|\|resumePending\.has\(element\)\|\|!element\.paused\)return;/,
  'resume requests must be de-duplicated per element');
need(/if\(audioPending\|\|!ownsPlayback\(\)\)return;/, 'external audio sync must be de-duplicated');

// 14: recovery is targeted; nothing is rebuilt on the healthy path.
assert.ok(!renderer.includes('rearmTimelinePreviewAfterScrub'),
  'the blanket post-scrub teardown must be gone - it was a workaround, not a fix');
assert.ok(!renderer.includes('timelineAudioPlayers.clear()'),
  'healthy external audio players must not be discarded as a recovery mechanism');
need(/function recoverPoisonedPreviewElements\(\)\{/,
  'recovery must exist but be targeted at genuinely poisoned elements');
need(/if\(!isPoisonedMediaElement\(el\)\)continue;/,
  'a healthy media element must never be torn down and reloaded');

// Play must cancel delayed scrub work before starting.
need(/async function startTimelinePlayback\(\)\{[\s\S]{0,200}cancelScrubPreviewWork\(\);\s*stopTimelinePlayback\(\);/,
  'Play must cancel scrub work and invalidate old preview requests before starting');

console.log('EMX PLAYBACK CLOCK SMOKE: PASS');
