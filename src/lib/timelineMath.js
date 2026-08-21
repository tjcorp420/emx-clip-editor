export function clipDuration(c){
  const speed=Math.max(.25,Math.min(4,Number(c?.speed)||1));
  const a=Math.max(0,Number(c?.trimStart)||0);
  const b=Math.max(a+.01,Number(c?.trimEnd)||a+.01);
  return Math.max(.01,(b-a)/speed);
}

export function clipStart(c){
  return Math.max(0,Number(c?.start)||0);
}

export function clipContainsTime(c,time,epsilon=.0005){
  const start=clipStart(c);
  const end=start+clipDuration(c);
  const t=Number(time);
  return Number.isFinite(t)&&t>=start-epsilon&&t<end-epsilon;
}

export function clipAtTime(clips,time){
  return [...(clips||[])]
    .sort((left,right)=>clipStart(left)-clipStart(right))
    .find(clip=>clipContainsTime(clip,time))||null;
}

export function magneticStartForClips(candidate,movingClip,trackClips,snapEnabled,pxPerSec){
  let value=Math.max(0,Number(candidate)||0);
  if(!snapEnabled)return value;
  const thresholdSec=14/Math.max(1,Number(pxPerSec)||1);
  const dur=clipDuration(movingClip);
  const targets=[0];
  for(const other of trackClips||[]){
    if(other.id===movingClip.id)continue;
    targets.push(Number(other.start)||0);
    targets.push((Number(other.start)||0)+clipDuration(other));
  }
  let best=value,bestDist=Infinity;
  for(const t of targets){
    const startDist=Math.abs(value-t);
    if(startDist<thresholdSec&&startDist<bestDist){best=t;bestDist=startDist}
    const endDist=Math.abs(value+dur-t);
    if(endDist<thresholdSec&&endDist<bestDist){best=t-dur;bestDist=endDist}
  }
  return Math.max(0,Math.round(best*1000)/1000);
}

export function trimLeftByDelta(clip,deltaTimelineSeconds){
  const c={...clip};
  const speed=Math.max(.25,Math.min(4,Number(c.speed)||1));
  const originalTrim=Math.max(0,Number(c.trimStart)||0);
  const originalStart=Math.max(0,Number(c.start)||0);
  let newTrim=Math.max(0,Math.min(Number(c.trimEnd)-.05,originalTrim+deltaTimelineSeconds*speed));
  let actual=(newTrim-originalTrim)/speed;
  let newStart=originalStart+actual;
  if(newStart<0){
    actual=-originalStart;
    newStart=0;
    newTrim=Math.max(0,originalTrim+actual*speed);
  }
  c.trimStart=newTrim;
  c.start=newStart;
  return c;
}

export function trimRightByDelta(clip,deltaTimelineSeconds){
  const c={...clip};
  const speed=Math.max(.25,Math.min(4,Number(c.speed)||1));
  const originalTrim=Math.max(0,Number(c.trimEnd)||0);
  c.trimEnd=Math.max(Number(c.trimStart)+.05,Math.min(Number(c.duration)||originalTrim,originalTrim+deltaTimelineSeconds*speed));
  return c;
}

export function splitClipAtTime(clip,time,newId){
  const start=clipStart(clip);
  const dur=clipDuration(clip);
  const t=Number(time);
  if(!Number.isFinite(t)||t<=start+.02||t>=start+dur-.02)return null;
  const speed=Math.max(.25,Math.min(4,Number(clip.speed)||1));
  const sourceSplit=(Number(clip.trimStart)||0)+(t-start)*speed;
  const first={...clip,trimEnd:sourceSplit};
  const second={...clip,id:newId,start:t,trimStart:sourceSplit};
  return {first,second};
}
