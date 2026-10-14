-- Taprizz Crazy Deal backend (Supabase / Postgres)
-- Every object is prefixed tq_ so it can safely share a project with other apps.
-- All access goes through the tq_* functions below. Tables have RLS on and no policies,
-- so the public (anon) key cannot read or write them directly.
--
-- One-time setup after running this file (replace the secret with a long random one and keep it private):
--   insert into public.tq_settings(key, value)
--   values ('master_hash', encode(sha256(convert_to('YOUR-LONG-ADMIN-SECRET','utf8')),'hex'))
--   on conflict (key) do update set value = excluded.value;

-- ---------------------------------------------------------------- tables
create table if not exists public.tq_settings (
  key   text primary key,
  value text not null
);

create table if not exists public.tq_stores (
  id                uuid primary key default gen_random_uuid(),
  key               text not null unique check (key ~ '^[a-z0-9-]{2,30}$'),
  code              text not null unique check (code ~ '^[A-Z0-9]{3,8}$'),
  name              text not null check (length(name) between 1 and 80),
  branch            text not null check (length(branch) between 1 and 120),
  tagline           text check (length(tagline) <= 120),
  color             text not null default '#e11d48' check (color ~ '^#[0-9a-fA-F]{6}$'),
  game              text not null default 'wheel' check (game in ('wheel', 'scratch')),
  valid_days        int  not null default 30 check (valid_days between 1 and 365),
  cooldown_hours    int  not null default 24 check (cooldown_hours between 0 and 720),
  blank_message     text not null default 'Better luck next time' check (length(blank_message) <= 80),
  min_purchase_note text not null default 'Redeem it on your next visit' check (length(min_purchase_note) <= 80),
  collect_lead      boolean not null default true,
  whatsapp          text check (whatsapp ~ '^[0-9]{8,15}$'),
  instagram         text check (instagram ~ '^https://'),
  google_review_url text check (google_review_url ~ '^https://'),
  ai_review_url     text check (ai_review_url ~ '^https://'),
  prizes            jsonb not null check (jsonb_typeof(prizes) = 'array' and jsonb_array_length(prizes) = 4),
  active            boolean not null default true,
  owner_token_hash  text not null,
  created_at        timestamptz not null default now()
);

create table if not exists public.tq_plays (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references public.tq_stores(id) on delete cascade,
  created_at  timestamptz not null default now(),
  game        text not null,
  name        text,
  phone       text,
  phone_key   text,            -- last 10 digits, used for "one play per phone"
  device      text,            -- random per-browser id, used when no phone is collected
  prize_idx   int  not null,
  result      text not null,   -- deal text, or '' for a blank slot
  is_win      boolean not null,
  code        text unique,
  valid_until timestamptz,
  redeemed_at timestamptz
);
create index if not exists tq_plays_store_time on public.tq_plays (store_id, created_at desc);
create index if not exists tq_plays_phone on public.tq_plays (store_id, phone_key);
create index if not exists tq_plays_device on public.tq_plays (store_id, device);

create table if not exists public.tq_events (
  id         bigserial primary key,
  store_id   uuid not null references public.tq_stores(id) on delete cascade,
  kind       text not null check (kind in ('review', 'instagram', 'whatsapp')),
  created_at timestamptz not null default now()
);
create index if not exists tq_events_store_time on public.tq_events (store_id, created_at desc);

-- Reports from the AI review bot land here (see docs/review-bot.md)
create table if not exists public.tq_reviews (
  id         uuid primary key default gen_random_uuid(),
  store_id   uuid not null references public.tq_stores(id) on delete cascade,
  created_at timestamptz not null default now(),
  rating     int  not null check (rating between 1 and 5),
  review     text check (length(review) <= 2000),
  reviewer   text check (length(reviewer) <= 80),
  source     text not null default 'ai-bot'
);
create index if not exists tq_reviews_store_time on public.tq_reviews (store_id, created_at desc);

alter table public.tq_settings enable row level security;
alter table public.tq_stores   enable row level security;
alter table public.tq_plays    enable row level security;
alter table public.tq_events   enable row level security;
alter table public.tq_reviews  enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.tq_settings, public.tq_stores, public.tq_plays, public.tq_events, public.tq_reviews from anon;
    revoke all on sequence public.tq_events_id_seq from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on public.tq_settings, public.tq_stores, public.tq_plays, public.tq_events, public.tq_reviews from authenticated;
    revoke all on sequence public.tq_events_id_seq from authenticated;
  end if;
