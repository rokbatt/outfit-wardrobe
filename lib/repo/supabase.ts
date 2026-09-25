"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  CutoutStatus,
  NewOutfit,
  NewWardrobeItem,
  Outfit,
  OutfitItemRef,
  PersonImage,
  PersonKind,
  Placement,
  Preferences,
  TryOnMeta,
  TryOnRender,
  WardrobeItem,
  WearLog,
} from "../types";
import { applyOutfitWearStats, applyWearStats, DEFAULT_PREFS, uid, type CutoutInput, type Repo } from "./types";

const BUCKET = "wardrobe";
const BASE_COLS =
  "id,image_path,name,category,subcategory,color,secondary_color,pattern,material,fit,style,season,gender,brand,formality,notes,ai_raw,wear_count,last_worn_at,created_at,updated_at";
// Added by migrations/002_mannequin.sql
const GARMENT_COLS = "cutout_path,cutout_status,anchor_x,anchor_y,garment_scale,garment_rotation,layer_order";
// Added by migrations/003_tryon.sql (user_preferences)
const PERSON_COLS: Record<PersonKind, "body_photo_path" | "base_model_path"> = { photo: "body_photo_path", model: "base_model_path" };

type ItemRow = Omit<WardrobeItem, "image_url" | "cutout_url" | "cutout_status" | "placement"> & {
  image_path: string | null;
  cutout_path?: string | null;
  cutout_status?: CutoutStatus;
  anchor_x?: number | null;
  anchor_y?: number | null;
  garment_scale?: number | null;
  garment_rotation?: number | null;
  layer_order?: number | null;
  garment_scale_y?: number | null;
};

function must<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

/** placement ⇄ flat columns */
function placementToCols(p: Placement | null | undefined, withScaleY: boolean) {
  if (p === undefined) return {};
  return {
    anchor_x: p?.x ?? null,
    anchor_y: p?.y ?? null,
    garment_scale: p?.scale ?? null,
    garment_rotation: p?.rotation ?? null,
    layer_order: p?.layer ?? null,
    ...(withScaleY && { garment_scale_y: p?.scale_y ?? null }),
  };
}
function colsToPlacement(r: ItemRow): Placement | null {
  if (r.anchor_x == null && r.anchor_y == null && r.garment_scale == null && r.garment_rotation == null && r.layer_order == null) return null;
  return {
    x: r.anchor_x ?? 0,
    y: r.anchor_y ?? 0,
    scale: r.garment_scale ?? 1,
    scale_y: r.garment_scale_y ?? null,
    rotation: r.garment_rotation ?? 0,
    layer: r.layer_order ?? null,
  };
}

export class SupabaseRepo implements Repo {
  kind = "supabase" as const;
  private sb: SupabaseClient;
  private userId = "";
  private signed = new Map<string, { url: string; exp: number }>();
  /** true when migration 002 has not been applied yet — app keeps working without mannequin fields */
  private legacy = false;
  /** false when migration 003 has not been applied — try-on renders are then kept in memory only */
  private tryon = false;
  private memTryOn = new Map<string, TryOnRender>();
  private memPerson = new Map<PersonKind, PersonImage>();

