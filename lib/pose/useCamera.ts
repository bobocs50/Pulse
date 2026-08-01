"use client";
import { useEffect, useRef, useState } from "react";
import type { CameraStatus } from "@/types/vision";

// facingMode "environment" = rear camera, which points at the rescuer
// when phone is propped on the floor beside the patient
export function useCamera() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [status, setStatus] = useState<CameraStatus>("loading");

  useEffect(() => {
    let mounted = true;
    let stream: MediaStream | null = null;

    navigator.mediaDevices
      .getUserMedia({
        video: { facingMode: "environment", width: { ideal: 720 }, height: { ideal: 1280 } },
        audio: false,
      })
      .then(s => {
        if (!mounted) { s.getTracks().forEach(t => t.stop()); return; }
        stream = s;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = s;
        video.play().then(() => { if (mounted) setStatus("ready"); });
      })
      .catch(err => {
        if (!mounted) return;
        setStatus(err instanceof DOMException && err.name === "NotAllowedError" ? "blocked" : "error");
      });

    return () => {
      mounted = false;
      stream?.getTracks().forEach(t => t.stop());
    };
  }, []);

  return { videoRef, status };
}
