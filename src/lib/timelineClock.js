/**
 * Authoritative timeline clock.
 *
 * V1.11.4 integrated timeline time by hand from wall-clock deltas that were
 * clamped to 80ms per animation frame:
 *
 *   const dt=Math.min(.08,(now-last)/1000);
 *   state.playhead+=dt;
 *
 * The animation tick awaited media promises (source loads, play(), external
 * audio sync), so a single frame regularly cost far more than 80ms. Whenever it
 * did, the timeline clock advanced more slowly than real time while the video
 * element kept decoding at real speed. The two clocks separated permanently,
 * and the throttled drift correction then dragged video.currentTime *backwards*
 * onto the lagging playhead again and again - replaying the same short section
 * and producing a discontinuity (tick/buzz) in the audio on every correction.
 *
 * The fix is to stop integrating time by hand while a media element is able to
 * keep it. A playing video element is the authority and timeline time is
 * derived from it; the wall clock is only used where no element can keep time
 * (timeline gaps and audio-only ranges). Time is held - never advanced - while
 * an element is stalled or a clip handoff is in flight, so the clocks can never
 * separate and no backward correction is ever required for the primary video.
 */

export const CLOCK_LIMITS={
  /** Largest single wall-clock step, so a suspended window cannot jump time. */
  maxWallStep:.25,
  /** Divergence a slaved element may accumulate before a corrective seek. */
  slaveDriftLimit:.35,
  /** Minimum spacing between corrective seeks on any one element. */
  slaveCooldownMs:700,
  /** How long the clock may be held before playback is treated as stalled. */
  stallRecoveryMs:2000
};

const SPEED_MIN=.25,SPEED_MAX=4;

function clipSpeed(clip){
  return Math.max(SPEED_MIN,Math.min(SPEED_MAX,Number(clip?.speed)||1));
}

/**
 * Map an element's source time back onto the timeline for a given clip.
 * Returns null when the element is not actually positioned inside the clip's
 * trimmed source window, which means it has not finished seeking yet and must
 * not be trusted as the clock.
 */
export function timelineTimeFromMedia(mediaTime,clip,tolerance=.35){
  const t=Number(mediaTime);
  if(!Number.isFinite(t)||!clip)return null;
  const trimStart=Math.max(0,Number(clip.trimStart)||0);
  const trimEnd=Math.max(trimStart+.01,Number(clip.trimEnd)||trimStart+.01);
  if(t<trimStart-tolerance||t>trimEnd+tolerance)return null;
  const start=Math.max(0,Number(clip.start)||0);
  const bounded=Math.max(trimStart,Math.min(trimEnd,t));
  return start+(bounded-trimStart)/clipSpeed(clip);
}

/**
 * Corrective-seek policy for elements that are slaved to the authoritative
 * clock (the transition element and external audio players). Bounded by a
 * drift limit and throttled by a cooldown, so a correction can never run on
 * every animation frame and can never become a seek storm.
 */
export function planSlaveCorrection({expected,actual,now,lastCorrectionAt=-Infinity,limit=CLOCK_LIMITS.slaveDriftLimit,cooldownMs=CLOCK_LIMITS.slaveCooldownMs}){
  const want=Number(expected),have=Number(actual);
  if(!Number.isFinite(want)||!Number.isFinite(have))return {seek:false,to:have,at:lastCorrectionAt};
  if(Math.abs(have-want)<=limit)return {seek:false,to:have,at:lastCorrectionAt};
  if(Number.isFinite(lastCorrectionAt)&&now-lastCorrectionAt<cooldownMs)return {seek:false,to:have,at:lastCorrectionAt};
  return {seek:true,to:Math.max(0,want),at:now};
}

export function createTimelineClock(){
  let time=0,lastWall=0,source='idle',heldSince=0;

  return {
    get time(){return time},
    get source(){return source},

    reset(t,wallNow){
      time=Math.max(0,Number(t)||0);
      lastWall=Number(wallNow)||0;
      source='idle';
      heldSince=0;
      return time;
    },

    /** A playing element owns the clock: derive timeline time from it. */
    syncToMedia(mediaTime,clip,wallNow){
      const derived=timelineTimeFromMedia(mediaTime,clip);
      if(derived===null)return null;
      time=derived;
      lastWall=Number(wallNow)||lastWall;
      source='media';
      heldSince=0;
      return time;
    },

    /** No element can keep time here (gap or audio-only): integrate real time. */
    advanceWall(wallNow){
      const now=Number(wallNow)||lastWall;
      const dt=Math.min(CLOCK_LIMITS.maxWallStep,Math.max(0,(now-lastWall)/1000));
      lastWall=now;
      time+=dt;
      source='wall';
      heldSince=0;
      return time;
    },

    /**
     * An element should own the clock but is stalled, seeking, or mid-handoff.
     * Hold time still rather than letting the wall clock run ahead of it - that
     * separation is exactly what produced the backward-seek replay loop.
     */
    hold(wallNow){
      const now=Number(wallNow)||lastWall;
      if(!heldSince)heldSince=now;
      lastWall=now;
      source='held';
      return time;
    },

    /** How long the clock has been held, for a bounded stall watchdog. */
    heldFor(wallNow){
      if(!heldSince)return 0;
      return Math.max(0,(Number(wallNow)||lastWall)-heldSince);
    },

    /** Used by seeks/scrubs that authoritatively place the playhead. */
    seekTo(t,wallNow){
      return this.reset(t,wallNow);
    }
  };
}
