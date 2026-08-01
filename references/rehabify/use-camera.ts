// SOURCE: github.com/obro79/Rehabify/src/hooks/use-camera.ts
// Their version uses facingMode: "user" (front/selfie camera)
// Our useCamera.ts uses facingMode: "environment" (rear camera)
// Everything else is identical — isMounted pattern, stream cleanup

"use client";
import { useEffect, useRef, useState } from "react";

export type CameraStatus = "loading" | "ready" | "blocked" | "error";

export function useCamera() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<CameraStatus>("loading");

  useEffect(() => {
    let isMounted = true;

    async function setupCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: 720, height: 1280 }, // <-- change to "environment" for us
          audio: false,
        });
        if (!isMounted) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setStatus("ready");
      } catch (error) {
        if (!isMounted) return;
        setStatus(error instanceof DOMException ? "blocked" : "error");
      }
    }

    setupCamera();
    return () => {
      isMounted = false;
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  return { videoRef, status };
}
