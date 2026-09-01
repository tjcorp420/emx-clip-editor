import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createPlaybackSession} from '../src/lib/playbackSession.js';

const session=createPlaybackSession();
const timelineRun=session.begin();
assert.equal(session.owns(timelineRun),true,'the active timeline loop should own its playback session');

session.stop();
assert.equal(session.owns(timelineRun),false,'switching away from timeline playback must invalidate the old animation loop');

const restartedTimeline=session.begin();
assert.equal(session.owns(timelineRun),false,'an older timeline loop must never regain ownership');
assert.equal(session.owns(restartedTimeline),true,'a new timeline playback run should own the new session');

const raceSession=createPlaybackSession();
const raceToken=raceSession.begin();
let releaseAwait;
const gate=new Promise(resolve=>{releaseAwait=resolve});
const events=[];
const staleTick=(async()=>{
  await gate;
  if(raceSession.owns(raceToken))events.push('stale timeline resumed');
})();
raceSession.stop();
events.push('resources preview owns player');
releaseAwait();
await staleTick;
assert.deepEqual(events,['resources preview owns player'],'an awaited timeline tick must not resume after Resources preview takes ownership');

const renderer=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
assert.match(renderer,/async function selectMedia\([^)]*\)\{\s*stopTimelinePlayback\(\);\s*const requestId=\+\+state\.previewRequestId;/,'Resources preview must stop and invalidate timeline playback before taking ownership.');
assert.ok(renderer.includes('if(!ownsPlayback()){state.timelineTimer=null;return}'),'The asynchronous timeline tick must stop when its playback session loses ownership.');
assert.ok(renderer.includes('requestId!==state.previewRequestId||state.timelinePreview'),'An interrupted media preview must not resume after timeline preview takes ownership.');
assert.match(renderer,/selectClip\(c\.id,modifiers\);[\s\S]{0,160}activateTimelinePreviewForClip\(c\);/,'Clicking a timeline clip after Resources preview must explicitly return playback ownership to the timeline.');
assert.ok(renderer.includes('if(requestId!==state.previewRequestId||state.timelinePreview){'),'A Resources autoplay promise must re-check ownership after it resolves.');

console.log('EMX PLAYBACK SESSION SMOKE: PASS');
