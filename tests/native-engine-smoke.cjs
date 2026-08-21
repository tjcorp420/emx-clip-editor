
const fs=require('fs');
const os=require('os');
const path=require('path');
const {spawnSync}=require('child_process');
const assert=require('assert');
const {exportProject,extractAudio,probe,buildExportArgs}=require('../electron/exporter.cjs');
const {normalizeWatermark}=require('../electron/branding.cjs');

function resolveBins(){
  let ffmpeg=process.env.EMX_FFMPEG_PATH;
  let ffprobe=process.env.EMX_FFPROBE_PATH;
  if(!ffmpeg)ffmpeg=require('ffmpeg-static');
  if(!ffprobe)ffprobe=require('ffprobe-static').path;
  return{ffmpeg,ffprobe};
}
function run(bin,args){
  const r=spawnSync(bin,args,{stdio:'pipe',encoding:'utf8',windowsHide:true});
  if(r.status!==0)throw new Error(`${bin} failed:\n${r.stderr}`);
}
function rawFrame(bin,input){
  const r=spawnSync(bin,['-ss','0.8','-i',input,'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','pipe:1'],{stdio:'pipe',windowsHide:true});
  if(r.status!==0)throw new Error(`Could not extract watermark verification frame:\n${r.stderr}`);
  return r.stdout;
}

