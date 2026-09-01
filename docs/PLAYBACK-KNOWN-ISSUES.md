# Playback — fixed, and what is still open

## Fixed: repeated-section replay with audio ticking (V1.11.5)

**Symptom.** The preview replayed the same short section over and over, or froze
on a short segment, usually with rapid audio ticking. It appeared after
scrubbing, after adding or editing a transition, after applying effects, when
switching between Resources and Timeline preview, and at clip boundaries.
Deleting and re-adding the clip, or running the Engine Self-Test, appeared to
fix it.

**Root cause.** Timeline time was hand-integrated from wall-clock deltas clamped
to 80ms per animation frame:

```js
const dt = Math.min(.08, (now - last) / 1000);
state.playhead += dt;
```

inside an animation tick that `await`ed media promises (source loads, `play()`,
external audio sync). Any frame costing more than 80ms — routine during a source
load, a transition handoff, or an effect change — made the timeline clock
advance more slowly than real time while the video element kept decoding at real
speed. The clocks separated permanently, and the throttled drift correction then
seeked `video.currentTime` **backwards** onto the lagging playhead over and
over. That is the repeated section; each corrective seek is the audio tick.

Reproduction, using the real constants: at a 250ms frame cost the loop replays
about 0.85s of video every 1.25s indefinitely, with the clock running 68% slow.

**Fix.** One authoritative clock with one owner — see `src/lib/timelineClock.js`
and `startTimelinePlayback()` in `src/main.js`. A playing element *is* the clock;
time is held (never advanced) whenever no element can keep it; the tick is
synchronous and re-arms the next frame before touching media; slaved elements
are corrected through a bounded, throttled policy.

**Status: verified fixed.** `tests/playback-clock-smoke.mjs` reproduces the
legacy integrator as a sensitivity check (the old source fails 6/6 of the new
contract assertions) and asserts zero backward seeks at frame costs from 16.7ms
to 600ms. `tests/playback-runtime-validation.cjs` drives the real renderer and
reports `driftSeeks=0` in every scenario.

---

## Fixed: trimmed clip played the footage that was trimmed away (V1.11.7)

**Symptom.** After trimming a clip's start (dragging the left handle right),
viewing another clip, then returning to the beginning, the first clip played the
footage that should have been trimmed off. Pressing Play from a chosen position
restarted at the beginning instead of resuming there.

**Root cause, part one.** `timelineTimeFromMedia()` returned `null` both when
the element sat *before* the clip's trimmed window and when it had run *past*
it, and the playback tick treated every such refusal as "the clip finished" and
advanced the wall clock. For a clip trimmed to start at 40.22s, an element still
sitting at 0 is *behind* the window - so the playhead ran forward while the
element played exactly the footage the user had cut. `mediaWindowSide()` now
reports `behind` / `inside` / `ahead`; only `ahead` may advance time, and
`behind` holds the clock and re-asserts the element's position promptly.

**Root cause, part two.** `previewTimelineAt()` marked the load "settled"
immediately after *issuing* a seek. An element still settling a superseded load
silently discards a seek, so playback began at 0 with state believing it was
positioned correctly. The seek is now confirmed - waiting on `seeked` and
re-issuing once - before the load is treated as settled.

**Status: verified fixed.** `tests/playback-runtime-validation.cjs` scenario
`trimmedClipPlayback` reproduces the report (trim clip 1's start, view clip 2,
return to the start, Play) and asserts no frame is shown from before the clip's
trim-in point. It reported 20 violations before the fix and 0 after.

---

## Harness note: the window must be visible

Chromium parks `requestAnimationFrame` in a window that never composites.
The runtime harness originally ran with `show: false`, which throttled the
playback loop to roughly 1fps and made every scenario silently under-test the
loop it exists to exercise - a "playhead snap-back" recorded here earlier was
largely an artifact of that throttling. The harness now shows its window
(non-focusable, off the taskbar). Do not set `show: false` again.
