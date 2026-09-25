/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { garmentSource } from "@/lib/garment";
import { daysSince } from "@/lib/styling";
import { categoryLabel } from "@/lib/taxonomy";
import type { WardrobeItem } from "@/lib/types";
import { GarmentGlyph } from "./GarmentGlyph";
import { IconCheck } from "./icons";

/**
 * The garment itself: transparent cutout → original photo → (only for photo-less demo items) placeholder.
 */
export function ItemVisual({ item, className = "" }: { item: WardrobeItem; className?: string }) {
  const src = garmentSource(item);
  if (src.kind === "none")
    return (
      <GarmentGlyph
        category={item.category}
        subcategory={item.subcategory}
        color={item.color}
        pattern={item.pattern}
        fit={item.fit}
        className={`h-full w-full ${className}`}
      />
    );
  return (
    <img
      src={src.url!}
      alt={item.name}
      draggable={false}
      className={`h-full w-full object-contain ${src.kind === "photo" ? "garment-img" : ""} ${className}`}
    />
  );
}

/** Commerce-style product card: square-ish grey tile, bold name, small meta. */
export function ItemCard({
  item,
  href,
  meta = "sub",
  selected = false,
  onClick,
  size = "md",
  checkable = false,
}: {
  item: WardrobeItem;
  href?: string;
  meta?: "wear" | "sub" | "none";
  selected?: boolean;
  /** show a check circle (multi-select mode) */
  checkable?: boolean;
  onClick?: () => void;
  size?: "xs" | "sm" | "md";
}) {
  const since = daysSince(item.last_worn_at);
  const pad = size === "xs" ? "p-1.5" : size === "sm" ? "p-2.5" : "p-4";
  const body = (
    <div className="group text-left">
      <div
        className={`relative aspect-[5/6] overflow-hidden rounded-md bg-card ${pad} transition ${
          selected ? "ring-[1.5px] ring-ink" : ""
        }`}
      >
        <ItemVisual item={item} className="transition-transform duration-300 group-hover:scale-[1.03]" />
        {checkable && (
          <span
            className={`absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full border-[1.5px] ${
              selected ? "border-ink bg-ink text-paper" : "border-line-2 bg-paper/80"
            }`}
          >
            {selected && <IconCheck width={12} height={12} strokeWidth={2.6} />}
          </span>
        )}
      </div>
      {meta !== "none" && (
        <div className="mt-1.5 px-0.5">
          <p className={`truncate font-semibold ${size === "md" ? "text-[13px]" : "text-[11.5px]"} leading-snug`}>{item.name}</p>
          {meta === "sub" && (
            <p className="truncate text-[11px] text-mute">
              {categoryLabel(item.category)} · {item.subcategory || "-"}
            </p>
          )}
          {meta === "wear" && (
            <p className="text-[11px] text-mute">{item.wear_count === 0 ? "아직 안 입음" : `${item.wear_count}회 · ${since === 0 ? "오늘" : `${since}일 전`}`}</p>
          )}
        </div>
      )}
    </div>
  );
  if (href)
    return (
      <Link href={href} className="block">
        {body}
      </Link>
    );
  if (onClick)
    return (
      <button type="button" onClick={onClick} className="block w-full">
        {body}
      </button>
    );
  return body;
}
