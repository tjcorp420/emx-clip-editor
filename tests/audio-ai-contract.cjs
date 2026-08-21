const assert=require('assert');
const {progressFromLine}=require('../electron/audio-ai.cjs');
const {runtimePaths}=require('../electron/ai-runtime.cjs');
assert.strictEqual(progressFromLine('processing 37%'),.37);
assert.strictEqual(progressFromLine('no percent'),null);
const p=runtimePaths(process.platform==='win32'?'C:\\EMX\\runtime':'/tmp/emx-runtime');
assert.ok(p.python);
assert.ok(p.cli);
console.log('EMX AUDIO AI CONTRACT SMOKE TEST: PASS');
