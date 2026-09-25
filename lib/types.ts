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
  /** Shorts / bermudas: where the hem falls (lib/taxonomy HEM_LENGTHS key). null → the type's default */
  hem_length: string | null;
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
 * Manual size on the 2D lookbook, relative to the automatic layout box.
 * scale: width × · scale_y: height × · y: top edge offset, as a share of the automatic box height.
 * Rows without scale_y predate the lookbook (old 3D-mannequin offsets) and are ignored.
 */
export interface Placement {
  x: number;
  y: number;
  scale: number;
  scale_y?: number | null;
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
  /** AI try-on render linked on save (cache key of lib/tryon). null → flat-lay thumbnail */
  tryon_key: string | null;
  /** Resolved URL of that render, filled in by the repo. */
  tryon_url: string | null;
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

export type NewOutfit = Pick<Outfit, "name" | "occasion" | "style" | "source" | "note" | "items" | "outfit_date" | "render"> & {
  tryon_key?: string | null;
};

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

/**
 * Reference person for AI try-on.
 * photo = the user's own full-body photo (profile) · model = generated default model.
 */
export type PersonKind = "photo" | "model";
export interface PersonImage {
  kind: PersonKind;
  /** Changes on every upload / generation → part of the try-on cache key. */
  id: string;
  url: string;
  /** model only: signature of the profile settings it was generated for */
  sig: string | null;
  created_at: string;
}

/** A cached AI try-on render. */
export interface TryOnRender {
  key: string;
  url: string;
  created_at: string;
}
export interface TryOnMeta {
  person_id: string;
  item_ids: string[];
  model: string;
  cost_usd: number | null;
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
