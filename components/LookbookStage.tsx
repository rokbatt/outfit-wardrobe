"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { garmentSource } from "@/lib/garment";
import type { Selection } from "@/lib/styling";
import { hasHemLength, HEM_LENGTHS } from "@/lib/taxonomy";
import { useStore } from "@/lib/store";
import type { Placement, Slot, WardrobeItem } from "@/lib/types";
import { GarmentGlyph, glyphAspect } from "./GarmentGlyph";
import { IconChevronL, IconChevronR, IconClose, IconLock, IconPlus } from "./icons";

const KO: Record<Slot, string> = { outer: "아우터", top: "상의", bottom: "하의", shoes: "신발", acc: "액세서리" };
type Row = "upper" | "bottom" | "shoes";

/*
 * Real-world scale. Every piece is sized by its garment LENGTH in cm (shoulder → hem, waist → hem);
 * the width then follows from the image's own aspect ratio (cutouts are trimmed to the garment).
 * Sizing by width instead inflates tops, whose flat-lay width includes both sleeves.
 */
const FALLBACK_ASPECT: Record<Slot, number> = { outer: 0.85, top: 1.05, bottom: 0.45, shoes: 2.2, acc: 1 };
const TOP_LEN = 64; // all tops (reference: 그레이 크루넥 니트)
const OUTER_COVER = 1.04; // outer is at least this × the top's width, so the top's sleeves stay inside
const OUTER_OPEN = 0.09; // worn open: each half pulled out by this share of the outer's width
const OUTER_RISE = 1.5; // cm the outer's collar sits above the top's neckline

/** Front-opening outerwear is drawn open over the top; pullovers are drawn closed. */
const canOpen = (it: WardrobeItem) => !/아노락|풀오버|하프\s?집|맨투맨/.test(`${it.subcategory} ${it.name}`);
const SHOE_LEN = 28; // one shoe seen from the side, toe → heel
const SHOE_PAIR_W = 32; // a photo of the pair from above / the front
const FOOT_GAP = 5; // between the two mirrored shoes
const OVERLAP_HEM = 0.35; // shoes cover this share of their height over the pant hem
const SHORTS_LEN = 55; // waist → hem of shorts
const BERMUDA_LEN = 63; // knee-length shorts
const LEG_LEN = 104; // waist → floor, the length of full pants
const SHORT_BOTTOM = 80; // bottoms shorter than this (shorts, short skirts) leave the legs bare to the floor
const SHORTS_FLAT_W = 60; // flat-lay width of a pair of shorts / bermudas, cm
const MAX_HEM_STRETCH = 1.6; // a picked hem length may stretch the photo vertically up to this much
const PAIR_MIN_ASPECT = 1.35; // wider than this → a single side-view shoe → mirrored pair (≈ square = pair photo)
const ARROW_COL = 40; // px kept free on each side for the row arrows

const cropped = (it: WardrobeItem) => it.fit === "cropped" || /크롭|crop/i.test(`${it.name} ${it.subcategory}`);

/** Garment length in cm, from subcategory / fit / name. */
function lengthCm(slot: Slot, it: WardrobeItem, aspect: number): number {
  const s = `${it.subcategory} ${it.name}`;
  // Every top gets one length, calibrated to the grey crewneck knit, so the top section reads the same across tops.
  if (slot === "top") return TOP_LEN;
  if (slot === "outer") {
    if (/코트/.test(s)) return 100;
    if (/패딩/.test(s)) return /롱/.test(s) ? 105 : 72;
    if (/블레이저/.test(s)) return 74;
    if (/블루종/.test(s) || cropped(it)) return 62;
    if (/가디건|플리스/.test(s)) return 66;
    return 70;
  }
  // bottom
  if (/버뮤다/.test(s)) return BERMUDA_LEN;
  if (/쇼츠|반바지|숏/.test(s)) return SHORTS_LEN;
  if (/스커트/.test(s)) return /롱|맥시/.test(s) ? 88 : /미디/.test(s) ? 72 : 55;
  if (!it.subcategory && aspect > 0.8) return SHORTS_LEN; // untagged and wide → shorts-like
  return cropped(it) ? 92 : 104;
}

/** How much of the top's length overlaps the pants below the waistband (a worn top covers the waist). */
const waistOverlap = (topLen: number) => Math.min(12, topLen * 0.16);

/**
 * Which way a side-view shoe photo points. The heel end (collar / counter) stands taller than the toe box,
 * so compare the silhouette height near each end. Null when it can't tell (tainted canvas, no clear shape).
 */
