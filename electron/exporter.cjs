
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { normalizeWatermark, watermarkRenderWidth, watermarkMargin, overlayXY } = require('./branding.cjs');
const visualConfig = require('./visuals.json');

function n(v, fallback=0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function projectDuration(project) {
  const ends = [];
  for (const c of [...(project.videoClips||[]), ...(project.audioClips||[]), ...(project.overlayClips||[])]) {
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
function normalizeClipVisual(visual={}) {
  const defaults = visualConfig.defaultClipVisual;
  return {
    brightness: clamp(n(visual.brightness, defaults.brightness), -.5, .5),
    contrast: clamp(n(visual.contrast, defaults.contrast), .5, 2),
    saturation: clamp(n(visual.saturation, defaults.saturation), 0, 2),
    blur: clamp(n(visual.blur, defaults.blur), 0, 10),
    hue: clamp(n(visual.hue, defaults.hue), -180, 180),
    vignette: clamp(n(visual.vignette, defaults.vignette), 0, 1),
    zoom: clamp(n(visual.zoom, defaults.zoom), 1, 3),
    panX: clamp(n(visual.panX, defaults.panX), -1, 1),
    panY: clamp(n(visual.panY, defaults.panY), -1, 1)
  };
}
function videoFramingFilters(width,height,fit,visual={}) {
  const zoom=clamp(n(visual.zoom,1),1,3);
  const panX=clamp(n(visual.panX,0),-1,1);
  const panY=clamp(n(visual.panY,0),-1,1);
  const filters=[`scale=${width}:${height}:force_original_aspect_ratio=${fit==='cover'?'increase':'decrease'}`];
  if(fit==='contain')filters.push(`pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black`);
  if(zoom>1.000001){
    filters.push(`scale='trunc(iw*${zoom.toFixed(6)}/2)*2':'trunc(ih*${zoom.toFixed(6)}/2)*2'`);
  }
  if(fit==='cover'||zoom>1.000001){
    filters.push(`crop=${width}:${height}:x='(iw-ow)/2*(1+${panX.toFixed(6)})':y='(ih-oh)/2*(1+${panY.toFixed(6)})'`);
  }
  return filters;
}
function combinedVisual(projectEffects, clipVisual) {
  const global = projectEffects || {};
  const local = normalizeClipVisual(clipVisual);
  return {
    brightness: clamp(n(global.brightness, 0) + local.brightness, -.9, .9),
    contrast: clamp(n(global.contrast, 1) * local.contrast, .1, 3),
    saturation: clamp(n(global.saturation, 1) * local.saturation, 0, 3),
    blur: clamp(n(global.blur, 0) + local.blur, 0, 20),
    hue: local.hue,
    vignette: local.vignette,
    zoom: local.zoom,
    panX: local.panX,
    panY: local.panY
  };
}
function incomingTransitionType(c={}) {
  if (typeof c.transitionInStyle === 'string' && c.transitionInStyle) return c.transitionInStyle;
  return n(c.transitionIn,0) > 0 ? 'crossfade' : 'none';
}
function alphaTransition(type) {
  return type === 'crossfade' || type === 'dip-black';
}
function videoTransitionFilters(c, outDur) {
  const filters=[];
  const fadeIn=alphaTransition(incomingTransitionType(c))?clamp(n(c.transitionIn,0),0,Math.max(0,outDur-.01)):0;
  const fadeOut=alphaTransition(c.transitionOut)?clamp(n(c.transitionDuration,.45),0,Math.max(0,outDur-.01)):0;
  if(fadeIn>0)filters.push(`fade=t=in:st=0:d=${fadeIn.toFixed(6)}:alpha=1`);
  if(fadeOut>0)filters.push(`fade=t=out:st=${Math.max(0,outDur-fadeOut).toFixed(6)}:d=${fadeOut.toFixed(6)}:alpha=1`);
  return filters;
}
function videoOverlayX(c={}) {
  const style=incomingTransitionType(c);
  const duration=clamp(n(c.transitionIn,0),0,2);
  if(!duration||(style!=='slide-left'&&style!=='slide-right'))return '0';
  const start=Math.max(0,n(c.start,0));
  const end=start+duration;
  const offset=`W*(1-(t-${start.toFixed(6)})/${duration.toFixed(6)})`;
  return style==='slide-left'
    ? `if(lt(t\\,${end.toFixed(6)})\\,${offset}\\,0)`
    : `if(lt(t\\,${end.toFixed(6)})\\,-${offset}\\,0)`;
}
function normalizedOverlay(c={}) {
  const defaults=visualConfig.defaultOverlay;
  const position=visualConfig.positions.includes(c.position)?c.position:defaults.position;
  return {
    opacity:clamp(n(c.opacity,defaults.opacity),.1,1),
    scale:clamp(n(c.scale,defaults.scale),.08,1),
    position,
    visual:normalizeClipVisual(c.visual)
  };
}
function generatedEffectDrawboxes(kind,start,end,phase) {
  const enabled=`between(t,${start},${end})`;
  if(kind==='particle-rain'){
    return Array.from({length:14},(_,index)=>{
      const x=((index*37+9)%97)/100;
      const offset=(index*29)%251;
      const speed=76+(index%5)*23;
      const color=index%3===0?'0xB8FFAB@0.78':index%3===1?'white@0.72':'0xD56CFF@0.70';
      return `drawbox=x='${x.toFixed(3)}*iw':y='mod(${offset}+${speed}*t\,ih+24)-12':w=${3+(index%3)}:h=${8+(index%4)*2}:color=${color}:t=fill:enable='${enabled}'`;
    }).join(',');
  }
  if(kind==='sparkle-burst'){
    const filters=[];
    for(let index=0;index<10;index++){
      const x=((index*41+13)%91)/100;
      const y=((index*31+17)%83)/100;
      const pulse=`${enabled}*gt(sin(${(5.4+(index%4)*.7).toFixed(2)}*PI*${phase}+${(index*.73).toFixed(2)})\,0.28)`;
      const color=index%3===0?'white@0.92':index%3===1?'0xDFFFF4@0.88':'0xE9C6FF@0.86';
      filters.push(`drawbox=x='${x.toFixed(3)}*iw-6':y='${y.toFixed(3)}*ih-1':w=12:h=2:color=${color}:t=fill:enable='${pulse}'`);
      filters.push(`drawbox=x='${x.toFixed(3)}*iw-1':y='${y.toFixed(3)}*ih-6':w=2:h=12:color=${color}:t=fill:enable='${pulse}'`);
    }
    return filters.join(',');
  }
  return '';
}
function timedEffectFilter(c={},width=1920,height=1080) {
  const start=Math.max(0,n(c.start,0));
  const speed=clamp(n(c.speed,1),.25,4);
  const trimStart=Math.max(0,n(c.trimStart,0));
  const trimEnd=Math.max(trimStart+.01,n(c.trimEnd,trimStart+.01));
  const end=start+(trimEnd-trimStart)/speed;
  const s=start.toFixed(6),e=end.toFixed(6),phase=`(t-${s}+${trimStart.toFixed(6)})`;
  const enabled=`enable='between(t,${s},${e})'`;
  switch(c.effectId) {
    case 'neon-pulse':
      return `eq=brightness='0.03+0.08*(sin(4*PI*${phase})+1)/2':contrast='1+0.22*(sin(4*PI*${phase})+1)/2':saturation='1+0.5*(sin(4*PI*${phase})+1)/2':eval=frame:${enabled},hue=h='12*sin(2*PI*${phase})':${enabled}`;
    case 'flash-strobe':
      return `eq=brightness='0.38*gt(sin(12*PI*${phase})\,0.72)':contrast=1.12:eval=frame:${enabled}`;
    case 'rgb-wave':
      return `hue=h='55*sin(1.5*PI*${phase})':s='1.25+0.2*(sin(3*PI*${phase})+1)/2':${enabled}`;
    case 'focus-beat':
      return `gblur=sigma=2.4:${enabled},eq=contrast='1+0.16*(1-(sin(2.6*PI*${phase})+1)/2)':eval=frame:${enabled}`;
    case 'mono-flicker':
      return `hue=s='0.05+0.95*lte(sin(8*PI*${phase})\,0.1)':${enabled},eq=contrast=1.14:${enabled}`;
    case 'warm-flicker':
      return `eq=brightness='0.03+0.07*(sin(6.2*PI*${phase})+1)/2':saturation=1.12:eval=frame:${enabled},hue=h='8+12*sin(2.2*PI*${phase})':${enabled}`;
    case 'nightclub':
      return `hue=h='100*sin(3.6*PI*${phase})':s=1.5:${enabled},eq=contrast=1.15:${enabled}`;
    case 'vignette-pulse':
      return `vignette=angle='PI/(4+1.4*sin(2.4*PI*${phase}))':eval=frame:${enabled},eq=brightness='-0.04*(sin(2.4*PI*${phase})+1)/2':eval=frame:${enabled}`;
    case 'sparkle-burst':
      return `${generatedEffectDrawboxes('sparkle-burst',s,e,phase)},eq=brightness='0.025*(sin(6.8*PI*${phase})+1)/2':eval=frame:${enabled}`;
    case 'particle-rain':
      return `${generatedEffectDrawboxes('particle-rain',s,e,phase)},eq=contrast=1.08:brightness=0.015:${enabled}`;
    case 'negative-flash':
      return `negate=enable='between(t,${s},${e})*gt(sin(5*PI*${phase})\,0.52)',eq=contrast=1.08:${enabled}`;
    case 'bw-flash':
      return `hue=s='if(gt(sin(6*PI*${phase})\,0.12)\,0\,1)':${enabled},eq=contrast=1.12:${enabled}`;
    case 'camera-shake':
      return `rotate=angle='0.0061*sin(11*PI*${phase})':ow=iw:oh=ih:fillcolor=black:${enabled},scale=${Math.max(2,Math.round(width))}:${Math.max(2,Math.round(height))}`;
    case 'zoom-pulse':
      return `scale=w='iw*(1+0.095*(sin(2.7*PI*${phase})+1)/2*between(t,${s},${e}))':h='ih*(1+0.095*(sin(2.7*PI*${phase})+1)/2*between(t,${s},${e}))':eval=frame,crop=${Math.max(2,Math.round(width))}:${Math.max(2,Math.round(height))}`;
    case 'glitch-scan':
      return `hue=h='if(gt(sin(15*PI*${phase})\,0.35)\,42\,-18)':s=1.35:${enabled},noise=alls=9:allf=t+u:${enabled},eq=contrast=1.18:${enabled}`;
    default:
      return '';
  }
}
function buildExportArgs(project, probeByPath, outputPath) {
  const width = Math.max(320, Math.round(n(project.export?.width,1920)));
  const height = Math.max(240, Math.round(n(project.export?.height,1080)));
  const fps = clamp(Math.round(n(project.export?.fps,60)), 24, 120);
  const crf = clamp(Math.round(n(project.export?.crf,23)), 16, 35);
  const dur = projectDuration(project);
  const videos = [...(project.videoClips||[])].sort((a,b)=>n(a.start)-n(b.start));
  const audios = [...(project.audioClips||[])].sort((a,b)=>n(a.start)-n(b.start));
  const overlays = [...(project.overlayClips||[])].sort((a,b)=>n(a.start)-n(b.start));
  const effectClips = [...(project.effectClips||[])].sort((a,b)=>n(a.start)-n(b.start));
  const fit = project.export?.fit==='cover'?'cover':'contain';

  const inputs = [];
  const filters = [`color=c=black:s=${width}x${height}:r=${fps}:d=${dur.toFixed(6)}[base]`];
  const audioLabels = [];

  videos.forEach((c,i) => {
    inputs.push('-i', c.path);
    const trimStart = Math.max(0,n(c.trimStart,0));
    const trimEnd = Math.max(trimStart+.01,n(c.trimEnd,trimStart+.01));
    const speed = clamp(n(c.speed,1),.25,4);
    const start = Math.max(0,n(c.start,0));
    const visual = combinedVisual(project.effects, c.visual);
    const outDur=(trimEnd-trimStart)/speed;
    const freezeSource=clamp(n(c.freezeSourceTime,0),0,Number.MAX_SAFE_INTEGER);
    const sourceTiming=c.isFreeze?[
      `trim=start=${freezeSource.toFixed(6)}:end=${(freezeSource+Math.max(.02,1/fps)).toFixed(6)}`,
      'setpts=PTS-STARTPTS',
      `tpad=stop_mode=clone:stop_duration=${outDur.toFixed(6)}`,
      `trim=duration=${outDur.toFixed(6)}`
    ]:[
      `trim=start=${trimStart}:end=${trimEnd}`,
      'setpts=PTS-STARTPTS',
      `setpts=PTS/${speed}`
    ];

    const fx = [
      ...sourceTiming,
      `eq=brightness=${visual.brightness}:contrast=${visual.contrast}:saturation=${visual.saturation}`,
      visual.hue!==0 ? `hue=h=${visual.hue}` : null,
      visual.blur>0 ? `gblur=sigma=${visual.blur}` : null,
      visual.vignette>0 ? `vignette=angle=${(1.6-visual.vignette*1.2).toFixed(6)}` : null,
      ...videoFramingFilters(width,height,fit,visual),
      `fps=${fps}`,
      'format=rgba',
      ...videoTransitionFilters(c,outDur),
      `setpts=PTS+${start}/TB`
    ].filter(Boolean).join(',');
    filters.push(`[${i}:v]${fx}[vid${i}]`);

    if (!c.isFreeze && hasAudio(probeByPath.get(c.path))) {
      const delay = Math.round(start*1000);
      const volume = clamp(n(c.volume,1),0,4);
      filters.push(
        (() => { const od=(trimEnd-trimStart)/speed; const fades=audioFadeChain(c,od); return `[${i}:a]atrim=start=${trimStart}:end=${trimEnd},asetpts=PTS-STARTPTS,${atempoChain(speed)},volume=${volume}${fades.length?','+fades.join(','):''},adelay=${delay}:all=1[audv${i}]`; })()
      );
      audioLabels.push(`[audv${i}]`);
    }
  });

  let current='base';
  videos.forEach((clip,i)=>{
    const next=`comp${i}`;
    filters.push(`[${current}][vid${i}]overlay=x=${videoOverlayX(clip)}:y=0:eof_action=pass:repeatlast=0:shortest=0[${next}]`);
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

  let composited='vbase';
  const overlayBaseIndex=videos.length+audios.length;
  overlays.forEach((c,index)=>{
    const overlay=normalizedOverlay(c);
    const trimStart=Math.max(0,n(c.trimStart,0));
    const trimEnd=Math.max(trimStart+.01,n(c.trimEnd,trimStart+.01));
    const speed=clamp(n(c.speed,1),.25,4);
    const start=Math.max(0,n(c.start,0));
    const outDur=(trimEnd-trimStart)/speed;
    const inputIndex=overlayBaseIndex+index;
    const overlayWidth=Math.max(1,Math.round(width*overlay.scale));
    const position=overlayXY(overlay.position,watermarkMargin(width,height));
    inputs.push('-loop','1','-framerate',String(fps),'-i',c.path);
    const label=`overlay${index}`;
    const visual=combinedVisual({brightness:0,contrast:1,saturation:1,blur:0},overlay.visual);
    const fx=[
      `trim=start=${trimStart}:end=${trimEnd}`,
      'setpts=PTS-STARTPTS',
      `setpts=PTS/${speed}`,
      `eq=brightness=${visual.brightness}:contrast=${visual.contrast}:saturation=${visual.saturation}`,
      visual.hue!==0 ? `hue=h=${visual.hue}` : null,
      visual.blur>0 ? `gblur=sigma=${visual.blur}` : null,
      visual.vignette>0 ? `vignette=angle=${(1.6-visual.vignette*1.2).toFixed(6)}` : null,
      `scale=${overlayWidth}:-1`,
      'format=rgba',
      `colorchannelmixer=aa=${overlay.opacity.toFixed(3)}`,
      `trim=duration=${outDur.toFixed(6)}`,
      `setpts=PTS+${start}/TB`
    ].filter(Boolean).join(',');
    filters.push(`[${inputIndex}:v]${fx}[${label}]`);
    const next=`overlayComp${index}`;
    filters.push(`[${composited}][${label}]overlay=x=${position.x}:y=${position.y}:eof_action=pass:repeatlast=0:shortest=0[${next}]`);
    composited=next;
  });

  effectClips.forEach((clip,index)=>{
    const effectFilter=timedEffectFilter(clip,width,height);
    if(!effectFilter)return;
    const next=`effectComp${index}`;
    filters.push(`[${composited}]${effectFilter}[${next}]`);
    composited=next;
  });


  const watermark = normalizeWatermark(project.branding);
  const watermarkPath = String(project.branding?.assetPath || '');
  const watermarkIndex = videos.length + audios.length + overlays.length;
  const watermarkWidth = watermarkRenderWidth(width);
  const watermarkPosition = overlayXY(watermark.position, watermarkMargin(width, height));
  inputs.push('-loop', '1', '-i', watermarkPath);
  filters.push(`[${watermarkIndex}:v]format=rgba,scale=${watermarkWidth}:-1,colorchannelmixer=aa=${watermark.opacity.toFixed(3)}[emxwatermark]`);
  filters.push(`[${composited}][emxwatermark]overlay=x=${watermarkPosition.x}:y=${watermarkPosition.y}:eof_action=repeat:shortest=0[vwatermarked]`);
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
  const all=[...(project.videoClips||[]),...(project.audioClips||[]),...(project.overlayClips||[])];
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
  projectDuration,atempoChain,probe,hasAudio,timedEffectFilter,videoFramingFilters,buildExportArgs,validateProject,
  exportProject,extractAudio,versionLine,run
};
