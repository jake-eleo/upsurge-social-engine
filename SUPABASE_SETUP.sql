-- ============================================================================
-- UpSurge Social Engine — Supabase setup
-- ----------------------------------------------------------------------------
-- Run this in the Supabase SQL Editor for your NEW UpSurge project.
-- It creates the 3 tables the app reads/writes plus permissive RLS policies,
-- seeds the brand config, and creates the storage bucket (see bottom).
-- ============================================================================

-- Needed for gen_random_uuid()
create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- 1) upsurge_posts — every scheduled/draft/generated social post
--    Columns inferred from how the app reads/writes posts (loadPosts + upserts).
-- ----------------------------------------------------------------------------
create table if not exists public.upsurge_posts (
  id               text primary key,           -- client-generated id (e.g. "1717000000_ab12c")
  date             timestamptz not null,        -- scheduled date/time
  platform         text,                        -- instagram | facebook | linkedin | tiktok
  pillar           text,                        -- education | social_proof | lifestyle | offer
  status           text default 'draft',        -- draft | pending | scheduled | posted | rejected
  caption          text,
  hashtags         text,
  hook             text,
  suggested_image  text,                        -- "ASSET_ID + scene description"
  suggested_format text default 'static',       -- static | carousel | reel | story
  image_url        text,                        -- generated/overlaid image or video URL
  image_type       text,                        -- image | carousel | video
  carousel_urls    jsonb,                       -- array of slide URLs for carousels
  cover_url        text,                        -- branded reel cover thumbnail
  voiceover_script text,                        -- reel narration script
  score            integer,                     -- 1-5 performance rating
  reject_note      text,                        -- why a post was rejected
  updated_at       timestamptz default now()
);

-- ----------------------------------------------------------------------------
-- 2) upsurge_brand_config — single-row dynamic brand/offer config
--    (Static brand identity lives in brand.config.js; these are the editable
--     offer/promo fields surfaced in the Brand Configuration tab.)
--    NOTE: column names are kept stable (doctor_name, clinic_tagline,
--    active_protocols) so existing code works — they are repurposed for UpSurge.
-- ----------------------------------------------------------------------------
create table if not exists public.upsurge_brand_config (
  id               uuid primary key default gen_random_uuid(),
  primary_offer    text,
  primary_cta      text,
  current_promo    text,
  booking_link     text,   -- shop link
  active_protocols text,   -- repurposed: featured product categories
  target_city      text,
  doctor_name      text,   -- repurposed: optional brand-voice note (no doctor persona)
  clinic_tagline   text,   -- repurposed: brand tagline
  updated_at       timestamptz default now()
);

-- ----------------------------------------------------------------------------
-- 3) upsurge_brand_assets — product/logo reference images for image-to-image
--    Columns inferred from loadBrandAssets() + /api/upload-asset.
-- ----------------------------------------------------------------------------
create table if not exists public.upsurge_brand_assets (
  id                 text primary key,          -- asset id used in suggestedImage (e.g. UPFUEL_PRODUCT)
  name               text,
  image_url          text,                      -- public URL in the upsurge-assets bucket
  description        text,
  media_type         text default 'image/png',
  usage_tags         jsonb,                     -- array of tags
  usage_notes        text,
  visual_description text,
  updated_at         timestamptz default now()
);

-- ----------------------------------------------------------------------------
-- Row Level Security
-- ----------------------------------------------------------------------------
-- The app authenticates users via Supabase Auth and uses the anon key on the
-- client. These policies are PERMISSIVE (any authenticated user has full
-- access) — appropriate for a private internal tool. Tighten if you add
-- multi-tenant users.
alter table public.upsurge_posts        enable row level security;
alter table public.upsurge_brand_config enable row level security;
alter table public.upsurge_brand_assets enable row level security;

create policy "authenticated full access - posts"
  on public.upsurge_posts        for all to authenticated using (true) with check (true);
create policy "authenticated full access - brand_config"
  on public.upsurge_brand_config for all to authenticated using (true) with check (true);
create policy "authenticated full access - brand_assets"
  on public.upsurge_brand_assets for all to authenticated using (true) with check (true);

-- ----------------------------------------------------------------------------
-- Seed: one default brand-config row with UpSurge values
-- ----------------------------------------------------------------------------
insert into public.upsurge_brand_config
  (primary_offer, primary_cta, current_promo, booking_link, active_protocols, target_city, doctor_name, clinic_tagline)
values
  ('Free shipping on orders over $100',
   'Shop now at https://upsurgesupps.com/collections/all',
   '',
   'https://upsurgesupps.com/collections/all',
   'Pre/Intra Workout, Weight Loss / Fat Burners, Overall Health, Bundles',
   '',
   '',
   'Fuel Your Fitness Goals');

-- ============================================================================
-- STORAGE BUCKET  (create via Dashboard → Storage, or the SQL below)
-- ----------------------------------------------------------------------------
-- Create a PUBLIC bucket named exactly:  upsurge-assets
-- The app reads/writes brand assets, generated images, and reel covers here,
-- and serves them through /api/media/<path>.
--
-- Dashboard: Storage → New bucket → name "upsurge-assets" → toggle "Public".
--
-- Or via SQL:
insert into storage.buckets (id, name, public)
values ('upsurge-assets', 'upsurge-assets', true)
on conflict (id) do nothing;

-- Allow public reads + authenticated writes on the bucket:
create policy "public read upsurge-assets"
  on storage.objects for select
  using (bucket_id = 'upsurge-assets');
create policy "authenticated write upsurge-assets"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'upsurge-assets');
create policy "authenticated update upsurge-assets"
  on storage.objects for update to authenticated
  using (bucket_id = 'upsurge-assets');
-- ============================================================================
