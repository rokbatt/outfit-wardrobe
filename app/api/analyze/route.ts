import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { CATEGORIES, COLORS, FITS, PATTERNS, SEASONS, STYLES, SUBCATEGORIES } from "@/lib/taxonomy";
import type { AnalysisDraft, Category, Season } from "@/lib/types";

export const runtime = "nodejs";

const MAX_B64 = 3_000_000; // ~2.2MB image; client already downsizes to 768px

const catKeys = CATEGORIES.map((c) => c.key);
const colorKeys = COLORS.map((c) => c.key);
const fitKeys = FITS.map((f) => f.key);
const patternKeys = PATTERNS.map((p) => p.key);
const styleKeys = STYLES.map((s) => s.key);
const seasonKeys = SEASONS.map((s) => s.key);

const tool: Anthropic.Tool = {
  name: "record_garment",
  description: "Record the attributes of the single main garment in the photo.",
  input_schema: {
    type: "object",
    properties: {
      name: { type: "string", description: "짧은 한국어 이름. 색 + 핏/특징 + 종류. 예: '블랙 오버핏 반팔 티셔츠', '연청 와이드 데님'" },
      category: { type: "string", enum: catKeys },
      subcategory: {
        type: "string",
        description: `한국어 세부 종류. 가능하면 다음 중 선택: ${Object.values(SUBCATEGORIES).flat().join(", ")}`,
      },
      color: { type: "string", enum: colorKeys, description: "main color of the garment itself (not the background)" },
      secondary_color: { type: ["string", "null"], enum: [...colorKeys, null] },
      pattern: { type: "string", enum: patternKeys },
      material: { type: ["string", "null"], description: "e.g. cotton, denim, wool, nylon, leather, knit; null if unsure" },
      fit: { type: ["string", "null"], enum: [...fitKeys, null], description: "null for shoes/accessories" },
      style: { type: "array", items: { type: "string", enum: styleKeys }, maxItems: 3 },
      season: { type: "array", items: { type: "string", enum: seasonKeys }, minItems: 1 },
      gender: { type: ["string", "null"], enum: ["men", "women", "unisex", null] },
      brand: { type: ["string", "null"], description: "only if a logo/label is clearly visible; otherwise null" },
      formality: { type: "integer", minimum: 1, maximum: 5, description: "1 very casual … 5 formal" },
      confidence: { type: "number", minimum: 0, maximum: 1 },
    },
    required: ["name", "category", "subcategory", "color", "pattern", "style", "season", "formality"],
  },
};

const SYSTEM = `You tag clothing photos for a personal digital wardrobe app used by Korean users.
Identify the ONE main garment (ignore hangers, floors, people's skin, background).
Be conservative: if unsure about brand or material, use null. Never guess a brand from style alone.
Return the result only via the record_garment tool.`;

function clean(raw: Record<string, unknown>): AnalysisDraft {
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 80) : undefined);
  const oneOf = <T extends string>(v: unknown, keys: readonly T[]) => (keys.includes(v as T) ? (v as T) : undefined);
  const arr = <T extends string>(v: unknown, keys: readonly T[]) =>
    Array.isArray(v) ? [...new Set(v.filter((x): x is T => keys.includes(x as T)))] : undefined;
  const f = Number(raw.formality);
  return {
    name: str(raw.name),
    category: oneOf(raw.category, catKeys as Category[]),
    subcategory: str(raw.subcategory),
    color: oneOf(raw.color, colorKeys),
    secondary_color: oneOf(raw.secondary_color, colorKeys) ?? null,
    pattern: oneOf(raw.pattern, patternKeys),
    material: str(raw.material) ?? null,
    fit: oneOf(raw.fit, fitKeys) ?? null,
    style: arr(raw.style, styleKeys),
    season: arr(raw.season, seasonKeys as Season[]),
    gender: str(raw.gender) ?? null,
    brand: str(raw.brand) ?? null,
    formality: Number.isFinite(f) ? Math.min(5, Math.max(1, Math.round(f))) : undefined,
  };
}

export async function GET() {
  return NextResponse.json({ enabled: !!process.env.ANTHROPIC_API_KEY });
}

export async function POST(req: Request) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return NextResponse.json({ error: "AI 분석이 설정되지 않았습니다 (ANTHROPIC_API_KEY)." }, { status: 501 });

  let body: { image?: string; mediaType?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const image = body.image;
  const mediaType = body.mediaType ?? "image/jpeg";
  if (!image || typeof image !== "string" || image.length > MAX_B64)
    return NextResponse.json({ error: "이미지가 없거나 너무 큽니다." }, { status: 400 });
  if (!["image/jpeg", "image/png", "image/webp"].includes(mediaType))
    return NextResponse.json({ error: "지원하지 않는 이미지 형식" }, { status: 400 });

  const client = new Anthropic({ apiKey: key });
  const model = process.env.ANTHROPIC_VISION_MODEL || "claude-haiku-4-5-20251001";

  try {
    const msg = await client.messages.create({
      model,
      max_tokens: 600,
      system: SYSTEM,
      tools: [tool],
      tool_choice: { type: "tool", name: "record_garment" },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType as "image/jpeg", data: image } },
            { type: "text", text: "이 옷을 옷장 카드로 등록할 수 있게 속성을 추출해줘." },
          ],
        },
      ],
    });
    const use = msg.content.find((c): c is Anthropic.ToolUseBlock => c.type === "tool_use");
    if (!use) return NextResponse.json({ error: "분석 결과를 읽을 수 없습니다." }, { status: 502 });
    const raw = use.input as Record<string, unknown>;
    return NextResponse.json({
      draft: clean(raw),
      raw,
      usage: { model, input_tokens: msg.usage.input_tokens, output_tokens: msg.usage.output_tokens },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `AI 분석 실패: ${message}` }, { status: 502 });
  }
}