  constructor(url: string, anonKey: string) {
    this.sb = createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true } });
  }

  /** false when migration 004 has not been applied — hem length and lookbook height scale are then not stored */
  private hemCol = false;

  private get itemCols() {
    if (this.legacy) return `${BASE_COLS}${this.hemCol ? ",hem_length" : ""}`;
    return `${BASE_COLS},${GARMENT_COLS}${this.hemCol ? ",hem_length,garment_scale_y" : ""}`;
  }
  private get outfitCols() {
    if (this.legacy) return "id,name,occasion,style,source,note,created_at";
    return `id,name,occasion,style,source,note,created_at,outfit_date,render${this.tryon ? ",tryon_key" : ""}`;
  }

  /** The signed-in account (anonymous until an email is linked). */
  get account() {
    return this.userId;
  }
  async accountInfo(): Promise<{ id: string; email: string | null; anonymous: boolean }> {
    const { data } = await this.sb.auth.getUser();
    const u = data.user;
    return { id: this.userId, email: u?.email ?? null, anonymous: !!u?.is_anonymous };
  }
  /**
   * Turn the anonymous account into an email + password one, keeping all its data.
   * Works in one go when "Confirm email" is off (Authentication → Providers → Email);
   * with it on, Supabase first mails a link and the password is set after it is clicked.
   */
  async linkEmail(email: string, password: string): Promise<"linked" | "confirm"> {
    const r1 = await this.sb.auth.updateUser({ email });
    if (r1.error) throw new Error(r1.error.message);
    if (!r1.data.user?.email) return "confirm";
    const r2 = await this.sb.auth.updateUser({ password });
    if (r2.error) throw new Error(r2.error.message);
    return "linked";
  }
  /** Sign in to an existing email account (another browser / after clearing site data). */
  async signIn(email: string, password: string) {
    const { error } = await this.sb.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
  }
  async signOut() {
    await this.sb.auth.signOut();
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
    const probe3 = await this.sb.from("outfits").select("tryon_key").limit(1);
    this.tryon = !probe3.error;
    if (probe3.error)
      console.warn("[closet] migrations/003_tryon.sql 미적용 — AI 착용 이미지는 저장되지 않고 이번 세션에만 유지됩니다.", probe3.error.message);
    const probe4 = await this.sb.from("wardrobe_items").select("hem_length").limit(1);
    this.hemCol = !probe4.error;
    if (probe4.error) console.warn("[closet] migrations/004_hem_length.sql 미적용 — 반바지 기장이 저장되지 않습니다.", probe4.error.message);
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
      const { image_path, cutout_path, cutout_status, anchor_x: _ax, anchor_y: _ay, garment_scale: _gs, garment_rotation: _gr, layer_order: _lo, garment_scale_y: _gy, ...rest } = r;
      return {
        ...rest,
        hem_length: rest.hem_length ?? null,
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
    const { placement, hem_length, ...rest } = input;
    const row = { ...rest, ...(this.hemCol && hem_length !== undefined && { hem_length }) };
    return this.legacy ? row : { ...row, ...placementToCols(placement, this.hemCol) };
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
    type Row = Omit<Outfit, "items" | "wear_count" | "last_worn_at" | "tryon_key" | "tryon_url"> & {
      tryon_key?: string | null;
      outfit_items: (OutfitItemRef & { position: number })[];
    };
    const list = must(rows) as unknown as Row[];
    const renders = await this.tryOnUrls(list.map((o) => o.tryon_key));
    const outfits: Outfit[] = list.map(({ outfit_items, ...o }) => ({
      ...o,
      outfit_date: o.outfit_date ?? null,
      render: o.render ?? null,
      tryon_key: o.tryon_key ?? null,
      tryon_url: o.tryon_key ? renders.get(o.tryon_key) ?? null : null,
      items: [...outfit_items].sort((a, b) => a.position - b.position).map(({ wardrobe_item_id, slot }) => ({ wardrobe_item_id, slot })),
      wear_count: 0,
      last_worn_at: null,
    }));
    return applyOutfitWearStats(outfits, logs);
  }

  /** cache_key → display URL for the given try-on renders. */
  private async tryOnUrls(keys: (string | null | undefined)[]): Promise<Map<string, string>> {
    const want = [...new Set(keys.filter((k): k is string => !!k))];
    const out = new Map<string, string>();
    if (!want.length) return out;
    if (!this.tryon) {
      for (const k of want) {
        const m = this.memTryOn.get(k);
        if (m) out.set(k, m.url);
      }
      return out;
    }
    const rows = must(await this.sb.from("tryon_renders").select("cache_key,image_path").in("cache_key", want)) as {
      cache_key: string;
      image_path: string;
    }[];
    const urls = await this.resolveUrls(rows.map((r) => r.image_path));
    for (const r of rows) {
      const u = urls.get(r.image_path);
      if (u) out.set(r.cache_key, u);
    }
    return out;
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
    const { items: _i, outfit_date, render, tryon_key, ...rest } = p;
    if (this.legacy) return rest;
    return {
      ...rest,
      ...(outfit_date !== undefined && { outfit_date }),
      ...(render !== undefined && { render }),
      ...(this.tryon && tryon_key !== undefined && { tryon_key }),
    };
  }

  async createOutfit(input: NewOutfit) {
    const { items } = input;
    const row = must(await this.sb.from("outfits").insert(this.outfitRow(input)).select(this.outfitCols).single()) as unknown as Omit<
      Outfit,
      "items" | "wear_count" | "last_worn_at" | "tryon_key" | "tryon_url"
    > & { tryon_key?: string | null };
    await this.writeOutfitItems(row.id, items);
    // Without migration 003 the link isn't stored; keep it for this session so the new card still shows the render.
    const tryon_key = row.tryon_key ?? (this.tryon ? null : input.tryon_key ?? null);
    const tryon_url = tryon_key ? (await this.tryOnUrls([tryon_key])).get(tryon_key) ?? null : null;
    return { ...row, outfit_date: row.outfit_date ?? null, render: row.render ?? null, tryon_key, tryon_url, items, wear_count: 0, last_worn_at: null };
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
    type Row = Preferences & {
      user_id: string;
      updated_at: string;
      body_photo_path?: string | null;
      base_model_path?: string | null;
      base_model_sig?: string | null;
    };
    const row = must(res) as Row | null;
    if (!row) return { ...DEFAULT_PREFS };
    // try-on person columns are managed by get/setPerson, not part of Preferences
    const { user_id: _u, updated_at: _t, body_photo_path: _b, base_model_path: _m, base_model_sig: _s, ...p } = row;
    return { ...DEFAULT_PREFS, ...p };
  }

  async savePreferences(p: Preferences) {
    must(await this.sb.from("user_preferences").upsert({ ...p, user_id: this.userId, updated_at: new Date().toISOString() }));
  }

  async getPerson(kind: PersonKind): Promise<PersonImage | null> {
    if (!this.tryon) return this.memPerson.get(kind) ?? null;
    const col = PERSON_COLS[kind];
    const row = must(
      await this.sb.from("user_preferences").select(`${col},base_model_sig,updated_at`).eq("user_id", this.userId).maybeSingle(),
    ) as Record<string, string | null> | null;
    const path = row?.[col];
    if (!row || !path) return null;
    const url = (await this.resolveUrls([path])).get(path);
    if (!url) return null;
    // The storage path is unique per upload, so it doubles as the person id in the cache key.
    return { kind, id: path, url, sig: kind === "model" ? row.base_model_sig ?? null : null, created_at: row.updated_at ?? "" };
  }

  async setPerson(kind: PersonKind, blob: Blob | null, sig: string | null = null): Promise<PersonImage | null> {
    if (!this.tryon) {
      // Without migration 003 only the generated model is kept, for this session.
      if (kind === "photo" && blob) throw new Error("Supabase에 migrations/003_tryon.sql을 먼저 적용해 주세요");
      if (!blob) {
        this.memPerson.delete(kind);
        return null;
      }
      const p: PersonImage = { kind, id: `${kind}-${uid()}`, url: URL.createObjectURL(blob), sig, created_at: new Date().toISOString() };
      this.memPerson.set(kind, p);
      return p;
    }
    const col = PERSON_COLS[kind];
    const cur = must(await this.sb.from("user_preferences").select(col).eq("user_id", this.userId).maybeSingle()) as Record<
      string,
      string | null
    > | null;
    let path: string | null = null;
    if (blob) {
      const ext = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg";
      path = `${this.userId}/person/${kind}-${uid().slice(0, 8)}.${ext}`;
      must(await this.sb.storage.from(BUCKET).upload(path, blob, { contentType: blob.type, upsert: false }));
    }
    const patch: Record<string, unknown> = { user_id: this.userId, [col]: path, updated_at: new Date().toISOString() };
    if (kind === "model") patch.base_model_sig = path ? sig : null;
    must(await this.sb.from("user_preferences").upsert(patch));
    const old = cur?.[col];
    if (old) await this.sb.storage.from(BUCKET).remove([old]);
    return path ? this.getPerson(kind) : null;
  }

  async getTryOn(key: string): Promise<TryOnRender | null> {
    if (!this.tryon) return this.memTryOn.get(key) ?? null;
    const row = must(await this.sb.from("tryon_renders").select("image_path,created_at").eq("cache_key", key).maybeSingle()) as {
      image_path: string;
      created_at: string;
    } | null;
    if (!row) return null;
    const url = (await this.resolveUrls([row.image_path])).get(row.image_path);
    return url ? { key, url, created_at: row.created_at } : null;
  }

  async putTryOn(key: string, image: Blob, meta: TryOnMeta): Promise<TryOnRender> {
    if (!this.tryon) {
      const r = { key, url: URL.createObjectURL(image), created_at: new Date().toISOString() };
      this.memTryOn.set(key, r);
      return r;
    }
    const ext = image.type === "image/jpeg" ? "jpg" : image.type === "image/webp" ? "webp" : "png";
    const image_path = `${this.userId}/tryon/${key}.${ext}`;
    must(await this.sb.storage.from(BUCKET).upload(image_path, image, { contentType: image.type, upsert: true }));
    this.signed.delete(image_path);
    must(
      await this.sb
        .from("tryon_renders")
        .upsert(
          { cache_key: key, image_path, person_ref: meta.person_id, item_ids: meta.item_ids, model: meta.model, cost_usd: meta.cost_usd },
          { onConflict: "user_id,cache_key" },
        ),
    );
    return (await this.getTryOn(key))!;
  }
}
