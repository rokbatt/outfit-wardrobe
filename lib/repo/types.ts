import type {
  CutoutStatus,
  NewOutfit,
  NewWardrobeItem,
  Outfit,
  Preferences,
  WardrobeItem,
  WearLog,
} from "../types";

/**
 * Storage abstraction. Screens only talk to this interface, so the app runs
 * on IndexedDB out of the box and on Supabase when env vars are present.
 */
export interface Repo {
  kind: "local" | "supabase";
  init(): Promise<void>;

  listItems(): Promise<WardrobeItem[]>;
  createItem(input: NewWardrobeItem, image: Blob | null, cutout?: CutoutInput | null): Promise<WardrobeItem>;
  /** Store (or clear) the transparent garment asset. blob null + status "failed"/"original" → use original photo. */
  setCutout(id: string, cutout: CutoutInput): Promise<WardrobeItem>;
  /** image: undefined = keep, null = remove, Blob = replace */
  updateItem(id: string, patch: Partial<NewWardrobeItem>, image?: Blob | null): Promise<WardrobeItem>;
  deleteItem(id: string): Promise<void>;

  listOutfits(): Promise<Outfit[]>;
  createOutfit(input: NewOutfit): Promise<Outfit>;
  updateOutfit(id: string, patch: Partial<NewOutfit>): Promise<Outfit>;
  deleteOutfit(id: string): Promise<void>;

  listWearLogs(): Promise<WearLog[]>;
  logWear(input: { worn_at: string; outfit_id: string | null; item_ids: string[] }): Promise<WearLog>;
  deleteWearLog(id: string): Promise<void>;

  getPreferences(): Promise<Preferences>;
  savePreferences(p: Preferences): Promise<void>;
}

export interface CutoutInput {
  blob: Blob | null;
  status: CutoutStatus;
}

export const DEFAULT_PREFS: Preferences = {
  display_name: "",
  gender: null,
  height_cm: null,
  body_type: [],
  preferred_fit: null,
  preferred_styles: [],
  favorite_colors: [],
  avoid_colors: [],
  brands: "",
  activities: [],
  difficulty: null,
};

export const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

/** Derive per-item and per-outfit wear stats from logs (single source of truth). */
export function applyWearStats(items: WardrobeItem[], logs: WearLog[]): WardrobeItem[] {
  const count = new Map<string, number>();
  const last = new Map<string, string>();
  for (const l of logs) {
    for (const id of l.item_ids) {
      count.set(id, (count.get(id) ?? 0) + 1);
      const prev = last.get(id);
      if (!prev || l.worn_at > prev) last.set(id, l.worn_at);
    }
  }
  return items.map((i) => ({ ...i, wear_count: count.get(i.id) ?? 0, last_worn_at: last.get(i.id) ?? null }));
}

export function applyOutfitWearStats(outfits: Outfit[], logs: WearLog[]): Outfit[] {
  return outfits.map((o) => {
    const mine = logs.filter((l) => l.outfit_id === o.id);
    const lastWorn = mine.reduce<string | null>((a, l) => (!a || l.worn_at > a ? l.worn_at : a), null);
    return { ...o, wear_count: mine.length, last_worn_at: lastWorn };
  });
}
