"use client";

import type {
  CutoutStatus,
  NewOutfit,
  NewWardrobeItem,
  Outfit,
  PersonImage,
  PersonKind,
  Preferences,
  TryOnMeta,
  TryOnRender,
  WardrobeItem,
  WearLog,
} from "../types";
import { applyOutfitWearStats, applyWearStats, DEFAULT_PREFS, uid, type CutoutInput, type Repo } from "./types";

const DB_NAME = "closet";
const DB_VERSION = 1;
const STORES = ["items", "images", "outfits", "wear_logs", "kv"] as const;
type StoreName = (typeof STORES)[number];

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

type StoredItem = Omit<WardrobeItem, "image_url" | "cutout_url" | "cutout_status"> & {
  has_image: boolean;
  has_cutout?: boolean;
  cutout_status?: CutoutStatus;
};
const CUT = (id: string) => `${id}:cut`;
// Try-on assets share the images / kv stores (no schema bump): blob in images, metadata in kv.
const PERSON = (k: PersonKind) => `person:${k}`;
const TRYON = (key: string) => `tryon:${key}`;
type StoredPerson = Omit<PersonImage, "url">;
type StoredTryOn = TryOnMeta & { key: string; created_at: string };
type StoredOutfit = Omit<Outfit, "tryon_key" | "tryon_url"> & { tryon_key?: string | null };

export class LocalRepo implements Repo {
  kind = "local" as const;
  private db!: IDBDatabase;
  private urls = new Map<string, string>();

  async init() {
    this.db = await openDb();
  }

  private tx<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const t = this.db.transaction(store, mode);
      const req = fn(t.objectStore(store));
      t.oncomplete = () => resolve(req.result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  }
  private all<T>(store: StoreName) {
    return this.tx<T[]>(store, "readonly", (s) => s.getAll() as IDBRequest<T[]>);
  }
  private get<T>(store: StoreName, key: string) {
    return this.tx<T | undefined>(store, "readonly", (s) => s.get(key) as IDBRequest<T | undefined>);
  }
  private put(store: StoreName, key: string, value: unknown) {
    return this.tx(store, "readwrite", (s) => s.put(value, key));
  }
  private del(store: StoreName, key: string) {
    return this.tx(store, "readwrite", (s) => s.delete(key));
  }

  private async imageUrl(id: string): Promise<string | null> {
    // id may be an item id (photo) or CUT(id) (transparent asset)
    const cached = this.urls.get(id);
    if (cached) return cached;
    const blob = await this.get<Blob>("images", id);
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    this.urls.set(id, url);
    return url;
  }
  private dropUrl(id: string) {
    const u = this.urls.get(id);
    if (u) URL.revokeObjectURL(u);
    this.urls.delete(id);
  }
  private async hydrate(s: StoredItem): Promise<WardrobeItem> {
    const { has_image, has_cutout, cutout_status, ...rest } = s;
    return {
      ...rest,
      placement: rest.placement ?? null, // older rows predate placement
      hem_length: rest.hem_length ?? null, // … and hem length
      image_url: has_image ? await this.imageUrl(s.id) : null,
      cutout_url: has_cutout ? await this.imageUrl(CUT(s.id)) : null,
      cutout_status: cutout_status ?? null,
    };
  }

