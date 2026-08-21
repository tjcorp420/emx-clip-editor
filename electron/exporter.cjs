
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { normalizeWatermark, watermarkRenderWidth, watermarkMargin, overlayXY } = require('./branding.cjs');

function n(v, fallback=0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function projectDuration(project) {
  const ends = [];
  for (const c of [...(project.videoClips||[]), ...(project.audioClips||[])]) {
    const speed = clamp(n(c.speed,1), .25, 4);
    const trimStart = Math.max(0,n(c.trimStart,0));
    const trimEnd = Math.max(trimStart+.01,n(c.trimEnd,trimStart+.01));
    ends.push(Math.max(0,n(c.start,0)) + (trimEnd-trimStart)/speed);
  }
  return Math.max(.1, ...ends, .1);
}

function atempoChain(speed) {
  let s = clamp(n(speed,1), .25, 4);
  const parts = [];
  while (s > 2.000001) { parts.push('atempo=2'); s /= 2; }
  while (s < .499999) { parts.push('atempo=.5'); s /= .5; }
  parts.push(`atempo=${s.toFixed(6)}`);
  return parts.join(',');
}

function secondsFromFfmpegTime(text) {
  const m = /time=(\d+):(\d+):([\d.]+)/.exec(text);
  if (!m) return null;
  return (+m[1])*3600 + (+m[2])*60 + (+m[3]);
}

function run(bin, args, { duration=0, onProgress=()=>{}, onLog=()=>{} }={}) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide:true });
    let stderr = '';
    child.stderr.on('data', chunk => {
      const line = chunk.toString();
      stderr += line;
      onLog(line.trim().slice(-1200));
      if (duration > 0) {
        const t = secondsFromFfmpegTime(line);
        if (t !== null) onProgress(clamp(t/duration,0,.99));
      }
    });
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) {
        onProgress(1);
        resolve(stderr);
      } else {
        reject(new Error(`FFmpeg exited with code ${code}.\n${stderr.slice(-5000)}`));
      }
    });
  });
}

async function probe(ffprobePath, filePath) {
  return await new Promise((resolve, reject) => {
    const args = ['-v','error','-show_entries','format=duration:stream=codec_type,codec_name,width,height,avg_frame_rate,r_frame_rate,sample_rate','-of','json',filePath];
    const child = spawn(ffprobePath, args, { windowsHide:true });
    let out='', err='';
    child.stdout.on('data',d=>out+=d.toString());
    child.stderr.on('data',d=>err+=d.toString());
    child.on('error',reject);
    child.on('close',code=>{
      if(code!==0) return reject(new Error(`FFprobe failed for ${filePath}: ${err}`));
      try { resolve(JSON.parse(out)); } catch(e) { reject(e); }
    });
  });
}

function hasAudio(info) {
  return !!info?.streams?.some(s=>s.codec_type==='audio');
}

