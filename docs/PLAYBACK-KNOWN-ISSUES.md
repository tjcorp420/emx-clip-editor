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

## Open: single playhead snap-back after scrub → Play

**Symptom.** After dragging the scrubber and immediately pressing Play, the
playhead can jump backwards **once**, roughly 1.2s into playback — for example
from 5.28s to 0.96s. Playback then continues normally from the new position.

This is *not* the repeated-section bug: it happens once, it does not repeat, it
produces no seek storm, and no audio ticking. It is reproduced reliably by
`npm run verify:playback-runtime`, scenario `scrubThenPlay`, which currently
**fails** by design so the defect is not forgotten.

**What is known.** Instrumented traces through `window.__emxPlaybackSnapshot()`
show, in the ~0.9s before the jump:

```
tl=5.27 ct=0.676 clk=5.268 src=held settled=true vMed=b268 clipMed=b268
        clipStart=0 dur=6 seekEnd=6 net=1
```

- Timeline time is frozen at 5.27 and the clock reports `held`.
- The element is playing from ~0 and climbing smoothly.
- The element is fully loaded and seekable (`dur=6`, `seekEnd=6`).
- The element's media matches the active clip's media (`vMed === clipMed`).
- The load is marked settled.

Then the clock switches to `media` and adopts the element's ~0.96.

Ruled out: media identity mismatch, an unsettled load, a non-seekable or
partially loaded element, a hidden element, and the drift-correction path (the
throttled re-assert added for this case does not execute, so the tick is not
entering the branch that owns the clock).

The evidence — timeline time frozen, `clockSource` stale at `held`, the readout
not updating, and the element playing on unattended — is consistent with the
animation loop having **exited** (`ownsPlayback()` returning false) rather than
the clock mis-deriving time, with a later preview request restarting it and
re-basing onto the element. The next step is to instrument `ownsPlayback()` and
`stopTimelinePlayback()` call sites to find what invalidates the session about a
second after Play following a scrub.

**Workaround.** Press Play again, or move the playhead once; playback resumes
normally.
