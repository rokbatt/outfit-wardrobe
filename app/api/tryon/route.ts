import { NextResponse } from "next/server";
import {
  TRYON_ASPECT,
  TRYON_SIZE,
  type TryOnErrorCode,
  type TryOnGarment,
  type TryOnImage,
  type TryOnProfile,
  type TryOnRequest,
} from "@/lib/tryon-shared";

/**
 * AI try-on (on demand only). Gemini image model via REST generateContent:
 *   mode "model" → one-time default model photo from the profile (gender / height / build)
 *   mode "tryon" → person image + garment references (cutouts, labelled by slot) → lookbook photo
 * generateContent is stateless (the Interactions API stores requests by default), which suits body photos.
 * Response: image bytes + x-tryon-* headers, or { code, error } JSON.
 */
export const runtime = "nodejs";
export const maxDuration = 90;

const DEFAULT_MODEL = "gemini-3.1-flash-image"; // 2.5 Flash Image shuts down 2026-10-02 — do not use
const TIMEOUT_MS = 75_000;
const MAX_B64 = 4_000_000; // per image (~3MB); the client downsizes to ≤1280px
const MAX_GARMENTS = 6;
const MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);

// USD per 1M tokens, gemini-3.1-flash-image paid tier (ai.google.dev/gemini-api/docs/pricing, 2026-09).
// Other models via GEMINI_IMAGE_MODEL are logged with the same rates as a rough estimate.
const PRICE = { input: 0.5, text: 3, image: 60 };
const IMAGE_TOKENS_1K = 1120;

const model = () => process.env.GEMINI_IMAGE_MODEL?.trim() || DEFAULT_MODEL;

export async function GET() {
  return NextResponse.json({ enabled: !!process.env.GEMINI_API_KEY, model: model() });
}

const fail = (code: TryOnErrorCode, error: string, status: number) => NextResponse.json({ code, error }, { status });

const validImage = (i: TryOnImage | undefined): i is TryOnImage =>
  !!i && typeof i.data === "string" && i.data.length > 0 && i.data.length <= MAX_B64 && MIMES.has(i.mime);

/* ─────────── prompts ─────────── */

const BUILD_EN: Record<string, string> = {
  슬림: "slim",
  보통: "average",
  탄탄: "athletic, toned",
  "상체 발달": "broad shoulders and chest",
  "하체 발달": "strong legs and hips",
  "큰 체격": "large, sturdy",
};

function modelPrompt(p: TryOnProfile) {
  const who = p.gender === "men" ? "adult man" : p.gender === "women" ? "adult woman" : "adult person";
  const build = p.body_type.map((b) => BUILD_EN[b]).filter(Boolean).join(", ") || "average";
  const height = p.height_cm ? `, about ${p.height_cm} cm tall` : "";
  return [
    `Photorealistic full-body studio photograph of a single ${who}${height}, ${build} build.`,
    "Front-facing, standing straight in a neutral relaxed pose, arms slightly away from the body, feet shoulder-width apart, looking at the camera.",
    "Natural, realistic face with a calm expression and natural skin texture.",
    "The whole body from head to toe is visible with a little margin above the head and below the feet.",
    "Plain seamless light-grey studio background, soft even lighting, subtle floor shadow.",
    "Wearing only a plain fitted light-grey crew-neck t-shirt and plain fitted light-grey shorts, barefoot.",
    "No accessories, no logos, no text, no watermark. Portrait orientation.",
  ].join(" ");
}

function tryOnIntro(garments: TryOnGarment[]) {
  const missing = (["outer", "top", "bottom", "shoes"] as const).filter((s) => !garments.some((g) => g.slot === s));
  return [
    "Task: virtual try-on for a fashion lookbook.",
    "The first image is the PERSON. The following images are GARMENT references, each labelled with its category.",
    "Dress the person in exactly these garments.",
    "Preserve every garment faithfully: color, fabric texture and material, logos, prints and patterns, length, and fit/silhouette.",
    "Do not add any clothing or accessory that is not in the references.",
    missing.length
      ? `There is no reference for: ${missing.join(", ")}. For those areas keep what the person is already wearing, unchanged.`
      : "",
    "Layer naturally: outerwear goes over the top; tops sit over or tuck into bottoms as a stylist would.",
    "Keep the person's pose, body shape, proportions, face, hair and skin tone exactly the same.",
    "Output one photorealistic full-body studio lookbook photo, head to toe visible, plain light-grey background, soft even lighting.",
    "No text, no labels, no collage, no watermark.",
  ]
    .filter(Boolean)
    .join(" ");
}

type Part = { text: string } | { inline_data: { mime_type: string; data: string } };

