/**
 * 2D layered-mannequin geometry.
 *
 * Everything lives in the mannequin's 400 × 1000 coordinate space. Each garment slot
 * has an anchor zone; a garment asset (tightly cropped cutout) is fitted inside its zone
 * with `object-fit: contain`, aligned to the anchor edge, then the per-garment manual
 * placement (x/y offset, scale, rotation, layer) is applied on top.
 *
 * Swapping this module for an AI virtual try-on later only changes how a layer is
 * produced, not the Outfit Builder UI or the saved data.
 */
import type { Body, Placement, RenderOptions, Slot, WardrobeItem } from "./types";

export const VIEW_W = 400;
export const VIEW_H = 1000;

export const BODY_SCALE: Record<Body, number> = { slim: 0.9, standard: 1, relaxed: 1.12 };

/** Spec layer order: shoes 5 · bottom 10 · top 20 · outer 30 · accessory 40 */
export const LAYER: Record<Slot, number> = { shoes: 5, bottom: 10, top: 20, outer: 30, acc: 40 };

export interface Zone {
  cx: number; // anchor x (centre)
  y: number; // anchor y — top edge (align "top") or bottom edge (align "bottom") or centre ("center")
  w: number;
  h: number;
  align: "top" | "bottom" | "center";
}

function accZone(sub: string): Zone {
  if (/모자|캡|비니/.test(sub)) return { cx: 200, y: 8, w: 150, h: 92, align: "top" };
  if (/안경|선글라스/.test(sub)) return { cx: 200, y: 74, w: 92, h: 34, align: "center" };
  if (/머플러|스카프/.test(sub)) return { cx: 200, y: 150, w: 170, h: 210, align: "top" };
  if (/벨트/.test(sub)) return { cx: 200, y: 432, w: 200, h: 44, align: "center" };
  if (/시계|팔찌/.test(sub)) return { cx: 312, y: 548, w: 44, h: 60, align: "center" };
  if (/양말/.test(sub)) return { cx: 200, y: 930, w: 120, h: 60, align: "center" };
  // bags & everything else: carried at the side
  return { cx: 322, y: 520, w: 140, h: 170, align: "top" };
}

/** Anchor zone for a garment, by slot + subcategory, scaled for the body variant. */
export function zoneFor(slot: Slot, item: Pick<WardrobeItem, "subcategory" | "fit">, body: Body = "standard"): Zone {
  const k = BODY_SCALE[body];
  const sub = item.subcategory ?? "";
  let z: Zone;
  switch (slot) {
    case "top":
      z = /민소매/.test(sub) ? { cx: 200, y: 160, w: 200, h: 330, align: "top" } : { cx: 200, y: 156, w: 304, h: 336, align: "top" };
      break;
    case "outer":
      z = /코트/.test(sub)
        ? { cx: 200, y: 150, w: 330, h: 560, align: "top" }
        : /패딩/.test(sub)
          ? { cx: 200, y: 146, w: 350, h: 380, align: "top" }
          : { cx: 200, y: 150, w: 330, h: 372, align: "top" };
      break;
    case "bottom":
      z = /쇼츠|반바지/.test(sub)
        ? { cx: 200, y: 418, w: 250, h: 236, align: "top" }
        : /스커트/.test(sub)
          ? { cx: 200, y: 418, w: 260, h: 300, align: "top" }
          : { cx: 200, y: 416, w: item.fit === "wide" || /와이드|카고/.test(sub) ? 280 : 250, h: 532, align: "top" };
      break;
    case "shoes":
      z = { cx: 200, y: 990, w: 250, h: 92, align: "bottom" };
      break;
    case "acc":
      z = accZone(sub);
      break;
  }
  return { ...z, cx: 200 + (z.cx - 200) * k, w: z.w * (slot === "acc" || slot === "shoes" ? 1 : k) };
}

export const DEFAULT_PLACEMENT: Placement = { x: 0, y: 0, scale: 1, rotation: 0, layer: null };

export function effectiveLayer(slot: Slot, p: Placement | null, render: RenderOptions | null | undefined) {
  if (p?.layer != null) return p.layer;
  if (render?.tuck && slot === "bottom") return 21; // tucked: waistband over the top
  return LAYER[slot];
}

/** Which image a layer should use. */
export function garmentSource(it: WardrobeItem): { kind: "cutout" | "photo" | "none"; url: string | null } {
  if (it.cutout_status === "ready" && it.cutout_url) return { kind: "cutout", url: it.cutout_url };
  if (it.image_url) return { kind: "photo", url: it.image_url };
  return { kind: "none", url: null };
}

/** Outerwear that can be worn open (split into two halves so the top shows through). */
export const canOpen = (it: WardrobeItem) => it.category === "outer" && !/패딩|플리스|바람막이/.test(it.subcategory);