  async listItems() {
    const [stored, logs] = await Promise.all([this.all<StoredItem>("items"), this.all<WearLog>("wear_logs")]);
    const items = await Promise.all(stored.map((s) => this.hydrate(s)));
    return applyWearStats(items, logs).sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  async createItem(input: NewWardrobeItem, image: Blob | null, cutout?: CutoutInput | null) {
    const now = new Date().toISOString();
    const id = uid();
    const stored: StoredItem = {
      ...input,
      id,
      has_image: !!image,
      has_cutout: !!cutout?.blob,
      cutout_status: cutout?.status ?? null,
      wear_count: 0,
      last_worn_at: null,
      created_at: now,
      updated_at: now,
    };
    if (image) await this.put("images", id, image);
    if (cutout?.blob) await this.put("images", CUT(id), cutout.blob);
    await this.put("items", id, stored);
    return this.hydrate(stored);
  }

  async setCutout(id: string, cutout: CutoutInput) {
    const cur = await this.get<StoredItem>("items", id);
    if (!cur) throw new Error("item not found");
    if (cutout.blob) await this.put("images", CUT(id), cutout.blob);
    else await this.del("images", CUT(id));
    this.dropUrl(CUT(id));
    const next: StoredItem = { ...cur, has_cutout: !!cutout.blob, cutout_status: cutout.status };
    await this.put("items", id, next);
    return this.hydrate(next);
  }

  async updateItem(id: string, patch: Partial<NewWardrobeItem>, image?: Blob | null) {
    const cur = await this.get<StoredItem>("items", id);
    if (!cur) throw new Error("item not found");
    let has_image = cur.has_image;
    if (image === null) {
      await this.del("images", id);
      this.dropUrl(id);
      has_image = false;
    } else if (image) {
      await this.put("images", id, image);
      this.dropUrl(id);
      has_image = true;
    }
    let cut: Partial<StoredItem> = {};
    if (image !== undefined) {
      // New or removed photo → old cutout no longer matches.
      await this.del("images", CUT(id));
      this.dropUrl(CUT(id));
      cut = { has_cutout: false, cutout_status: null };
    }
    const next: StoredItem = { ...cur, ...patch, ...cut, has_image, updated_at: new Date().toISOString() };
    await this.put("items", id, next);
    return this.hydrate(next);
  }

  async deleteItem(id: string) {
    await this.del("items", id);
    await this.del("images", id);
    await this.del("images", CUT(id));
    this.dropUrl(id);
    this.dropUrl(CUT(id));
    // Remove from outfits; drop outfits that become empty.
    const outfits = await this.all<Outfit>("outfits");
    for (const o of outfits) {
      if (!o.items.some((r) => r.wardrobe_item_id === id)) continue;
      const items = o.items.filter((r) => r.wardrobe_item_id !== id);
      if (items.length === 0) await this.del("outfits", o.id);
      else await this.put("outfits", o.id, { ...o, items });
    }
    const logs = await this.all<WearLog>("wear_logs");
    for (const l of logs) {
      if (l.item_ids.includes(id)) await this.put("wear_logs", l.id, { ...l, item_ids: l.item_ids.filter((x) => x !== id) });
    }
  }

  async listOutfits() {
    const [outfits, logs] = await Promise.all([this.all<StoredOutfit>("outfits"), this.all<WearLog>("wear_logs")]);
    const norm = await Promise.all(outfits.map((o) => this.hydrateOutfit(o)));
    return applyOutfitWearStats(norm, logs).sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  private async hydrateOutfit(o: StoredOutfit): Promise<Outfit> {
    const tryon_key = o.tryon_key ?? null; // older rows predate try-on
    return {
      ...o,
      outfit_date: o.outfit_date ?? null,
      render: o.render ?? null,
      tryon_key,
      tryon_url: tryon_key ? await this.imageUrl(TRYON(tryon_key)) : null,
    };
  }
  async createOutfit(input: NewOutfit) {
    const o: StoredOutfit = { ...input, id: uid(), created_at: new Date().toISOString(), last_worn_at: null, wear_count: 0 };
    await this.put("outfits", o.id, o);
    return this.hydrateOutfit(o);
  }
  async updateOutfit(id: string, patch: Partial<NewOutfit>) {
    const cur = await this.get<StoredOutfit>("outfits", id);
    if (!cur) throw new Error("outfit not found");
    const next: StoredOutfit = { ...cur, ...patch };
    await this.put("outfits", id, next);
    return this.hydrateOutfit(next);
  }
  async deleteOutfit(id: string) {
    await this.del("outfits", id);
    const logs = await this.all<WearLog>("wear_logs");
    for (const l of logs) if (l.outfit_id === id) await this.put("wear_logs", l.id, { ...l, outfit_id: null });
  }

  async listWearLogs() {
    const logs = await this.all<WearLog>("wear_logs");
    return logs.sort((a, b) => b.worn_at.localeCompare(a.worn_at));
  }
  async logWear(input: { worn_at: string; outfit_id: string | null; item_ids: string[] }) {
    const log: WearLog = { ...input, id: uid(), created_at: new Date().toISOString() };
    await this.put("wear_logs", log.id, log);
    return log;
  }
  async deleteWearLog(id: string) {
    await this.del("wear_logs", id);
  }

  async getPreferences() {
    return { ...DEFAULT_PREFS, ...((await this.get<Preferences>("kv", "prefs")) ?? {}) };
  }
  async savePreferences(p: Preferences) {
    await this.put("kv", "prefs", p);
  }

  async getPerson(kind: PersonKind) {
    const meta = await this.get<StoredPerson>("kv", PERSON(kind));
    const url = meta ? await this.imageUrl(PERSON(kind)) : null;
    return meta && url ? { ...meta, url } : null;
  }
  async setPerson(kind: PersonKind, blob: Blob | null, sig: string | null = null) {
    this.dropUrl(PERSON(kind));
    if (!blob) {
      await this.del("images", PERSON(kind));
      await this.del("kv", PERSON(kind));
      return null;
    }
    const meta: StoredPerson = { kind, id: `${kind}-${uid()}`, sig, created_at: new Date().toISOString() };
    await this.put("images", PERSON(kind), blob);
    await this.put("kv", PERSON(kind), meta);
    return { ...meta, url: (await this.imageUrl(PERSON(kind)))! };
  }

  async getTryOn(key: string): Promise<TryOnRender | null> {
    const meta = await this.get<StoredTryOn>("kv", TRYON(key));
    const url = meta ? await this.imageUrl(TRYON(key)) : null;
    return meta && url ? { key, url, created_at: meta.created_at } : null;
  }
  async putTryOn(key: string, image: Blob, meta: TryOnMeta) {
    const stored: StoredTryOn = { ...meta, key, created_at: new Date().toISOString() };
    this.dropUrl(TRYON(key));
    await this.put("images", TRYON(key), image);
    await this.put("kv", TRYON(key), stored);
    return { key, url: (await this.imageUrl(TRYON(key)))!, created_at: stored.created_at };
  }
}
