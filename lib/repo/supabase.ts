"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { CutoutStatus, NewOutfit, NewWardrobeItem, Outfit, OutfitItemRef, Placement, Preferences, WardrobeItem, WearLog } from "../types";
import { applyOutfitWearStats, applyWearStats, DEFAULT_PREFS, uid, type CutoutInput, type Repo } from "./types";

const BUCKET = "wardrobe";
const BASE_COLS =
  "id,image_path,name,category,subcategory,color,secondary_color,pattern,material,fit,style,season,gender,brand,formality,notes,ai_raw,wear_count,last_worn_at,created_at,updated_at";
// Added by migrations/002_mannequin.sql
const GARMENT_COLS = "cutout_path,cutout_status,anchor_x,anchor_y,garment_scale,garment_rotation,layer_order";

type ItemRow = Omit<WardrobeItem, "image_url" | "cutout_url" | "cutout_status" | "placement"> & {
  image_path: string | null;
  cutout_path?: string | null;
  cutout_status?: CutoutStatus;
  anchor_x?: number | null;
  anchor_y?: number | null;
  garment_scale?: number | null;
  garment_rotation?: number | null;
  layer_order?: number | null;
};

function must<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

/** placement ⇄ flat columns */
function placementToCols(p: Placement | null | undefined) {
  if (p === undefined) return {};
  return {
    anchor_x: p?.x ?? null,
    anchor_y: p?.y ?? null,
    garment_scale: p?.scale ?? null,
    garment_rotation: p?.rotation ?? null,
    layer_order: p?.layer ?? null,
  };
}
function colsToPlacement(r: ItemRow): Placement | null {
  if (r.anchor_x == null && r.anchor_y == null && r.garment_scale == null && r.garment_rotation == null && r.layer_order == null) return null;
  return { x: r.anchor_x ?? 0, y: r.anchor_y ?? 0, scale: r.garment_scale ?? 1, rotation: r.garment_rotation ?? 0, layer: r.layer_order ?? null };
}

export class SupabaseRepo implements Repo {
  kind = "supabase" as const;
  private sb: SupabaseClient;
  private userId = "";
  private signed = new Map<string, { url: string; exp: number }>();
  /** true when migration 002 has not been applied yet — app keeps working without mannequin fields */
  private legacy = false;

