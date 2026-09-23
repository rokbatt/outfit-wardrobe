export type Category = "top" | "bottom" | "outer" | "shoes" | "acc" | "etc";
export type Slot = "outer" | "top" | "bottom" | "shoes" | "acc";
export type Season = "spring" | "summer" | "fall" | "winter";

export interface WardrobeItem {
  id: string;
  name: string;
  category: Category;
  subcategory: string;
  color: string; // palette key (lib/taxonomy COLORS)
  secondary_color: string | null;
  pattern: string;
  material: string | null;
  fit: string | null;
  style: string[];
  season: Season[];
  gender: string | null;
  brand: string | null;
  formality: number; // 1 (very casual) – 5 (formal)
  notes: string | null;
  /** Resolved URL for display (object URL / data URL / signed/public URL). null → placeholder */
  image_url: string | null;
  /** Transparent garment asset (background removed). null → fall back to image_url */
  cutout_url: string | null;
  /** ready = cutout usable · failed = tried, use original · null = not processed yet */
  cutout_status: CutoutStatus;
  /** Per-garment manual fit on the mannequin. null → automatic anchor */
  placement: Placement | null;
  ai_raw: unknown | null;
  wear_count: number;
  last_worn_at: string | null; // ISO date
  created_at: string;
  updated_at: string;
}

export type CutoutStatus = "ready" | "failed" | "original" | null;

/**
 * Manual placement offset relative to the slot's automatic anchor.
 * x / y: offset in % of mannequin width/height · scale: multiplier · rotation: degrees · layer: z override
 */
export interface Placement {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  layer?: number | null;
}

export type NewWardrobeItem = Omit<
  WardrobeItem,
  "id" | "image_url" | "cutout_url" | "cutout_status" | "wear_count" | "last_worn_at" | "created_at" | "updated_at"
>;

export interface OutfitItemRef {
  wardrobe_item_id: string;
  slot: Slot;
}

export interface Outfit {
  id: string;
  name: string;
  occasion: string;
  style: string[];
  source: "manual" | "random" | "ai";
  note: string | null;
  items: OutfitItemRef[];
  outfit_date: string | null; // YYYY-MM-DD
  render: RenderOptions | null;
  created_at: string;
  last_worn_at: string | null;
  wear_count: number;
}

export type Body = "standard" | "slim" | "relaxed";

/** How the outfit is drawn on the mannequin (saved with the outfit). */
export interface RenderOptions {
  tuck?: boolean; // top tucked into bottom → bottom drawn over top
  openOuter?: boolean; // outerwear drawn open so the top shows
  body?: Body;
}

export type NewOutfit = Pick<Outfit, "name" | "occasion" | "style" | "source" | "note" | "items" | "outfit_date" | "render">;

export interface WearLog {
  id: string;
  worn_at: string; // YYYY-MM-DD
  outfit_id: string | null;
  item_ids: string[];
  created_at: string;
}

export interface Preferences {
  display_name: string;
  gender: string | null;
  height_cm: number | null;
  body_type: string[];
  preferred_fit: string | null;
  preferred_styles: string[];
  favorite_colors: string[];
  avoid_colors: string[];
  brands: string;
  activities: string[];
  difficulty: string | null;
}

/** Output of /api/analyze — a draft the user always confirms. */
export interface AnalysisDraft {
  name?: string;
  category?: Category;
  subcategory?: string;
  color?: string;
  secondary_color?: string | null;
  pattern?: string;
  material?: string | null;
  fit?: string | null;
  style?: string[];
  season?: Season[];
  gender?: string | null;
  brand?: string | null;
  formality?: number;
}
