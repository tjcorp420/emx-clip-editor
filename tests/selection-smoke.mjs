import assert from 'node:assert/strict';
import { reconcileSelection, selectIds } from '../src/lib/selection.js';

const order=['a','b','c','d'];
let result=selectIds({currentIds:new Set(),orderedIds:order,targetId:'b',anchorId:null});
assert.deepEqual([...result.ids],['b']);
assert.equal(result.anchorId,'b');

result=selectIds({currentIds:result.ids,orderedIds:order,targetId:'d',anchorId:result.anchorId,range:true});
assert.deepEqual([...result.ids],['b','c','d']);

result=selectIds({currentIds:result.ids,orderedIds:order,targetId:'c',anchorId:result.anchorId,toggle:true});
assert.deepEqual([...result.ids],['b','d']);

assert.deepEqual([...reconcileSelection(new Set(['a','missing','d']),order)],['a','d']);
console.log('EMX SELECTION SMOKE TEST: PASS');
