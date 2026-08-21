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

/** Pixels of pointer travel within which an edge grabs. Generous on purpose:
 *  effect clips are synced to beats by eye, so the grab must feel magnetic. */
export const SNAP_PIXELS=14;

/**
 * Collect every timeline position an edge should lock onto: the start and end
 * of each clip on the given tracks, plus any explicit positions (the playhead,
 * zero, the project end). Positions are de-duplicated so a boundary shared by
 * two adjacent clips does not out-vote a nearby one.
 */
export function collectSnapTargets({tracks=[],extra=[],excludeId=null}={}){
  const targets=new Set([0]);
  for(const clips of tracks){
    for(const clip of clips||[]){
      if(!clip||clip.id===excludeId)continue;
      const start=clipStart(clip);
      targets.add(Math.round(start*1000)/1000);
      targets.add(Math.round((start+clipDuration(clip))*1000)/1000);
    }
  }
  for(const value of extra){
    const t=Number(value);
    if(Number.isFinite(t)&&t>=0)targets.add(Math.round(t*1000)/1000);
  }
  return [...targets].sort((a,b)=>a-b);
}

/**
 * Snap a single edge position to the nearest target inside the threshold.
 * Returns the resolved value plus the target it locked onto, so the caller can
 * draw a guide showing the user exactly what the edge is aligned to.
 */
export function snapEdge(value,targets,thresholdSec){
  const v=Number(value)||0;
  let best=v,bestDist=Infinity,snappedTo=null;
  for(const t of targets||[]){
    const dist=Math.abs(v-t);
    if(dist<thresholdSec&&dist<bestDist){best=t;bestDist=dist;snappedTo=t}
  }
  return {value:Math.round(best*1000)/1000,snappedTo};
}

export function magneticStartForClips(candidate,movingClip,trackClips,snapEnabled,pxPerSec,extraTargets=[]){
  let value=Math.max(0,Number(candidate)||0);
  if(!snapEnabled)return value;
  const thresholdSec=SNAP_PIXELS/Math.max(1,Number(pxPerSec)||1);
  const dur=clipDuration(movingClip);
  const targets=collectSnapTargets({
    tracks:[trackClips],
    extra:extraTargets,
    excludeId:movingClip?.id??null
  });
  let best=value,bestDist=Infinity;
  for(const t of targets){
    const startDist=Math.abs(value-t);
    if(startDist<thresholdSec&&startDist<bestDist){best=t;bestDist=startDist}
    const endDist=Math.abs(value+dur-t);
    if(endDist<thresholdSec&&endDist<bestDist){best=t-dur;bestDist=endDist}
  }
  return Math.max(0,Math.round(best*1000)/1000);
}

export function timelineStartFromPointer(pointerX,laneLeft,pxPerSec,pointerOffsetSec=0){
  const scale=Math.max(1,Number(pxPerSec)||1);
  const position=(Number(pointerX)||0)-(Number(laneLeft)||0);
  return Math.max(0,position/scale-(Number(pointerOffsetSec)||0));
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
