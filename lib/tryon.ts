"use client";

import { garmentSource } from "./garment";
import type { Selection } from "./styling";
import { colorDef, FITS, labelOf, PATTERNS } from "./taxonomy";
import {
  TRYON_ASPECT,
  TRYON_PROMPT_VERSION,
  TRYON_SIZE,
  type TryOnErrorCode,
  type TryOnGarment,
  type TryOnImage,
  type TryOnRequest,
} from "./tryon-shared";
import type { Preferences, Slot, WardrobeItem } from "./types";

/**
 * Browser side of AI try-on: cache key, reference images, /api/tryon call.
 * Rendering is on demand only; the 2D lookbook stage is the default view.
 */

export const TRYON_ORDER: Slot[] = ["outer", "top", "bottom", "shoes", "acc"];
const LABEL: Record<Slot, string> = { outer: "OUTERWEAR", top: "TOP", bottom: "BOTTOM", shoes: "SHOES", acc: "ACCESSORY" };

export const TRYON_ERROR_KO: Record<TryOnErrorCode, string> = {
  key: "Gemini API 키가 유효하지 않아요. .env.local의 GEMINI_API_KEY를 확인해 주세요",
  safety: "안전 필터에 걸려 착용 이미지를 만들지 못했어요. 다른 사진이나 조합으로 시도해 주세요",
  timeout: "착용 이미지 생성 시간이 초과됐어요. 잠시 후 다시 시도해 주세요",
  quota: "Gemini 요청 한도를 초과했어요. 잠시 후 다시 시도해 주세요",
  no_image: "착용 이미지가 생성되지 않았어요. 다시 시도해 주세요",
  bad_request: "착용 이미지 요청을 만들 수 없어요",
  upstream: "Gemini 서버 오류로 착용 이미지를 만들지 못했어요",
  network: "네트워크 오류로 착용 이미지를 만들지 못했어요",
};

export class TryOnError extends Error {
  constructor(
    public code: TryOnErrorCode,
    detail?: string,
  ) {
    super(detail || TRYON_ERROR_KO[code]);
  }
  get ko() {
    return TRYON_ERROR_KO[this.code];
  }
}

export async function tryOnStatus(): Promise<{ enabled: boolean; model: string }> {
  try {
    const r = await fetch("/api/tryon", { cache: "no-store" });
    if (!r.ok) return { enabled: false, model: "" };
    return await r.json();
  } catch {
    return { enabled: false, model: "" };
  }
}

/* ─────────── cache key ─────────── */

/** 53-bit string hash (cyrb53). crypto.subtle is unavailable on plain-http LAN dev URLs, so no SHA here. */
function hash53(str: string, seed: number) {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, "0");
}

export const selItems = (sel: Selection) => TRYON_ORDER.map((s) => sel[s]).filter((x): x is WardrobeItem => !!x);

/**
 * (reference person id + sorted item ids + render options) → cache key.
 * Each item id carries its image version, so replacing a photo or finishing a cutout re-renders.
 */
export function cacheKey(personId: string, items: WardrobeItem[], model: string) {
  const ids = items.map((i) => `${i.id}@${i.updated_at}:${garmentSource(i).kind}`).sort();
  const raw = JSON.stringify([personId, ids, { v: TRYON_PROMPT_VERSION, aspect: TRYON_ASPECT, size: TRYON_SIZE, model }]);
  return hash53(raw, 1) + hash53(raw, 2);
}

/** Profile settings the default model is generated for; a change regenerates it. */
export function personSig(p: Preferences) {
  return JSON.stringify([p.gender ?? "", p.height_cm ?? "", [...p.body_type].sort()]);
}

/* ─────────── images ─────────── */

async function toBase64(blob: Blob) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = "";
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}

/** URL → downsized JPEG on white (transparent cutouts must not turn black). */
export async function urlToRef(url: string, maxSide: number): Promise<TryOnImage> {
  const blob = await (await fetch(url)).blob();
  const bmp = await createImageBitmap(blob);
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  const jpg = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("encode failed"))), "image/jpeg", 0.9));
  return { mime: "image/jpeg", data: await toBase64(jpg) };
}

function describe(it: WardrobeItem) {
  const color = colorDef(it.color).ko + (it.secondary_color ? `/${colorDef(it.secondary_color).ko}` : "");
  return [
    it.name,
    it.subcategory,
    `색 ${color}`,
    it.pattern !== "solid" ? labelOf(PATTERNS, it.pattern) : "",
    it.material ? `소재 ${it.material}` : "",
    it.fit ? `${labelOf(FITS, it.fit)} 핏` : "",
    it.brand ? `브랜드 ${it.brand}` : "",
  ]
    .filter(Boolean)
    .join(", ");
}

export async function garmentRefs(sel: Selection): Promise<TryOnGarment[]> {
  return Promise.all(
    TRYON_ORDER.filter((s) => sel[s]).map(async (slot) => {
      const it = sel[slot]!;
      const src = garmentSource(it);
      const image = src.url ? await urlToRef(src.url, 1024).catch(() => undefined) : undefined;
      return { slot, label: LABEL[slot], desc: describe(it), image };
    }),
  );
}

/* ─────────── call ─────────── */

export async function callTryOn(req: TryOnRequest): Promise<{ blob: Blob; model: string; costUsd: number | null }> {
  let r: Response;
  try {
    r = await fetch("/api/tryon", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(req) });
  } catch {
    throw new TryOnError("network");
  }
  if (!r.ok) {
    const j = (await r.json().catch(() => ({}))) as { code?: TryOnErrorCode; error?: string };
    throw new TryOnError(j.code && j.code in TRYON_ERROR_KO ? j.code : r.status === 504 ? "timeout" : "upstream", j.error);
  }
  const cost = Number(r.headers.get("x-tryon-cost-usd"));
  const model = r.headers.get("x-tryon-model") ?? "";
  console.info(`[tryon] ${req.mode} · ${model} · ${r.headers.get("x-tryon-ms")}ms · ≈ $${Number.isFinite(cost) ? cost.toFixed(4) : "?"}`);
  return { blob: await r.blob(), model, costUsd: Number.isFinite(cost) ? cost : null };
}
