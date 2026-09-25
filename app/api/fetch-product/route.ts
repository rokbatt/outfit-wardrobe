import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { NextResponse } from "next/server";

/**
 * "Import from link" for the add screen.
 *   POST { url }          → { images: string[] }  product photo candidates (og:image first, then large <img>s)
 *   GET  ?image=<url>     → the image bytes, fetched here so hotlink/CORS rules on the shop's CDN don't matter
 * Both hops pretend to be a normal browser; anything that fails comes back as { error } with a Korean message
 * the add screen shows next to its "캡처해서 올리기" fallback.
 */
export const runtime = "nodejs";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const MAX_HTML = 4 * 1024 * 1024;
const MAX_IMAGE = 12 * 1024 * 1024;
const MAX_CANDIDATES = 6;
const MIN_SIDE = 400;
const BLOCKED = "이 사이트에서는 자동으로 가져올 수 없어요, 캡처해서 올려주세요";

class Fail extends Error {
  constructor(message: string, readonly status = 422) {
    super(message);
  }
}

// ── safe fetch: public http(s) hosts only, redirects re-checked hop by hop ──

function privateIp(ip: string) {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v.startsWith("::ffff:")) return privateIp(v.slice(7));
    return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80");
  }
  const [a, b] = ip.split(".").map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

async function assertPublic(u: URL) {
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Fail("http(s) 링크만 가져올 수 있어요", 400);
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) throw new Fail("가져올 수 없는 주소예요", 400);
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (!addrs.length) throw new Fail("주소를 찾을 수 없어요. 링크를 다시 확인해 주세요", 400);
  if (addrs.some((a) => privateIp(a.address))) throw new Fail("가져올 수 없는 주소예요", 400);
}

async function safeFetch(raw: string, accept: string, referer?: string) {
  let u = new URL(raw);
  for (let hop = 0; hop < 5; hop++) {
    await assertPublic(u);
    const r = await fetch(u, {
      redirect: "manual",
      signal: AbortSignal.timeout(12_000),
      headers: {
        "user-agent": UA,
        accept,
        "accept-language": "ko-KR,ko;q=0.9,en;q=0.8",
        ...(referer ? { referer } : {}),
      },
    });
    const next = r.status >= 300 && r.status < 400 ? r.headers.get("location") : null;
    if (!next) return { res: r, finalUrl: u };
    u = new URL(next, u);
  }
  throw new Fail(BLOCKED, 502);
}

async function readCapped(r: Response, cap: number) {
  const len = Number(r.headers.get("content-length") ?? 0);
  if (len > cap) throw new Fail("파일이 너무 커요", 413);
  const buf = await r.arrayBuffer();
  if (buf.byteLength > cap) throw new Fail("파일이 너무 커요", 413);
  return buf;
}

// ── candidate extraction ──

const attr = (tag: string, name: string) =>
  tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"))?.slice(1).find((v) => v !== undefined) ?? null;

const decodeEntities = (s: string) =>
  s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

/** logos, icons, the site's generic share image, tracking pixels… never a product photo */
const JUNK = /(^|[\/_.-])(logo|favicon|sprite|icons?|placeholder|default|og|banner|badge|blank|spacer|pixel|loading)([\/_.-]|$)|\.(svg|gif)(\?|$)/i;

/** Size hint from width/height attributes or common resize query params (?w=1200, ?width=…). */
function sizeHint(tag: string | null, u: URL) {
  const nums = [
    tag && attr(tag, "width"),
    tag && attr(tag, "height"),
    u.searchParams.get("w"),
    u.searchParams.get("width"),
    u.searchParams.get("h"),
    u.searchParams.get("height"),
  ]
    .map((v) => parseInt(v ?? "", 10))
    .filter((n) => n > 0);
  return nums.length ? Math.max(...nums) : 0;
}

/** Largest entry of a srcset ("a.jpg 320w, b.jpg 1200w"). */
function bestSrcset(srcset: string | null) {
  if (!srcset) return null;
  let best: [string, number] | null = null;
  for (const part of srcset.split(",")) {
    const [url, d] = part.trim().split(/\s+/);
    const n = parseFloat(d ?? "1") * (d?.endsWith("x") ? 1000 : 1);
    if (url && (!best || n > best[1])) best = [url, n];
  }
  return best?.[0] ?? null;
}

