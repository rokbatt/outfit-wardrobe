/**
 * 3D garment templates.
 *
 * A wardrobe item never becomes its own mesh: it references one template (by id) and
 * the template's geometry is generated around the current avatar body, then coloured
 * by the item's metadata (color, pattern, material). Approximation is intended — the
 * photo-accurate look is the AI Try-On's job.
 *
 * Lengths are expressed against body landmarks so every template fits every body:
 *   top hem  t: 0 = waist, 1 = crotch, 2 = knee
 *   sleeve   0–1 of arm length (shoulder → wrist)
 *   leg hem  0–1 of leg length (hip joint → ankle), > 1 breaks over the shoe
 *   rise     0 = natural waist, 1 = hip line
 */
import type { Slot, WardrobeItem } from "../types";

export type Collar = "none" | "crew" | "rib" | "shirt" | "hood" | "puffer";

export interface TopSpec {
  kind: "top";
  ease: number; // m added around the body
  drape: number; // below the chest the garment hangs at ≥ drape × its own chest size (1 = boxy)
  hem: number;
  sleeve: number;
  sleeveEase: number;
  sleeveDrape: number; // sleeve keeps ≥ this × its upper-arm size (1 = straight tube)
  band?: boolean; // ribbed hem that hugs (sweatshirt, blouson)
  cuff?: boolean;
  collar: Collar;
  frontLine?: boolean; // open front / zip line (outerwear, shirts)
}
export interface BottomSpec {
  kind: "bottom";
  style: "pants" | "skirt";
  rise: number;
  ease: number;
  leg: "fitted" | "straight" | "wide" | "tapered";
  hem: number;
  cuff?: boolean;
  flare?: number; // skirt hem width vs hip
}
export interface ShoesSpec {
  kind: "shoes";
  style: "sneaker" | "loafer" | "boots" | "sandal";
}
export interface AccSpec {
  kind: "acc";
  style: "cap" | "beanie" | "none";
}
export type GarmentSpec = TopSpec | BottomSpec | ShoesSpec | AccSpec;

const top = (s: Omit<TopSpec, "kind">): TopSpec => ({ kind: "top", ...s });
const bottom = (s: Omit<BottomSpec, "kind" | "style"> & { style?: BottomSpec["style"] }): BottomSpec => ({ kind: "bottom", style: "pants", ...s });

