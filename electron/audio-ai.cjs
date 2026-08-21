const fs=require('fs');
const path=require('path');
const os=require('os');
const {spawn,spawnSync}=require('child_process');
const {runtimePaths,cliReady,ensureEmbeddedRuntime}=require('./ai-runtime.cjs');

function progressFromLine(line){
  const m=String(line||'').match(/(\d{1,3}(?:\.\d+)?)\s*%/);
  if(!m)return null;
  return Math.max(0,Math.min(1,Number(m[1])/100));
}
function runProcess(cmd,args,{cwd,env,onLine=()=>{},onProgress=()=>{}}={}){
  return new Promise((resolve,reject)=>{
    const child=spawn(cmd,args,{cwd,env,windowsHide:true,shell:false});
    let all='';
    const feed=buf=>{
      const s=buf.toString();all+=s;
      s.split(/\r?\n/).filter(Boolean).forEach(line=>{
        onLine(line);
        const p=progressFromLine(line);if(p!==null)onProgress(p);
      });
    };
    child.stdout.on('data',feed);child.stderr.on('data',feed);
    child.on('error',reject);
    child.on('close',code=>code===0?resolve(all):reject(new Error(`${path.basename(cmd)} exited with code ${code}\n${all.slice(-5000)}`)));
  });
}

async function setupAudioAI({
  runtimeDir,ffmpegPath,onStatus=()=>{},onLog=()=>{},onProgress=()=>{},force=false
}){
  const result=await ensureEmbeddedRuntime({
    runtimeDir,ffmpegPath,onStatus,onLog,onProgress,force
  });
  const p=runtimePaths(runtimeDir);
  return {ok:true,python:p.python,runtime:p,source:result.source};
}
function aiStatus(runtimeDir){
  const p=runtimePaths(runtimeDir);
  if(!cliReady(runtimeDir)){
    return {installed:false,bundled:false,runtimeDir,python:p.python,cli:p.cli};
  }
  try{
    const r=spawnSync(p.cli,['--version'],{encoding:'utf8',windowsHide:true});
    return {
      installed:r.status===0,bundled:true,runtimeDir,python:p.python,cli:p.cli,
      version:(r.stdout||r.stderr||'').trim()
    };
  }catch{
    return {installed:false,bundled:false,runtimeDir,python:p.python,cli:p.cli};
  }
}
function listWavs(dir){
  if(!fs.existsSync(dir))return [];
  return fs.readdirSync(dir).filter(f=>/\.(wav|flac|m4a|mp3)$/i.test(f)).map(f=>path.join(dir,f));
}
function findByStem(files,stem){
  return files.find(f=>path.basename(f).toLowerCase().includes(stem.toLowerCase()))||null;
}
async function nativeDenoise({inputPath,outputPath,ffmpegPath,onLine,onProgress}){
  await runProcess(ffmpegPath,['-y','-i',inputPath,'-vn','-af','highpass=f=35,lowpass=f=18000,afftdn=nf=-25','-ar','48000','-ac','2',outputPath],{
    onLine,onProgress
  });
  return [outputPath];
}
async function processAudioAI({runtimeDir,baseDir,ffmpegPath,inputPath,mode,jobDir,onStatus=()=>{},onLog=()=>{},onProgress=()=>{}}){
  fs.mkdirSync(jobDir,{recursive:true});
  const cleanInput=path.join(jobDir,'input.wav');
  onStatus('Preparing 48 kHz stereo audio…');onProgress(.03);
  await runProcess(ffmpegPath,['-y','-i',inputPath,'-vn','-ar','44100','-ac','2',cleanInput],{onLine:onLog});

  if(mode==='denoise'){
    onStatus('Reducing constant background noise…');onProgress(.20);
    const out=path.join(jobDir,'EMX_Denoised.wav');
    await nativeDenoise({inputPath:cleanInput,outputPath:out,ffmpegPath,onLine:onLog,onProgress:p=>onProgress(.20+p*.70)});
    onProgress(1);return {files:[out],mode};
  }

  const runtime=runtimePaths(runtimeDir);
  if(!cliReady(runtimeDir))throw new Error('EMX Audio AI runtime is not ready. Restart EMX or use Repair Audio AI.');
  const modelDir=path.join(baseDir,'models');fs.mkdirSync(modelDir,{recursive:true});
  const env={...process.env,PATH:`${path.dirname(ffmpegPath)}${path.delimiter}${process.env.PATH||''}`};

  if(mode==='remove-voices'){
    onStatus('Loading vocal separation model (downloads once on first use)…');onProgress(.08);
    const names=JSON.stringify({Instrumental:'EMX_No_Vocals',Vocals:'EMX_Vocals'});
    await runProcess(runtime.cli,[cleanInput,'--model_filename','model_bs_roformer_ep_317_sdr_12.9755.yaml','--output_format','WAV','--output_dir',jobDir,'--model_file_dir',modelDir,'--custom_output_names',names],{
      env,onLine:onLog,onProgress:p=>onProgress(.08+p*.84)
    });
    const files=listWavs(jobDir).filter(f=>path.basename(f)!=='input.wav');
    const instrumental=findByStem(files,'no_vocals')||findByStem(files,'instrumental')||files.find(f=>!/vocal/i.test(path.basename(f)));
    if(!instrumental)throw new Error('Vocal separation finished but EMX could not locate the non-vocal output.');
    onProgress(1);return {files:[instrumental],mode};
  }

  onStatus('Loading Demucs 4-stem model (downloads once on first use)…');onProgress(.08);
  const names=JSON.stringify({Vocals:'EMX_Vocals',Drums:'EMX_Drums',Bass:'EMX_Bass',Other:'EMX_Other'});
  await runProcess(runtime.cli,[cleanInput,'--model_filename','htdemucs_ft.yaml','--output_format','WAV','--output_dir',jobDir,'--model_file_dir',modelDir,'--custom_output_names',names],{
    env,onLine:onLog,onProgress:p=>onProgress(.08+p*.76)
  });
  const files=listWavs(jobDir).filter(f=>path.basename(f)!=='input.wav');
  if(mode==='four-stem'){
    const stems=['vocals','drums','bass','other'].map(s=>findByStem(files,s)).filter(Boolean);
    if(stems.length<3)throw new Error('4-stem separation finished but expected stem files were not found.');
    onProgress(1);return {files:stems,mode};
  }

  const other=findByStem(files,'other'),drums=findByStem(files,'drums'),bass=findByStem(files,'bass');
  if(!other)throw new Error('Game Audio Focus could not locate the Other/effects stem.');
  onStatus('Building experimental game-audio-focused remix…');onProgress(.86);
  const out=path.join(jobDir,'EMX_Game_Audio_Focus.wav');
  const args=['-y','-i',other];
  const labels=['[0:a]volume=1.0[a0]'];let count=1;
  if(drums){args.push('-i',drums);labels.push(`[${count}:a]volume=0.35[a${count}]`);count++}
  if(bass){args.push('-i',bass);labels.push(`[${count}:a]volume=0.12[a${count}]`);count++}
  const ins=Array.from({length:count},(_,i)=>`[a${i}]`).join('');
  args.push('-filter_complex',`${labels.join(';')};${ins}amix=inputs=${count}:normalize=0,afftdn=nf=-28[mix]`,'-map','[mix]','-ar','48000','-ac','2',out);
  await runProcess(ffmpegPath,args,{onLine:onLog,onProgress:p=>onProgress(.86+p*.12)});
  onProgress(1);return {files:[out],mode};
}
module.exports={progressFromLine,setupAudioAI,aiStatus,processAudioAI};