(async()=>{
  const {ffmpeg,ffprobe}=resolveBins();
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'emx-clip-smoke-'));
  const c1=path.join(dir,'clip1.mp4');
  const c2=path.join(dir,'clip2.mp4');
  const extra=path.join(dir,'extra.m4a');
  const out=path.join(dir,'out.mp4');
  const visualOutput=path.join(dir,'visual-out.mp4');
  const slideOutput=path.join(dir,'slide-out.mp4');
  const freezeOutput=path.join(dir,'freeze-out.mp4');
  const watermarkInput=path.join(dir,'watermark-input.mp4');
  const watermarkOutput=path.join(dir,'watermark-out.mp4');
  const extracted=path.join(dir,'extracted.m4a');
  const watermarkAsset=path.join(__dirname,'..','build','branding','EMXCLIPSWATERMARK-render.png');

  run(ffmpeg,['-y','-f','lavfi','-i','testsrc=size=640x360:rate=30','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','2','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac',c1]);
  run(ffmpeg,['-y','-f','lavfi','-i','testsrc2=size=640x360:rate=30','-f','lavfi','-i','sine=frequency=660:sample_rate=48000','-t','2','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac',c2]);
  run(ffmpeg,['-y','-f','lavfi','-i','sine=frequency=880:sample_rate=48000','-t','1.2','-c:a','aac',extra]);
  run(ffmpeg,['-y','-f','lavfi','-i','color=c=black:s=640x360:r=30','-f','lavfi','-i','sine=frequency=330:sample_rate=48000','-t','2','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac',watermarkInput]);

  await extractAudio({inputPath:c1,outputPath:extracted,ffmpegPath:ffmpeg,ffprobePath:ffprobe});

  await exportProject({
    ffmpegPath:ffmpeg,ffprobePath:ffprobe,outputPath:out,
    project:{
      videoClips:[
        {name:'c1',path:c1,start:0,trimStart:0,trimEnd:2,speed:1,volume:1},
        {name:'c2',path:c2,start:3,trimStart:0,trimEnd:2,speed:1,volume:1}
      ],
      audioClips:[
        {name:'extra',path:extra,start:.5,trimStart:0,trimEnd:1.2,speed:1,volume:.5}
      ],
      effects:{brightness:0,contrast:1,saturation:1,blur:0},
      branding:{...normalizeWatermark({opacity:.75,position:'bottom-right'}),assetPath:watermarkAsset},
      export:{width:640,height:360,fps:30,crf:25,preset:'ultrafast'}
    }
  });

  const info=await probe(ffprobe,out);
  const dur=Number(info.format?.duration||0);
  const hasV=info.streams?.some(s=>s.codec_type==='video');
  const hasA=info.streams?.some(s=>s.codec_type==='audio');
  if(!hasV||!hasA||dur<4.8)throw new Error(`Smoke export verification failed: duration=${dur}, video=${hasV}, audio=${hasA}`);

  const visualProject={
    videoClips:[
      {name:'c1',path:c1,start:0,trimStart:0,trimEnd:2,speed:1,volume:1,transitionOut:'crossfade',transitionDuration:.5,transitionIn:0,visual:{brightness:.02,contrast:1.1,saturation:1.2,blur:0,hue:4,vignette:.15}},
      {name:'c2',path:c2,start:1.5,trimStart:0,trimEnd:2,speed:1,volume:1,transitionIn:.5,visual:{brightness:0,contrast:1,saturation:1,blur:.2,hue:0,vignette:0}}
    ],
    audioClips:[],
    overlayClips:[{name:'emx-overlay',path:watermarkAsset,start:.4,trimStart:0,trimEnd:1.4,speed:1,opacity:.9,scale:.28,position:'top-left',visual:{brightness:0,contrast:1,saturation:1,blur:0,hue:0,vignette:0}}],
    effectClips:['neon-pulse','flash-strobe','rgb-wave','focus-beat','mono-flicker','warm-flicker','nightclub','vignette-pulse'].map((effectId,index)=>({
      id:`effect-${index}`,effectId,name:effectId,start:.25,trimStart:0,trimEnd:2.5,speed:1
    })),
    effects:{brightness:0,contrast:1,saturation:1,blur:0},
    branding:{...normalizeWatermark({opacity:.75,position:'bottom-right'}),assetPath:watermarkAsset},
    export:{width:640,height:360,fps:30,crf:25,preset:'ultrafast'}
  };
  const visualGraph=buildExportArgs(visualProject,new Map([[c1,{streams:[{codec_type:'audio'}]}],[c2,{streams:[{codec_type:'audio'}]}]]),visualOutput).filterGraph;
  assert.ok(visualGraph.includes('overlayComp0'),'Visual export graph must contain the timed image overlay compositor.');
  assert.ok(visualGraph.includes('effectComp7')&&visualGraph.includes("between(t,0.250000,2.750000)"),'Visual export graph must contain every timed animated effect compositor.');
  assert.ok(visualGraph.includes('fade=t=in')&&visualGraph.includes('fade=t=out'),'Visual export graph must contain a real alpha cross fade.');
  await exportProject({ffmpegPath:ffmpeg,ffprobePath:ffprobe,outputPath:visualOutput,project:visualProject});
  const visualInfo=await probe(ffprobe,visualOutput);
  const visualDuration=Number(visualInfo.format?.duration||0);
  if(!visualInfo.streams?.some(stream=>stream.codec_type==='video')||visualDuration<3.3){
    throw new Error(`Visual export verification failed: duration=${visualDuration}`);
  }

  const slideProject={
    ...visualProject,
    videoClips:[
      {...visualProject.videoClips[0],transitionOut:'slide-left',transitionDuration:.5},
      {...visualProject.videoClips[1],transitionIn:.5,transitionInStyle:'slide-left'}
    ],
    overlayClips:[]
  };
  const slideGraph=buildExportArgs(slideProject,new Map([[c1,{streams:[{codec_type:'audio'}]}],[c2,{streams:[{codec_type:'audio'}]}]]),slideOutput).filterGraph;
  assert.ok(slideGraph.includes('overlay=x=if(lt(t\\,'),'Slide export graph must animate an incoming clip position.');
  await exportProject({ffmpegPath:ffmpeg,ffprobePath:ffprobe,outputPath:slideOutput,project:slideProject});
  const slideInfo=await probe(ffprobe,slideOutput);
  if(!slideInfo.streams?.some(stream=>stream.codec_type==='video')||Number(slideInfo.format?.duration||0)<3.3){
    throw new Error('Slide transition export verification failed.');
  }

  await exportProject({
    ffmpegPath:ffmpeg,ffprobePath:ffprobe,outputPath:freezeOutput,
    project:{
      videoClips:[{name:'freeze',path:c1,start:0,trimStart:0,trimEnd:1.25,speed:1,volume:0,isFreeze:true,freezeSourceTime:.7}],
      audioClips:[],overlayClips:[],effectClips:[],effects:{brightness:0,contrast:1,saturation:1,blur:0},
      branding:{...normalizeWatermark({opacity:.75,position:'bottom-right'}),assetPath:watermarkAsset},
      export:{width:360,height:640,fit:'cover',fps:30,crf:25,preset:'ultrafast'}
    }
  });
  const freezeInfo=await probe(ffprobe,freezeOutput);
  if(!freezeInfo.streams?.some(stream=>stream.codec_type==='video')||Number(freezeInfo.format?.duration||0)<1.2){
    throw new Error('Freeze-frame export verification failed.');
  }

  await exportProject({
    ffmpegPath:ffmpeg,ffprobePath:ffprobe,outputPath:watermarkOutput,
    project:{
      videoClips:[{name:'watermark',path:watermarkInput,start:0,trimStart:0,trimEnd:2,speed:1,volume:1}],
      audioClips:[],effects:{brightness:0,contrast:1,saturation:1,blur:0},
      branding:{...normalizeWatermark({opacity:0,position:'top-left'}),assetPath:watermarkAsset},
      export:{width:640,height:360,fps:30,crf:25,preset:'ultrafast'}
    }
  });
  const pixels=rawFrame(ffmpeg,watermarkOutput);
  let visiblePixels=0;
  for(let i=0;i<pixels.length;i+=3){
    if(pixels[i]>18||pixels[i+1]>18||pixels[i+2]>18)visiblePixels++;
  }
  if(visiblePixels<150)throw new Error(`Permanent watermark frame verification failed: only ${visiblePixels} non-black pixels.`);
  console.log('EMX NATIVE ENGINE SMOKE TEST: PASS');
  console.log(`Output duration: ${dur.toFixed(2)}s`);
  console.log(`Visual overlay + cross-fade output duration: ${visualDuration.toFixed(2)}s`);
  console.log(`Slide transition output: ${slideOutput}`);
  console.log(`Freeze-frame vertical output: ${freezeOutput}`);
  console.log(`Permanent watermark frame pixels: ${visiblePixels}`);
  console.log(`Output: ${out}`);
})().catch(err=>{console.error(err);process.exit(1)});
