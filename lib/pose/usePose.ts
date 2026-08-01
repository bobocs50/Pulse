"use client";
import { useEffect, useRef } from "react";
import type { Landmark, WorkerOutMessage } from "@/types/vision";
import { createFilter, filterLandmarks } from "@/lib/vision/landmark-filter";
import type { FilterState } from "@/lib/vision/landmark-filter";

export function usePose() {
  const workerRef   = useRef<Worker | null>(null);
  const landmarksRef = useRef<Landmark[] | null>(null);
  const filterRef   = useRef<FilterState | null>(null);
  const readyRef    = useRef(false);

  useEffect(() => {
    filterRef.current = createFilter();
    const worker = new Worker(new URL("./worker", import.meta.url), { type: "module" });

    worker.onmessage = (e: MessageEvent<WorkerOutMessage>) => {
      if (e.data.type === "ready") {
        readyRef.current = true;
        return;
      }
      if (e.data.type === "landmarks" && e.data.landmarks && filterRef.current) {
        landmarksRef.current = filterLandmarks(filterRef.current, e.data.landmarks);
      } else if (e.data.type === "landmarks") {
        landmarksRef.current = e.data.landmarks ?? null;
      }
    };

    worker.postMessage({ type: "init" });
    workerRef.current = worker;
    return () => {
      worker.terminate();
      workerRef.current = null;
      readyRef.current = false;
    };
  }, []);

  return { workerRef, landmarksRef, readyRef };
}
