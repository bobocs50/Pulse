"use client";
import { useEffect, useRef, useState } from "react";
import type { CameraStatus } from "@/types/vision";

// Demo position: standing at a table facing the phone → front camera ("user")
// is the default; caller must mirror video + overlay together.
// "environment" (rear) remains available via flip for the floor/side setup.
export function useCamera() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [status, setStatus] = useState<CameraStatus>("loading");
  const [facing, setFacing] = useState<"environment" | "user">("user");

  useEffect(() => {
    let mounted = true;
    let stream: MediaStream | null = null;
    setStatus("loading");

    navigator.mediaDevices
      .getUserMedia({
        video: {
          facingMode: facing,
          width: { ideal: 720 },
          height: { ideal: 1280 },
          aspectRatio: { ideal: 9 / 16 }, // portrait — some Androids deliver landscape otherwise
          frameRate: { ideal: 60 },       // rVFC ticks per decoded frame — more samples for peaks
        },
        audio: false,
      })
      .then(s => {
        if (!mounted) { s.getTracks().forEach(t => t.stop()); return; }
        stream = s;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = s;
        video.play()
          .then(() => { if (mounted) setStatus("ready"); })
          .catch(err => {
            // AbortError = a newer flip/effect superseded this play() — ignore
            if (mounted && (err as DOMException)?.name !== "AbortError") setStatus("error");
          });
      })
      .catch(err => {
        if (!mounted) return;
        setStatus(err instanceof DOMException && err.name === "NotAllowedError" ? "blocked" : "error");
      });

    return () => {
      mounted = false;
      stream?.getTracks().forEach(t => t.stop());
    };
  }, [facing]);

  const flip = () => setFacing(f => (f === "user" ? "environment" : "user"));

  return { videoRef, status, facing, flip };
}
