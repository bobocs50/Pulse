// Adapted from Rehabify — clean interfaces, no changes needed
export type ErrorSeverity = "info" | "warning";

export interface Landmark {
  x: number;
  y: number;
  z: number;
  visibility: number;
}

export interface FormError {
  type: string;
  message: string;
  severity: ErrorSeverity;
  timestamp: number;
  bodyPart?: string;
}

export interface WorkerInMessage {
  type: "init" | "frame";
  bitmap?: ImageBitmap;
  timestamp?: number;
}

export interface WorkerOutMessage {
  type: "ready" | "landmarks" | "error";
  landmarks?: Landmark[] | null;
  hands?: Landmark[][] | null;   // HandLandmarker: 21 anchors per detected hand
  timestamp?: number;
  error?: string;
}

export type CameraStatus = "loading" | "ready" | "blocked" | "error";

export type CameraFeedback = { message: string; type: "warning" | "info" | "success"; cue: string } | null;
