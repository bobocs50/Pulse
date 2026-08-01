// SOURCE: github.com/obro79/Rehabify/src/lib/vision/form-engine.ts
// FULL SOURCE — the complete form analysis engine
//
// KEY PATTERN FOR CPR: the phase state machine
//   let phase = "neutral"
//   if (value > threshold) phase = "compressed"
//   repIncremented = lastPhase === "compressed" && phase === "neutral"
//
// Also: scoreFromTargetAngle() and scoreFromKneeAngle() are reusable scoring helpers
// Also: "block rep if warning errors exist" pattern at bottom of createFormEngine()
// Also: baseline calibration pattern in analyzeStandingLumbarExtension() — steal for
//       establishing shoulder-y baseline in first 60 frames

import type { FormError } from "@/types";
import type { Exercise } from "@/lib/exercises/types";
import type { Landmark } from "@/types/vision";
import { analyzeSquat, createSquatState, type SquatState } from "./exercises/squat";

interface FormEngineResult {
  phase: string;
  formScore: number;
  errors: FormError[];
  feedback?: string;
  isCorrect: boolean;
  repIncremented: boolean;
  confidence: number;
  debug?: {
    kneeAngle?: number;
    trunkLean?: number;
    kneeForward?: number;
    descentSpeed?: number;
    minDepth?: number;
    hipAngle?: number;
    spineDepth?: number;
    depthChange?: number;
    baseline?: number;
    baselineSamples?: number;
    shoulderTilt?: number;
    shoulderTiltAngle?: number;
    hipTilt?: number;
    bendingSide?: string;
    leftThighAngle?: number;
    rightThighAngle?: number;
    bestDepthAngle?: number;
    shinAngle?: number;
    torsion?: number;
    shoulderYaw?: number;
    hipYaw?: number;
    phase?: string;
    queuedErrors: string[];
  };
}

interface EngineState {
  lastPhase: string;
  lastRepPhase: string;
  lastExtendedSide: "left" | "right" | null;
  squatState: SquatState;
  baselineSpineDepth: number[];
  sideBendState: { leftDone: boolean; rightDone: boolean };
  lungeRotationState: { inLunge: boolean; rotatedLeft: boolean; rotatedRight: boolean };
}

