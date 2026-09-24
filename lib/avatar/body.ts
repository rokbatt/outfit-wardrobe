/**
 * Parametric body. The avatar is generated from these numbers, so a user's own
 * proportions can drive it later without touching the renderer or garments.
 */
import type { Body, Preferences } from "../types";

export interface BodyParams {
  /** stature in cm */
  height: number;
  /** width multipliers (1 = neutral fashion mannequin) */
  shoulder: number;
  chest: number;
  waist: number;
  hip: number;
  /** leg length multiplier; torso absorbs the difference so height stays fixed */
  legRatio: number;
}

export const NEUTRAL_BODY: BodyParams = { height: 180, shoulder: 1, chest: 1, waist: 1, hip: 1, legRatio: 1 };

/** Presets for the existing `RenderOptions.body` values (saved outfits keep working). */
export const BODY_PRESETS: Record<Body, BodyParams> = {
  slim: { ...NEUTRAL_BODY, shoulder: 0.95, chest: 0.92, waist: 0.88, hip: 0.94 },
  standard: NEUTRAL_BODY,
  relaxed: { ...NEUTRAL_BODY, shoulder: 1.06, chest: 1.12, waist: 1.2, hip: 1.08 },
};

export const BODY_LIMITS: Record<keyof BodyParams, [number, number]> = {
  height: [150, 200],
  shoulder: [0.85, 1.2],
  chest: [0.85, 1.3],
  waist: [0.8, 1.4],
  hip: [0.85, 1.3],
  legRatio: [0.9, 1.1],
};

export function clampBody(p: BodyParams): BodyParams {
  const out = { ...p };
  for (const k of Object.keys(BODY_LIMITS) as (keyof BodyParams)[]) {
    const [lo, hi] = BODY_LIMITS[k];
    out[k] = Math.min(hi, Math.max(lo, Number.isFinite(p[k]) ? p[k] : NEUTRAL_BODY[k]));
  }
  return out;
}

export function presetFromPrefs(p: Preferences): Body {
  if (p.body_type.some((b) => /큰 체격|상체 발달/.test(b))) return "relaxed";
  if (p.body_type.includes("슬림")) return "slim";
  return "standard";
}

/** Body params for a user: preset from their body type, stature from their profile. */
export function bodyFromPrefs(p: Preferences, preset: Body = presetFromPrefs(p)): BodyParams {
  return clampBody({ ...BODY_PRESETS[preset], height: p.height_cm ?? NEUTRAL_BODY.height });
}