function detectToeLeft(img: HTMLImageElement): boolean | null {
  try {
    const W = 160;
    const H = Math.max(1, Math.round((W * img.naturalHeight) / img.naturalWidth));
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, W, H);
    const d = ctx.getImageData(0, 0, W, H).data;
    // background: transparent (cutout) or the corners' colour (photo)
    const px = (x: number, y: number) => (y * W + x) * 4;
    const corners = [px(0, 0), px(W - 1, 0), px(0, H - 1), px(W - 1, H - 1)];
    const transparent = corners.every((i) => d[i + 3] < 16);
    const bg = [0, 1, 2].map((k) => corners.reduce((s, i) => s + d[i + k], 0) / 4);
    const fg = (i: number) =>
      transparent ? d[i + 3] > 40 : d[i + 3] > 40 && Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]) > 60;

    // per-column silhouette height, and the shoe's horizontal extent
    const colH = new Array<number>(W).fill(0);
    for (let x = 0; x < W; x++) {
      let top = -1;
      let bot = -1;
      for (let y = 0; y < H; y++) {
        if (fg(px(x, y))) {
          if (top < 0) top = y;
          bot = y;
        }
      }
      if (top >= 0) colH[x] = bot - top + 1;
    }
    const cols = colH.map((h, x) => (h > 0 ? x : -1)).filter((x) => x >= 0);
    if (cols.length < W * 0.2) return null;
    const x0 = cols[0];
    const x1 = cols[cols.length - 1];
    const span = x1 - x0;
    const mean = (a: number, b: number) => {
      let s = 0;
      for (let x = Math.round(a); x <= Math.round(b); x++) s += colH[x];
      return s / (Math.round(b) - Math.round(a) + 1);
    };
    // skip the very tips (rounded toe / heel pull tab), compare the outer quarter on each side
    const left = mean(x0 + span * 0.04, x0 + span * 0.3);
    const right = mean(x1 - span * 0.3, x1 - span * 0.04);
    if (Math.abs(left - right) < Math.max(left, right) * 0.06) return null;
    return right > left; // heel on the right → toe points left
  } catch {
    return null;
  }
}

/** Manual size of one piece, relative to its automatic box: width ×, height ×, top-edge shift (share of the box height). */
interface Fit2D {
  sx: number;
  sy: number;
  oy: number;
}
const NO_FIT: Fit2D = { sx: 1, sy: 1, oy: 0 };
const MIN_SCALE = 0.3;
const MAX_SCALE = 3;
const sameFit = (a: Fit2D, b: Fit2D) => Math.abs(a.sx - b.sx) < 1e-3 && Math.abs(a.sy - b.sy) < 1e-3 && Math.abs(a.oy - b.oy) < 1e-3;
// only lookbook sizes carry scale_y; older placements (3D mannequin offsets) mean nothing here
const fitOf = (p: Placement | null): Fit2D => (p && p.scale_y != null ? { sx: p.scale, sy: p.scale_y, oy: p.y } : NO_FIT);
const toPlacement = (f: Fit2D): Placement | null => (sameFit(f, NO_FIT) ? null : { x: 0, y: f.oy, scale: f.sx, scale_y: f.sy, rotation: 0, layer: null });