function audioFadeChain(c,outDur){
  const filters=[];
  const fadeIn=clamp(n(c.fadeIn,0),0,outDur);
  const fadeOut=clamp(n(c.fadeOut,0),0,outDur);
  if(fadeIn>0)filters.push(`afade=t=in:st=0:d=${fadeIn.toFixed(6)}`);
  if(fadeOut>0)filters.push(`afade=t=out:st=${Math.max(0,outDur-fadeOut).toFixed(6)}:d=${fadeOut.toFixed(6)}`);
  return filters;
}
function buildExportArgs(project, probeByPath, outputPath) {
  const width = Math.max(320, Math.round(n(project.export?.width,1920)));
  const height = Math.max(240, Math.round(n(project.export?.height,1080)));
  const fps = clamp(Math.round(n(project.export?.fps,60)), 24, 120);
  const crf = clamp(Math.round(n(project.export?.crf,23)), 16, 35);
  const dur = projectDuration(project);
  const videos = [...(project.videoClips||[])].sort((a,b)=>n(a.start)-n(b.start));
  const audios = [...(project.audioClips||[])].sort((a,b)=>n(a.start)-n(b.start));

  const inputs = [];
  const filters = [`color=c=black:s=${width}x${height}:r=${fps}:d=${dur.toFixed(6)}[base]`];
  const audioLabels = [];

  videos.forEach((c,i) => {
    inputs.push('-i', c.path);
    const trimStart = Math.max(0,n(c.trimStart,0));
    const trimEnd = Math.max(trimStart+.01,n(c.trimEnd,trimStart+.01));
    const speed = clamp(n(c.speed,1),.25,4);
    const start = Math.max(0,n(c.start,0));
    const brightness = clamp(n(project.effects?.brightness,0),-.9,.9);
    const contrast = clamp(n(project.effects?.contrast,1),.1,3);
    const saturation = clamp(n(project.effects?.saturation,1),0,3);
    const blur = clamp(n(project.effects?.blur,0),0,20);

    const fx = [
      `trim=start=${trimStart}:end=${trimEnd}`,
      'setpts=PTS-STARTPTS',
      `setpts=PTS/${speed}`,
      `eq=brightness=${brightness}:contrast=${contrast}:saturation=${saturation}`,
      blur>0 ? `gblur=sigma=${blur}` : null,
      `scale=${width}:${height}:force_original_aspect_ratio=decrease`,
      `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black`,
      `fps=${fps}`,
      'format=yuv420p',
      `setpts=PTS+${start}/TB`
    ].filter(Boolean).join(',');
    filters.push(`[${i}:v]${fx}[vid${i}]`);

    if (hasAudio(probeByPath.get(c.path))) {
      const delay = Math.round(start*1000);
      const volume = clamp(n(c.volume,1),0,4);
      filters.push(
        (() => { const od=(trimEnd-trimStart)/speed; const fades=audioFadeChain(c,od); return `[${i}:a]atrim=start=${trimStart}:end=${trimEnd},asetpts=PTS-STARTPTS,${atempoChain(speed)},volume=${volume}${fades.length?','+fades.join(','):''},adelay=${delay}:all=1[audv${i}]`; })()
      );
      audioLabels.push(`[audv${i}]`);
    }
  });

  let current='base';
  videos.forEach((_,i)=>{
    const next=`comp${i}`;
    filters.push(`[${current}][vid${i}]overlay=x=0:y=0:eof_action=pass:repeatlast=0:shortest=0[${next}]`);
    current=next;
  });
  filters.push(`[${current}]trim=duration=${dur.toFixed(6)},setpts=PTS-STARTPTS[vbase]`);

  const audioBaseIndex = videos.length;
  audios.forEach((c,j)=>{
    const idx=audioBaseIndex+j;
    inputs.push('-i',c.path);
    const trimStart=Math.max(0,n(c.trimStart,0));
    const trimEnd=Math.max(trimStart+.01,n(c.trimEnd,trimStart+.01));
    const speed=clamp(n(c.speed,1),.25,4);
    const start=Math.max(0,n(c.start,0));
    const volume=clamp(n(c.volume,1),0,4);
    const delay=Math.round(start*1000);
    filters.push(
      (() => { const od=(trimEnd-trimStart)/speed; const fades=audioFadeChain(c,od); return `[${idx}:a]atrim=start=${trimStart}:end=${trimEnd},asetpts=PTS-STARTPTS,${atempoChain(speed)},volume=${volume}${fades.length?','+fades.join(','):''},adelay=${delay}:all=1[aude${j}]`; })()
    );
    audioLabels.push(`[aude${j}]`);
  });

  if(audioLabels.length===0) {
    filters.push(`anullsrc=r=48000:cl=stereo,atrim=duration=${dur.toFixed(6)}[aout]`);
  } else if(audioLabels.length===1) {
    filters.push(`${audioLabels[0]}atrim=duration=${dur.toFixed(6)},asetpts=PTS-STARTPTS[aout]`);
  } else {
    filters.push(`${audioLabels.join('')}amix=inputs=${audioLabels.length}:normalize=0:dropout_transition=0,atrim=duration=${dur.toFixed(6)},asetpts=PTS-STARTPTS[aout]`);
  }


  const watermark = normalizeWatermark(project.branding);
  const watermarkPath = String(project.branding?.assetPath || '');
  const watermarkIndex = videos.length + audios.length;
  const watermarkWidth = watermarkRenderWidth(width);
  const watermarkPosition = overlayXY(watermark.position, watermarkMargin(width, height));
  inputs.push('-loop', '1', '-i', watermarkPath);
  filters.push(`[${watermarkIndex}:v]format=rgba,scale=${watermarkWidth}:-1,colorchannelmixer=aa=${watermark.opacity.toFixed(3)}[emxwatermark]`);
  filters.push(`[vbase][emxwatermark]overlay=x=${watermarkPosition.x}:y=${watermarkPosition.y}:eof_action=repeat:shortest=0[vwatermarked]`);
  filters.push('[vwatermarked]format=yuv420p[vout]');

  const args = [
    '-y',
    ...inputs,
    '-filter_complex', filters.join(';'),
    '-map','[vout]',
    '-map','[aout]',
    '-c:v','libx264',
    '-preset', project.export?.preset || 'veryfast',
    '-crf',String(crf),
    '-c:a','aac',
    '-b:a','192k',
    '-ar','48000',
    '-movflags','+faststart',
    '-t',dur.toFixed(6),
    outputPath
  ];

  return { args, duration:dur, filterGraph:filters.join(';') };
}