export const GARMENT_TEMPLATES = {
  // ── TOP ──
  tshirt: top({ ease: 0.012, drape: 0.9, hem: 0.9, sleeve: 0.3, sleeveEase: 0.012, sleeveDrape: 0.95, collar: "crew" }),
  oversized_tshirt: top({ ease: 0.024, drape: 1.0, hem: 1.02, sleeve: 0.44, sleeveEase: 0.02, sleeveDrape: 1.02, collar: "crew" }),
  longsleeve: top({ ease: 0.01, drape: 0.88, hem: 0.9, sleeve: 1, sleeveEase: 0.008, sleeveDrape: 0.74, collar: "crew", cuff: true }),
  shirt: top({ ease: 0.014, drape: 0.92, hem: 1.02, sleeve: 1, sleeveEase: 0.011, sleeveDrape: 0.78, collar: "shirt", cuff: true, frontLine: true }),
  polo: top({ ease: 0.013, drape: 0.91, hem: 0.9, sleeve: 0.3, sleeveEase: 0.012, sleeveDrape: 0.95, collar: "shirt" }),
  knit: top({ ease: 0.016, drape: 0.9, hem: 0.82, sleeve: 1, sleeveEase: 0.013, sleeveDrape: 0.78, collar: "rib", band: true, cuff: true }),
  sweatshirt: top({ ease: 0.019, drape: 0.92, hem: 0.8, sleeve: 1, sleeveEase: 0.015, sleeveDrape: 0.8, collar: "rib", band: true, cuff: true }),
  hoodie: top({ ease: 0.022, drape: 0.94, hem: 0.84, sleeve: 1, sleeveEase: 0.017, sleeveDrape: 0.8, collar: "hood", band: true, cuff: true }),
  tank: top({ ease: 0.009, drape: 0.9, hem: 0.9, sleeve: 0, sleeveEase: 0, sleeveDrape: 0, collar: "none" }),
  // ── OUTER ──
  jacket: top({ ease: 0.022, drape: 0.93, hem: 0.92, sleeve: 1, sleeveEase: 0.016, sleeveDrape: 0.8, collar: "shirt", frontLine: true }),
  blouson: top({ ease: 0.028, drape: 0.96, hem: 0.55, sleeve: 1, sleeveEase: 0.02, sleeveDrape: 0.84, collar: "rib", band: true, cuff: true, frontLine: true }),
  coat: top({ ease: 0.024, drape: 0.94, hem: 1.85, sleeve: 1.02, sleeveEase: 0.018, sleeveDrape: 0.82, collar: "shirt", frontLine: true }),
  padding: top({ ease: 0.048, drape: 1, hem: 0.85, sleeve: 1.02, sleeveEase: 0.036, sleeveDrape: 0.9, collar: "puffer", band: true, cuff: true, frontLine: true }),
  cardigan: top({ ease: 0.018, drape: 0.92, hem: 0.95, sleeve: 1, sleeveEase: 0.014, sleeveDrape: 0.78, collar: "none", band: true, cuff: true, frontLine: true }),
  windbreaker: top({ ease: 0.032, drape: 0.96, hem: 0.8, sleeve: 1, sleeveEase: 0.022, sleeveDrape: 0.84, collar: "hood", band: true, cuff: true, frontLine: true }),
  fleece: top({ ease: 0.028, drape: 0.95, hem: 0.8, sleeve: 1, sleeveEase: 0.02, sleeveDrape: 0.82, collar: "rib", band: true, cuff: true, frontLine: true }),
  // ── BOTTOM ──
  jeans: bottom({ rise: 0.45, ease: 0.01, leg: "straight", hem: 1.02 }),
  wide_jeans: bottom({ rise: 0.4, ease: 0.014, leg: "wide", hem: 1.05 }),
  slacks: bottom({ rise: 0.3, ease: 0.012, leg: "straight", hem: 1.02 }),
  chino: bottom({ rise: 0.4, ease: 0.012, leg: "straight", hem: 1.0 }),
  wide_pants: bottom({ rise: 0.3, ease: 0.016, leg: "wide", hem: 1.05 }),
  cargo: bottom({ rise: 0.45, ease: 0.018, leg: "wide", hem: 1.03 }),
  jogger: bottom({ rise: 0.35, ease: 0.014, leg: "tapered", hem: 0.98, cuff: true }),
  shorts: bottom({ rise: 0.4, ease: 0.014, leg: "straight", hem: 0.42 }),
  skirt: bottom({ style: "skirt", rise: 0.2, ease: 0.012, leg: "straight", hem: 0.6, flare: 1.22 }),
  // ── SHOES ──
  sneaker: { kind: "shoes", style: "sneaker" } as ShoesSpec,
  loafer: { kind: "shoes", style: "loafer" } as ShoesSpec,
  boots: { kind: "shoes", style: "boots" } as ShoesSpec,
  sandal: { kind: "shoes", style: "sandal" } as ShoesSpec,
  // ── ACC ──
  cap: { kind: "acc", style: "cap" } as AccSpec,
  beanie: { kind: "acc", style: "beanie" } as AccSpec,
  none: { kind: "acc", style: "none" } as AccSpec,
} satisfies Record<string, GarmentSpec>;

export type GarmentTemplateId = keyof typeof GARMENT_TEMPLATES;

export const TEMPLATE_KO: Record<GarmentTemplateId, string> = {
  tshirt: "반팔 티셔츠",
  oversized_tshirt: "오버핏 반팔",
  longsleeve: "긴팔 티셔츠",
  shirt: "셔츠",
  polo: "폴로",
  knit: "니트",
  sweatshirt: "스웨트셔츠",
  hoodie: "후드",
  tank: "민소매",
  jacket: "자켓",
  blouson: "블루종",
  coat: "코트",
  padding: "패딩",
  cardigan: "가디건",
  windbreaker: "바람막이",
  fleece: "플리스",
  jeans: "데님",
  wide_jeans: "와이드 데님",
  slacks: "슬랙스",
  chino: "치노",
  wide_pants: "와이드 팬츠",
  cargo: "카고",
  jogger: "조거",
  shorts: "쇼츠",
  skirt: "스커트",
  sneaker: "스니커즈",
  loafer: "로퍼",
  boots: "부츠",
  sandal: "샌들",
  cap: "캡",
  beanie: "비니",
  none: "3D 미지원",
};

