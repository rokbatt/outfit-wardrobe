"use client";

/**
 * Garment cutout (background removal) → transparent, tightly-cropped garment asset.
 *
 *   original photo ─► BackgroundRemover ─► alpha mask ─► trim to garment bbox ─► PNG/WebP asset
 *
 * Providers are pluggable:
 *   1. "api"   — /api/cutout (server holds REMOVE_BG_API_KEY; any segmentation API can sit behind it)
 *   2. "local" — in-browser heuristic segmentation (free, instant, no upload)
 * Swap in an AI segmentation model later by adding another provider — callers don't change.
 */

import type { CutoutStatus } from "./types";

export interface CutoutOutcome {
  blob: Blob | null; // null → use the original photo
  status: Exclude<CutoutStatus, null>;
  provider: string;
  coverage: number; // garment area / frame area (quality signal)
}

export interface BackgroundRemover {
  name: string;
  available(): Promise<boolean>;
  /** Returns an RGBA canvas (transparent background) or null if it cannot segment this photo. */
  remove(src: Blob): Promise<HTMLCanvasElement | null>;
}

// ─────────────────────────────────────────────────────────────
// helpers
// ─────────────────────────────────────────────────────────────

async function decode(blob: Blob): Promise<ImageBitmap | HTMLImageElement> {
  try {
    return await createImageBitmap(blob, { imageOrientation: "from-image" });
  } catch {
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

function toCanvas(src: CanvasImageSource & { width: number; height: number }, maxSide: number) {
  const w = "naturalWidth" in src ? (src as HTMLImageElement).naturalWidth : src.width;
  const h = "naturalHeight" in src ? (src as HTMLImageElement).naturalHeight : src.height;
  const k = Math.min(1, maxSide / Math.max(w, h));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w * k));
  c.height = Math.max(1, Math.round(h * k));
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

const toBlob = (c: HTMLCanvasElement, type: string, q?: number) =>
  new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("encode failed"))), type, q));

/** Transparent assets: WebP keeps alpha and is ~5x smaller than PNG; Safari <17 falls back to PNG. */
async function encodeAlpha(c: HTMLCanvasElement) {
  const webp = await toBlob(c, "image/webp", 0.9);
  return webp.type === "image/webp" ? webp : toBlob(c, "image/png");
}

