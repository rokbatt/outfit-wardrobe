import type { RenderOptions, Slot, WardrobeItem } from "@/lib/types";
import { OutfitRenderer, type Selection } from "./outfit/OutfitRenderer";

/**
 * Outfit thumbnail: the dressed mannequin on a grey stage.
 * Used by Home, My Outfits, item detail and the stylist — the same renderer as the builder.
 */
export function OutfitBoard({
  sel,
  render,
  className = "",
  aspect = "aspect-[3/4]",
}: {
  sel: Selection;
  render?: RenderOptions | null;
  className?: string;
  aspect?: string;
}) {
  return (
    <div className={`relative flex ${aspect} w-full items-center justify-center overflow-hidden rounded-md bg-stage ${className}`}>
      <OutfitRenderer sel={sel} render={render} className="h-[94%]" />
    </div>
  );
}

/** Outfit as selection map from refs. */
export function selFromRefs(refs: { wardrobe_item_id: string; slot: Slot }[], byId: Map<string, WardrobeItem>) {
  const sel: Partial<Record<Slot, WardrobeItem>> = {};
  for (const r of refs) {
    const it = byId.get(r.wardrobe_item_id);
    if (it) sel[r.slot] = it;
  }
  return sel;
}