/** Templates a slot may use — for letting the user override the automatic choice. */
export const TEMPLATES_FOR_SLOT: Record<Slot, GarmentTemplateId[]> = {
  top: ["tshirt", "oversized_tshirt", "longsleeve", "shirt", "polo", "knit", "sweatshirt", "hoodie", "tank"],
  outer: ["jacket", "blouson", "coat", "padding", "cardigan", "windbreaker", "fleece"],
  bottom: ["jeans", "wide_jeans", "slacks", "chino", "wide_pants", "cargo", "jogger", "shorts", "skirt"],
  shoes: ["sneaker", "loafer", "boots", "sandal"],
  acc: ["cap", "beanie", "none"],
};

/** Pick a template from subcategory + fit. `item.garment_template` (when set) wins. */
export function templateFor(item: Pick<WardrobeItem, "category" | "subcategory" | "fit"> & { garment_template?: string | null }): GarmentTemplateId {
  if (item.garment_template && item.garment_template in GARMENT_TEMPLATES) return item.garment_template as GarmentTemplateId;
  const sub = item.subcategory ?? "";
  const loose = item.fit === "oversized" || item.fit === "relaxed" || item.fit === "wide";
  switch (item.category) {
    case "top":
      if (/민소매|나시|탱크/.test(sub)) return "tank";
      if (/후드/.test(sub)) return "hoodie";
      if (/스웨트|맨투맨/.test(sub)) return "sweatshirt";
      if (/니트|스웨터/.test(sub)) return "knit";
      if (/폴로|카라/.test(sub)) return "polo";
      if (/셔츠|남방/.test(sub) && !/티셔츠/.test(sub)) return "shirt";
      if (/긴팔/.test(sub)) return "longsleeve";
      return item.fit === "oversized" ? "oversized_tshirt" : "tshirt";
    case "outer":
      if (/코트/.test(sub)) return "coat";
      if (/패딩|다운/.test(sub)) return "padding";
      if (/가디건/.test(sub)) return "cardigan";
      if (/바람막이|윈드/.test(sub)) return "windbreaker";
      if (/플리스/.test(sub)) return "fleece";
      if (/블루종|봄버|항공/.test(sub)) return "blouson";
      return "jacket";
    case "bottom":
      if (/스커트|치마/.test(sub)) return "skirt";
      if (/쇼츠|반바지/.test(sub)) return "shorts";
      if (/조거|트레이닝/.test(sub)) return "jogger";
      if (/카고/.test(sub)) return "cargo";
      if (/데님|청바지|진/.test(sub)) return item.fit === "wide" || item.fit === "relaxed" ? "wide_jeans" : "jeans";
      if (/와이드/.test(sub) || item.fit === "wide") return "wide_pants";
      if (/슬랙스/.test(sub)) return loose ? "wide_pants" : "slacks";
      return loose ? "wide_pants" : "chino";
    case "shoes":
      if (/부츠|워커/.test(sub)) return "boots";
      if (/로퍼|더비|구두|옥스퍼드/.test(sub)) return "loafer";
      if (/샌들|슬리퍼|쪼리/.test(sub)) return "sandal";
      return "sneaker";
    case "acc":
      if (/비니/.test(sub)) return "beanie";
      if (/모자|캡/.test(sub)) return "cap";
      return "none";
    default:
      return "none";
  }
}

/** Fit fine-tunes the template (a slim shirt and an oversized shirt share a template). */
export function specFor(item: Pick<WardrobeItem, "category" | "subcategory" | "fit"> & { garment_template?: string | null }): GarmentSpec {
  const base = GARMENT_TEMPLATES[templateFor(item)];
  if (base.kind !== "top") return base;
  const f = item.fit;
  if (f === "oversized" && templateFor(item) !== "oversized_tshirt")
    return { ...base, ease: base.ease + 0.012, drape: base.drape + 0.05, sleeveEase: base.sleeveEase + 0.008, sleeveDrape: base.sleeveDrape + 0.08 };
  if (f === "relaxed") return { ...base, ease: base.ease + 0.006, drape: base.drape + 0.03 };
  if (f === "slim") return { ...base, ease: Math.max(0.006, base.ease - 0.006), drape: base.drape - 0.05, sleeveDrape: base.sleeveDrape - 0.1 };
  return base;
}
