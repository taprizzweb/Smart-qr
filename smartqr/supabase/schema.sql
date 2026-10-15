-- Smart QR: shop pages + admin panel backend (Supabase / Postgres)
-- Every object is prefixed sq_ so it can share a project with other apps (the older spin/scratch product uses tq_).
-- All access goes through the sq_* functions. Tables have RLS on and no policies, so the public (anon) key
-- cannot read or write them directly.
--
-- One-time setup after running this file (use a long random secret, keep it private):
--   insert into public.sq_settings(key, value)
--   values ('admin_hash', encode(sha256(convert_to('YOUR-LONG-ADMIN-KEY','utf8')),'hex'))
--   on conflict (key) do update set value = excluded.value;

-- ---------------------------------------------------------------- tables
create table if not exists public.sq_settings (
  key   text primary key,
  value text not null
);

create table if not exists public.sq_shops (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique
              check (slug ~ '^[a-z0-9-]{2,40}$' and slug not in ('admin', 'assets', 'vendor', 'icons', 'api', 'config', 'p', 'sw')),
  name        text not null check (length(name) between 1 and 80),
  address     text check (length(address) <= 160),
  color       text not null default '#2563eb' check (color ~ '^#[0-9a-fA-F]{6}$'),
  logo        text check (logo is null or (length(logo) <= 400000 and logo ~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$')),
  logo_thumb  text check (logo_thumb is null or (length(logo_thumb) <= 20000 and logo_thumb ~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$')),
  review_url  text check (review_url is null or review_url ~ '^https://'),
  map_url     text check (map_url is null or map_url ~ '^https://'),
  whatsapp    text check (whatsapp is null or whatsapp ~ '^[0-9]{8,15}$'),
  instagram   text check (instagram is null or instagram ~ '^https://'),
  website     text check (website is null or website ~ '^https://'),
  zomato      text check (zomato is null or zomato ~ '^https://'),
  buttons     jsonb not null default '[]'::jsonb check (jsonb_typeof(buttons) = 'array' and jsonb_array_length(buttons) <= 6),
  game_on     boolean not null default true,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Counts only: no names, no phones, no device ids.
create table if not exists public.sq_events (
  id         bigserial primary key,
  shop_id    uuid not null references public.sq_shops(id) on delete cascade,
  kind       text not null check (kind in ('view', 'review', 'map', 'whatsapp', 'instagram', 'website', 'zomato', 'game', 'b0', 'b1', 'b2', 'b3', 'b4', 'b5')),
  created_at timestamptz not null default now()
);
create index if not exists sq_events_shop_time on public.sq_events (shop_id, created_at desc);

-- Upgrade path for databases created before the website / extra buttons existed (safe to re-run).
alter table public.sq_shops add column if not exists website text check (website is null or website ~ '^https://');
alter table public.sq_shops add column if not exists zomato text check (zomato is null or zomato ~ '^https://');
alter table public.sq_shops add column if not exists buttons jsonb not null default '[]'::jsonb
  check (jsonb_typeof(buttons) = 'array' and jsonb_array_length(buttons) <= 6);
alter table public.sq_events drop constraint if exists sq_events_kind_check;
alter table public.sq_events add constraint sq_events_kind_check
  check (kind in ('view', 'review', 'map', 'whatsapp', 'instagram', 'website', 'zomato', 'game', 'b0', 'b1', 'b2', 'b3', 'b4', 'b5'));

-- Permanent QR links: <your-domain>/sq/<code>. The printed QR never changes; the destination can be changed any time.
-- Counts only (how many times it was opened), no visitor data.
create table if not exists public.sq_links (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique check (code ~ '^[a-z0-9-]{3,40}$'),
  label       text check (length(label) <= 80),
  target      text check (target is null or (target ~ '^https://[^[:space:]]+$' and length(target) <= 1000)),
  shop_slug   text check (shop_slug is null or shop_slug ~ '^[a-z0-9-]{2,40}$'),
  active      boolean not null default true,
  clicks      bigint not null default 0,
  last_opened timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check ((target is not null) <> (shop_slug is not null))
);

-- 'sq' is reserved so a shop page can never collide with the /sq/ links.
alter table public.sq_shops drop constraint if exists sq_shops_slug_check;
alter table public.sq_shops add constraint sq_shops_slug_check
  check (slug ~ '^[a-z0-9-]{2,40}$' and slug not in ('admin', 'assets', 'vendor', 'icons', 'api', 'config', 'p', 'sw', 'sq'));

alter table public.sq_settings enable row level security;
alter table public.sq_shops    enable row level security;
alter table public.sq_events   enable row level security;
alter table public.sq_links    enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.sq_settings, public.sq_shops, public.sq_events, public.sq_links from anon;
    revoke all on sequence public.sq_events_id_seq from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on public.sq_settings, public.sq_shops, public.sq_events, public.sq_links from authenticated;
    revoke all on sequence public.sq_events_id_seq from authenticated;
  end if;
end $$;

-- ---------------------------------------------------------------- internal helpers (not exposed)
create or replace function public.sq_hash(t text) returns text
language sql immutable as $$ select encode(sha256(convert_to(coalesce(t, ''), 'utf8')), 'hex') $$;

-- Wrong key = a short pause (slows guessing) and a refusal.
create or replace function public.sq_require_admin(p_key text) returns void
language plpgsql volatile as $$
declare h text;
begin
  select value into h from public.sq_settings where key = 'admin_hash';
  if h is null or h <> sq_hash(p_key) then
    perform pg_sleep(0.6);
    raise exception 'forbidden';
  end if;
end $$;

-- Extra buttons: [{label, kind: link|call|email, value}], at most 6. Cleans and validates; raises 'bad_buttons'.
create or replace function public.sq_clean_buttons(p jsonb) returns jsonb
language plpgsql immutable as $$
declare b jsonb; out jsonb := '[]'::jsonb; lbl text; kd text; v text;
begin
  if p is null or jsonb_typeof(p) <> 'array' then raise exception 'bad_buttons'; end if;
  if jsonb_array_length(p) > 6 then raise exception 'bad_buttons'; end if;
  for b in select * from jsonb_array_elements(p) loop
    lbl := trim(coalesce(b ->> 'label', '')); kd := coalesce(b ->> 'kind', ''); v := trim(coalesce(b ->> 'value', ''));
    if length(lbl) < 1 or length(lbl) > 28 then raise exception 'bad_buttons'; end if;
    if kd = 'link' then
      if v !~ '^https://[^[:space:]]+$' or length(v) > 500 then raise exception 'bad_buttons'; end if;
    elsif kd = 'call' then
      v := regexp_replace(v, '\D', '', 'g');
      if v !~ '^[0-9]{8,15}$' then raise exception 'bad_buttons'; end if;
    elsif kd = 'email' then
      if v !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or length(v) > 120 then raise exception 'bad_buttons'; end if;
    else raise exception 'bad_buttons';
    end if;
    out := out || jsonb_build_array(jsonb_build_object('label', lbl, 'kind', kd, 'value', v));
  end loop;
  return out;
end $$;

create or replace function public.sq_shop_json(s public.sq_shops, with_logo boolean) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'slug', s.slug, 'name', s.name, 'address', s.address, 'color', s.color,
    'reviewUrl', s.review_url, 'mapUrl', s.map_url, 'whatsapp', s.whatsapp, 'instagram', s.instagram,
    'website', s.website, 'zomato', s.zomato, 'buttons', s.buttons,
    'gameOn', s.game_on, 'active', s.active, 'updatedAt', s.updated_at
  ) || case when with_logo then jsonb_build_object('logo', s.logo) else jsonb_build_object('logoThumb', s.logo_thumb) end
$$;

-- ---------------------------------------------------------------- public API (the shop page)
create or replace function public.sq_get_shop(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_catalog as $$
declare s public.sq_shops;
begin
  select * into s from public.sq_shops where slug = lower(coalesce(p_slug, ''));
  if not found then return null; end if;
  return sq_shop_json(s, true) - 'updatedAt';
end $$;

create or replace function public.sq_log(p_slug text, p_kind text) returns void
language plpgsql volatile security definer set search_path = public, pg_catalog as $$
declare sid uuid;
begin
  if p_kind not in ('view', 'review', 'map', 'whatsapp', 'instagram', 'website', 'zomato', 'game', 'b0', 'b1', 'b2', 'b3', 'b4', 'b5') then return; end if;
  select id into sid from public.sq_shops where slug = lower(coalesce(p_slug, '')) and active;
  if sid is not null then insert into public.sq_events (shop_id, kind) values (sid, p_kind); end if;
end $$;

-- ---------------------------------------------------------------- admin API (admin key)
create or replace function public.sq_admin_list(p_key text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_catalog as $$
begin
  perform sq_require_admin(p_key);
  return (select coalesce(jsonb_agg(
      sq_shop_json(s, false) || jsonb_build_object(
        'views30', (select count(*) from public.sq_events e where e.shop_id = s.id and e.kind = 'view' and e.created_at > now() - interval '30 days'))
      order by s.created_at desc), '[]'::jsonb)
    from public.sq_shops s);
end $$;

create or replace function public.sq_admin_get(p_key text, p_slug text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_catalog as $$
declare s public.sq_shops;
begin
  perform sq_require_admin(p_key);
  select * into s from public.sq_shops where slug = lower(coalesce(p_slug, ''));
  if not found then raise exception 'shop_not_found'; end if;
  return sq_shop_json(s, true);
end $$;

-- Create or update by slug. The slug itself never changes after creation (it is printed in the QR).
-- A key that is absent keeps the old value; "logo": null removes the logo.
create or replace function public.sq_admin_save(p_key text, p_shop jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_catalog as $$
declare
  k text := lower(coalesce(p_shop ->> 'slug', '')); s public.sq_shops; created boolean := false;
  nm text := nullif(trim(coalesce(p_shop ->> 'name', '')), '');
  qr text := lower(nullif(trim(coalesce(p_shop ->> 'qrCode', '')), ''));
begin
  perform sq_require_admin(p_key);
  if qr is not null and qr !~ '^[a-z0-9-]{3,40}$' then raise exception 'code_check'; end if;
  if qr is not null and exists (select 1 from public.sq_links where code = qr) then raise exception 'code_taken'; end if;
  select * into s from public.sq_shops where slug = k;

  if not found then
    if nm is null then raise exception 'name_required'; end if;
    insert into public.sq_shops (slug, name) values (k, nm) returning * into s;
    created := true;
  end if;

  update public.sq_shops set
    name       = coalesce(nm, name),
    address    = case when p_shop ? 'address'   then nullif(trim(p_shop ->> 'address'), '')   else address end,
    color      = case when p_shop ? 'color'     then coalesce(nullif(p_shop ->> 'color', ''), color) else color end,
    logo       = case when p_shop ? 'logo'      then nullif(p_shop ->> 'logo', '')            else logo end,
    logo_thumb = case when p_shop ? 'logoThumb' then nullif(p_shop ->> 'logoThumb', '')       else logo_thumb end,
    review_url = case when p_shop ? 'reviewUrl' then nullif(trim(p_shop ->> 'reviewUrl'), '') else review_url end,
    map_url    = case when p_shop ? 'mapUrl'    then nullif(trim(p_shop ->> 'mapUrl'), '')    else map_url end,
    whatsapp   = case when p_shop ? 'whatsapp'  then nullif(regexp_replace(coalesce(p_shop ->> 'whatsapp', ''), '\D', '', 'g'), '') else whatsapp end,
    instagram  = case when p_shop ? 'instagram' then nullif(trim(p_shop ->> 'instagram'), '') else instagram end,
    website    = case when p_shop ? 'website'   then nullif(trim(p_shop ->> 'website'), '')   else website end,
    zomato     = case when p_shop ? 'zomato'    then nullif(trim(p_shop ->> 'zomato'), '')    else zomato end,
    buttons    = case when p_shop ? 'buttons'   then sq_clean_buttons(p_shop -> 'buttons')    else buttons end,
    game_on    = case when p_shop ? 'gameOn'    then (p_shop ->> 'gameOn')::boolean           else game_on end,
    active     = case when p_shop ? 'active'    then (p_shop ->> 'active')::boolean           else active end,
    updated_at = now()
  where id = s.id;

  -- Optional: give this business a permanent QR number (<domain>/sq/<number>) in the same step.
  -- If the number is taken, the whole save is cancelled, so a shop is never half-created.
  if qr is not null then
    insert into public.sq_links (code, shop_slug) values (qr, k);
  end if;

  return jsonb_build_object('created', created, 'slug', k, 'qrCode', qr);
end $$;

create or replace function public.sq_admin_delete(p_key text, p_slug text) returns void
language plpgsql volatile security definer set search_path = public, pg_catalog as $$
begin
  perform sq_require_admin(p_key);
  delete from public.sq_shops where slug = lower(coalesce(p_slug, ''));
  if not found then raise exception 'shop_not_found'; end if;
end $$;

create or replace function public.sq_admin_stats(p_key text, p_slug text, p_days int default 30) returns jsonb
language plpgsql stable security definer set search_path = public, pg_catalog as $$
declare s public.sq_shops; d int := least(greatest(coalesce(p_days, 30), 1), 365); since timestamptz;
begin
  perform sq_require_admin(p_key);
  select * into s from public.sq_shops where slug = lower(coalesce(p_slug, ''));
  if not found then raise exception 'shop_not_found'; end if;
  since := now() - make_interval(days => d);
  return jsonb_build_object(
    'days', d,
    'counts', (select coalesce(jsonb_object_agg(kind, n), '{}'::jsonb) from (
                 select kind, count(*) n from public.sq_events where shop_id = s.id and created_at >= since group by kind) t),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object('d', to_char(g, 'YYYY-MM-DD'),
                'views', (select count(*) from public.sq_events e where e.shop_id = s.id and e.kind = 'view' and e.created_at::date = g)) order by g), '[]'::jsonb)
              from generate_series(current_date - 13, current_date, interval '1 day') g)
  );
end $$;

-- Dashboard: totals across every shop for the last p_days days.
create or replace function public.sq_admin_overview(p_key text, p_days int default 30) returns jsonb
language plpgsql stable security definer set search_path = public, pg_catalog as $$
declare d int := least(greatest(coalesce(p_days, 30), 1), 365); since timestamptz;
begin
  perform sq_require_admin(p_key);
  since := now() - make_interval(days => d);
  return jsonb_build_object(
    'days', d,
    'shops', (select count(*) from public.sq_shops),
    'live', (select count(*) from public.sq_shops where active),
    'counts', (select coalesce(jsonb_object_agg(kind, n), '{}'::jsonb) from (
                 select case when kind ~ '^b[0-9]$' then 'custom' else kind end as kind, count(*) n
                 from public.sq_events where created_at >= since group by 1) t),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object('d', to_char(g, 'YYYY-MM-DD'),
                'views', (select count(*) from public.sq_events e where e.kind = 'view' and e.created_at::date = g)) order by g), '[]'::jsonb)
              from generate_series(current_date - 13, current_date, interval '1 day') g),
    'top', (select coalesce(jsonb_agg(t order by t.views desc, t.name), '[]'::jsonb) from (
              select s.slug, s.name, s.active,
                     count(*) filter (where e.kind = 'view') as views,
                     count(*) filter (where e.kind <> 'view') as taps
              from public.sq_shops s left join public.sq_events e on e.shop_id = s.id and e.created_at >= since
              group by s.id order by views desc, s.name limit 5) t)
  );
end $$;

-- ---------------------------------------------------------------- QR links
-- Public: what does /sq/<code> open? Returns {"target": "https://..."} or {"shop": "slug"}, or null when unknown or paused.
-- Counts one open. No visitor data is stored.
create or replace function public.sq_resolve(p_code text) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_catalog as $$
declare l public.sq_links;
begin
  select * into l from public.sq_links where code = lower(coalesce(p_code, '')) and active;
  if not found then return null; end if;
  update public.sq_links set clicks = clicks + 1, last_opened = now() where id = l.id;
  if l.target is not null then return jsonb_build_object('target', l.target); end if;
  return jsonb_build_object('shop', l.shop_slug);
end $$;

create or replace function public.sq_link_json(l public.sq_links) returns jsonb
language sql stable set search_path = public, pg_catalog as $$
  select jsonb_build_object(
    'code', l.code, 'label', l.label, 'target', l.target, 'shopSlug', l.shop_slug,
    'shopName', (select name from public.sq_shops where slug = l.shop_slug),
    'active', l.active, 'clicks', l.clicks, 'lastOpened', l.last_opened, 'createdAt', l.created_at)
$$;

create or replace function public.sq_admin_links(p_key text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_catalog as $$
begin
  perform sq_require_admin(p_key);
  return (select coalesce(jsonb_agg(sq_link_json(l) order by l.created_at desc), '[]'::jsonb) from public.sq_links l);
end $$;

create or replace function public.sq_admin_link_get(p_key text, p_code text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_catalog as $$
declare l public.sq_links;
begin
  perform sq_require_admin(p_key);
  select * into l from public.sq_links where code = lower(coalesce(p_code, ''));
  if not found then raise exception 'link_not_found'; end if;
  return sq_link_json(l);
end $$;

-- Create (with "create": true, refuses an existing code) or update by code. The code never changes after creation.
-- "target" (any https link) and "shopSlug" (one of your shop pages) are alternatives: setting one clears the other.
create or replace function public.sq_admin_link_save(p_key text, p_link jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_catalog as $$
declare
  k text := lower(coalesce(p_link ->> 'code', '')); l public.sq_links; created boolean := false;
  tg text := nullif(trim(coalesce(p_link ->> 'target', '')), '');
  sh text := lower(nullif(trim(coalesce(p_link ->> 'shopSlug', '')), ''));
begin
  perform sq_require_admin(p_key);
  if k !~ '^[a-z0-9-]{3,40}$' then raise exception 'code_check'; end if;
  if tg is not null and sh is not null then raise exception 'destination_required'; end if;
  if sh is not null and not exists (select 1 from public.sq_shops where slug = sh) then raise exception 'shop_not_found'; end if;
  select * into l from public.sq_links where code = k;

  if not found then
    if tg is null and sh is null then raise exception 'destination_required'; end if;
    insert into public.sq_links (code, target, shop_slug) values (k, tg, sh) returning * into l;
    created := true;
  elsif coalesce((p_link ->> 'create')::boolean, false) then
    raise exception 'code_taken';
  end if;

  update public.sq_links set
    label     = case when p_link ? 'label'  then nullif(trim(p_link ->> 'label'), '') else label end,
    target    = case when tg is not null then tg when sh is not null then null else target end,
    shop_slug = case when sh is not null then sh when tg is not null then null else shop_slug end,
    active    = case when p_link ? 'active' then (p_link ->> 'active')::boolean else active end,
    updated_at = now()
  where id = l.id;

  return jsonb_build_object('created', created, 'code', k);
end $$;

create or replace function public.sq_admin_link_delete(p_key text, p_code text) returns void
language plpgsql volatile security definer set search_path = public, pg_catalog as $$
begin
  perform sq_require_admin(p_key);
  delete from public.sq_links where code = lower(coalesce(p_code, ''));
  if not found then raise exception 'link_not_found'; end if;
end $$;

-- ---------------------------------------------------------------- grants: only the public API is callable
do $$
declare f text;
begin
  for f in
    select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'sq\_%'
  loop
    execute format('revoke all on function %s from public', f);
    -- Supabase grants new functions to its API roles by default; take that back for everything, then grant only the public API below.
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on function %s from anon, authenticated', f);
    end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    grant execute on function
      public.sq_get_shop(text),
      public.sq_log(text, text),
      public.sq_admin_list(text),
      public.sq_admin_get(text, text),
      public.sq_admin_save(text, jsonb),
      public.sq_admin_delete(text, text),
      public.sq_admin_stats(text, text, int),
      public.sq_admin_overview(text, int),
      public.sq_resolve(text),
      public.sq_admin_links(text),
      public.sq_admin_link_get(text, text),
      public.sq_admin_link_save(text, jsonb),
      public.sq_admin_link_delete(text, text)
    to anon, authenticated;
  end if;
end $$;
