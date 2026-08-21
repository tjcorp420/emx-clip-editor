const assert=require('assert');
const fs=require('fs');
const path=require('path');
const rt=require('../electron/ai-runtime.cjs');

assert.equal(rt.PYTHON_VERSION,'3.12.10');
assert.ok(rt.PYTHON_URL.includes('python.org'));
assert.ok(rt.PYTHON_URL.endsWith('embed-amd64.zip'));
assert.ok(rt.GET_PIP_URL.startsWith('https://bootstrap.pypa.io/'));
assert.equal(rt.AUDIO_SEPARATOR_SPEC,'audio-separator[cpu]');
assert.ok(rt.COMPAT_PACKAGES?.includes?.('audioread==3.1.0') || fs.readFileSync(path.join(__dirname,'..','electron','ai-runtime.cjs'),'utf8').includes("audioread==3.1.0"));

const pkg=JSON.parse(fs.readFileSync(path.join(__dirname,'..','package.json'),'utf8'));
assert.ok(!pkg.build.extraResources.some(x=>x&&x.to==='ai-runtime'),'Fast friend installer must not bundle the giant AI runtime tree.');
assert.ok(pkg.scripts['prepare:ai-runtime']);

const preload=fs.readFileSync(path.join(__dirname,'..','electron','preload.cjs'),'utf8');
assert.ok(preload.includes('aiEnsure'));
assert.ok(preload.includes('aiRepair'));

const ui=fs.readFileSync(path.join(__dirname,'..','src','main.js'),'utf8');
assert.ok(ui.includes('autoEnsureAiReady'));
assert.ok(!ui.includes('Install Audio AI</button>'));
assert.ok(ui.includes('EMX MANAGED / FRIEND READY'));

console.log('EMX FRIEND-READY RUNTIME CONTRACT: PASS');
