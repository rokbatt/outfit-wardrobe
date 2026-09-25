/** Contract between lib/tryon (browser) and app/api/tryon (server). */

export const TRYON_ASPECT = "3:4";
export const TRYON_SIZE = "1K";
/** Bump when the prompt changes enough that old renders should not be reused. */
export const TRYON_PROMPT_VERSION = 1;

export interface TryOnImage {
  mime: "image/jpeg" | "image/png" | "image/webp";
  data: string; // base64, no data: prefix
}

export interface TryOnGarment {
  slot: "outer" | "top" | "bottom" | "shoes" | "acc";
  label: string; // "TOP", "OUTERWEAR" …
  desc: string;
  image?: TryOnImage; // absent for photo-less items → text only
}

export interface TryOnProfile {
  gender: string | null;
  height_cm: number | null;
  body_type: string[];
}

export type TryOnRequest =
  | { mode: "model"; profile: TryOnProfile }
  | { mode: "tryon"; person: TryOnImage; garments: TryOnGarment[] };

export type TryOnErrorCode = "key" | "safety" | "timeout" | "quota" | "no_image" | "bad_request" | "upstream" | "network";
