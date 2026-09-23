"use client";

import { COLORS } from "./taxonomy";

export interface ProcessedImage {
  blob: Blob; // stored image (≤1280px, webp/jpeg)
  preview: string; // object URL for immediate display
  aiBase64: string; // ≤768px jpeg base64 (no prefix) — keeps vision tokens low
  aiMediaType: "image/jpeg";
  dominant: string; // palette key
}

async function decode(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // Older Safari: fall back to <img> (it applies EXIF orientation itself)
    const url = URL.createObjectURL(file);
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

function draw(src: ImageBitmap | HTMLImageElement, maxSide: number) {
  const w = "naturalWidth" in src ? src.naturalWidth : src.width;
  const h = "naturalHeight" in src ? src.naturalHeight : src.height;
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const c = document.createElement("canvas");
  c.width = Math.round(w * scale);
  c.height = Math.round(h * scale);
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

const toBlob = (c: HTMLCanvasElement, type: string, q: number) =>
  new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("encode failed"))), type, q));

function hexToRgb(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const;
}
const PALETTE = COLORS.map((c) => ({ key: c.key, rgb: hexToRgb(c.hex) }));

/** Weighted RGB distance (cheap perceptual approximation). */
function dist(a: readonly number[], b: readonly number[]) {
  const rm = (a[0] + b[0]) / 2;
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db);
}

/**
 * Dominant garment colour: estimate background from the border, ignore pixels
 * close to it, then vote for the nearest palette colour among the rest.
 */
export function dominantColor(canvas: HTMLCanvasElement): string {
  const S = 64;
  const c = document.createElement("canvas");
  c.width = S;
  c.height = S;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(canvas, 0, 0, S, S);
  const d = ctx.getImageData(0, 0, S, S).data;
  const px = (x: number, y: number) => {
    const i = (y * S + x) * 4;
    return [d[i], d[i + 1], d[i + 2]];
  };
  const border: number[][] = [];
  for (let i = 0; i < S; i++) border.push(px(i, 0), px(i, S - 1), px(0, i), px(S - 1, i));
  const bg = [0, 1, 2].map((k) => border.map((p) => p[k]).sort((a, b) => a - b)[border.length >> 1]);

  const votes = new Map<string, number>();
  const m = Math.floor(S * 0.12);
  for (let y = m; y < S - m; y++)
    for (let x = m; x < S - m; x++) {
      const p = px(x, y);
      if (dist(p, bg) < 60) continue;
      // centre-weighted
      const w = 1 - Math.hypot(x - S / 2, y - S / 2) / S;
      let best = PALETTE[0];
      let bd = Infinity;
      for (const c2 of PALETTE) {
        const dd = dist(p, c2.rgb);
        if (dd < bd) {
          bd = dd;
          best = c2;
        }
      }
      votes.set(best.key, (votes.get(best.key) ?? 0) + w);
    }
  if (!votes.size) return "gray";
  return [...votes.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

export async function processImage(file: Blob): Promise<ProcessedImage> {
  const src = await decode(file);
  const big = draw(src, 1280);
  let blob = await toBlob(big, "image/webp", 0.85);
  if (blob.type !== "image/webp") blob = await toBlob(big, "image/jpeg", 0.86);
  const small = draw(src, 768);
  const aiBlob = await toBlob(small, "image/jpeg", 0.8);
  const aiBase64 = await blobToBase64(aiBlob);
  const dominant = dominantColor(small);
  if ("close" in src) src.close();
  return { blob, preview: URL.createObjectURL(blob), aiBase64, aiMediaType: "image/jpeg", dominant };
}

function blobToBase64(b: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1] ?? "");
    r.onerror = () => rej(r.error);
    r.readAsDataURL(b);
  });
}