const LANDMARKS = {
  leftEar: 7, rightEar: 8,
  leftShoulder: 11, rightShoulder: 12,
  leftElbow: 13, rightElbow: 14,
  leftWrist: 15, rightWrist: 16,
  leftHip: 23, rightHip: 24,
  leftKnee: 25, rightKnee: 26,
  leftAnkle: 27, rightAnkle: 28,
  leftHeel: 29, rightHeel: 30,
  leftFootIndex: 31, rightFootIndex: 32,
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function midpoint(a: Landmark, b: Landmark): Landmark {
  return { x: (a.x+b.x)/2, y: (a.y+b.y)/2, z: (a.z+b.z)/2, visibility: (a.visibility+b.visibility)/2 };
}

function distance2D(a: Landmark, b: Landmark) {
  return Math.sqrt((a.x-b.x)**2 + (a.y-b.y)**2);
}

function angleBetween(a: Landmark, b: Landmark, c: Landmark) {
  const abx=a.x-b.x, aby=a.y-b.y, cbx=c.x-b.x, cby=c.y-b.y;
  const dot=abx*cbx+aby*cby;
  const mag=Math.sqrt(abx**2+aby**2)*Math.sqrt(cbx**2+cby**2);
  if (mag===0) return 0;
  return Math.acos(clamp(dot/mag,-1,1))*(180/Math.PI);
}

function angleBetween3D(a: Landmark, b: Landmark, c: Landmark) {
  const abx=a.x-b.x,aby=a.y-b.y,abz=a.z-b.z;
  const cbx=c.x-b.x,cby=c.y-b.y,cbz=c.z-b.z;
  const dot=abx*cbx+aby*cby+abz*cbz;
  const mag=Math.sqrt(abx**2+aby**2+abz**2)*Math.sqrt(cbx**2+cby**2+cbz**2);
  if (mag===0) return 0;
  return Math.acos(clamp(dot/mag,-1,1))*(180/Math.PI);
}

function averageVisibility(landmarks: Landmark[], indices: number[]) {
  return indices.reduce((s,i)=>s+(landmarks[i]?.visibility??0),0)/indices.length;
}

function baseFormScore(landmarks: Landmark[]) {
  const v = averageVisibility(landmarks,[LANDMARKS.leftShoulder,LANDMARKS.rightShoulder,LANDMARKS.leftHip,LANDMARKS.rightHip,LANDMARKS.leftKnee,LANDMARKS.rightKnee]);
  return clamp(Math.round(v*100),0,100);
}

// Score helper: 100 when angle === target, 0 when deviation >= tolerance
function scoreFromTargetAngle(angle: number, target: number, tolerance: number) {
  if (tolerance<=0) return 0;
  return Math.round(clamp(1-Math.abs(angle-target)/tolerance,0,1)*100);
}

function checkOrientation(landmarks: Landmark[], desired: "front"|"side") {
  const sw=distance2D(landmarks[LANDMARKS.leftShoulder],landmarks[LANDMARKS.rightShoulder]);
  const msh=midpoint(landmarks[LANDMARKS.leftShoulder],landmarks[LANDMARKS.rightShoulder]);
  const mhip=midpoint(landmarks[LANDMARKS.leftHip],landmarks[LANDMARKS.rightHip]);
  const th=distance2D(msh,mhip)||1;
  const ratio=sw/th;
  if (desired==="side" && ratio>0.6) return {isCorrect:false,feedback:"Turn to face the side"};
  if (desired==="front" && ratio<0.5) return {isCorrect:false,feedback:"Turn to face forward"};
  return {isCorrect:true};
}

// --- BASELINE CALIBRATION PATTERN (steal for CPR shoulder-y baseline) ---
// analyzeStandingLumbarExtension builds a baseline over 60 frames:
//   if (state.baselineSpineDepth.length < 60) state.baselineSpineDepth.push(value)
//   const baseline = average(state.baselineSpineDepth)
//   const change = currentValue - baseline
//   if (change <= threshold) phase = "extension"

function analyzeStandingLumbarExtension(
  landmarks: Landmark[],
  thresholds: Record<string,number>,
  state: EngineState
): FormEngineResult {
  const errors: FormError[] = [];
  const orientation=checkOrientation(landmarks,"side");
  if (!orientation.isCorrect && orientation.feedback) {
    errors.push({type:"orientation",message:orientation.feedback,severity:"warning",timestamp:Date.now(),bodyPart:"body"});
  }

  const midShoulder=midpoint(landmarks[LANDMARKS.leftShoulder],landmarks[LANDMARKS.rightShoulder]);
  const midHip=midpoint(landmarks[LANDMARKS.leftHip],landmarks[LANDMARKS.rightHip]);
  const midKnee=midpoint(landmarks[LANDMARKS.leftKnee],landmarks[LANDMARKS.rightKnee]);
  const midAnkle=midpoint(landmarks[LANDMARKS.leftAnkle],landmarks[LANDMARKS.rightAnkle]);

  const kneeAngle=angleBetween3D(midHip,midKnee,midAnkle);
  const spineDepth=Math.abs(midShoulder.z-midHip.z);

  const isCalibrating=state.baselineSpineDepth.length<60;
  if (isCalibrating) state.baselineSpineDepth.push(spineDepth);

  const baseline=state.baselineSpineDepth.length>0
    ? state.baselineSpineDepth.reduce((s,v)=>s+v,0)/state.baselineSpineDepth.length
    : spineDepth;

  const depthChange=spineDepth-baseline;
  let phase="neutral";
  if (depthChange<=-0.05) phase="extension";

  const repIncremented=state.lastPhase==="extension"&&phase==="neutral";
  const formScore=baseFormScore(landmarks);

  if (kneeAngle<135) errors.push({type:"knee_bend",message:"Keep knees straight",severity:"warning",timestamp:Date.now(),bodyPart:"knees"});

  return {
    phase,formScore,errors,
    feedback:isCalibrating?"Calibrating...":phase==="extension"?"Hold extension":undefined,
    isCorrect:errors.length===0,repIncremented,
    confidence:averageVisibility(landmarks,[LANDMARKS.leftShoulder,LANDMARKS.rightShoulder,LANDMARKS.leftHip,LANDMARKS.rightHip]),
  };
}

function analyzeLunge(landmarks: Landmark[], thresholds: Record<string,number>, state: EngineState): FormEngineResult {
  const leftHip=landmarks[LANDMARKS.leftHip],rightHip=landmarks[LANDMARKS.rightHip];
  const leftKnee=landmarks[LANDMARKS.leftKnee],rightKnee=landmarks[LANDMARKS.rightKnee];
  const leftAnkle=landmarks[LANDMARKS.leftAnkle],rightAnkle=landmarks[LANDMARKS.rightAnkle];
  const midShoulder=midpoint(landmarks[LANDMARKS.leftShoulder],landmarks[LANDMARKS.rightShoulder]);
  const midHip=midpoint(leftHip,rightHip);
  const strideWidth=Math.abs(leftAnkle.x-rightAnkle.x);
  const minKneeAngle=Math.min(angleBetween(leftHip,leftKnee,leftAnkle),angleBetween(rightHip,rightKnee,rightAnkle));
  const isInLunge=minKneeAngle<130&&strideWidth>0.3;
  const isStanding=minKneeAngle>150;

  let phase="standing",feedback="Step forward into a lunge";
  if (isInLunge) { phase="lunge_hold"; feedback="Good lunge. Push back to start"; }
  else if (state.lastPhase==="lunge_hold"&&!isStanding) { phase="lunge_hold"; feedback="Push back to start"; }

  const repIncremented=state.lastPhase==="lunge_hold"&&phase==="standing";
  if (repIncremented) feedback="Rep complete!";

  const errors: FormError[]=[];
  if (isInLunge) {
    const trunkLean=Math.abs(Math.atan2(midHip.x-midShoulder.x,midHip.y-midShoulder.y)*(180/Math.PI));
    if (trunkLean>20) errors.push({type:"forward_lean",message:"Keep chest up",severity:"warning",timestamp:Date.now(),bodyPart:"torso"});
  }

  return {phase,formScore:baseFormScore(landmarks),errors,feedback,isCorrect:errors.length===0,repIncremented,
    confidence:averageVisibility(landmarks,[LANDMARKS.leftShoulder,LANDMARKS.rightShoulder,LANDMARKS.leftHip,LANDMARKS.rightHip])};
}

// Main factory — wraps state, dispatches to analyzer, blocks rep on warnings
export function createFormEngine(exercise: Exercise) {
  const state: EngineState = {
    lastPhase:"neutral",lastRepPhase:"",lastExtendedSide:null,
    squatState:createSquatState(),baselineSpineDepth:[],
    sideBendState:{leftDone:false,rightDone:false},
    lungeRotationState:{inLunge:false,rotatedLeft:false,rotatedRight:false},
  };

  return (landmarks: Landmark[]): FormEngineResult => {
    const thresholds=exercise.detection_config?.thresholds??{};
    let result: FormEngineResult;

    switch (exercise.slug) {
      case "lunge": result=analyzeLunge(landmarks,thresholds,state); break;
      case "standing-lumbar-extension": result=analyzeStandingLumbarExtension(landmarks,thresholds,state); break;
      case "bodyweight-squat": result=analyzeSquat(landmarks,thresholds,state.squatState); break;
      default:
        result={phase:"neutral",formScore:baseFormScore(landmarks),errors:[],isCorrect:true,repIncremented:false,
          confidence:averageVisibility(landmarks,[LANDMARKS.leftShoulder,LANDMARKS.rightShoulder,LANDMARKS.leftHip,LANDMARKS.rightHip])};
    }

    state.lastPhase=result.phase;

    // PATTERN: block rep if any warning errors — steal this for CPR
    const hasWarning=result.errors.some(e=>e.severity==="warning");
    if (hasWarning&&result.repIncremented) result.repIncremented=false;
    if (result.repIncremented) state.lastRepPhase=result.phase;

    return result;
  };
}