function tryOnParts(person: TryOnImage, garments: TryOnGarment[]): Part[] {
  const parts: Part[] = [{ text: tryOnIntro(garments) }, { text: "PERSON:" }, { inline_data: { mime_type: person.mime, data: person.data } }];
  for (const g of garments) {
    parts.push({ text: `GARMENT — ${g.label}: ${g.desc}${g.image ? "" : " (no photo; follow this description)"}` });
    if (g.image) parts.push({ inline_data: { mime_type: g.image.mime, data: g.image.data } });
  }
  return parts;
}

/* ─────────── Gemini call ─────────── */

interface GeminiResponse {
  candidates?: {
    content?: { parts?: { text?: string; inlineData?: { mimeType: string; data: string }; thought?: boolean }[] };
    finishReason?: string;
  }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number;
    candidatesTokensDetails?: { modality?: string; tokenCount?: number }[];
  };
  error?: { code?: number; message?: string; status?: string };
}

const SAFETY = new Set(["SAFETY", "IMAGE_SAFETY", "IMAGE_PROHIBITED_CONTENT", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII", "RECITATION", "IMAGE_RECITATION"]);

function estimateCost(u: GeminiResponse["usageMetadata"]) {
  const input = u?.promptTokenCount ?? 0;
  const imageOut = u?.candidatesTokensDetails?.find((d) => d.modality === "IMAGE")?.tokenCount ?? IMAGE_TOKENS_1K;
  const textOut = Math.max(0, (u?.candidatesTokenCount ?? imageOut) - imageOut) + (u?.thoughtsTokenCount ?? 0);
  const usd = (input * PRICE.input + textOut * PRICE.text + imageOut * PRICE.image) / 1e6;
  return { usd, input, imageOut, textOut };
}

export async function POST(req: Request) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return fail("key", "GEMINI_API_KEY가 설정되지 않았어요", 501);

  const body = (await req.json().catch(() => null)) as TryOnRequest | null;
  let parts: Part[];
  if (body?.mode === "model" && body.profile && Array.isArray(body.profile.body_type)) {
    parts = [{ text: modelPrompt(body.profile) }];
  } else if (
    body?.mode === "tryon" &&
    validImage(body.person) &&
    Array.isArray(body.garments) &&
    body.garments.length > 0 &&
    body.garments.length <= MAX_GARMENTS &&
    body.garments.every((g) => typeof g.label === "string" && typeof g.desc === "string" && (g.image === undefined || validImage(g.image)))
  ) {
    parts = tryOnParts(body.person, body.garments);
  } else {
    return fail("bad_request", "요청 형식이 올바르지 않아요", 400);
  }

  const m = model();
  const t0 = Date.now();
  let r: Response;
  try {
    r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": key, "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: {
          responseModalities: ["TEXT", "IMAGE"],
          imageConfig: { aspectRatio: TRYON_ASPECT, imageSize: TRYON_SIZE },
        },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    const timeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    console.warn(`[tryon] ${body.mode} ${timeout ? "timeout" : "network error"} after ${Date.now() - t0}ms`, e);
    return timeout ? fail("timeout", "생성 시간이 초과됐어요", 504) : fail("upstream", "Gemini 서버에 연결할 수 없어요", 502);
  }

  const json = (await r.json().catch(() => ({}))) as GeminiResponse;
  if (!r.ok) {
    const msg = json.error?.message ?? `HTTP ${r.status}`;
    console.warn(`[tryon] ${body.mode} ${m} → ${r.status} ${json.error?.status ?? ""} ${msg}`);
    if (r.status === 401 || r.status === 403 || /api key/i.test(msg)) return fail("key", "API 키가 유효하지 않아요", 502);
    if (r.status === 429) return fail("quota", "요청 한도를 초과했어요", 429);
    if (r.status === 404) return fail("upstream", `모델(${m})을 찾을 수 없어요`, 502);
    return fail("upstream", msg, 502);
  }

  const cost = estimateCost(json.usageMetadata);
  const cand = json.candidates?.[0];
  const img = cand?.content?.parts?.find((p) => p.inlineData?.data && !p.thought)?.inlineData;
  const reason = json.promptFeedback?.blockReason ?? cand?.finishReason ?? "";
  // One line per call so spend is visible in the server console.
  console.log(
    `[tryon] ${body.mode} ${m} ${Date.now() - t0}ms · in ${cost.input} tok · out img ${cost.imageOut} + text ${cost.textOut} tok · ≈ $${cost.usd.toFixed(4)}${img ? "" : ` · no image (${reason || "?"})`}`,
  );

  if (!img) {
    if (json.promptFeedback?.blockReason || SAFETY.has(reason)) return fail("safety", "안전 필터에 걸렸어요", 422);
    return fail("no_image", "이미지가 생성되지 않았어요", 502);
  }
  return new Response(Buffer.from(img.data, "base64"), {
    headers: {
      "content-type": img.mimeType || "image/png",
      "cache-control": "no-store",
      "x-tryon-model": m,
      "x-tryon-cost-usd": cost.usd.toFixed(4),
      "x-tryon-ms": String(Date.now() - t0),
    },
  });
}
