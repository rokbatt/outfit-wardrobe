-- ════════════════════════════════════════════════════════════════
-- 003 · AI try-on (2D lookbook + on-demand Gemini render)
-- Additive only: nullable columns + one new table. Existing rows keep working,
-- and the app runs without this migration (try-on results just aren't persisted).
-- ════════════════════════════════════════════════════════════════

-- Reference person: the user's own full-body photo, or the generated default model.
-- storage: wardrobe/{uid}/person/{kind}-xxxx.jpg
alter table public.user_preferences
  add column if not exists body_photo_path text,
  add column if not exists base_model_path text,
  add column if not exists base_model_sig  text;  -- profile settings the model was generated for

-- Render cache. cache_key = sha256(person id + sorted item ids + render options).
-- storage: wardrobe/{uid}/tryon/{cache_key}.png
create table if not exists public.tryon_renders (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  cache_key   text not null,
  image_path  text not null,
  person_ref  text not null,
  item_ids    text[] not null default '{}',   -- text, not FK: renders outlive deleted items
  model       text not null,
  cost_usd    numeric(8,4),
  created_at  timestamptz not null default now(),
  unique (user_id, cache_key)
);

-- Saved outfit → its try-on render (MY OUTFITS thumbnail)
alter table public.outfits
  add column if not exists tryon_key text;

alter table public.tryon_renders enable row level security;
drop policy if exists own on public.tryon_renders;
create policy own on public.tryon_renders for all using (user_id = auth.uid()) with check (user_id = auth.uid());