end $$;

-- ---------------------------------------------------------------- internal helpers (not exposed)
create or replace function public.tq_hash(t text) returns text
language sql immutable as $$ select encode(sha256(convert_to(coalesce(t, ''), 'utf8')), 'hex') $$;

-- Uniform [0,1) from the OS secure random source (gen_random_uuid)
create or replace function public.tq_rand() returns double precision
language sql volatile as $$
  select (('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))::bit(32)::bigint)::double precision / 4294967296.0
$$;

create or replace function public.tq_pick(p_prizes jsonb) returns int
language plpgsql volatile as $$
declare
  n int := jsonb_array_length(p_prizes);
  total numeric := 0; roll numeric; w numeric; i int; last_pos int := n - 1;
begin
  for i in 0 .. n - 1 loop
    w := greatest(0, coalesce((p_prizes -> i ->> 'weight')::numeric, 0));
    total := total + w;
    if w > 0 then last_pos := i; end if;
  end loop;
  if total <= 0 then return floor(tq_rand() * n)::int; end if;
  roll := tq_rand() * total;
  for i in 0 .. n - 1 loop
    w := greatest(0, coalesce((p_prizes -> i ->> 'weight')::numeric, 0));
    if roll < w then return i; end if;
    roll := roll - w;
  end loop;
  return last_pos;
end $$;

create or replace function public.tq_code(p_prefix text) returns text
language plpgsql volatile as $$
declare alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; s text := ''; i int;
begin
  for i in 1 .. 6 loop s := s || substr(alphabet, 1 + floor(tq_rand() * 32)::int, 1); end loop;
  return p_prefix || '-' || s;
end $$;

-- Validates and normalises exactly 4 slots: [{label, short, weight}]
create or replace function public.tq_clean_prizes(p jsonb) returns jsonb
language plpgsql immutable as $$
declare out jsonb := '[]'::jsonb; e jsonb; lbl text; sh text; w numeric; real_slot boolean := false;
begin
  if p is null or jsonb_typeof(p) <> 'array' or jsonb_array_length(p) <> 4 then
    raise exception 'prizes_must_have_4_slots';
  end if;
  for e in select * from jsonb_array_elements(p) loop
    lbl := trim(coalesce(e ->> 'label', ''));
    sh  := trim(coalesce(e ->> 'short', ''));
    if length(lbl) > 60 then raise exception 'deal_text_too_long'; end if;
    if length(sh) > 14 then raise exception 'wheel_text_too_long'; end if;
    begin
      w := coalesce((e ->> 'weight')::numeric, 0);
    exception when others then raise exception 'weight_invalid';
    end;
    if w < 0 or w > 1000 then raise exception 'weight_invalid'; end if;
    if lbl <> '' and w > 0 then real_slot := true; end if;
    out := out || jsonb_build_array(jsonb_build_object('label', lbl, 'short', sh, 'weight', w));
  end loop;
  if not real_slot then raise exception 'need_one_real_deal'; end if;
  return out;
end $$;

create or replace function public.tq_owner_store(p_key text, p_token text) returns public.tq_stores
language plpgsql stable as $$
declare s public.tq_stores;
begin
  select * into s from public.tq_stores where key = lower(coalesce(p_key, ''));
  if not found or s.owner_token_hash <> tq_hash(p_token) then raise exception 'invalid_token'; end if;
  return s;
end $$;

create or replace function public.tq_require_master(p_master text) returns void
language plpgsql stable as $$
declare h text;
begin
  select value into h from public.tq_settings where key = 'master_hash';
  if h is null or h <> tq_hash(p_master) then raise exception 'forbidden'; end if;
end $$;

create or replace function public.tq_play_json(s public.tq_stores, pl public.tq_plays, already boolean) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'idx', pl.prize_idx,
    'label', pl.result,
    'isWin', pl.is_win,
    'code', coalesce(pl.code, ''),
    'issued', (extract(epoch from pl.created_at) * 1000)::bigint,
    'validUntil', case when pl.valid_until is null then null else (extract(epoch from pl.valid_until) * 1000)::bigint end,
    'alreadyPlayed', already
  )
$$;

-- ---------------------------------------------------------------- public API (customer side)
create or replace function public.tq_get_store(p_key text) returns jsonb
language sql stable security definer set search_path = public, pg_catalog as $$
  select jsonb_build_object(
    'key', key, 'code', code, 'name', name, 'branch', branch, 'tagline', tagline, 'color', color,
    'game', game, 'validDays', valid_days, 'blankMessage', blank_message, 'minPurchaseNote', min_purchase_note,
    'collectLead', collect_lead, 'whatsapp', whatsapp, 'instagram', instagram,
    'googleReviewUrl', google_review_url, 'aiReviewUrl', ai_review_url, 'active', active,
    'prizes', (select jsonb_agg(jsonb_build_object('label', e ->> 'label', 'short', e ->> 'short') order by ord)
               from jsonb_array_elements(prizes) with ordinality as t(e, ord))
  )
  from public.tq_stores where key = lower(coalesce(p_key, ''))
$$;

create or replace function public.tq_play(p_key text, p_name text, p_phone text, p_device text)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_catalog as $$
declare
  s public.tq_stores; ex public.tq_plays; pl public.tq_plays;
  v_phone text; v_pkey text; v_dev text; idx int; lbl text; v_code text; tries int := 0;
begin
  select * into s from public.tq_stores where key = lower(coalesce(p_key, ''));
  if not found then raise exception 'store_not_found'; end if;
  if not s.active then raise exception 'store_paused'; end if;

  v_phone := nullif(regexp_replace(coalesce(p_phone, ''), '[\s-]', '', 'g'), '');
  v_dev   := nullif(left(coalesce(p_device, ''), 64), '');
  if s.collect_lead then
    if length(trim(coalesce(p_name, ''))) < 2 then raise exception 'name_required'; end if;
    if v_phone is null or v_phone !~ '^\+?[0-9]{10,14}$' then raise exception 'phone_invalid'; end if;
  elsif v_phone is not null and v_phone !~ '^\+?[0-9]{10,14}$' then
    v_phone := null;
  end if;
  v_pkey := case when v_phone is null then null else right(regexp_replace(v_phone, '\D', '', 'g'), 10) end;

  -- one play per phone (or per device when no phone), until the coupon expires / the blank cooldown ends
  select * into ex from public.tq_plays x
   where x.store_id = s.id
     and ((v_pkey is not null and x.phone_key = v_pkey) or (v_pkey is null and v_dev is not null and x.device = v_dev))
   order by x.created_at desc limit 1;
  if found and ((ex.is_win and ex.valid_until > now())
             or (not ex.is_win and ex.created_at + make_interval(hours => s.cooldown_hours) > now())) then
    return tq_play_json(s, ex, true);
  end if;

  idx := tq_pick(s.prizes);
  lbl := coalesce(s.prizes -> idx ->> 'label', '');

  loop
    begin
      v_code := case when lbl = '' then null else tq_code(s.code) end;
      insert into public.tq_plays (store_id, game, name, phone, phone_key, device, prize_idx, result, is_win, code, valid_until)
      values (s.id, s.game, left(trim(p_name), 80), v_phone, v_pkey, v_dev, idx, lbl, lbl <> '', v_code,
              case when lbl = '' then null else now() + make_interval(days => s.valid_days) end)
      returning * into pl;
      exit;
    exception when unique_violation then
      tries := tries + 1;
      if tries > 5 then raise; end if;
    end;
  end loop;

  return tq_play_json(s, pl, false);
end $$;

create or replace function public.tq_log_event(p_key text, p_kind text) returns void
language plpgsql volatile security definer set search_path = public, pg_catalog as $$
declare sid uuid;
begin
  if p_kind not in ('review', 'instagram', 'whatsapp') then return; end if;
  select id into sid from public.tq_stores where key = lower(coalesce(p_key, ''));
  if sid is not null then insert into public.tq_events (store_id, kind) values (sid, p_kind); end if;
end $$;

-- Called by the AI review bot when a review is generated / posted
create or replace function public.tq_log_review(p_key text, p_rating int, p_review text, p_reviewer text)
returns void language plpgsql volatile security definer set search_path = public, pg_catalog as $$
declare sid uuid;
begin
  if p_rating is null or p_rating < 1 or p_rating > 5 then raise exception 'rating_invalid'; end if;
  select id into sid from public.tq_stores where key = lower(coalesce(p_key, ''));
  if sid is null then raise exception 'store_not_found'; end if;
  insert into public.tq_reviews (store_id, rating, review, reviewer)
  values (sid, p_rating, left(p_review, 2000), left(p_reviewer, 80));
end $$;

-- ---------------------------------------------------------------- owner API (secret link)
create or replace function public.tq_owner_dashboard(p_key text, p_token text, p_days int default 30)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $$
declare s public.tq_stores; since timestamptz; d int := least(greatest(coalesce(p_days, 30), 1), 365);
begin
  s := tq_owner_store(p_key, p_token);
  since := now() - make_interval(days => d);
  return jsonb_build_object(
    'store', jsonb_build_object('key', s.key, 'name', s.name, 'branch', s.branch, 'game', s.game, 'active', s.active,
                                'validDays', s.valid_days, 'prizes', s.prizes),
    'days', d,
    'stats', jsonb_build_object(
      'plays',    (select count(*) from public.tq_plays where store_id = s.id and created_at >= since),
      'wins',     (select count(*) from public.tq_plays where store_id = s.id and created_at >= since and is_win),
      'redeemed', (select count(*) from public.tq_plays where store_id = s.id and created_at >= since and redeemed_at is not null),
      'leads',    (select count(distinct phone_key) from public.tq_plays where store_id = s.id and created_at >= since and phone_key is not null),
      'reviewTaps',    (select count(*) from public.tq_events where store_id = s.id and created_at >= since and kind = 'review'),
      'instagramTaps', (select count(*) from public.tq_events where store_id = s.id and created_at >= since and kind = 'instagram'),
      'whatsappTaps',  (select count(*) from public.tq_events where store_id = s.id and created_at >= since and kind = 'whatsapp'),
      'reviews',       (select count(*) from public.tq_reviews where store_id = s.id and created_at >= since),
      'avgRating',     (select round(avg(rating)::numeric, 1) from public.tq_reviews where store_id = s.id and created_at >= since)
    ),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object('d', to_char(g, 'YYYY-MM-DD'),
                'plays', (select count(*) from public.tq_plays p where p.store_id = s.id and p.created_at::date = g)) order by g), '[]'::jsonb)
              from generate_series(current_date - 13, current_date, interval '1 day') g),
    'plays', (select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) from (
                select created_at as time, name, phone, result, is_win as "isWin", code, valid_until as "validUntil", redeemed_at as "redeemedAt"
                from public.tq_plays where store_id = s.id order by created_at desc limit 300) t),
    'reviews', (select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) from (
                select created_at as time, rating, review, reviewer
                from public.tq_reviews where store_id = s.id order by created_at desc limit 100) t)
  );