/** Crop to the non-transparent bounding box (+ small padding). Returns null if (almost) empty. */
export function trimTransparent(c: HTMLCanvasElement, pad = 0.02): { canvas: HTMLCanvasElement; coverage: number; fill: number } | null {
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  const { data, width: W, height: H } = ctx.getImageData(0, 0, c.width, c.height);
  let x0 = W, y0 = H, x1 = -1, y1 = -1, n = 0;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (data[(y * W + x) * 4 + 3] > 24) {
        n++;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  if (x1 < 0 || n < W * H * 0.005) return null;
  const fill = n / ((x1 - x0 + 1) * (y1 - y0 + 1)); // how solid the garment is inside its box
  const p = Math.round(Math.max(x1 - x0, y1 - y0) * pad);
  x0 = Math.max(0, x0 - p);
  y0 = Math.max(0, y0 - p);
  x1 = Math.min(W - 1, x1 + p);
  y1 = Math.min(H - 1, y1 + p);
  const out = document.createElement("canvas");
  out.width = x1 - x0 + 1;
  out.height = y1 - y0 + 1;
  out.getContext("2d")!.drawImage(c, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  return { canvas: out, coverage: n / (W * H), fill };
}

// ─────────────────────────────────────────────────────────────
// Provider 1 · server API (remove.bg-compatible), opt-in via env
// ─────────────────────────────────────────────────────────────

let apiAvailable: boolean | null = null;
export const apiRemover: BackgroundRemover = {
  name: "api",
  async available() {
    if (apiAvailable !== null) return apiAvailable;
    try {
      const r = await fetch("/api/cutout");
      apiAvailable = r.ok && !!(await r.json()).enabled;
    } catch {
      apiAvailable = false;
    }
    return apiAvailable;
  },
  async remove(src) {
    const fd = new FormData();
    fd.append("image", src, "garment");
    const r = await fetch("/api/cutout", { method: "POST", body: fd });
    if (!r.ok) return null;
    return toCanvas(await decode(await r.blob()), 1280);
  },
};

// ─────────────────────────────────────────────────────────────
// Provider 2 · local heuristic segmentation
//   Works well for garments laid on a floor / bed / wall / hanger against a
//   reasonably uniform background. Model the background from the image border
//   (k-means in YCbCr), flood-fill it inward with gradient-aware region growing,
//   keep the significant foreground components, feather the edge.
// ─────────────────────────────────────────────────────────────

const WORK = 480; // mask resolution

function ycc(r: number, g: number, b: number): [number, number, number] {
  return [0.299 * r + 0.587 * g + 0.114 * b, -0.1687 * r - 0.3313 * g + 0.5 * b, 0.5 * r - 0.4187 * g - 0.0813 * b];
}
// Luminance is down-weighted so soft shadows on the background still count as background.
const dist = (a: number[], b: number[]) => Math.hypot((a[0] - b[0]) * 0.55, a[1] - b[1], a[2] - b[2]);
/** pixel → background-centre distance. Darker than the background (shadow) is forgiven; brighter is not
 *  (so a white shirt on a light-grey sheet still separates). */
const bgDist = (p: number[], c: number[]) => {
  const dy = p[0] - c[0];
  return Math.hypot(dy * (dy < 0 ? 0.5 : 1.05), p[1] - c[1], p[2] - c[2]);
};

function kmeans(samples: number[][], k: number) {
  const cents = Array.from({ length: k }, (_, i) => samples[Math.floor(((i + 0.5) * samples.length) / k)].slice());
  const assign = new Int32Array(samples.length);
  for (let it = 0; it < 8; it++) {
    for (let i = 0; i < samples.length; i++) {
      let best = 0, bd = Infinity;
      for (let c = 0; c < k; c++) {
        const d = dist(samples[i], cents[c]);
        if (d < bd) (bd = d), (best = c);
      }
      assign[i] = best;
    }
    const sum = Array.from({ length: k }, () => [0, 0, 0, 0]);
    for (let i = 0; i < samples.length; i++) {
      const s = sum[assign[i]];
      s[0] += samples[i][0]; s[1] += samples[i][1]; s[2] += samples[i][2]; s[3]++;
    }
    for (let c = 0; c < k; c++) if (sum[c][3]) cents[c] = [sum[c][0] / sum[c][3], sum[c][1] / sum[c][3], sum[c][2] / sum[c][3]];
  }
  // spread per cluster → adaptive threshold
  const spread = new Array(k).fill(0), cnt = new Array(k).fill(0);
  for (let i = 0; i < samples.length; i++) {
    spread[assign[i]] += dist(samples[i], cents[assign[i]]);
    cnt[assign[i]]++;
  }
  return cents
    .map((c, i) => ({ c, share: cnt[i] / samples.length, th: Math.min(46, Math.max(13, (cnt[i] ? spread[i] / cnt[i] : 0) * 2.6 + 9)) }))
    .filter((x) => x.share > 0.04); // ignore clusters that are just the garment touching the edge
}

function boxBlur3(src: Float32Array, w: number, h: number, r: number) {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  const n = 2 * r + 1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      for (let c = 0; c < 3; c++) {
        let s = 0;
        for (let d = -r; d <= r; d++) s += src[(y * w + Math.min(w - 1, Math.max(0, x + d))) * 3 + c];
        tmp[(y * w + x) * 3 + c] = s / n;
      }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      for (let c = 0; c < 3; c++) {
        let s = 0;
        for (let d = -r; d <= r; d++) s += tmp[(Math.min(h - 1, Math.max(0, y + d)) * w + x) * 3 + c];
        out[(y * w + x) * 3 + c] = s / n;
      }
  return out;
}

export function segmentLocal(src: HTMLCanvasElement): { mask: Uint8ClampedArray; w: number; h: number; borderFg: number } {
  const k = Math.min(1, WORK / Math.max(src.width, src.height));
  const w = Math.max(1, Math.round(src.width * k));
  const h = Math.max(1, Math.round(src.height * k));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(src, 0, 0, w, h);
  const px = ctx.getImageData(0, 0, w, h).data;
  const N = w * h;
  const raw = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const [a, b, cc] = ycc(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]);
    raw[i * 3] = a; raw[i * 3 + 1] = b; raw[i * 3 + 2] = cc;
  }
  // Denoise (separable 5-tap box blur) so fabric / floor grain doesn't break region growing.
  const Y = boxBlur3(raw, w, h, 2);
  const at = (i: number) => [Y[i * 3], Y[i * 3 + 1], Y[i * 3 + 2]];

  // Edge strength (colour difference across ±2px) — background growth may not cross strong edges.
  const edge = new Float32Array(N);
  for (let y = 2; y < h - 2; y++)
    for (let x = 2; x < w - 2; x++) {
      const i = y * w + x;
      let e = 0;
      for (const [a, b] of [[i - 2, i + 2], [i - 2 * w, i + 2 * w]]) {
        const d = Math.hypot(Y[a * 3] - Y[b * 3], (Y[a * 3 + 1] - Y[b * 3 + 1]) * 1.4, (Y[a * 3 + 2] - Y[b * 3 + 2]) * 1.4);
        if (d > e) e = d;
      }
      edge[i] = e;
    }
  const EDGE = 11;

  // 1. background model from a 3px border
  const B = 3;
  const border: number[] = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) if (x < B || y < B || x >= w - B || y >= h - B) border.push(y * w + x);
  const model = kmeans(border.filter((_, i) => i % 2 === 0).map(at), 4);
  const bgScore = (i: number) => {
    const p = at(i);
    let best = Infinity;
    for (const m of model) best = Math.min(best, bgDist(p, m.c) / m.th);
    return best; // < 1 → looks like background
  };

  // 2. region growing from the border (colour model OR smooth continuation, never across an edge)
  const bg = new Uint8Array(N);
  const q = new Int32Array(N);
  let qh = 0, qt = 0;
  for (const i of border) if (bgScore(i) < 1) (bg[i] = 1), (q[qt++] = i);
  const STEP = 3; // max local change for gradient backgrounds (after denoise)
  while (qh < qt) {
    const i = q[qh++];
    const x = i % w, y = (i / w) | 0;
    const pi = at(i);
    const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1];
    for (const j of nb) {
      if (j < 0 || bg[j] || edge[j] > EDGE) continue;
      const s = bgScore(j);
      // Smooth continuation (lighting gradients) only on flat ground — never creep along a soft garment edge.
      if (s < 1 || (s < 1.8 && edge[j] < EDGE * 0.45 && dist(pi, at(j)) < STEP)) {
        bg[j] = 1;
        q[qt++] = j;
      }
    }
  }
  // Pixels sitting on an edge next to background: the edge band itself — assign by colour.
  for (let i = 0; i < N; i++) if (!bg[i] && edge[i] > EDGE && bgScore(i) < 0.8) bg[i] = 1;

  // 3. connected foreground components — keep the garment, drop specks
  const label = new Int32Array(N).fill(-1);
  const areas: number[] = [];
  for (let s = 0; s < N; s++) {
    if (bg[s] || label[s] >= 0) continue;
    const id = areas.length;
    let a = 0;
    qh = qt = 0;
    q[qt++] = s;
    label[s] = id;
    while (qh < qt) {
      const i = q[qh++];
      a++;
      const x = i % w, y = (i / w) | 0;
      const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1];
      for (const j of nb) if (j >= 0 && !bg[j] && label[j] < 0) (label[j] = id), (q[qt++] = j);
    }
    areas.push(a);
  }
  const maxA = Math.max(0, ...areas);
  // Islands that look like background (e.g. floor boards fenced in by gaps) are dropped.
  const scoreSum = new Float64Array(areas.length);
  for (let i = 0; i < N; i++) if (label[i] >= 0) scoreSum[label[i]] += Math.min(3, bgScore(i));
  const keep = areas.map((a, id) => a >= Math.max(maxA * 0.06, N * 0.002) && (a === maxA || scoreSum[id] / a > 0.75));

  // 4. binary mask → open (remove 1px fuzz) → 3x3 blur for a soft edge
  let m = new Uint8ClampedArray(N);
  for (let i = 0; i < N; i++) m[i] = !bg[i] && label[i] >= 0 && keep[label[i]] ? 255 : 0;
  const morph = (src2: Uint8ClampedArray, erode: boolean) => {
    const o = new Uint8ClampedArray(N);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let v = erode ? 255 : 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const xx = Math.min(w - 1, Math.max(0, x + dx)), yy = Math.min(h - 1, Math.max(0, y + dy));
            const s2 = src2[yy * w + xx];
            v = erode ? Math.min(v, s2) : Math.max(v, s2);
          }
        o[y * w + x] = v;
      }
    return o;
  };
  m = morph(morph(m, true), false);
  const soft = new Uint8ClampedArray(N);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let s2 = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) s2 += m[Math.min(h - 1, Math.max(0, y + dy)) * w + Math.min(w - 1, Math.max(0, x + dx))];
      soft[y * w + x] = s2 / 9;
    }

  let bfg = 0;
  for (const i of border) if (soft[i] > 128) bfg++;
  return { mask: soft, w, h, borderFg: bfg / border.length };
}