async function validateProject(project, ffprobePath) {
  if(!project.videoClips?.length) throw new Error('No video clips are on the timeline.');
  const all=[...(project.videoClips||[]),...(project.audioClips||[])];
  for(const c of all) {
    if(!c.path) throw new Error(`No desktop file path is available for "${c.name||'media'}". Re-import it in the desktop app.`);
    if(!fs.existsSync(c.path)) throw new Error(`Source file no longer exists: ${c.path}`);
    if(n(c.trimEnd)<=n(c.trimStart)) throw new Error(`Invalid trim range on "${c.name||'clip'}".`);
  }
  const watermarkPath=String(project.branding?.assetPath||'');
  if(!watermarkPath)throw new Error('Permanent EMX Clips watermark resource is unavailable.');
  if(!fs.existsSync(watermarkPath))throw new Error(`Permanent EMX Clips watermark resource is missing: ${watermarkPath}`);
  const unique=[...new Set(all.map(c=>c.path))];
  const probes=new Map();
  for(const p of unique) probes.set(p,await probe(ffprobePath,p));
  return probes;
}

async function exportProject({project,ffmpegPath,ffprobePath,outputPath,onProgress,onLog}) {
  const probes=await validateProject(project,ffprobePath);
  const {args,duration}=buildExportArgs(project,probes,outputPath);
  await run(ffmpegPath,args,{duration,onProgress,onLog});
  if(!fs.existsSync(outputPath) || fs.statSync(outputPath).size<1024) {
    throw new Error('FFmpeg finished but no valid MP4 was created.');
  }
  const outProbe=await probe(ffprobePath,outputPath);
  const hasV=outProbe.streams?.some(s=>s.codec_type==='video');
  const hasA=outProbe.streams?.some(s=>s.codec_type==='audio');
  if(!hasV) throw new Error('Export verification failed: output MP4 has no video stream.');
  if(!hasA) throw new Error('Export verification failed: output MP4 has no audio stream.');
  return { outputPath, duration:n(outProbe.format?.duration,duration), size:fs.statSync(outputPath).size };
}

async function extractAudio({inputPath,outputPath,ffmpegPath,ffprobePath,onProgress,onLog}) {
  if(!inputPath || !fs.existsSync(inputPath)) throw new Error('The selected source file is missing.');
  const info=await probe(ffprobePath,inputPath);
  if(!hasAudio(info)) throw new Error('The selected video has no audio stream to extract.');
  const duration=n(info.format?.duration,0);
  await run(ffmpegPath,['-y','-i',inputPath,'-map','0:a:0','-vn','-c:a','aac','-b:a','192k','-ar','48000',outputPath],{duration,onProgress,onLog});
  if(!fs.existsSync(outputPath) || fs.statSync(outputPath).size<256) throw new Error('Audio extraction produced no valid output file.');
  const outInfo=await probe(ffprobePath,outputPath);
  if(!hasAudio(outInfo)) throw new Error('Audio extraction verification failed.');
  return {outputPath,size:fs.statSync(outputPath).size,duration:n(outInfo.format?.duration,duration)};
}

async function versionLine(binary) {
  return await new Promise((resolve,reject)=>{
    const child=spawn(binary,['-version'],{windowsHide:true});
    let out='';
    child.stdout.on('data',d=>out+=d.toString());
    child.stderr.on('data',d=>out+=d.toString());
    child.on('error',reject);
    child.on('close',code=>{
      if(code!==0)return reject(new Error(`Could not run ${binary}`));
      resolve(out.split(/\r?\n/)[0]||'Unknown version');
    });
  });
}

module.exports={
  projectDuration,atempoChain,probe,hasAudio,buildExportArgs,validateProject,
  exportProject,extractAudio,versionLine,run
};