end $$;

create or replace function public.tq_owner_update(p_key text, p_token text, p_prizes jsonb, p_active boolean, p_valid_days int)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_catalog as $$
declare s public.tq_stores;
begin
  s := tq_owner_store(p_key, p_token);
  if p_valid_days is null or p_valid_days < 1 or p_valid_days > 365 then raise exception 'valid_days_invalid'; end if;
  update public.tq_stores
     set prizes = tq_clean_prizes(p_prizes), active = coalesce(p_active, active), valid_days = p_valid_days
   where id = s.id;
  return jsonb_build_object('ok', true);
end $$;

-- Check a customer's coupon; with p_redeem = true it is marked as used (atomically, exactly once)
create or replace function public.tq_owner_verify(p_key text, p_token text, p_code text, p_redeem boolean default false)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_catalog as $$
declare s public.tq_stores; pl public.tq_plays; status text;
begin
  s := tq_owner_store(p_key, p_token);
  select * into pl from public.tq_plays where store_id = s.id and code = upper(trim(coalesce(p_code, '')));
  if not found then return jsonb_build_object('status', 'invalid'); end if;

  if pl.redeemed_at is not null then status := 'redeemed';
  elsif pl.valid_until < now() then status := 'expired';
  else
    status := 'valid';
    if p_redeem then
      update public.tq_plays set redeemed_at = now() where id = pl.id and redeemed_at is null returning * into pl;
      status := case when found then 'redeemed_now' else 'redeemed' end;
    end if;
  end if;

  return jsonb_build_object('status', status, 'result', pl.result, 'name', pl.name, 'phone', pl.phone,
                            'validUntil', pl.valid_until, 'redeemedAt', pl.redeemed_at);
