-- ════════════════════════════════════════════════════════════════
-- CLOSET — Supabase schema (Phase 1 + Phase 2-ready)
-- Run once in Supabase SQL editor.
-- Also enable: Authentication → Sign In / Providers → "Allow anonymous sign-ins"
-- ════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- ── user_preferences (1:1 auth.users) ───────────────────────────
create table if not exists public.user_preferences (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  display_name     text not null default '',
  gender           text,
  height_cm        smallint check (height_cm between 100 and 230),
  body_type        text[] not null default '{}',
  preferred_fit    text,
  preferred_styles text[] not null default '{}',
  favorite_colors  text[] not null default '{}',
  avoid_colors     text[] not null default '{}',
  brands           text not null default '',
  activities       text[] not null default '{}',
  difficulty       text,
  updated_at       timestamptz not null default now()
);

-- ── wardrobe_items ──────────────────────────────────────────────
create table if not exists public.wardrobe_items (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  image_path       text,                       -- storage: wardrobe/{user_id}/{id}.webp
  name             text not null,
  category         text not null check (category in ('top','bottom','outer','shoes','acc','etc')),
  subcategory      text not null default '',
  color            text not null default 'gray',
  secondary_color  text,
  pattern          text not null default 'solid',
  material         text,
  fit              text,
  style            text[] not null default '{}',
  season           text[] not null default '{}',
  gender           text,
  brand            text,
  formality        smallint not null default 2 check (formality between 1 and 5),
  notes            text,
  ai_raw           jsonb,                      -- untouched AI output, for audit / prompt tuning
  archived         boolean not null default false,
  wear_count       integer not null default 0, -- maintained by trigger
  last_worn_at     date,                       -- maintained by trigger
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists wardrobe_items_user_cat on public.wardrobe_items (user_id, category) where not archived;
create index if not exists wardrobe_items_user_worn on public.wardrobe_items (user_id, last_worn_at);

-- ── outfits / outfit_items ──────────────────────────────────────
create table if not exists public.outfits (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null,
  occasion    text not null default 'daily',
  style       text[] not null default '{}',
  source      text not null default 'manual' check (source in ('manual','random','ai')),
  note        text,
  created_at  timestamptz not null default now()
);
create index if not exists outfits_user on public.outfits (user_id, created_at desc);

create table if not exists public.outfit_items (
  id                uuid primary key default gen_random_uuid(),
  outfit_id         uuid not null references public.outfits(id) on delete cascade,
  wardrobe_item_id  uuid not null references public.wardrobe_items(id) on delete cascade,
  slot              text not null check (slot in ('outer','top','bottom','shoes','acc')),
  position          smallint not null default 0,
  unique (outfit_id, wardrobe_item_id)
);
create index if not exists outfit_items_item on public.outfit_items (wardrobe_item_id);

-- ── wear_logs / wear_log_items ──────────────────────────────────
-- A log can reference a saved outfit or just a set of items worn that day.
create table if not exists public.wear_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  outfit_id   uuid references public.outfits(id) on delete set null,
  worn_at     date not null default current_date,
  created_at  timestamptz not null default now()
);
create index if not exists wear_logs_user_date on public.wear_logs (user_id, worn_at desc);

create table if not exists public.wear_log_items (
  wear_log_id       uuid not null references public.wear_logs(id) on delete cascade,
  wardrobe_item_id  uuid not null references public.wardrobe_items(id) on delete cascade,
  primary key (wear_log_id, wardrobe_item_id)
);
create index if not exists wear_log_items_item on public.wear_log_items (wardrobe_item_id);

-- ── ai_recommendations (Phase 2: cache + cost tracking) ─────────
create table if not exists public.ai_recommendations (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind           text not null check (kind in ('stylist','dormant','wardrobe_review','trend')),
  request        jsonb not null,
  response       jsonb not null,
  model          text not null,
  input_tokens   integer,
  output_tokens  integer,
  created_at     timestamptz not null default now()
);
create index if not exists ai_recs_user on public.ai_recommendations (user_id, created_at desc);

