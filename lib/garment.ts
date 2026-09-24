import type { WardrobeItem } from "./types";

/** Best image of a garment: transparent cutout → original photo → none (placeholder glyph). */
export function garmentSource(it: WardrobeItem): { kind: "cutout" | "photo" | "none"; url: string | null } {
  if (it.cutout_status === "ready" && it.cutout_url) return { kind: "cutout", url: it.cutout_url };
  if (it.image_url) return { kind: "photo", url: it.image_url };
  return { kind: "none", url: null };
}
