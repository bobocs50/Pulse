// SOURCE: github.com/obro79/Rehabify/src/lib/vision/exercises/squat.ts
// FULL SOURCE — most complete exercise analyzer in Rehabify
//
// KEY PATTERNS TO STEAL FOR CPR:
//
// 1. Speed detection (lines ~hip velocity):
//    const timeDelta = now - state.lastHipTimestamp
//    const hipYDelta = midHip.y - state.lastHipY
//    descentSpeed = hipYDelta / (timeDelta / 1000)
//    → Adapt this for compression speed / rate detection
//
// 2. Phase with hysteresis (ascending/descending):
//    Prevents flicker when crossing threshold boundary.
//    if (state.lastPhase === "bottom" || state.lastPhase === "ascending") phase = "ascending"
//    → Steal for CPR: once "compressed", stay compressed until clearly risen
//
// 3. State reset on new rep start:
//    if (phase === "descending" && state.lastPhase === "standing") {
//      state.repErrors.clear(); state.peakDescentSpeed = 0; state.maxThighAngle = thighAngle;
//    }
//    → Steal for CPR: reset per-compression state when new compression starts
//
// 4. maxThighAngle tracking (tracks peak value during rep):
//    if (phase !== "standing" && thighAngle > state.maxThighAngle) state.maxThighAngle = thighAngle
//    → Steal for CPR: track min shoulder-y (max depression) per compression for depth tracking

import type { FormError } from "@/types";
import type { Landmark } from "@/types/vision";

export interface SquatState {
  lastPhase: string;
  lastHipY: number | null;
  lastHipTimestamp: number | null;
  peakDescentSpeed: number;
  repErrors: Set<string>;
  maxThighAngle: number;
  repAngles: number[];
}

const LANDMARKS = {
  leftEar:7,rightEar:8,leftShoulder:11,rightShoulder:12,
  leftWrist:15,rightWrist:16,leftHip:23,rightHip:24,
  leftKnee:25,rightKnee:26,leftAnkle:27,rightAnkle:28,
};

function midpoint(a: Landmark, b: Landmark): Landmark {
  return {x:(a.x+b.x)/2,y:(a.y+b.y)/2,z:(a.z+b.z)/2,visibility:(a.visibility+b.visibility)/2};
}

function distance2D(a: Landmark, b: Landmark) {
  return Math.sqrt((a.x-b.x)**2+(a.y-b.y)**2);
}

function angleBetween(a: Landmark, b: Landmark, c: Landmark) {
  const abx=a.x-b.x,aby=a.y-b.y,cbx=c.x-b.x,cby=c.y-b.y;
  const dot=abx*cbx+aby*cby;
  const mag=Math.sqrt(abx**2+aby**2)*Math.sqrt(cbx**2+cby**2);
  if (mag===0) return 0;
  return Math.acos(Math.min(1,Math.max(-1,dot/mag)))*(180/Math.PI);
}

function averageVisibility(landmarks: Landmark[], indices: number[]) {
  return indices.reduce((s,i)=>s+(landmarks[i]?.visibility??0),0)/indices.length;
}

function clamp(v: number,min: number,max: number){return Math.min(max,Math.max(min,v));}

function baseFormScore(landmarks: Landmark[]) {
  return clamp(Math.round(averageVisibility(landmarks,[11,12,23,24,25,26])*100),0,100);
}

export function createSquatState(): SquatState {
  return {lastPhase:"standing",lastHipY:null,lastHipTimestamp:null,
    peakDescentSpeed:0,repErrors:new Set(),maxThighAngle:0,repAngles:[]};
}