end $$;

-- ---------------------------------------------------------------- admin API (master secret)
create or replace function public.tq_admin_upsert_store(p_master text, p_store jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_catalog as $$
declare
  k text := lower(coalesce(p_store ->> 'key', '')); s public.tq_stores; tok text;
  v_prizes jsonb := tq_clean_prizes(p_store -> 'prizes');
begin
  perform tq_require_master(p_master);
  select * into s from public.tq_stores where key = k;
  if found then
    update public.tq_stores set
      code = upper(coalesce(nullif(p_store ->> 'code', ''), code)),
      name = coalesce(nullif(p_store ->> 'name', ''), name),
      branch = coalesce(nullif(p_store ->> 'branch', ''), branch),
      tagline = nullif(p_store ->> 'tagline', ''),
      color = coalesce(nullif(p_store ->> 'color', ''), color),
      game = coalesce(nullif(p_store ->> 'game', ''), game),
      valid_days = coalesce((p_store ->> 'validDays')::int, valid_days),
      cooldown_hours = coalesce((p_store ->> 'cooldownHours')::int, cooldown_hours),
      blank_message = coalesce(nullif(p_store ->> 'blankMessage', ''), blank_message),
      collect_lead = coalesce((p_store ->> 'collectLead')::boolean, collect_lead),
      whatsapp = nullif(regexp_replace(coalesce(p_store ->> 'whatsapp', ''), '\D', '', 'g'), ''),
      instagram = nullif(p_store ->> 'instagram', ''),
      google_review_url = nullif(p_store ->> 'googleReviewUrl', ''),
      ai_review_url = nullif(p_store ->> 'aiReviewUrl', ''),
      prizes = v_prizes
    where id = s.id;
    return jsonb_build_object('created', false, 'key', k);
  end if;

  tok := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.tq_stores (key, code, name, branch, tagline, color, game, valid_days, cooldown_hours, blank_message,
                                collect_lead, whatsapp, instagram, google_review_url, ai_review_url, prizes, owner_token_hash)
  values (k, upper(coalesce(p_store ->> 'code', '')), p_store ->> 'name', p_store ->> 'branch',
          nullif(p_store ->> 'tagline', ''), coalesce(nullif(p_store ->> 'color', ''), '#e11d48'),
          coalesce(nullif(p_store ->> 'game', ''), 'wheel'), coalesce((p_store ->> 'validDays')::int, 30),
          coalesce((p_store ->> 'cooldownHours')::int, 24), coalesce(nullif(p_store ->> 'blankMessage', ''), 'Better luck next time'),
          coalesce((p_store ->> 'collectLead')::boolean, true),
          nullif(regexp_replace(coalesce(p_store ->> 'whatsapp', ''), '\D', '', 'g'), ''),
          nullif(p_store ->> 'instagram', ''), nullif(p_store ->> 'googleReviewUrl', ''), nullif(p_store ->> 'aiReviewUrl', ''),
          v_prizes, tq_hash(tok));
  return jsonb_build_object('created', true, 'key', k, 'ownerToken', tok);
end $$;

create or replace function public.tq_admin_list(p_master text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_catalog as $$
begin
  perform tq_require_master(p_master);
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'key', s.key, 'name', s.name, 'branch', s.branch, 'game', s.game, 'active', s.active,
      'plays', (select count(*) from public.tq_plays p where p.store_id = s.id),
      'reviews', (select count(*) from public.tq_reviews r where r.store_id = s.id)) order by s.created_at desc), '[]'::jsonb)
    from public.tq_stores s);
end $$;

create or replace function public.tq_admin_reset_token(p_master text, p_key text) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_catalog as $$
declare tok text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
begin
  perform tq_require_master(p_master);
  update public.tq_stores set owner_token_hash = tq_hash(tok) where key = lower(coalesce(p_key, ''));
  if not found then raise exception 'store_not_found'; end if;
  return jsonb_build_object('ownerToken', tok);
end $$;

-- ---------------------------------------------------------------- grants: only the public API is callable
do $$
declare f text;
begin
  for f in
    select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'tq\_%'
  loop
    execute format('revoke all on function %s from public', f);
  end loop;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    grant execute on function
      public.tq_get_store(text),
      public.tq_play(text, text, text, text),
      public.tq_log_event(text, text),
      public.tq_log_review(text, int, text, text),
      public.tq_owner_dashboard(text, text, int),
      public.tq_owner_update(text, text, jsonb, boolean, int),
      public.tq_owner_verify(text, text, text, boolean),
      public.tq_admin_upsert_store(text, jsonb),
      public.tq_admin_list(text),
      public.tq_admin_reset_token(text, text)
    to anon, authenticated;
  end if;
end $$;