type BoxKey = "outer" | "top" | "bottom" | "shoes";
type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
const HANDLES: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const CURSOR: Record<Handle, string> = { n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize", ne: "nesw-resize", sw: "nesw-resize", nw: "nwse-resize", se: "nwse-resize" };

interface Box {
  x: number; // centre, px
  y: number; // top, px
  w: number;
  h: number;
}

/**
 * 2D lookbook: the real garment images (cutout → photo → glyph) stacked into one worn outfit.
 * (outer + top) → bottom → shoes, laid out from each piece's real aspect ratio so the top hem meets the
 * waistband and the shoes sit right under the hem. Accessories live in a collapsible side panel.
 * Every row swipes / arrows through its category ("Dress Me"); locked rows don't move.
 * Fills its (relative) parent.
 */
export function LookbookStage({
  sel,
  groups,
  locked,
  active,
  onActive,
  onStep,
  rightInset = 0,
}: {
  sel: Selection;
  groups: Record<Slot, WardrobeItem[]>;
  locked: Set<Slot>;
  active: Slot;
  onActive: (s: Slot) => void;
  onStep: (s: Slot, d: 1 | -1) => void;
  /** px from the top taken by an overlay in the top-right corner (the look badges) — right arrows stay below it */
  rightInset?: number;
}) {
  const areaRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [aspects, setAspects] = useState<Record<string, number>>({});
  const [accOpen, setAccOpen] = useState(false);
  const swipe = useRef<{ x: number; y: number; row: Row } | null>(null);

  // PowerPoint-style resize: click a piece → frame with 8 handles; drag to resize; save keeps it for that item.
  const { updateItem, toast } = useStore();
  const [editing, setEditing] = useState<BoxKey | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Fit2D>>({}); // item id → unsaved size
  const [saved, setSaved] = useState<Record<string, Fit2D>>({}); // item id → saved this session (sel holds snapshots)
  const [savingFit, setSavingFit] = useState(false);
  const [dragging, setDragging] = useState(false); // pieces animate their size; not while a handle is dragged
  const drag = useRef<{ id: string; h: Handle; px: number; py: number; f: Fit2D; b: Box } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setEditing(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // outer + top share the upper row; its arrows drive whichever of the two is active
  const upperSlot: Slot = active === "outer" && groups.outer.length ? "outer" : "top";
  const accAvailable = groups.acc.length > 0 || !!sel.acc;
  const showAcc = accOpen && accAvailable;

  useEffect(() => {
    if (active === "acc" && accAvailable) setAccOpen(true);
  }, [active, accAvailable]);

  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Natural aspect of every selected image (cutouts are trimmed, so this is the garment's own shape).
  const urls = (["outer", "top", "bottom", "shoes"] as Slot[]).map((s) => (sel[s] ? garmentSource(sel[s]!).url : null));
  const urlKey = urls.join("|");
  useEffect(() => {
    for (const u of urls) {
      if (!u || aspects[u]) continue;
      const img = new Image();
      img.onload = () => img.naturalHeight && setAspects((a) => ({ ...a, [u]: img.naturalWidth / img.naturalHeight }));
      img.src = u;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlKey]);

  // Toe direction of the shoe photo, so the mirrored pair always points outward.
  const [toeLeft, setToeLeft] = useState<Record<string, boolean | null>>({});
  const shoeUrl = sel.shoes ? garmentSource(sel.shoes).url : null;
  useEffect(() => {
    if (!shoeUrl || shoeUrl in toeLeft) return;
    const img = new Image();
    if (!shoeUrl.startsWith("data:") && !shoeUrl.startsWith("blob:")) img.crossOrigin = "anonymous";
    img.onload = () => setToeLeft((t) => ({ ...t, [shoeUrl]: detectToeLeft(img) }));
    img.onerror = () => setToeLeft((t) => ({ ...t, [shoeUrl]: null }));
    img.src = shoeUrl;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shoeUrl]);
  const shoeFlip = !!(shoeUrl && toeLeft[shoeUrl]);

  const aspectOf = (slot: Slot, it: WardrobeItem) => {
    const src = garmentSource(it);
    if (src.kind === "none") return glyphAspect(it.category, it.subcategory, it.fit);
    return aspects[src.url!] ?? FALLBACK_ASPECT[slot];
  };

  /* ─────────── layout in cm, then scaled to px (u = px per cm) ─────────── */
  const { top, outer, bottom, shoes } = sel;
  const dims = (slot: Slot, it: WardrobeItem) => {
    const a = aspectOf(slot, it);
    const h = lengthCm(slot, it, a);
    return { w: h * a, h };
  };
  // the piece drawn in the top box: the top, or the outer when it is worn alone
  const upperItem = top ?? outer;
  const upper = upperItem ? dims(top ? "top" : "outer", upperItem) : { w: 56, h: 66 };
  const both = !!(top && outer);
  // Worn over the top: centred on it, at least as wide so the top's sleeves stay inside the outer's.
  const outerD = (() => {
    if (!both) return null;
    const d = dims("outer", outer!);
    const k = Math.max(1, (upper.w * OUTER_COVER) / d.w);
    return { w: d.w * k, h: d.h * k };
  })();
  const outerOpen = both && canOpen(outer!);
  const outerSpan = outerD ? outerD.w * (1 + (outerOpen ? 2 * OUTER_OPEN : 0)) : 0;
  // Shorts / bermudas with a picked hem length: the photo keeps its width and is stretched to that length.
  const hemCm = bottom && hasHemLength(bottom.category, bottom.subcategory) ? HEM_LENGTHS.find((l) => l.key === bottom.hem_length)?.cm : undefined;
  const bottomD = !bottom
    ? { w: 44, h: 100 }
    : hemCm
      ? (() => {
          const a = aspectOf("bottom", bottom);
          const shown = Math.min(95, Math.max(35, SHORTS_FLAT_W / a)); // length the photo itself depicts
          const stretch = Math.min(MAX_HEM_STRETCH, Math.max(0.85, hemCm / shown));
          return { w: (hemCm * a) / stretch, h: hemCm };
        })()
      : dims("bottom", bottom);
  const shoeAspect = shoes ? aspectOf("shoes", shoes) : 3;
  const pair = !!shoes && (garmentSource(shoes).kind === "none" || shoeAspect > PAIR_MIN_ASPECT);
  const shoeD = !shoes
    ? { w: 40, h: 12 }
    : pair
      ? { w: SHOE_LEN * 2 + FOOT_GAP, h: SHOE_LEN / shoeAspect }
      : { w: SHOE_PAIR_W, h: SHOE_PAIR_W / shoeAspect };

  const overlapWaist = upperItem ? waistOverlap(upper.h) : 4;
  const waistY = upper.h - overlapWaist;
  // Shorts / short skirts: the shoes stay where full-length pants would end (bare legs between), so the
  // figure keeps one scale and the top doesn't balloon when the bottom gets shorter.
  const floorY = waistY + (hemCm || bottomD.h < SHORT_BOTTOM ? LEG_LEN : bottomD.h);
  const shoeY = floorY - shoeD.h * OVERLAP_HEM;
  const totalH = Math.max(shoeY + shoeD.h, outerD?.h ?? 0);
  const half = Math.max(upper.w, outerSpan, bottomD.w, shoeD.w) / 2;
  // everything hangs on one centre line

  const availW = Math.max(0, size.w - ARROW_COL * 2);
  const reserve = accAvailable && !showAcc ? 40 : 0; // bottom strip for the folded accessory toggle
  const availH = (size.h - reserve) * 0.92;
  const u = size.w && size.h ? Math.min(availH / totalH, availW / (half * 2)) : 0;
  const x0 = size.w / 2;
  const y0 = (size.h - reserve - totalH * u) / 2 + size.h * 0.01;
  const box = (cx: number, y: number, w: number, h: number): Box => ({ x: x0 + cx * u, y: y0 + y * u, w: w * u, h: h * u });

  const boxes = {
    // collar sits a touch above the top's neckline; outer alone is drawn in the top box
    outer: outerD ? box(0, -OUTER_RISE, outerD.w, outerD.h) : null,
    top: box(0, 0, upper.w, upper.h),
    bottom: box(0, waistY, bottomD.w, bottomD.h),
    shoes: box(0, shoeY, shoeD.w, shoeD.h),
  };
  const upperH = upper.h;
  const bottomH = bottomD.h;
  const shoeH = shoeD.h;
  const seam = y0 + (waistY + overlapWaist / 2) * u;
  const bands: Record<Row, [number, number]> = {
    upper: [0, seam],
    bottom: [seam, y0 + (shoeY + shoeH * 0.2) * u],
    shoes: [y0 + (shoeY + shoeH * 0.2) * u, size.h],
  };
  const rowSlot: Record<Row, Slot> = { upper: upperSlot, bottom: "bottom", shoes: "shoes" };
  const rowCenter: Record<Row, number> = {
    upper: y0 + (upperH / 2) * u,
    bottom: y0 + (waistY + bottomH / 2) * u,
    shoes: y0 + (shoeY + shoeH / 2) * u,
  };
  const rowAt = (y: number): Row => (y < bands.upper[1] ? "upper" : y < bands.bottom[1] ? "bottom" : "shoes");
  // Right arrow slides down below the corner overlay, but never out of its own row.
  const rightDrop = (row: Row) => {
    const want = rightInset + 20;
    return rowCenter[row] >= want ? 0 : Math.max(0, Math.min(want, bands[row][1] - 16) - rowCenter[row]);
  };
  const canStep = (s: Slot) => !locked.has(s) && groups[s].length > 0;

  /* ─────────── manual sizes (on top of the automatic layout; the layout itself doesn't move) ─────────── */
  const pieceItem: Record<BoxKey, WardrobeItem | undefined> = { outer: both ? outer : undefined, top: top ?? (both ? undefined : outer), bottom, shoes };
  const savedFit = (it: WardrobeItem) => saved[it.id] ?? fitOf(it.placement);
  const fitFor = (it?: WardrobeItem) => (it ? drafts[it.id] ?? savedFit(it) : NO_FIT);
  const sized = (k: BoxKey): Box | null => {
    const b = boxes[k];
    if (!b) return null;
    const f = fitFor(pieceItem[k]);
    return { x: b.x, y: b.y + f.oy * b.h, w: b.w * f.sx, h: b.h * f.sy };
  };
  const shown = { outer: sized("outer"), top: sized("top")!, bottom: sized("bottom")!, shoes: sized("shoes")! };
  const stretched = (k: BoxKey) => {
    const f = fitFor(pieceItem[k]);
    return Math.abs(f.sx - f.sy) > 1e-3;
  };

  const allItems = Object.values(groups).flat();
  const dirtyIds = Object.keys(drafts).filter((id) => {
    const it = allItems.find((x) => x.id === id);
    return it && !sameFit(drafts[id], savedFit(it));
  });
  const editItem = editing ? pieceItem[editing] : undefined;
  const editFit = fitFor(editItem);

  const startDrag = (e: React.PointerEvent, h: Handle) => {
    if (!editing || !editItem || !boxes[editing]) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: editItem.id, h, px: e.clientX, py: e.clientY, f: fitFor(editItem), b: boxes[editing]! };
    setDragging(true);
  };
  const moveDrag = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.px;
    const dy = e.clientY - d.py;
    const W0 = d.b.w * d.f.sx;
    const H0 = d.b.h * d.f.sy;
    // horizontal: the piece stays on the centre line, so both sides move · vertical: the opposite edge stays put
    let W = d.h.includes("e") ? W0 + 2 * dx : d.h.includes("w") ? W0 - 2 * dx : W0;
    let H = d.h.includes("s") ? H0 + dy : d.h.includes("n") ? H0 - dy : H0;
    if (d.h.length === 2) {
      // corners keep the proportions (the axis dragged further wins)
      const k = Math.abs(W / W0 - 1) > Math.abs(H / H0 - 1) ? W / W0 : H / H0;
      W = W0 * k;
      H = H0 * k;
    }
    const clamp = (v: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, v));
    const sx = clamp(W / d.b.w);
    const sy = clamp(H / d.b.h);
    const oy = d.h.includes("n") ? d.f.oy + (H0 - d.b.h * sy) / d.b.h : d.f.oy;
    setDrafts((m) => ({ ...m, [d.id]: { sx, sy, oy } }));
  };
  const endDrag = () => {
    drag.current = null;
    setDragging(false);
  };

  const saveFits = async () => {
    setSavingFit(true);
    try {
      for (const id of dirtyIds) await updateItem(id, { placement: toPlacement(drafts[id]) });
      setSaved((s) => ({ ...s, ...Object.fromEntries(dirtyIds.map((id) => [id, drafts[id]])) }));
      setDrafts({});
      setEditing(null);
      toast("크기를 저장했어요 · 다음부터 이 비율로 보여요");
    } catch (e) {
      toast(`저장 실패: ${e instanceof Error ? e.message : e}`);
    } finally {
      setSavingFit(false);
    }
  };
  const pick = (k: BoxKey) => (s: Slot) => {
    onActive(s);
    setEditing(k);
  };

  return (
    <div className="absolute inset-0 flex">
      {/* outfit column — takes the full stage while the accessory panel is folded */}
      <div
        ref={areaRef}
        className={`relative h-full min-w-0 flex-1 ${dragging ? "[&_*]:!transition-none" : ""}`}
        style={{ touchAction: "pan-y" }}
        onPointerDown={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          swipe.current = { x: e.clientX, y: e.clientY, row: rowAt(e.clientY - r.top) };
        }}
        onPointerUp={(e) => {
          const s = swipe.current;
          swipe.current = null;
          if (!s || !canStep(rowSlot[s.row])) return;
          const dx = e.clientX - s.x;
          const dy = e.clientY - s.y;
          if (Math.abs(dx) > 36 && Math.abs(dx) > Math.abs(dy) * 1.4) onStep(rowSlot[s.row], dx < 0 ? 1 : -1);
        }}
        onPointerCancel={() => (swipe.current = null)}
        onClick={(e) => e.target === e.currentTarget && setEditing(null)}
      >
        {u > 0 && (
          <>
            {/* soft floor shadow under the shoes */}
            <div
              className="pointer-events-none absolute rounded-[50%] bg-[radial-gradient(closest-side,rgba(0,0,0,0.10),transparent)]"
              style={{ left: x0 - 45 * u, width: 90 * u, top: shown.shoes.y + shown.shoes.h - 4 * u, height: 8 * u }}
            />
            {/* outer is worn over the top (z above it), open down the front when it can be */}
            {shown.outer && <Piece item={outer!} slot="outer" box={shown.outer} z={22} onPick={pick("outer")} open={outerOpen} fill={stretched("outer")} />}
            {/* the top always sits over the bottom (z 20 > 10), however either is resized */}
            <Piece item={bottom} slot="bottom" box={shown.bottom} z={10} onPick={pick("bottom")} fill={!!hemCm || stretched("bottom")} />
            <Piece item={pieceItem.top} slot={top || !outer ? "top" : "outer"} box={shown.top} z={20} onPick={pick("top")} fill={stretched("top")} />
            {shoes ? (
              <Piece item={shoes} slot="shoes" box={shown.shoes} z={25} onPick={pick("shoes")} pair={pair} flip={shoeFlip} fill={stretched("shoes")} />
            ) : (
              <Piece slot="shoes" box={boxes.shoes} z={5} onPick={onActive} />
            )}

            {(["upper", "bottom", "shoes"] as Row[]).map((row) => {
              const slot = rowSlot[row];
              const lock = locked.has(slot);
              const can = canStep(slot);
              const on = row === "upper" ? active === "top" || active === "outer" : active === slot;
              return (
                <div key={row} className="pointer-events-none absolute inset-x-0 z-30" style={{ top: rowCenter[row] }}>
                  <div className="absolute left-1.5 flex -translate-y-1/2 flex-col items-start gap-1">
                    {lock ? (
                      <LockTag label={slot === "outer" ? "OUTER" : slot.toUpperCase()} />
                    ) : (
                      can && <Arrow slot={slot} d={-1} on={on} onStep={onStep} />
                    )}
                  </div>
                  <div className="absolute right-1.5 -translate-y-1/2" style={{ top: rightDrop(row) }}>
                    {!lock && can && <Arrow slot={slot} d={1} on={on} onStep={onStep} />}
                  </div>
                </div>
              );
            })}

            {/* resize frame around the picked piece */}
            {editing && editItem && shown[editing] && (
              <div
                className="pointer-events-none absolute z-40 border-[1.5px] border-dashed border-ink/70"
                style={{ left: shown[editing]!.x - shown[editing]!.w / 2, top: shown[editing]!.y, width: shown[editing]!.w, height: shown[editing]!.h }}
              >
                {HANDLES.map((h) => (
                  <span
                    key={h}
                    role="presentation"
                    onPointerDown={(e) => startDrag(e, h)}
                    onPointerMove={moveDrag}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                    className="tap pointer-events-auto absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-[3px] border-[1.5px] border-ink bg-paper shadow-sm"
                    style={{
                      left: h.includes("w") ? "0%" : h.includes("e") ? "100%" : "50%",
                      top: h.includes("n") ? "0%" : h.includes("s") ? "100%" : "50%",
                      cursor: CURSOR[h],
                      touchAction: "none",
                    }}
                  />
                ))}
              </div>
            )}

            {/* save / reset bar for manual sizes */}
            {(dirtyIds.length > 0 || editing) && (
              <div className="absolute inset-x-0 bottom-2.5 z-40 flex justify-center px-2">
                <div className="flex items-center gap-1.5 rounded-full border border-line bg-paper/95 p-1 pl-3 text-[11.5px] shadow-md backdrop-blur">
                  {dirtyIds.length === 0 && <span className="pr-1 text-mute">모서리·변을 끌어 크기 조절</span>}
                  {editItem && !sameFit(editFit, NO_FIT) && (
                    <button className="rounded-full px-2.5 py-1 font-semibold text-ink-2 hover:bg-card" onClick={() => setDrafts((m) => ({ ...m, [editItem.id]: NO_FIT }))}>
                      원래 크기
                    </button>
                  )}
                  {dirtyIds.length > 0 && (
                    <>
                      <button className="rounded-full px-2.5 py-1 font-semibold text-ink-2 hover:bg-card" disabled={savingFit} onClick={() => setDrafts({})}>
                        취소
                      </button>
                      <button className="rounded-full bg-ink px-3.5 py-1 font-semibold text-paper disabled:opacity-50" disabled={savingFit} onClick={saveFits}>
                        {savingFit ? "저장 중…" : `저장${dirtyIds.length > 1 ? ` (${dirtyIds.length})` : ""}`}
                      </button>
                    </>
                  )}
                  {dirtyIds.length === 0 && (
                    <button aria-label="크기 조절 닫기" className="tap grid h-6 w-6 place-items-center rounded-full text-ink-2 hover:bg-card" onClick={() => setEditing(null)}>
                      <IconClose width={12} height={12} />
                    </button>
                  )}
                </div>
              </div>
            )}

            {groups.outer.length > 0 && (
              <button
                onClick={() => onActive(upperSlot === "outer" ? "top" : "outer")}
                className="tap absolute left-1.5 z-30 rounded-full border border-line bg-paper/90 px-2 py-0.5 text-[9.5px] font-bold tracking-[0.06em] text-ink-2 shadow-sm backdrop-blur"
                style={{ top: rowCenter.upper + 22 }}
                aria-label="넘길 옷 바꾸기 (상의 / 아우터)"
              >
                {upperSlot === "outer" ? "OUTER ⇄ TOP" : "TOP ⇄ OUTER"}
              </button>
            )}
          </>
        )}

        {/* accessory toggle (folded panel takes no space; a picked accessory still shows as a badge) */}
        {accAvailable && !showAcc && (
          <button
            onClick={() => {
              setAccOpen(true);
              onActive("acc");
            }}
            className="absolute bottom-2.5 right-2.5 z-30 flex items-center gap-1.5 rounded-full border border-line bg-paper/90 py-1 pl-1.5 pr-2.5 text-[11px] font-semibold text-ink-2 shadow-sm backdrop-blur"
            aria-label="액세서리 펼치기"
          >
            {sel.acc ? (
              <span className="grid h-6 w-6 place-items-center overflow-hidden rounded-full bg-card p-0.5">
                <Visual item={sel.acc} />
              </span>
            ) : (
              <IconPlus width={13} height={13} strokeWidth={2} />
            )}
            액세서리
            {locked.has("acc") && <IconLock width={10} height={10} strokeWidth={2.2} />}
          </button>
        )}
      </div>

      {showAcc && (
        <div className="relative flex h-full w-[27%] min-w-[92px] max-w-[170px] flex-col items-center justify-end gap-1.5 pb-3 pr-2.5">
          <div className="relative w-full">
            <div className="aspect-square w-full">
              <Piece item={sel.acc} slot="acc" box={null} z={0} onPick={onActive} />
            </div>
            {locked.has("acc") && (
              <div className="absolute -top-2 left-1/2 -translate-x-1/2">
                <LockTag label="ACC" />
              </div>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {canStep("acc") && <Arrow slot="acc" d={-1} on={active === "acc"} onStep={onStep} small />}
            {canStep("acc") && <Arrow slot="acc" d={1} on={active === "acc"} onStep={onStep} small />}
            <button
              onClick={() => {
                setAccOpen(false);
                if (active === "acc") onActive("top");
              }}
              className="tap grid h-7 w-7 place-items-center rounded-full border border-line bg-paper/85 text-ink-2 shadow-sm lg:h-6 lg:w-6"
              aria-label="액세서리 접기"
            >
              <IconClose width={12} height={12} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/*
 * Display-only downscaling. A large photo shrunk in one step by the browser (worse inside a filtered layer
 * like .lookbook-piece) aliases fine knit textures into moiré. Halving repeatedly with smoothing is a proper
 * low-pass, so the copy drawn on the stage is clean. The stored original is never touched.
 */
const resampled = new Map<string, Promise<string>>();
const bucket = (px: number) => Math.ceil(px / 96) * 96; // don't re-render on every small resize

function resample(url: string, targetW: number): Promise<string> {
  const key = `${targetW}|${url}`;
  let p = resampled.get(key);
  if (!p) {
    p = new Promise<string>((resolve) => {
      const img = new Image();
      if (!url.startsWith("data:") && !url.startsWith("blob:")) img.crossOrigin = "anonymous";
      img.onerror = () => resolve(url);
      img.onload = () => {
        try {
          let w = img.naturalWidth;
          let h = img.naturalHeight;
          if (w <= targetW * 1.25) return resolve(url);
          let cur: CanvasImageSource = img;
          while (w / 2 >= targetW) {
            const c = document.createElement("canvas");
            c.width = Math.round(w / 2);
            c.height = Math.round(h / 2);
            const ctx = c.getContext("2d")!;
            ctx.imageSmoothingQuality = "high";
            ctx.drawImage(cur, 0, 0, c.width, c.height);
            cur = c;
            w = c.width;
            h = c.height;
          }
          const out = document.createElement("canvas");
          out.width = targetW;
          out.height = Math.max(1, Math.round((h * targetW) / w));
          const ctx = out.getContext("2d")!;
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(cur, 0, 0, out.width, out.height);
          out.toBlob((b) => resolve(b ? URL.createObjectURL(b) : url), "image/png");
        } catch {
          resolve(url); // cross-origin without CORS → show the original
        }
      };
      img.src = url;
    });
    resampled.set(key, p);
  }
  return p;
}

/** `url`, downscaled for display at `px` CSS pixels wide (null/0 → the original). */
function useDisplaySrc(url: string | null, px: number) {
  const dpr = typeof window === "undefined" ? 1 : Math.min(3, window.devicePixelRatio || 1);
  const target = px > 0 ? bucket(px * dpr) : 0;
  const [done, setDone] = useState<{ key: string; src: string } | null>(null);
  const key = `${target}|${url}`;
  useEffect(() => {
    if (!url || !target) return;
    let alive = true;
    resample(url, target).then((src) => alive && setDone({ key, src }));
    return () => {
      alive = false;
    };
  }, [url, target, key]);
  if (!url) return null;
  // until the copy is ready keep the previous one (avoids a flash of the moiré original on resize)
  return done && (done.key === key || done.key.endsWith(`|${url}`)) ? done.src : url;
}

function Visual({ item, px = 0, fill = false }: { item: WardrobeItem; px?: number; fill?: boolean }) {
  const src = garmentSource(item);
  const shown = useDisplaySrc(src.url, px);
  if (src.kind === "none")
    return (
      <GarmentGlyph
        category={item.category}
        subcategory={item.subcategory}
        color={item.color}
        pattern={item.pattern}
        fit={item.fit}
        tight
        className="h-full w-full"
      />
    );
  return (
    <img
      src={shown!}
      alt=""
      draggable={false}
      className={`h-full w-full ${fill ? "object-fill" : "object-contain"} ${src.kind === "photo" ? "garment-img" : ""}`}
    />
  );
}

/**
 * One garment, placed in px (box) or filling its parent (box null).
 * Shoes can be drawn as a mirrored pair; outerwear can be drawn worn open (halves pulled apart, the top shows between).
 */
function Piece({
  item,
  slot,
  box,
  z,
  onPick,
  pair = false,
  flip = false,
  fill = false,
  open = false,
}: {
  item?: WardrobeItem;
  slot: Slot;
  box: Box | null;
  z: number;
  onPick: (s: Slot) => void;
  pair?: boolean;
  /** the side-view shoe photo points left, so mirror the right shoe instead of the left */
  flip?: boolean;
  /** stretch the image to the box (a picked hem length) instead of keeping its aspect */
  fill?: boolean;
  open?: boolean;
}) {
  const pos: CSSProperties = box
    ? { position: "absolute", left: box.x - box.w / 2, top: box.y, width: box.w, height: box.h, zIndex: z }
    : { position: "relative", width: "100%", height: "100%" };
  const moves = "transition-[left,top,width,height] duration-300 ease-out";

  if (!item)
    return (
      <div className={`flex items-center justify-center ${moves}`} style={pos}>
        <span className="whitespace-nowrap rounded border border-dashed border-line-2 bg-stage/70 px-2 py-1 text-[10.5px] text-mute">
          {KO[slot]} 없음
        </span>
      </div>
    );

  const shadow = garmentSource(item).kind === "photo" ? "" : "lookbook-piece";
  const px = box?.w ?? 0; // on-screen width, for the display-resampled image
  return (
    <button type="button" onClick={() => onPick(slot)} aria-label={`${KO[slot]}: ${item.name}`} className={`block ${shadow} ${moves} ${open ? "pointer-events-none" : ""}`} style={pos}>
      <div key={item.id} className="stage-in relative h-full w-full">
        {pair ? (
          // single side-view shoe → one mirrored so both toes point outward, feet slightly apart
          <div className="flex h-full w-full items-end justify-between">
            <div className={`h-full w-[48%] ${flip ? "" : "-scale-x-100"}`}>
              <Visual item={item} px={px * 0.48} fill={fill} />
            </div>
            <div className={`h-full w-[48%] ${flip ? "-scale-x-100" : ""}`}>
              <Visual item={item} px={px * 0.48} fill={fill} />
            </div>
          </div>
        ) : open ? (
          <>
            <div className="pointer-events-auto absolute inset-0" style={{ clipPath: "inset(0 50% 0 0)", transform: `translateX(-${OUTER_OPEN * 100}%)` }}>
              <Visual item={item} px={px} fill={fill} />
            </div>
            <div className="pointer-events-auto absolute inset-0" style={{ clipPath: "inset(0 0 0 50%)", transform: `translateX(${OUTER_OPEN * 100}%)` }}>
              <Visual item={item} px={px} fill={fill} />
            </div>
          </>
        ) : (
          <Visual item={item} px={px} fill={fill} />
        )}
      </div>
    </button>
  );
}

function Arrow({ slot, d, on, onStep, small = false }: { slot: Slot; d: 1 | -1; on: boolean; onStep: (s: Slot, d: 1 | -1) => void; small?: boolean }) {
  const s = small ? 13 : 15;
  return (
    <button
      type="button"
      aria-label={`${KO[slot]} ${d < 0 ? "이전" : "다음"}`}
      onClick={() => onStep(slot, d)}
      className={`tap pointer-events-auto grid shrink-0 place-items-center rounded-full border bg-paper/85 shadow-sm backdrop-blur transition hover:border-ink ${
        small ? "h-7 w-7 lg:h-6 lg:w-6" : "h-8 w-8 lg:h-7 lg:w-7"
      } ${on ? "border-ink/40 text-ink" : "border-line text-ink-2"}`}
    >
      {d < 0 ? <IconChevronL width={s} height={s} /> : <IconChevronR width={s} height={s} />}
    </button>
  );
}

function LockTag({ label }: { label: string }) {
  return (
    <span className="pointer-events-auto flex items-center gap-1 rounded-full bg-ink px-1.5 py-0.5 text-[9.5px] font-bold tracking-[0.06em] text-paper">
      <IconLock width={9} height={9} strokeWidth={2.4} />
      {label}
    </span>
  );
}