  constructor(url: string, anonKey: string) {
    this.sb = createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true } });
  }

  private get itemCols() {
    return this.legacy ? BASE_COLS : `${BASE_COLS},${GARMENT_COLS}`;
  }
  private get outfitCols() {
    return this.legacy ? "id,name,occasion,style,source,note,created_at" : "id,name,occasion,style,source,note,created_at,outfit_date,render";
  }

  async init() {
    const { data } = await this.sb.auth.getSession();
    let user = data.session?.user;
    if (!user) {
      // Anonymous account: zero-friction start. Can be linked to email later (auth.updateUser).
      const res = await this.sb.auth.signInAnonymously();
      if (res.error) throw new Error(`Supabase 익명 로그인 실패: ${res.error.message}`);
      user = res.data.user ?? undefined;
    }
    if (!user) throw new Error("Supabase 세션을 만들 수 없습니다.");
    this.userId = user.id;
    const probe = await this.sb.from("wardrobe_items").select("cutout_path").limit(1);
    if (probe.error) {
      this.legacy = true;
      console.warn("[closet] migrations/002_mannequin.sql 미적용 — 누끼·마네킹 위치 저장이 비활성화됩니다.", probe.error.message);
    }
  }

  private async resolveUrls(paths: string[]): Promise<Map<string, string>> {
    const now = Date.now();
    const out = new Map<string, string>();
    const need = paths.filter((p) => {
      const c = this.signed.get(p);
      if (c && c.exp > now + 60_000) {
        out.set(p, c.url);
        return false;
      }
      return true;
    });
    if (need.length) {
      const res = await this.sb.storage.from(BUCKET).createSignedUrls(need, 60 * 60 * 6);
      for (const r of must(res)) {
        if (r.signedUrl && r.path) {
          this.signed.set(r.path, { url: r.signedUrl, exp: now + 60 * 60 * 6 * 1000 });
          out.set(r.path, r.signedUrl);
        }
      }
    }
    return out;
  }

  private async toItems(rows: ItemRow[]): Promise<WardrobeItem[]> {
    const paths = rows.flatMap((r) => [r.image_path, r.cutout_path]).filter((p): p is string => !!p);
    const urls = await this.resolveUrls(paths);
    return rows.map((r) => {
      const { image_path, cutout_path, cutout_status, anchor_x: _ax, anchor_y: _ay, garment_scale: _gs, garment_rotation: _gr, layer_order: _lo, ...rest } = r;
      return {
        ...rest,
        image_url: image_path ? urls.get(image_path) ?? null : null,
        cutout_url: cutout_path ? urls.get(cutout_path) ?? null : null,
        cutout_status: cutout_status ?? null,
        placement: colsToPlacement(r),
      };
    });
  }

  private async upload(id: string, image: Blob, tag = ""): Promise<string> {
    const ext = image.type === "image/webp" ? "webp" : image.type === "image/png" ? "png" : "jpg";
    // New path each upload → no stale CDN/signed-url cache.
    const path = `${this.userId}/${id}${tag}-${uid().slice(0, 8)}.${ext}`;
    must(await this.sb.storage.from(BUCKET).upload(path, image, { contentType: image.type, upsert: false }));
    return path;
  }

  /** NewWardrobeItem → DB row (placement flattened; dropped in legacy mode). */
  private toRow(input: Partial<NewWardrobeItem>) {
    const { placement, ...rest } = input;
    return this.legacy ? rest : { ...rest, ...placementToCols(placement) };
  }

  async listItems() {
    const [rows, logs] = await Promise.all([
      this.sb.from("wardrobe_items").select(this.itemCols).eq("archived", false).order("created_at", { ascending: false }),
      this.listWearLogs(),
    ]);
    return applyWearStats(await this.toItems(must(rows) as unknown as ItemRow[]), logs);
  }

  async createItem(input: NewWardrobeItem, image: Blob | null, cutout?: CutoutInput | null) {
    const id = uid();
    const image_path = image ? await this.upload(id, image) : null;
    const extra: Record<string, unknown> = {};
    if (!this.legacy && cutout) {
      extra.cutout_path = cutout.blob ? await this.upload(id, cutout.blob, "-cut") : null;
      extra.cutout_status = cutout.status;
    }
    const row = must(
      await this.sb.from("wardrobe_items").insert({ ...this.toRow(input), ...extra, id, image_path }).select(this.itemCols).single(),
    ) as unknown as ItemRow;
    return (await this.toItems([row]))[0];
  }

  async setCutout(id: string, cutout: CutoutInput) {
    if (this.legacy) {
      const row = must(await this.sb.from("wardrobe_items").select(this.itemCols).eq("id", id).single()) as unknown as ItemRow;
      return (await this.toItems([row]))[0];
    }
    const cur = must(await this.sb.from("wardrobe_items").select("cutout_path").eq("id", id).single()) as { cutout_path: string | null };
    const cutout_path = cutout.blob ? await this.upload(id, cutout.blob, "-cut") : null;
    const row = must(
      await this.sb.from("wardrobe_items").update({ cutout_path, cutout_status: cutout.status }).eq("id", id).select(this.itemCols).single(),
    ) as unknown as ItemRow;
    if (cur.cutout_path) await this.sb.storage.from(BUCKET).remove([cur.cutout_path]);
    return (await this.toItems([row]))[0];
  }

  async updateItem(id: string, patch: Partial<NewWardrobeItem>, image?: Blob | null) {
    const update: Record<string, unknown> = this.toRow(patch);
    const stale: string[] = [];
    if (image !== undefined) {
      const cur = must(
        await this.sb.from("wardrobe_items").select(this.legacy ? "image_path" : "image_path,cutout_path").eq("id", id).single(),
      ) as unknown as { image_path: string | null; cutout_path?: string | null };
      if (cur.image_path) stale.push(cur.image_path);
      if (cur.cutout_path) stale.push(cur.cutout_path);
      update.image_path = image ? await this.upload(id, image) : null;
      if (!this.legacy) {
        // New/removed photo → cutout must be regenerated.
        update.cutout_path = null;
        update.cutout_status = null;
      }
    }
    const row = must(await this.sb.from("wardrobe_items").update(update).eq("id", id).select(this.itemCols).single()) as unknown as ItemRow;
    if (stale.length) await this.sb.storage.from(BUCKET).remove(stale);
    return (await this.toItems([row]))[0];
  }

  async deleteItem(id: string) {
    const cur = must(
      await this.sb.from("wardrobe_items").select(this.legacy ? "image_path" : "image_path,cutout_path").eq("id", id).single(),
    ) as unknown as { image_path: string | null; cutout_path?: string | null };
    // Outfits that would become empty are removed too (mirrors LocalRepo).
    const refs = must(await this.sb.from("outfit_items").select("outfit_id").eq("wardrobe_item_id", id)) as { outfit_id: string }[];
    must(await this.sb.from("wardrobe_items").delete().eq("id", id));
    const files = [cur.image_path, cur.cutout_path].filter((p): p is string => !!p);
    if (files.length) await this.sb.storage.from(BUCKET).remove(files);
    for (const { outfit_id } of refs) {
      const left = must(await this.sb.from("outfit_items").select("id").eq("outfit_id", outfit_id)) as unknown[];
      if (left.length === 0) await this.sb.from("outfits").delete().eq("id", outfit_id);
    }
  }

  async listOutfits() {
    const [rows, logs] = await Promise.all([
      this.sb
        .from("outfits")
        .select(`${this.outfitCols},outfit_items(wardrobe_item_id,slot,position)`)
        .order("created_at", { ascending: false }),
      this.listWearLogs(),
    ]);
    type Row = Omit<Outfit, "items" | "wear_count" | "last_worn_at"> & {
      outfit_items: (OutfitItemRef & { position: number })[];
    };
    const outfits: Outfit[] = (must(rows) as unknown as Row[]).map(({ outfit_items, ...o }) => ({
      ...o,
      outfit_date: o.outfit_date ?? null,
      render: o.render ?? null,
      items: [...outfit_items].sort((a, b) => a.position - b.position).map(({ wardrobe_item_id, slot }) => ({ wardrobe_item_id, slot })),
      wear_count: 0,
      last_worn_at: null,
    }));
    return applyOutfitWearStats(outfits, logs);
  }

  private async writeOutfitItems(outfitId: string, items: OutfitItemRef[]) {
    must(await this.sb.from("outfit_items").delete().eq("outfit_id", outfitId));
    if (items.length)
      must(
        await this.sb
          .from("outfit_items")
          .insert(items.map((r, position) => ({ outfit_id: outfitId, wardrobe_item_id: r.wardrobe_item_id, slot: r.slot, position }))),
      );
  }

  private outfitRow(p: Partial<NewOutfit>) {
    const { items: _i, outfit_date, render, ...rest } = p;
    return this.legacy ? rest : { ...rest, ...(outfit_date !== undefined && { outfit_date }), ...(render !== undefined && { render }) };
  }

  async createOutfit(input: NewOutfit) {
    const { items } = input;
    const row = must(await this.sb.from("outfits").insert(this.outfitRow(input)).select(this.outfitCols).single()) as unknown as Omit<
      Outfit,
      "items" | "wear_count" | "last_worn_at"
    >;
    await this.writeOutfitItems(row.id, items);
    return { ...row, outfit_date: row.outfit_date ?? null, render: row.render ?? null, items, wear_count: 0, last_worn_at: null };
  }

  async updateOutfit(id: string, patch: Partial<NewOutfit>) {
    const { items } = patch;
    const rest = this.outfitRow(patch);
    if (Object.keys(rest).length) must(await this.sb.from("outfits").update(rest).eq("id", id));
    if (items) await this.writeOutfitItems(id, items);
    const all = await this.listOutfits();
    const o = all.find((x) => x.id === id);
    if (!o) throw new Error("outfit not found");
    return o;
  }

  async deleteOutfit(id: string) {
    must(await this.sb.from("outfits").delete().eq("id", id));
  }

  async listWearLogs(): Promise<WearLog[]> {
    type Row = { id: string; worn_at: string; outfit_id: string | null; created_at: string; wear_log_items: { wardrobe_item_id: string }[] };
    const rows = must(
      await this.sb.from("wear_logs").select("id,worn_at,outfit_id,created_at,wear_log_items(wardrobe_item_id)").order("worn_at", { ascending: false }),
    ) as Row[];
    return rows.map(({ wear_log_items, ...l }) => ({ ...l, item_ids: wear_log_items.map((x) => x.wardrobe_item_id) }));
  }

  async logWear(input: { worn_at: string; outfit_id: string | null; item_ids: string[] }) {
    const row = must(
      await this.sb.from("wear_logs").insert({ worn_at: input.worn_at, outfit_id: input.outfit_id }).select("id,worn_at,outfit_id,created_at").single(),
    ) as Omit<WearLog, "item_ids">;
    if (input.item_ids.length)
      must(await this.sb.from("wear_log_items").insert(input.item_ids.map((wardrobe_item_id) => ({ wear_log_id: row.id, wardrobe_item_id }))));
    return { ...row, item_ids: input.item_ids };
  }

  async deleteWearLog(id: string) {
    must(await this.sb.from("wear_logs").delete().eq("id", id));
  }

  async getPreferences(): Promise<Preferences> {
    const res = await this.sb.from("user_preferences").select("*").eq("user_id", this.userId).maybeSingle();
    const row = must(res) as (Preferences & { user_id: string; updated_at: string }) | null;
    if (!row) return { ...DEFAULT_PREFS };
    const { user_id: _u, updated_at: _t, ...p } = row;
    return { ...DEFAULT_PREFS, ...p };
  }

  async savePreferences(p: Preferences) {
    must(await this.sb.from("user_preferences").upsert({ ...p, user_id: this.userId, updated_at: new Date().toISOString() }));
  }
}
