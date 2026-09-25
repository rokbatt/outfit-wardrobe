-- ════════════════════════════════════════════════════════════════
-- 004 · Hem length for shorts / bermudas + lookbook height scale
-- Additive only: nullable columns. The app runs without them (these values just aren't stored).
-- ════════════════════════════════════════════════════════════════

-- above_knee | knee | below_knee | mid_calf | low_calf (lib/taxonomy HEM_LENGTHS) · null → the type's default
alter table public.wardrobe_items
  add column if not exists hem_length text;

-- Manual size on the 2D lookbook: garment_scale = width ×, garment_scale_y = height ×,
-- anchor_y = top-edge offset (share of the automatic box height). null scale_y → no manual size.
alter table public.wardrobe_items
  add column if not exists garment_scale_y real;
