"use client";

/* eslint-disable @next/next/no-img-element */
import { useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { canOpen, DEFAULT_PLACEMENT, effectiveLayer, garmentSource, VIEW_H, VIEW_W, zoneFor } from "@/lib/mannequin";
import type { Body, Placement, RenderOptions, Slot, WardrobeItem } from "@/lib/types";
import { GarmentGlyph } from "../GarmentGlyph";
import { Mannequin } from "./Mannequin";

export type Selection = Partial<Record<Slot, WardrobeItem | undefined>>;

const pctX = (v: number) => `${(v / VIEW_W) * 100}%`;
const pctY = (v: number) => `${(v / VIEW_H) * 100}%`;

/**
 * <OutfitRenderer>
 *   <Mannequin />
 *   <GarmentLayer slot="shoes" />   z 5
 *   <GarmentLayer slot="bottom" />  z 10
 *   <GarmentLayer slot="top" />     z 20
 *   <GarmentLayer slot="outer" />   z 30
 *   <GarmentLayer slot="acc" />     z 40
 * </OutfitRenderer>
 *
 * The box keeps the mannequin's 2:5 aspect; size it by height (h-full) or width (w-full).
 */
export function OutfitRenderer({
  sel,
  render,
  className = "",
  activeSlot,
  adjust = false,
  placementOverride,
  onPlacementChange,
  onLayerClick,
}: {
  sel: Selection;
  render?: RenderOptions | null;
  className?: string;
  activeSlot?: Slot;
  adjust?: boolean;
  /** live placement while dragging (not yet persisted) */
  placementOverride?: { slot: Slot; placement: Placement } | null;
  onPlacementChange?: (slot: Slot, p: Placement) => void;
  onLayerClick?: (slot: Slot) => void;
}) {
  const body: Body = render?.body ?? "standard";
  const ref = useRef<HTMLDivElement>(null);
  const slots = (["shoes", "bottom", "top", "outer", "acc"] as Slot[]).filter((s) => sel[s]);

  return (
    <div ref={ref} className={`relative aspect-[2/5] select-none ${className}`}>
      <Mannequin body={body} className="absolute inset-0 h-full w-full" />
      {slots.map((s) => {
        const it = sel[s]!;
        const p = placementOverride?.slot === s ? placementOverride.placement : it.placement ?? DEFAULT_PLACEMENT;
        return (
          <GarmentLayer
            key={s + it.id}
            slot={s}
            item={it}
            body={body}
            placement={p}
            z={effectiveLayer(s, it.placement, render)}
            open={s === "outer" && render?.openOuter !== false && canOpen(it) && !!sel.top}
            editing={adjust && activeSlot === s}
            stageRef={ref}
            onChange={onPlacementChange ? (np) => onPlacementChange(s, np) : undefined}
            onClick={onLayerClick ? () => onLayerClick(s) : undefined}
          />
        );
      })}
    </div>
  );
}

function GarmentLayer({
  slot,
  item,
  body,
  placement,
  z,
  open,
  editing,
  stageRef,
  onChange,
  onClick,
}: {
  slot: Slot;
  item: WardrobeItem;
  body: Body;
  placement: Placement;
  z: number;
  open: boolean;
  editing: boolean;
  stageRef: React.RefObject<HTMLDivElement | null>;
  onChange?: (p: Placement) => void;
  onClick?: () => void;
}) {
  const zone = zoneFor(slot, item, body);
  const src = garmentSource(item);
  const [aspect, setAspect] = useState<number | null>(null);
  const drag = useRef<{ x: number; y: number; p: Placement } | null>(null);

  const left = zone.cx - zone.w / 2 + (placement.x / 100) * VIEW_W;
  const top =
    (zone.align === "top" ? zone.y : zone.align === "bottom" ? zone.y - zone.h : zone.y - zone.h / 2) + (placement.y / 100) * VIEW_H;
  const origin = zone.align === "top" ? "50% 0%" : zone.align === "bottom" ? "50% 100%" : "50% 50%";
  const objPos = zone.align === "top" ? "center top" : zone.align === "bottom" ? "center bottom" : "center";

  // Single side-view shoe photo → draw a pair (mirrored). Pair photos (≈ square) are drawn once.
  const pair = slot === "shoes" && (src.kind === "none" || (aspect !== null && aspect > 1.35));

  const onPointerDown = (e: RPointerEvent) => {
    if (!editing || !onChange) return;
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, p: placement };
  };
  const onPointerMove = (e: RPointerEvent) => {
    const d = drag.current;
    const stage = stageRef.current;
    if (!d || !stage || !onChange) return;
    const r = stage.getBoundingClientRect();
    onChange({
      ...d.p,
      x: Math.round((d.p.x + ((e.clientX - d.x) / r.width) * 100) * 10) / 10,
      y: Math.round((d.p.y + ((e.clientY - d.y) / r.height) * 100) * 10) / 10,
    });
  };
  const onPointerUp = () => (drag.current = null);

  const img = (extra = "", style?: React.CSSProperties) =>
    src.kind === "none" ? (
      <GarmentGlyph
        category={item.category}
        subcategory={item.subcategory}
        color={item.color}
        pattern={item.pattern}
        fit={item.fit}
        tight
        align={zone.align}
        className={`h-full w-full ${extra}`}
      />
    ) : (
      <img
        src={src.url!}
        alt={item.name}
        draggable={false}
        onLoad={(e) => setAspect(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight)}
        className={`h-full w-full object-contain ${src.kind === "photo" ? "garment-photo" : "garment-cutout"} ${extra}`}
        style={{ objectPosition: objPos, ...style }}
      />
    );

  return (
    <div
      data-slot={slot}
      className={`absolute ${editing ? "cursor-move touch-none outline outline-1 outline-offset-2 outline-dashed outline-ink/50" : ""} ${
        onClick && !editing ? "cursor-pointer" : ""
      }`}
      style={{
        left: pctX(left),
        top: pctY(top),
        width: pctX(zone.w),
        height: pctY(zone.h),
        zIndex: z,
        transform: `scale(${placement.scale}) rotate(${placement.rotation}deg)`,
        transformOrigin: origin,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onClick={onClick}
    >
      {pair ? (
        <div className="flex h-full w-full items-end justify-center gap-[2%]">
          <div className="h-full w-[48%] -scale-x-100">{img()}</div>
          <div className="h-full w-[48%]">{img()}</div>
        </div>
      ) : open ? (
        // Worn open: two halves pulled apart so the top underneath shows.
        <div className="relative h-full w-full">
          <div className="absolute inset-0" style={{ clipPath: "inset(0 50% 0 0)", transform: "translateX(-7%)" }}>
            {img()}
          </div>
          <div className="absolute inset-0" style={{ clipPath: "inset(0 0 0 50%)", transform: "translateX(7%)" }}>
            {img()}
          </div>
        </div>
      ) : (
        img()
      )}
    </div>
  );
}
