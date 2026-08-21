const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const visual=require('../electron/visuals.json');
const {timedEffectFilter}=require('../electron/exporter.cjs');

const ffmpeg=process.env.EMX_FFMPEG_PATH||require('ffmpeg-static');
const width=320,height=240;

for(const effect of visual.effectLibrary){
  const filter=timedEffectFilter({effectId:effect.id,start:0,trimStart:0,trimEnd:.4,speed:1},width,height);
  assert.ok(filter,`${effect.title} must produce an FFmpeg filter chain.`);
  const run=spawnSync(ffmpeg,[
    '-hide_banner','-loglevel','error','-f','lavfi','-i',`testsrc2=s=${width}x${height}:r=30:d=0.4`,
    '-vf',filter,'-frames:v','4','-f','null','-'
  ],{encoding:'utf8',windowsHide:true,timeout:15000});
  assert.equal(run.status,0,`${effect.title} FFmpeg filter failed:\n${run.stderr||run.stdout}`);
}

console.log(`EMX EFFECT RENDER SMOKE: PASS (${visual.effectLibrary.length} animated effects)`);
