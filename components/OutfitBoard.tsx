import type { Selection } from "@/lib/styling";
import type { RenderOptions, Slot, WardrobeItem } from "@/lib/types";
import { ItemVisual } from "./ItemVisual";

/**
 * Outfit thumbnail as a flat-lay of the real garment images (no mannequin).
 * Used by Home, My Outfits, item detail, the stylist and the save sheet.
 * The interactive 3D view lives only in the Outfit Builder.
 */
export function OutfitBoard({
  sel,
  className = "",
  aspect = "aspect-[3/4]",
}: {
  sel: Selection;
  /** kept for call-site compatibility; flat-lay ignores render options */
  render?: RenderOptions | null;
  className?: string;
  aspect?: string;
}) {
  const main = [sel.outer, sel.top, sel.bottom].filter(Boolean) as WardrobeItem[];
  const small = [sel.shoes, sel.acc].filter(Boolean) as WardrobeItem[];
  return (
    <div className={`relative ${aspect} w-full overflow-hidden rounded-md bg-stage p-[6%] ${className}`}>
      {main.length + small.length === 0 ? null : (
        <div className={`grid h-full gap-[4%] ${small.length ? "grid-rows-[minmax(0,3fr)_minmax(0,1fr)]" : "grid-rows-1"}`}>
          <div className={`grid min-h-0 gap-[4%] ${main.length >= 2 ? "grid-cols-2" : "grid-cols-1"}`}>
            {main.length === 3 ? (
              <>
                <div className="grid min-h-0 grid-rows-2 gap-[4%]">
                  <Piece item={main[0]} />
                  <Piece item={main[1]} />
                </div>
                <Piece item={main[2]} />
              </>
            ) : (
              main.map((it) => <Piece key={it.id} item={it} />)
            )}
          </div>
          <div className="flex min-h-0 justify-center gap-[6%]">
            {small.map((it) => (
              <div key={it.id} className="aspect-square h-full min-h-0">
                <Piece item={it} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Piece({ item }: { item: WardrobeItem }) {
  return (
    <div className="h-full min-h-0 w-full">
      <ItemVisual item={item} />
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
