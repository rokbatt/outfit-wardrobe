import { NextResponse } from "next/server";

/**
 * Optional server-side background removal.
 * Enabled when REMOVE_BG_API_KEY is set (remove.bg API). Any other segmentation
 * service (self-hosted rembg, Replicate, Clipdrop…) can be swapped in here —
 * the client only expects a PNG/WebP with alpha back.
 */
export const runtime = "nodejs";

const MAX_BYTES = 8 * 1024 * 1024;

export async function GET() {
  return NextResponse.json({ enabled: !!process.env.REMOVE_BG_API_KEY });
}

export async function POST(req: Request) {
  const key = process.env.REMOVE_BG_API_KEY;
  if (!key) return NextResponse.json({ error: "not configured" }, { status: 501 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("image");
  if (!(file instanceof Blob) || file.size === 0 || file.size > MAX_BYTES)
    return NextResponse.json({ error: "invalid image" }, { status: 400 });

  const fd = new FormData();
  fd.append("image_file", file, "garment");
  fd.append("size", "auto");
  fd.append("type", "product"); // garments are products, not people
  fd.append("format", "png");

  const r = await fetch("https://api.remove.bg/v1.0/removebg", { method: "POST", headers: { "X-Api-Key": key }, body: fd });
  if (!r.ok) return NextResponse.json({ error: `remove.bg ${r.status}` }, { status: 502 });
  return new Response(await r.arrayBuffer(), { headers: { "content-type": r.headers.get("content-type") ?? "image/png" } });
}
