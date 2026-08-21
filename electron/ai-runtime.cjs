const fs=require('fs');
const path=require('path');
const https=require('https');
const {spawn,spawnSync}=require('child_process');

const PYTHON_VERSION='3.12.10';
const PYTHON_URL=`https://www.python.org/ftp/python/${PYTHON_VERSION}/python-${PYTHON_VERSION}-embed-amd64.zip`;
const GET_PIP_URL='https://bootstrap.pypa.io/get-pip.py';
const AUDIO_SEPARATOR_SPEC='audio-separator[cpu]';
const COMPAT_PACKAGES=['audioread==3.1.0'];

function runtimePaths(base){
  const win=process.platform==='win32';
  return {
    base,
    python:path.join(base,win?'python.exe':'bin/python'),
    cli:path.join(base,win?'Scripts/audio-separator.exe':'bin/audio-separator'),
    scripts:path.join(base,win?'Scripts':'bin'),
    models:path.join(base,'models')
  };
}
function cliReady(base){
  const p=runtimePaths(base);
  if(!fs.existsSync(p.python)||!fs.existsSync(p.cli))return false;
  try{
    const r=spawnSync(p.cli,['--version'],{encoding:'utf8',windowsHide:true});
    return r.status===0;
  }catch{return false}
}
function follow(url,cb){
  https.get(url,{headers:{'User-Agent':'EMX-Clip-Studio/1.7'}},res=>{
    if(res.statusCode>=300&&res.statusCode<400&&res.headers.location){
      res.resume();
      return follow(new URL(res.headers.location,url).toString(),cb);
    }
    cb(res);
  }).on('error',err=>cb(null,err));
}
function download(url,dest,{onProgress=()=>{},onStatus=()=>{}}={}){
  return new Promise((resolve,reject)=>{
    fs.mkdirSync(path.dirname(dest),{recursive:true});
    const tmp=dest+'.part';
    onStatus(`Downloading ${path.basename(dest)}…`);
    follow(url,(res,err)=>{
      if(err)return reject(err);
      if(!res||res.statusCode!==200)return reject(new Error(`Download failed (${res?.statusCode||'no response'}): ${url}`));
      const total=Number(res.headers['content-length']||0),out=fs.createWriteStream(tmp);
      let got=0;
      res.on('data',chunk=>{got+=chunk.length;if(total)onProgress(got/total)});
      res.pipe(out);
      out.on('finish',()=>out.close(()=>{
        fs.renameSync(tmp,dest);
        onProgress(1);resolve(dest);
      }));
      out.on('error',reject);
    });
  });
}
function run(cmd,args,{cwd,env,onLine=()=>{},onProgress=()=>{}}={}){
  return new Promise((resolve,reject)=>{
    const child=spawn(cmd,args,{cwd,env,windowsHide:true,shell:false});
    let all='';
    const feed=b=>{
      const s=b.toString();all+=s;
      s.split(/\r?\n/).filter(Boolean).forEach(line=>{
        onLine(line);
        const m=line.match(/(\d{1,3}(?:\.\d+)?)\s*%/);
        if(m)onProgress(Math.max(0,Math.min(1,Number(m[1])/100)));
      });
    };
    child.stdout.on('data',feed);child.stderr.on('data',feed);
    child.on('error',reject);
    child.on('close',code=>code===0?resolve(all):reject(new Error(`${path.basename(cmd)} exited with code ${code}\n${all.slice(-6000)}`)));
  });
}
function expandZipWindows(zipPath,dest){
  if(process.platform!=='win32')throw new Error('The friend-ready AI runtime builder currently targets Windows x64.');
  fs.mkdirSync(dest,{recursive:true});
  const command=`Expand-Archive -LiteralPath '${zipPath.replace(/'/g,"''")}' -DestinationPath '${dest.replace(/'/g,"''")}' -Force`;
  const r=spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-Command',command],{
    encoding:'utf8',windowsHide:true
  });
  if(r.status!==0)throw new Error(`Could not unpack private Python runtime.\n${r.stderr||r.stdout||''}`);
}
function patchEmbeddedPython(base){
  const pth=path.join(base,'python312._pth');
  if(!fs.existsSync(pth))throw new Error(`Embedded Python path file missing: ${pth}`);
  let text=fs.readFileSync(pth,'utf8');
  text=text.replace(/^#\s*import site\s*$/m,'import site');
  if(!/^Lib\\site-packages$/m.test(text))text += '\nLib\\site-packages\n';
  if(!/^Scripts$/m.test(text))text += 'Scripts\n';
  fs.writeFileSync(pth,text,'utf8');
}

async function installCompatibilityPackages(p,env,{onStatus=()=>{},onLog=()=>{},onProgress=()=>{}}={}){
  onStatus('Installing EMX Audio AI compatibility packages…');
  await run(p.python,['-m','pip','install',...COMPAT_PACKAGES,'--no-warn-script-location'],{
    env,onLine:onLog,onProgress:q=>onProgress(q)
  });
}
async function verifyRuntimeImports(p,env,{onStatus=()=>{},onLog=()=>{}}={}){
  onStatus('Verifying Audio AI Python imports…');
  const probe=[
    'import audioread',
    'import torch',
    'import onnxruntime',
    'import librosa',
    'from audio_separator.separator import Separator',
    'print("EMX_AUDIO_AI_IMPORTS_OK")'
  ].join(';');
  const out=await run(p.python,['-c',probe],{env,onLine:onLog});
  if(!out.includes('EMX_AUDIO_AI_IMPORTS_OK'))throw new Error('EMX Audio AI import verification did not complete.');
  return true;
}

async function ensureEmbeddedRuntime({
  runtimeDir,ffmpegPath='',onStatus=()=>{},onLog=()=>{},onProgress=()=>{},force=false
}){
  if(process.platform!=='win32')throw new Error('EMX friend-ready Audio AI runtime is built for Windows x64.');
  if(!force&&cliReady(runtimeDir)){
    const p=runtimePaths(runtimeDir);
    return {ok:true,ready:true,source:'existing',runtime:p};
  }

  fs.mkdirSync(runtimeDir,{recursive:true});
  const cache=path.join(runtimeDir,'_bootstrap');
  fs.mkdirSync(cache,{recursive:true});
  const zip=path.join(cache,`python-${PYTHON_VERSION}-embed-amd64.zip`);
  const getPip=path.join(cache,'get-pip.py');
  const p=runtimePaths(runtimeDir);

  if(!fs.existsSync(p.python)){
    if(!fs.existsSync(zip)){
      onStatus('Downloading private Python runtime from python.org…');
      await download(PYTHON_URL,zip,{
        onStatus,onProgress:pct=>onProgress(.02+pct*.13)
      });
    }else onProgress(.15);

    onStatus('Unpacking private EMX Audio AI runtime…');onProgress(.17);
    expandZipWindows(zip,runtimeDir);
    patchEmbeddedPython(runtimeDir);
  }else{
    onStatus('Resuming existing private EMX Audio AI runtime…');onProgress(.18);
    patchEmbeddedPython(runtimeDir);
  }

  if(!fs.existsSync(getPip)){
    onStatus('Downloading Python package bootstrap…');
    await download(GET_PIP_URL,getPip,{
      onStatus,onProgress:pct=>onProgress(.18+pct*.05)
    });
  }
  const env={
    ...process.env,
    PYTHONUTF8:'1',
    PIP_DISABLE_PIP_VERSION_CHECK:'1',
    PATH:`${p.base}${path.delimiter}${p.scripts}${ffmpegPath?path.delimiter+path.dirname(ffmpegPath):''}${path.delimiter}${process.env.PATH||''}`
  };

  const pipCheck=spawnSync(p.python,['-m','pip','--version'],{encoding:'utf8',windowsHide:true,env});
  if(pipCheck.status!==0){
    onStatus('Installing pip into the private runtime…');onProgress(.24);
    await run(p.python,[getPip,'--no-warn-script-location'],{
      env,onLine:onLog,onProgress:q=>onProgress(.24+q*.07)
    });
  }else{
    onStatus('Existing private pip detected…');onProgress(.31);
  }

  onStatus('Preparing Python package tools…');onProgress(.32);
  await run(p.python,['-m','pip','install','--upgrade','pip','setuptools','wheel','--no-warn-script-location'],{
    env,onLine:onLog,onProgress:q=>onProgress(.32+q*.08)
  });

  onStatus('Installing local Audio Separator engine…');onProgress(.41);
  await run(p.python,['-m','pip','install',AUDIO_SEPARATOR_SPEC,'--no-warn-script-location'],{
    env,onLine:onLog,onProgress:q=>onProgress(.41+q*.52)
  });

  onStatus('Installing required EMX compatibility layer…');onProgress(.94);
  await installCompatibilityPackages(p,env,{
    onStatus,onLog,onProgress:q=>onProgress(.94+q*.025)
  });

  onStatus('Verifying friend-ready Audio AI runtime…');onProgress(.97);
  if(!fs.existsSync(p.cli))throw new Error('Audio Separator executable was not created in the private runtime.');

  await verifyRuntimeImports(p,env,{onStatus,onLog});
  const info=await run(p.cli,['--env_info'],{env,onLine:onLog});
  onProgress(1);
  fs.writeFileSync(path.join(runtimeDir,'EMX_RUNTIME_READY.json'),JSON.stringify({
    python:PYTHON_VERSION,audioSeparator:AUDIO_SEPARATOR_SPEC,preparedAt:new Date().toISOString()
  },null,2));
  return {ok:true,ready:true,source:'prepared',runtime:p,info};
}
module.exports={
  PYTHON_VERSION,PYTHON_URL,GET_PIP_URL,AUDIO_SEPARATOR_SPEC,COMPAT_PACKAGES,
  runtimePaths,cliReady,download,patchEmbeddedPython,installCompatibilityPackages,verifyRuntimeImports,ensureEmbeddedRuntime
};
