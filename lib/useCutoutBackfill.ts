"use client";

import { useEffect } from "react";
import { makeCutout } from "./cutout";
import { useStore } from "./store";

/** Items attempted this session (success or not) — never retried in a loop. */
const attempted = new Set<string>();
let running = false;

/**
 * Existing wardrobe photos → transparent garment assets, in the background.
 * Runs one item at a time while the app is open; results are saved via the repo,
 * so each photo is processed once ever.
 */
export function useCutoutBackfill() {
  const { ready, items, setCutout } = useStore();
  useEffect(() => {
    if (!ready || running) return;
    const todo = items.filter((i) => i.image_url && i.cutout_status == null && !attempted.has(i.id));
    if (!todo.length) return;
    running = true;
    let cancelled = false;
    (async () => {
      for (const it of todo) {
        if (cancelled) break;
        attempted.add(it.id);
        try {
          const blob = await (await fetch(it.image_url!)).blob();
          const out = await makeCutout(blob);
          await setCutout(it.id, { blob: out.blob, status: out.status });
        } catch (e) {
          console.warn("[cutout] backfill failed", it.id, e);
        }
        await new Promise((r) => setTimeout(r, 60)); // keep the UI responsive
      }
      running = false;
    })();
    return () => {
      cancelled = true;
      running = false;
    };
  }, [ready, items, setCutout]);
}