export const localRemover: BackgroundRemover = {
  name: "local",
  async available() {
    return true;
  },
  async remove(src) {
    const img = toCanvas(await decode(src), 1280);
    const { mask, w, h, borderFg } = segmentLocal(img);
    // Garment fills the frame edge-to-edge (close-up / worn by a person) → can't separate reliably.
    if (borderFg > 0.45) return null;
    const mc = document.createElement("canvas");
    mc.width = w;
    mc.height = h;
    const mctx = mc.getContext("2d")!;
    const md = mctx.createImageData(w, h);
    for (let i = 0; i < w * h; i++) md.data[i * 4 + 3] = mask[i];
    mctx.putImageData(md, 0, 0);
    const ctx = img.getContext("2d")!;
    ctx.globalCompositeOperation = "destination-in";
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(mc, 0, 0, img.width, img.height); // bilinear upscale = feathered edge
    ctx.globalCompositeOperation = "source-over";
    return img;
  },
};

const PROVIDERS: BackgroundRemover[] = [apiRemover, localRemover];

/** Photo → transparent garment asset. Never throws: failures fall back to the original photo. */
export async function makeCutout(src: Blob): Promise<CutoutOutcome> {
  for (const p of PROVIDERS) {
    try {
      if (!(await p.available())) continue;
      const canvas = await p.remove(src);
      if (!canvas) continue;
      const t = trimTransparent(canvas);
      // Sanity: a real garment covers a meaningful but not total part of the frame.
      if (!t || t.coverage < 0.012 || t.coverage > 0.93) continue;
      // A garment is a fairly solid shape. A sparse mask means the segmentation ate into it
      // (e.g. white shirt on a white sheet) — better to fall back to the original photo.
      if (p.name === "local" && t.fill < 0.4) continue;
      return { blob: await encodeAlpha(t.canvas), status: "ready", provider: p.name, coverage: t.coverage };
    } catch (e) {
      console.warn(`[cutout] ${p.name} failed`, e);
    }
  }
  return { blob: null, status: "failed", provider: "none", coverage: 0 };
}