-- ── triggers ────────────────────────────────────────────────────
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists wardrobe_items_touch on public.wardrobe_items;
create trigger wardrobe_items_touch before update on public.wardrobe_items
  for each row execute function public.touch_updated_at();

-- Recompute wear stats for the affected item (insert & delete safe).
create or replace function public.refresh_item_wear() returns trigger
language plpgsql security definer set search_path = public as $$
declare target uuid := coalesce(new.wardrobe_item_id, old.wardrobe_item_id);
begin
  update wardrobe_items w set
    wear_count   = s.cnt,
    last_worn_at = s.last
  from (
    select count(*)::int as cnt, max(l.worn_at) as last
    from wear_log_items li join wear_logs l on l.id = li.wear_log_id
    where li.wardrobe_item_id = target
  ) s
  where w.id = target;
  return null;
end $$;

drop trigger if exists wear_log_items_stats on public.wear_log_items;
create trigger wear_log_items_stats after insert or delete on public.wear_log_items
  for each row execute function public.refresh_item_wear();

-- ── RLS ─────────────────────────────────────────────────────────
alter table public.user_preferences   enable row level security;
alter table public.wardrobe_items     enable row level security;
alter table public.outfits            enable row level security;
alter table public.outfit_items       enable row level security;
alter table public.wear_logs          enable row level security;
alter table public.wear_log_items     enable row level security;
alter table public.ai_recommendations enable row level security;

do $$ begin
  -- owner tables
  execute 'drop policy if exists own on public.user_preferences';
  execute 'create policy own on public.user_preferences for all using (user_id = auth.uid()) with check (user_id = auth.uid())';
  execute 'drop policy if exists own on public.wardrobe_items';
  execute 'create policy own on public.wardrobe_items for all using (user_id = auth.uid()) with check (user_id = auth.uid())';
  execute 'drop policy if exists own on public.outfits';
  execute 'create policy own on public.outfits for all using (user_id = auth.uid()) with check (user_id = auth.uid())';
  execute 'drop policy if exists own on public.wear_logs';
  execute 'create policy own on public.wear_logs for all using (user_id = auth.uid()) with check (user_id = auth.uid())';
  execute 'drop policy if exists own on public.ai_recommendations';
  execute 'create policy own on public.ai_recommendations for all using (user_id = auth.uid()) with check (user_id = auth.uid())';
  -- child tables: via parent ownership
  execute 'drop policy if exists own on public.outfit_items';
  execute 'create policy own on public.outfit_items for all
           using (exists (select 1 from public.outfits o where o.id = outfit_id and o.user_id = auth.uid()))
           with check (exists (select 1 from public.outfits o where o.id = outfit_id and o.user_id = auth.uid())
                   and exists (select 1 from public.wardrobe_items w where w.id = wardrobe_item_id and w.user_id = auth.uid()))';
  execute 'drop policy if exists own on public.wear_log_items';
  execute 'create policy own on public.wear_log_items for all
           using (exists (select 1 from public.wear_logs l where l.id = wear_log_id and l.user_id = auth.uid()))
           with check (exists (select 1 from public.wear_logs l where l.id = wear_log_id and l.user_id = auth.uid())
                   and exists (select 1 from public.wardrobe_items w where w.id = wardrobe_item_id and w.user_id = auth.uid()))';
end $$;

-- ── Storage: private bucket, one folder per user ────────────────
insert into storage.buckets (id, name, public)
values ('wardrobe', 'wardrobe', false)
on conflict (id) do nothing;

drop policy if exists "wardrobe own read"   on storage.objects;
drop policy if exists "wardrobe own write"  on storage.objects;
drop policy if exists "wardrobe own update" on storage.objects;
drop policy if exists "wardrobe own delete" on storage.objects;
create policy "wardrobe own read"   on storage.objects for select using (bucket_id = 'wardrobe' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "wardrobe own write"  on storage.objects for insert with check (bucket_id = 'wardrobe' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "wardrobe own update" on storage.objects for update using (bucket_id = 'wardrobe' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "wardrobe own delete" on storage.objects for delete using (bucket_id = 'wardrobe' and (storage.foldername(name))[1] = auth.uid()::text);

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
