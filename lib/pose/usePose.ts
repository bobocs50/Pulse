"use client";
import { useEffect, useRef } from "react";
import type { Landmark, WorkerOutMessage } from "@/types/vision";
import { createFilter, filterLandmarks } from "@/lib/vision/landmark-filter";
import type { FilterState } from "@/lib/vision/landmark-filter";

export function usePose() {
  const workerRef   = useRef<Worker | null>(null);
  const landmarksRef = useRef<Landmark[] | null>(null);
  const handsRef    = useRef<Landmark[][] | null>(null);
  const filterRef   = useRef<FilterState | null>(null);
  const handFilterRef = useRef<FilterState | null>(null);
  const lastHandCount = useRef(0);
  const readyRef    = useRef(false);
  const pendingRef  = useRef(false); // frame in flight — backpressure for the worker

  useEffect(() => {
    filterRef.current = createFilter();
    handFilterRef.current = createFilter(42); // up to 2 hands × 21 anchors
    const worker = new Worker(new URL("./worker", import.meta.url), { type: "module" });

    worker.onmessage = (e: MessageEvent<WorkerOutMessage>) => {
      if (e.data.type === "ready") {
        readyRef.current = true;
        pendingRef.current = false;
        return;
      }
      if (e.data.type === "error") {
        console.error("pose worker:", e.data.error);
        pendingRef.current = false;
        return;
      }
      pendingRef.current = false;
      if (e.data.type === "landmarks" && e.data.landmarks && filterRef.current) {
        landmarksRef.current = filterLandmarks(filterRef.current, e.data.landmarks);
      } else if (e.data.type === "landmarks") {
        landmarksRef.current = e.data.landmarks ?? null;
      }
      if (e.data.type === "landmarks") {
        const hs = e.data.hands ?? null;
        // Hand count/order changed → stale per-slot filter state would smear
        // hand B through filters warmed on hand A. Reset instead.
        const n = hs?.length ?? 0;
        if (n !== lastHandCount.current) {
          handFilterRef.current = createFilter(42);
          lastHandCount.current = n;
        }
        if (hs && hs.length && handFilterRef.current) {
          const filtered = filterLandmarks(handFilterRef.current, hs.flat());
          const out: Landmark[][] = [];
          for (let i = 0; i < filtered.length; i += 21) out.push(filtered.slice(i, i + 21));
          handsRef.current = out;
        } else {
          handsRef.current = null;
        }
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

  return { workerRef, landmarksRef, handsRef, readyRef, pendingRef };
}
