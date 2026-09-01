import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createScrubSession} from '../src/lib/scrubSession.js';

const scrub=createScrubSession();
const drag=scrub.begin();
assert.equal(scrub.finish(drag),true,'the first pointerup/change event should finalize the scrub');
assert.equal(scrub.finish(drag),false,'the second pointerup/change event must not finalize the same scrub again');
assert.equal(scrub.owns(drag),true,'the single final preview remains current until playback replaces it');

const delayed=scrub.begin();
scrub.cancel();
assert.equal(scrub.owns(delayed),false,'Play must invalidate a delayed scrub preview before starting playback');

const renderer=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
assert.match(renderer,/async function startTimelinePlayback\(\)\{[\s\S]{0,260}cancelScrubPreviewWork\(\);[\s\S]{0,120}stopTimelinePlayback\(\);/,'Play must cancel scrub work and invalidate old preview requests before starting.');
// V1.11.4 rebuilt both video elements and every audio player after any scrub.
// That was a workaround for a desynchronised clock, not a fix: with one
// authoritative clock, healthy elements must survive a scrub untouched and
// only genuinely poisoned ones are rebuilt.
assert.ok(!renderer.includes('rearmTimelinePreviewAfterScrub'),'The blanket post-scrub media teardown must be gone.');
assert.ok(!renderer.includes('timelineAudioPlayers.clear()'),'Healthy external audio players must not be discarded after a scrub.');
assert.match(renderer,/recoverPoisonedPreviewElements\(\);/,'Play must run the targeted poisoned-element recovery instead of a blanket rebuild.');
assert.match(renderer,/if\(!isPoisonedMediaElement\(el\)\)continue;/,'Only an element that actually failed may be torn down and reloaded.');
assert.match(renderer,/if\(requestId!==state\.previewRequestId\)return;\s*await syncExternalTimelineAudio/,'A stale preview request must not reach external audio synchronization.');

console.log('EMX SCRUB SESSION SMOKE: PASS');