/** Same photo at different sizes → same key: drop the query, resize path segments and size suffixes (_500, _big, -1200x1200). */
const photoKey = (u: URL) =>
  u.hostname +
  u.pathname
    .replace(/\/(thumbnails?|thumbs?|resize[^/]*|w_\d+[^/]*)\//gi, "/")
    .replace(/[_-](\d{2,4}(x\d{2,4})?|big|large|medium|small|thumb|org|origin)(?=\.\w+$)/i, "");

function extractCandidates(html: string, base: URL) {
  const out = new Map<string, { url: string; size: number; og: boolean }>(); // key: photoKey
  const add = (raw: string | null, size: number, og: boolean) => {
    if (!raw || raw.startsWith("data:")) return;
    let u: URL;
    try {
      u = new URL(decodeEntities(raw.trim()), base);
    } catch {
      return;
    }
    if (u.protocol !== "http:" && u.protocol !== "https:") return;
    if (JUNK.test(u.pathname)) return;
    const key = photoKey(u);
    const prev = out.get(key);
    // same photo seen as og:image, a small thumbnail and a large view → one entry, largest URL
    if (!prev) out.set(key, { url: u.href, size, og });
    else if (size > prev.size) out.set(key, { url: u.href, size, og: prev.og || og });
    else if (og) prev.og = true;
  };

  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const key = (attr(m[0], "property") ?? attr(m[0], "name") ?? "").toLowerCase();
    if (key === "og:image" || key === "og:image:secure_url" || key === "og:image:url") add(attr(m[0], "content"), 0, true);
  }

  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    const src = bestSrcset(attr(tag, "srcset") ?? attr(tag, "data-srcset")) ?? attr(tag, "data-src") ?? attr(tag, "data-original") ?? attr(tag, "src");
    if (!src) continue;
    let u: URL;
    try {
      u = new URL(decodeEntities(src), base);
    } catch {
      continue;
    }
    add(src, sizeHint(tag, u), false);
  }

  // og:image first, then gallery images big enough to be product shots, in page order
  return [...out.values()]
    .filter((c) => c.og || c.size >= MIN_SIDE)
    .sort((a, b) => Number(b.og) - Number(a.og))
    .slice(0, MAX_CANDIDATES)
    .map((c) => c.url);
}

// ── handlers ──

const fail = (e: unknown) => {
  if (e instanceof Fail) return NextResponse.json({ error: e.message }, { status: e.status });
  const timeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
  return NextResponse.json({ error: timeout ? "사이트 응답이 너무 느려요. 캡처해서 올려주세요" : BLOCKED }, { status: 502 });
};

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as { url?: unknown } | null;
    const raw = typeof body?.url === "string" ? body.url.trim() : "";
    let target: URL;
    try {
      target = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    } catch {
      throw new Fail("올바른 링크가 아니에요", 400);
    }

    const { res, finalUrl } = await safeFetch(target.href, "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8");
    if (!res.ok) throw new Fail(BLOCKED, 502);
    if (!/html/i.test(res.headers.get("content-type") ?? "")) throw new Fail("상품 페이지 링크가 아니에요. 캡처해서 올려주세요");

    const html = new TextDecoder().decode(await readCapped(res, MAX_HTML));
    const images = extractCandidates(html, finalUrl);
    if (!images.length) throw new Fail(BLOCKED);
    return NextResponse.json({ images, page: finalUrl.href });
  } catch (e) {
    return fail(e);
  }
}

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const image = params.get("image");
  if (!image) return NextResponse.json({ error: "image 파라미터가 필요해요" }, { status: 400 });
  try {
    // Referer = the product page (or the image's own origin) — most CDNs only hotlink-protect on that
    const referer = params.get("page") ?? new URL(image).origin + "/";
    const { res } = await safeFetch(image, "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8", referer);
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !type.startsWith("image/")) throw new Fail("이미지를 받아오지 못했어요. 캡처해서 올려주세요", 502);
    const buf = await readCapped(res, MAX_IMAGE);
    return new Response(buf, { headers: { "content-type": type, "cache-control": "private, max-age=3600" } });
  } catch (e) {
    return fail(e);
  }
}