export function analyzeSquat(
  landmarks: Landmark[],
  thresholds: Record<string,number>,
  state: SquatState
) {
  const midEar=midpoint(landmarks[LANDMARKS.leftEar],landmarks[LANDMARKS.rightEar]);
  const midShoulder=midpoint(landmarks[LANDMARKS.leftShoulder],landmarks[LANDMARKS.rightShoulder]);
  const midHip=midpoint(landmarks[LANDMARKS.leftHip],landmarks[LANDMARKS.rightHip]);
  const midKnee=midpoint(landmarks[LANDMARKS.leftKnee],landmarks[LANDMARKS.rightKnee]);
  const midAnkle=midpoint(landmarks[LANDMARKS.leftAnkle],landmarks[LANDMARKS.rightAnkle]);
  const leftWrist=landmarks[LANDMARKS.leftWrist],rightWrist=landmarks[LANDMARKS.rightWrist];

  // Thigh angle from vertical (0=standing, 90=parallel)
  const thighDx=midHip.x-midKnee.x,thighDy=midHip.y-midKnee.y;
  const thighAngle=Math.abs(Math.atan2(thighDx,-thighDy)*(180/Math.PI));

  const trunkDx=midHip.x-midShoulder.x,trunkDy=midHip.y-midShoulder.y;
  const trunkLean=Math.abs(Math.atan2(trunkDx,trunkDy)*(180/Math.PI));

  const shinDx=midKnee.x-midAnkle.x,shinDy=midKnee.y-midAnkle.y;
  const shinAngle=Math.abs(Math.atan2(shinDx,-shinDy)*(180/Math.PI));

  const neckAngle=angleBetween(midEar,midShoulder,midHip);
  const leftHandKneeDist=Math.min(distance2D(leftWrist,landmarks[LANDMARKS.leftKnee]),distance2D(leftWrist,landmarks[LANDMARKS.rightKnee]));
  const rightHandKneeDist=Math.min(distance2D(rightWrist,landmarks[LANDMARKS.leftKnee]),distance2D(rightWrist,landmarks[LANDMARKS.rightKnee]));

  // Speed detection — steal this pattern for CPR compression speed
  const now=Date.now();
  let descentSpeed=0;
  if (state.lastHipY!==null&&state.lastHipTimestamp!==null) {
    const dt=now-state.lastHipTimestamp;
    if (dt>0&&dt<200) {
      descentSpeed=(midHip.y-state.lastHipY)/(dt/1000);
      if (descentSpeed>state.peakDescentSpeed) state.peakDescentSpeed=descentSpeed;
    }
  }
  state.lastHipY=midHip.y;
  state.lastHipTimestamp=now;

  const standingAngle=thresholds.standing_angle??20;
  const minDepthAngle=thresholds.min_depth_angle??70;
  const minRepAngle=thresholds.min_rep_angle??40;
  const maxTrunkLean=thresholds.max_trunk_lean??60;
  const maxShinAngle=thresholds.max_shin_angle??45;
  const minNeckAngle=thresholds.min_neck_angle??120;

  // Phase detection with hysteresis — steal this for CPR
  let phase="standing";
  if (thighAngle>=minDepthAngle) phase="bottom";
  else if (thighAngle>=standingAngle) {
    phase=(state.lastPhase==="bottom"||state.lastPhase==="ascending")?"ascending":"descending";
  }

  const isRepTransition=(state.lastPhase==="ascending"||state.lastPhase==="descending")&&phase==="standing";
  const reachedMinDepth=state.maxThighAngle>=minRepAngle;
  const repIncremented=isRepTransition&&reachedMinDepth;

  const errors: FormError[]=[];

  // Reset on new rep start
  if (phase==="descending"&&state.lastPhase==="standing") {
    state.repErrors.clear();state.peakDescentSpeed=0;
    state.maxThighAngle=thighAngle;state.repAngles=[];
  }

  // Track peak depth during rep
  if (phase!=="standing"&&thighAngle>state.maxThighAngle) state.maxThighAngle=thighAngle;
  if (phase!=="standing") state.repAngles.push(thighAngle);

  if (phase!=="standing") {
    if (trunkLean>maxTrunkLean) errors.push({type:"forward_lean",message:"Keep your chest up",severity:"warning",timestamp:Date.now(),bodyPart:"torso"});
    if (shinAngle>maxShinAngle) errors.push({type:"knee_forward",message:"Sit back more, keep knees behind toes",severity:"warning",timestamp:Date.now(),bodyPart:"knees"});
    if (neckAngle<minNeckAngle) errors.push({type:"upper_back_round",message:"Don't round your upper back",severity:"warning",timestamp:Date.now(),bodyPart:"head"});
    if (leftHandKneeDist<0.08||rightHandKneeDist<0.08) errors.push({type:"hands_on_legs",message:"Don't rest your hands on your legs",severity:"warning",timestamp:Date.now(),bodyPart:"arms"});
  }

  state.lastPhase=phase;

  return {
    phase,formScore:baseFormScore(landmarks),errors,
    isCorrect:errors.length===0,repIncremented,
    confidence:averageVisibility(landmarks,[11,12,23,24,25,26]),
    debug:{kneeAngle:thighAngle,trunkLean,kneeForward:shinAngle,descentSpeed:state.peakDescentSpeed,minDepth:state.maxThighAngle,queuedErrors:Array.from(state.repErrors)},
  };
}
