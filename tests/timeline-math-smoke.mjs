import assert from 'node:assert/strict';
import {clipDuration,clipContainsTime,clipAtTime,magneticStartForClips,trimLeftByDelta,trimRightByDelta,splitClipAtTime} from '../src/lib/timelineMath.js';

const base={id:'a',start:10,trimStart:0,trimEnd:20,duration:20,speed:1};
assert.equal(clipDuration(base),20);
assert.equal(clipContainsTime(base,10),true);
assert.equal(clipContainsTime(base,29.999),true);
assert.equal(clipContainsTime(base,30),false);
assert.equal(clipAtTime([{...base,id:'later',start:30},base],12)?.id,'a');

const moved=magneticStartForClips(29.93,{...base,id:'b',start:29.93,trimEnd:5},[base],true,100);
assert.ok(Math.abs(moved-30)<.001,'clip start should magnetically snap to previous clip end');

const l=trimLeftByDelta(base,2);
assert.equal(l.start,12);
assert.equal(l.trimStart,2);

const r=trimRightByDelta(base,-3);
assert.equal(r.trimEnd,17);

const split=splitClipAtTime(base,15,'b');
assert.ok(split);
assert.equal(split.first.trimEnd,5);
assert.equal(split.second.trimStart,5);
assert.equal(split.second.start,15);

console.log('EMX TIMELINE MATH SMOKE TEST: PASS');
