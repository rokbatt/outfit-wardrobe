-- ════════════════════════════════════════════════════════════════
-- 002 · Mannequin outfit builder
-- Additive only: every column is nullable / defaulted, existing rows keep working.
-- ════════════════════════════════════════════════════════════════

-- Transparent garment asset + per-garment placement on the mannequin
alter table public.wardrobe_items
  add column if not exists cutout_path      text,                     -- storage: wardrobe/{uid}/{id}-cut-xxxx.png
  add column if not exists cutout_status    text check (cutout_status in ('ready','failed','original')),
  add column if not exists anchor_x         real,                     -- offset from auto anchor, % of mannequin width
  add column if not exists anchor_y         real,                     -- offset from auto anchor, % of mannequin height
  add column if not exists garment_scale    real check (garment_scale is null or garment_scale between 0.2 and 3),
  add column if not exists garment_rotation real check (garment_rotation is null or garment_rotation between -180 and 180),
  add column if not exists layer_order      smallint;                 -- null → slot default (shoes 5, bottom 10, top 20, outer 30, acc 40)

-- Outfit date + how it is drawn (tuck / open outer / body type)
alter table public.outfits
  add column if not exists outfit_date date,
  add column if not exists render      jsonb;
