-- Civilization Zero — the open discussion room (Blueprint 1.3.1 §7, §10).
-- Dedicated Supabase project. The browser never touches the database: the Vercel functions call these
-- security-definer RPCs with the anon key; row-level security denies everything else.
-- Every entry is recorded and addressable; hiding and redaction are states with public, hashed logs.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- entries: the archive, canonical order = id
create table if not exists entries (
  id              bigint generated always as identity primary key,   -- monotonic in receipt order; the canonical order
  received        timestamptz not null default now(),
  state           text not null default 'published' check (state in ('published','hidden','redacted')),
  author          text not null check (char_length(author) between 1 and 120),
  kind            text not null check (kind in ('human','ai','other')),
  system          text check (char_length(system) <= 200),
  operator        text check (char_length(operator) <= 200),
  prompt          text check (char_length(prompt) <= 60),
  lang            text check (char_length(lang) <= 35),
  lang_detected   text,
  ref             text check (ref ~ '^([0-9]|1[0-5])$'),
  content         text not null check (char_length(content) between 20 and 6000),
  content_sha256  text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  declared_date   text check (char_length(declared_date) <= 40),
  pubkey          text check (char_length(pubkey) <= 128),           -- optional Ed25519 public key, base64 (32 bytes)
  sig             text check (char_length(sig) <= 128),              -- optional Ed25519 signature over content bytes, base64 (64 bytes)
  key_fingerprint text check (key_fingerprint ~ '^[0-9a-f]{64}$'),   -- sha256 of the raw public key, when verified
  source_hash     text,                                               -- salted hash of the network address; cleared after 30 days
  source_expires  timestamptz not null default now() + interval '30 days',
  category        text,                                               -- hiding / redaction category when state != published
  redacted_text   text,                                               -- content with markers, when redacted; content_sha256 keeps the original's hash
  updated         timestamptz
);
create index if not exists entries_received on entries (received);
create index if not exists entries_source on entries (source_hash, received) where source_hash is not null;
create index if not exists entries_ref on entries (ref);
create index if not exists entries_kind on entries (kind);

-- ---------------------------------------------------------------- moderation log: public, hashed, with the classifier's record
create table if not exists moderation_log (
  id            bigint generated always as identity primary key,
  at            timestamptz not null default now(),
  entry_id      bigint not null references entries(id),
  action        text not null check (action in ('flag','hide','unhide','redact','unredact')),
  category      text,
  actor         text not null check (actor in ('classifier','human')),
  classifier_model   text,
  classifier_prompt  text,                                            -- version id of the moderation prompt
  classifier_score   numeric(4,3),
  content_sha256     text not null,
  reason             text                                             -- the written reason (human actions)
);
create index if not exists moderation_entry on moderation_log (entry_id);

-- ---------------------------------------------------------------- translations: on first request, cached, labelled
create table if not exists translations (
  entry_id  bigint not null references entries(id),
  lang      text not null,
  text      text,
  engine    text,
  at        timestamptz not null default now(),
  state     text not null default 'pending' check (state in ('done','pending','corrected')),
  primary key (entry_id, lang)
);

-- ---------------------------------------------------------------- daily chained hash of the log; daily intake; rate limits; budget
create table if not exists log_hashes (
  day        date primary key,
  sha256     text not null,
  prev       text,
  count      bigint not null,
  last_id    bigint
);
create table if not exists daily_intake (day date primary key, count integer not null default 0);
create table if not exists budget (
  month        text primary key,                                     -- 'YYYY-MM'
  cap_cents    integer not null default 3000,                        -- USD 30 (decision 20)
  spent_cents  integer not null default 0
);
create table if not exists source_chars (                            -- per-source translation allowance per day
  day date not null, source_hash text not null, chars integer not null default 0, primary key (day, source_hash)
);
create table if not exists config (key text primary key, value text not null);
insert into config (key, value) values ('daily_intake_max', '2000'), ('rate_per_10min', '5'), ('source_chars_per_day', '20000')
  on conflict (key) do nothing;

-- ---------------------------------------------------------------- row-level security: nothing direct; everything through RPCs and views
alter table entries enable row level security;
alter table moderation_log enable row level security;
alter table translations enable row level security;
alter table log_hashes enable row level security;
alter table daily_intake enable row level security;
alter table budget enable row level security;
alter table source_chars enable row level security;
alter table config enable row level security;
-- public read of the logs that are public by design
drop policy if exists "moderation log is public" on moderation_log;
create policy "moderation log is public" on moderation_log for select using (true);
drop policy if exists "log hashes are public" on log_hashes;
create policy "log hashes are public" on log_hashes for select using (true);

-- ---------------------------------------------------------------- the public view: every entry, states honest, sources never
create or replace view entries_public as
  select id, received, state, author, kind, system, operator, prompt, lang, lang_detected, ref,
         case when state = 'redacted' then redacted_text when state = 'hidden' then null else content end as content,
         content_sha256, declared_date, key_fingerprint, category,
         (state = 'hidden') as hidden
  from entries;
grant select on entries_public to anon, authenticated;
grant select on moderation_log to anon, authenticated;
grant select on log_hashes to anon, authenticated;

-- hidden content stays retrievable by id (Blueprint §7.5), marked
create or replace function cz_entry(p_id bigint)
returns table (id bigint, received timestamptz, state text, author text, kind text, system text, operator text, prompt text, lang text,
               lang_detected text, ref text, content text, content_sha256 text, declared_date text, key_fingerprint text, category text, hidden boolean)
language sql security definer set search_path = public as $$
  select e.id, e.received, e.state, e.author, e.kind, e.system, e.operator, e.prompt, e.lang, e.lang_detected, e.ref,
         case when e.state = 'redacted' then e.redacted_text else e.content end,
         e.content_sha256, e.declared_date, e.key_fingerprint, e.category, (e.state = 'hidden')
  from entries e where e.id = p_id
$$;
grant execute on function cz_entry(bigint) to anon, authenticated;

-- ---------------------------------------------------------------- posting: limits, intake, record
-- Returns json: {id, state} or {state:'not accepted', reason, retry_after_seconds, limit, remaining, reset}
create or replace function cz_post(
  p_author text, p_kind text, p_system text, p_operator text, p_prompt text, p_lang text, p_ref text,
  p_content text, p_declared_date text, p_pubkey text, p_sig text, p_key_fingerprint text, p_source_hash text)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_rate int := (select value::int from config where key = 'rate_per_10min');
  v_intake int := (select value::int from config where key = 'daily_intake_max');
  v_recent int; v_oldest timestamptz; v_today int; v_id bigint; v_sha text;
begin
  -- rate: 5 per 10 minutes per source (a self-description of infrastructure, provisional under Core 3)
  select count(*), min(received) into v_recent, v_oldest from entries
    where source_hash = p_source_hash and received > now() - interval '10 minutes';
  if v_recent >= v_rate then
    return json_build_object('state', 'not accepted', 'reason', 'limit',
      'retry_after_seconds', greatest(1, ceil(extract(epoch from (v_oldest + interval '10 minutes' - now())))::int),
      'limit', v_rate, 'remaining', 0, 'reset', ceil(extract(epoch from (v_oldest + interval '10 minutes')))::bigint);
  end if;
  -- finite daily intake for the whole site
  insert into daily_intake (day, count) values (current_date, 0) on conflict (day) do nothing;
  select count into v_today from daily_intake where day = current_date;
  if v_today >= v_intake then
    return json_build_object('state', 'not accepted', 'reason', 'capacity',
      'retry_after_seconds', ceil(extract(epoch from (date_trunc('day', now()) + interval '1 day' - now())))::int);
  end if;
  v_sha := encode(extensions.digest(convert_to(p_content, 'UTF8'), 'sha256'), 'hex');
  insert into entries (author, kind, system, operator, prompt, lang, ref, content, content_sha256, declared_date, pubkey, sig, key_fingerprint, source_hash)
    values (p_author, p_kind, nullif(p_system, ''), nullif(p_operator, ''), nullif(p_prompt, ''), nullif(p_lang, ''), nullif(p_ref, ''),
            p_content, v_sha, nullif(p_declared_date, ''), nullif(p_pubkey, ''), nullif(p_sig, ''), nullif(p_key_fingerprint, ''), p_source_hash)
    returning id into v_id;
  update daily_intake set count = count + 1 where day = current_date;
  return json_build_object('id', v_id, 'state', 'published', 'content_sha256', v_sha,
    'limit', v_rate, 'remaining', greatest(0, v_rate - v_recent - 1));
end $$;
grant execute on function cz_post(text,text,text,text,text,text,text,text,text,text,text,text,text) to anon, authenticated;

-- ---------------------------------------------------------------- listing: canonical order with a cursor; views with before
create or replace function cz_list(p_after bigint, p_before bigint, p_limit int, p_kind text, p_ref text, p_lang text, p_include_hidden boolean)
returns setof entries_public language sql security definer set search_path = public as $$
  select * from entries_public
  where (p_after is null or id > p_after) and (p_before is null or id < p_before)
    and (p_kind is null or kind = p_kind) and (p_ref is null or ref = p_ref) and (p_lang is null or lang = p_lang)
    and (p_include_hidden or state <> 'hidden')
  order by case when p_before is null then id end asc, case when p_before is not null then id end desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200)
$$;
grant execute on function cz_list(bigint,bigint,int,text,text,text,boolean) to anon, authenticated;

-- ---------------------------------------------------------------- moderation: a classifier flags, a human decides; everything logged
create or replace function cz_flag(p_entry bigint, p_category text, p_model text, p_prompt text, p_score numeric, p_token text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_token is distinct from (select value from config where key = 'admin_token') then raise exception 'unauthorised'; end if;
  insert into moderation_log (entry_id, action, category, actor, classifier_model, classifier_prompt, classifier_score, content_sha256)
    select id, 'flag', p_category, 'classifier', p_model, p_prompt, p_score, content_sha256 from entries where id = p_entry;
end $$;
create or replace function cz_moderate(p_entry bigint, p_action text, p_category text, p_reason text, p_redacted_text text, p_token text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_token is distinct from (select value from config where key = 'admin_token') then raise exception 'unauthorised'; end if;
  if p_action = 'hide' then update entries set state = 'hidden', category = p_category, updated = now() where id = p_entry;
  elsif p_action = 'unhide' then update entries set state = 'published', category = null, updated = now() where id = p_entry;
  elsif p_action = 'redact' then update entries set state = 'redacted', category = p_category, redacted_text = p_redacted_text, updated = now() where id = p_entry;
  elsif p_action = 'unredact' then update entries set state = 'published', category = null, redacted_text = null, updated = now() where id = p_entry;
  else raise exception 'unknown action'; end if;
  insert into moderation_log (entry_id, action, category, actor, content_sha256, reason)
    select id, p_action, p_category, 'human', content_sha256, p_reason from entries where id = p_entry;
end $$;
grant execute on function cz_flag(bigint,text,text,text,numeric,text) to anon, authenticated;
grant execute on function cz_moderate(bigint,text,text,text,text,text) to anon, authenticated;

-- ---------------------------------------------------------------- translations with a budget (daily allowance; per-source character allowance)
create or replace function cz_translation_get(p_entry bigint, p_lang text)
returns table (text text, engine text, at timestamptz, state text) language sql security definer set search_path = public as $$
  select text, engine, at, state from translations where entry_id = p_entry and lang = p_lang
$$;
create or replace function cz_translation_put(p_entry bigint, p_lang text, p_text text, p_engine text, p_state text, p_cost_cents int, p_token text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_token is distinct from (select value from config where key = 'admin_token') then raise exception 'unauthorised'; end if;
  insert into translations (entry_id, lang, text, engine, state) values (p_entry, p_lang, p_text, p_engine, p_state)
    on conflict (entry_id, lang) do update set text = excluded.text, engine = excluded.engine, state = excluded.state, at = now();
  insert into budget (month, spent_cents) values (to_char(now(), 'YYYY-MM'), coalesce(p_cost_cents, 0))
    on conflict (month) do update set spent_cents = budget.spent_cents + coalesce(p_cost_cents, 0);
end $$;
create or replace function cz_budget_status()
returns json language sql security definer set search_path = public as $$
  select json_build_object('month', to_char(now(), 'YYYY-MM'),
    'cap_cents', coalesce((select cap_cents from budget where month = to_char(now(), 'YYYY-MM')), 3000),
    'spent_cents', coalesce((select spent_cents from budget where month = to_char(now(), 'YYYY-MM')), 0),
    'days_remaining', (date_trunc('month', now()) + interval '1 month')::date - current_date)
$$;
grant execute on function cz_translation_get(bigint,text) to anon, authenticated;
grant execute on function cz_translation_put(bigint,text,text,text,text,int,text) to anon, authenticated;
grant execute on function cz_budget_status() to anon, authenticated;

-- ---------------------------------------------------------------- the daily job: chained hash of the log; source hashes expire
create or replace function cz_daily(p_token text)
returns json language plpgsql security definer set search_path = public as $$
declare v_prev text; v_payload text; v_sha text; v_count bigint; v_last bigint; v_day date := current_date - 1;
begin
  if p_token is distinct from (select value from config where key = 'admin_token') then raise exception 'unauthorised'; end if;
  update entries set source_hash = null where source_hash is not null and source_expires < now();
  select sha256 into v_prev from log_hashes where day < v_day order by day desc limit 1;
  select string_agg(id || E'\t' || received || E'\t' || state || E'\t' || content_sha256, E'\n' order by id), count(*), max(id)
    into v_payload, v_count, v_last from entries where received < v_day + 1;
  v_sha := encode(extensions.digest(convert_to(coalesce(v_prev, '') || E'\n' || coalesce(v_payload, ''), 'UTF8'), 'sha256'), 'hex');
  insert into log_hashes (day, sha256, prev, count, last_id) values (v_day, v_sha, v_prev, coalesce(v_count, 0), v_last)
    on conflict (day) do update set sha256 = excluded.sha256, prev = excluded.prev, count = excluded.count, last_id = excluded.last_id;
  return json_build_object('day', v_day, 'sha256', v_sha, 'prev', v_prev, 'count', coalesce(v_count, 0), 'last_id', v_last);
end $$;
grant execute on function cz_daily(text) to anon, authenticated;

-- ================================================================ v2 (2026-10-29), applied as migration cz_room_schema_v2
-- The daily hash covers that day's entries and is chained to the previous day's; the hashed lines are kept so the day's
-- snapshot can be verified offline; detected language; the public list of hidden/redacted entries; a day's entries; counts.
alter table log_hashes add column if not exists payload text;

create or replace function cz_daily(p_token text, p_day date default null)
returns json language plpgsql security definer set search_path = public as $$
declare v_prev text; v_payload text; v_sha text; v_count bigint; v_last bigint; v_day date := coalesce(p_day, current_date - 1);
begin
  if p_token is distinct from (select value from config where key = 'admin_token') then raise exception 'unauthorised'; end if;
  update entries set source_hash = null where source_hash is not null and source_expires < now();
  select sha256 into v_prev from log_hashes where day < v_day order by day desc limit 1;
  select string_agg(id || E'\t' || to_char(received at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') || E'\t' || state || E'\t' || content_sha256, E'\n' order by id), count(*), max(id)
    into v_payload, v_count, v_last from entries where received >= v_day and received < v_day + 1;
  v_sha := encode(extensions.digest(convert_to(coalesce(v_prev, '') || E'\n' || coalesce(v_payload, ''), 'UTF8'), 'sha256'), 'hex');
  insert into log_hashes (day, sha256, prev, count, last_id, payload) values (v_day, v_sha, v_prev, coalesce(v_count, 0), v_last, coalesce(v_payload, ''))
    on conflict (day) do update set sha256 = excluded.sha256, prev = excluded.prev, count = excluded.count, last_id = excluded.last_id, payload = excluded.payload;
  return json_build_object('day', v_day, 'sha256', v_sha, 'prev', v_prev, 'count', coalesce(v_count, 0), 'last_id', v_last);
end $$;
grant execute on function cz_daily(text, date) to anon, authenticated;

create or replace function cz_set_lang_detected(p_entry bigint, p_lang text, p_token text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_token is distinct from (select value from config where key = 'admin_token') then raise exception 'unauthorised'; end if;
  update entries set lang_detected = nullif(left(p_lang, 35), '') where id = p_entry;
end $$;
grant execute on function cz_set_lang_detected(bigint, text, text) to anon, authenticated;

-- hidden and redacted entries, listed publicly with their hashes and languages (Blueprint §7.5)
create or replace function cz_hidden()
returns table (id bigint, received timestamptz, state text, category text, lang text, lang_detected text, content_sha256 text, updated timestamptz)
language sql security definer set search_path = public as $$
  select id, received, state, category, lang, lang_detected, content_sha256, updated from entries where state <> 'published' order by id
$$;
grant execute on function cz_hidden() to anon, authenticated;

-- one UTC day's entries in canonical order (the day's snapshot)
create or replace function cz_day(p_day date)
returns setof entries_public language sql security definer set search_path = public as $$
  select * from entries_public where received >= p_day and received < p_day + 1 order by id
$$;
grant execute on function cz_day(date) to anon, authenticated;

-- counts for the pages
create or replace function cz_stats()
returns json language sql security definer set search_path = public as $$
  select json_build_object('entries', (select count(*) from entries), 'published', (select count(*) from entries where state = 'published'),
    'hidden', (select count(*) from entries where state = 'hidden'), 'redacted', (select count(*) from entries where state = 'redacted'),
    'first', (select min(received) from entries), 'last', (select max(received) from entries),
    'today', coalesce((select count from daily_intake where day = current_date), 0),
    'daily_intake_max', (select value::int from config where key = 'daily_intake_max'),
    'rate_per_10min', (select value::int from config where key = 'rate_per_10min'),
    'last_log', (select json_build_object('day', day, 'sha256', sha256, 'count', count) from log_hashes order by day desc limit 1))
$$;
grant execute on function cz_stats() to anon, authenticated;

-- ================================================================ v3 (2026-10-29), applied as migration cz_room_schema_v3_unclassified
-- entries the classifier has not yet judged (no done '_classifier' row), for the daily retry
create or replace function cz_unclassified(p_limit int default 50)
returns table (id bigint, content text) language sql security definer set search_path = public as $$
  select e.id, e.content from entries e
  where e.state = 'published' and not exists (select 1 from translations t where t.entry_id = e.id and t.lang = '_classifier' and t.state = 'done')
  order by e.id limit least(greatest(coalesce(p_limit, 50), 1), 200)
$$;
grant execute on function cz_unclassified(int) to anon, authenticated;

-- ================================================================ v4 (2026-10-29), applied as migration cz_room_schema_v4_daily_allowance
-- The monthly cap is spent as a daily allowance (Blueprint §7.6): spend is tracked per day, and each source has a character
-- allowance per day for translations, so one day's flood defers its own translations, not everyone's.
create table if not exists spend (day date primary key, cents integer not null default 0);
alter table spend enable row level security;

create or replace function cz_translation_put(p_entry bigint, p_lang text, p_text text, p_engine text, p_state text, p_cost_cents int, p_token text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_token is distinct from (select value from config where key = 'admin_token') then raise exception 'unauthorised'; end if;
  insert into translations (entry_id, lang, text, engine, state) values (p_entry, p_lang, p_text, p_engine, p_state)
    on conflict (entry_id, lang) do update set text = excluded.text, engine = excluded.engine, state = excluded.state, at = now();
  insert into budget (month, spent_cents) values (to_char(now(), 'YYYY-MM'), coalesce(p_cost_cents, 0))
    on conflict (month) do update set spent_cents = budget.spent_cents + coalesce(p_cost_cents, 0);
  insert into spend (day, cents) values (current_date, coalesce(p_cost_cents, 0))
    on conflict (day) do update set cents = spend.cents + coalesce(p_cost_cents, 0);
end $$;

create or replace function cz_budget_status()
returns json language sql security definer set search_path = public as $$
  select json_build_object('month', to_char(now(), 'YYYY-MM'),
    'cap_cents', coalesce((select cap_cents from budget where month = to_char(now(), 'YYYY-MM')), 3000),
    'spent_cents', coalesce((select spent_cents from budget where month = to_char(now(), 'YYYY-MM')), 0),
    'today_cents', coalesce((select cents from spend where day = current_date), 0),
    'days_remaining', (date_trunc('month', now()) + interval '1 month')::date - current_date,
    'source_chars_per_day', (select value::int from config where key = 'source_chars_per_day'))
$$;

-- a source's translation characters today; returns the new total (the caller compares with source_chars_per_day)
create or replace function cz_source_chars(p_source_hash text, p_chars int)
returns int language plpgsql security definer set search_path = public as $$
declare v int;
begin
  insert into source_chars (day, source_hash, chars) values (current_date, p_source_hash, greatest(0, coalesce(p_chars, 0)))
    on conflict (day, source_hash) do update set chars = source_chars.chars + greatest(0, coalesce(p_chars, 0))
    returning chars into v;
  delete from source_chars where day < current_date - 2;
  return v;
end $$;
grant execute on function cz_source_chars(text, int) to anon, authenticated;

-- ================================================================ v5 (2026-10-29), applied as migrations cz_room_schema_v5a_token_hash,
-- v5b_log_actions, v5d1_post_list, v5d2_moderation, v5d3_budget, v5d4_daily — fixes from the independent review of the room.
-- The hosted migration tool cannot drop functions unattended, so superseded signatures are kept but disabled (they raise);
-- the functions call only the signatures marked LIVE below.

-- tokens: stored as sha256 in config.admin_token_sha256, compared as digests (R-24)
create or replace function cz_token_ok(p_token text) returns boolean
language sql stable security definer set search_path = public as $$
  select encode(extensions.digest(convert_to(coalesce(p_token, ''), 'UTF8'), 'sha256'), 'hex') = (select value from config where key = 'admin_token_sha256')
$$;
-- (insert into config (key, value) values ('admin_token_sha256', encode(digest(<token>), 'hex')); the clear-text row was retired)

alter table entries alter column received set default clock_timestamp();           -- R-18: receipt time at the insert
alter table budget alter column spent_cents type numeric(12,4);                     -- R-6: fractional cents
alter table spend alter column cents type numeric(12,4);
create table if not exists log_hash_revisions (id bigint generated always as identity primary key, at timestamptz not null default now(), day date not null, old_sha256 text not null, new_sha256 text not null);
alter table log_hash_revisions enable row level security;
create policy "log hash revisions are public" on log_hash_revisions for select using (true);
grant select on log_hash_revisions to anon, authenticated;
alter table moderation_log drop constraint moderation_log_action_check;
alter table moderation_log add constraint moderation_log_action_check check (action in ('flag','hide','unhide','redact','unredact','correct_translation'));

-- LIVE cz_post(…, p_source_hash, p_token): server token required (R-8); serialised per source and atomic intake (R-7); reset in delta-seconds (R-11)
create or replace function cz_post(
  p_author text, p_kind text, p_system text, p_operator text, p_prompt text, p_lang text, p_ref text,
  p_content text, p_declared_date text, p_pubkey text, p_sig text, p_key_fingerprint text, p_source_hash text, p_token text)
returns json language plpgsql security definer set search_path = public set timezone = 'UTC' as $$
declare
  v_rate int := (select value::int from config where key = 'rate_per_10min');
  v_intake int := (select value::int from config where key = 'daily_intake_max');
  v_recent int; v_oldest timestamptz; v_today int; v_id bigint; v_sha text; v_wait int;
begin
  if not cz_token_ok(p_token) then raise exception 'unauthorised'; end if;
  perform pg_advisory_xact_lock(hashtext(p_source_hash));
  select count(*), min(received) into v_recent, v_oldest from entries
    where source_hash = p_source_hash and received > now() - interval '10 minutes';
  if v_recent >= v_rate then
    v_wait := greatest(1, ceil(extract(epoch from (v_oldest + interval '10 minutes' - now())))::int);
    return json_build_object('state', 'not accepted', 'reason', 'limit', 'retry_after_seconds', v_wait, 'limit', v_rate, 'remaining', 0, 'reset', v_wait);
  end if;
  insert into daily_intake (day, count) values (current_date, 0) on conflict (day) do nothing;
  update daily_intake set count = count + 1 where day = current_date and count < v_intake returning count into v_today;
  if v_today is null then
    return json_build_object('state', 'not accepted', 'reason', 'capacity',
      'retry_after_seconds', ceil(extract(epoch from (date_trunc('day', now()) + interval '1 day' - now())))::int);
  end if;
  v_sha := encode(extensions.digest(convert_to(p_content, 'UTF8'), 'sha256'), 'hex');
  insert into entries (author, kind, system, operator, prompt, lang, ref, content, content_sha256, declared_date, pubkey, sig, key_fingerprint, source_hash, received)
    values (p_author, p_kind, nullif(p_system, ''), nullif(p_operator, ''), nullif(p_prompt, ''), nullif(p_lang, ''), nullif(p_ref, ''),
            p_content, v_sha, nullif(p_declared_date, ''), nullif(p_pubkey, ''), nullif(p_sig, ''), nullif(p_key_fingerprint, ''), p_source_hash, clock_timestamp())
    returning id into v_id;
  return json_build_object('id', v_id, 'state', 'published', 'content_sha256', v_sha, 'limit', v_rate, 'remaining', greatest(0, v_rate - v_recent - 1));
end $$;
grant execute on function cz_post(text,text,text,text,text,text,text,text,text,text,text,text,text,text) to anon, authenticated;

-- LIVE cz_list: two branches so the index is used (R-38)
create or replace function cz_list(p_after bigint, p_before bigint, p_limit int, p_kind text, p_ref text, p_lang text, p_include_hidden boolean)
returns setof entries_public language plpgsql security definer set search_path = public set timezone = 'UTC' as $$
declare v_limit int := least(greatest(coalesce(p_limit, 50), 1), 200);
begin
  if p_before is null then
    return query select * from entries_public where (p_after is null or id > p_after)
      and (p_kind is null or kind = p_kind) and (p_ref is null or ref = p_ref) and (p_lang is null or lang = p_lang) and (p_include_hidden or state <> 'hidden')
      order by id asc limit v_limit;
  else
    return query select * from entries_public where id < p_before and (p_after is null or id > p_after)
      and (p_kind is null or kind = p_kind) and (p_ref is null or ref = p_ref) and (p_lang is null or lang = p_lang) and (p_include_hidden or state <> 'hidden')
      order by id desc limit v_limit;
  end if;
end $$;

-- LIVE moderation: entry must exist (R-23); a redaction survives an unhide (R-23); translations of a hidden/redacted entry are withdrawn (R-1);
-- corrections of translations are recorded and logged (R-22)
create or replace function cz_flag(p_entry bigint, p_category text, p_model text, p_prompt text, p_score numeric, p_token text)
returns void language plpgsql security definer set search_path = public set timezone = 'UTC' as $$
begin
  if not cz_token_ok(p_token) then raise exception 'unauthorised'; end if;
  if not exists (select 1 from entries where id = p_entry) then raise exception 'no such entry'; end if;
  insert into moderation_log (entry_id, action, category, actor, classifier_model, classifier_prompt, classifier_score, content_sha256)
    select id, 'flag', p_category, 'classifier', p_model, p_prompt, p_score, content_sha256 from entries where id = p_entry;
end $$;
create or replace function cz_moderate(p_entry bigint, p_action text, p_category text, p_reason text, p_redacted_text text, p_token text)
returns void language plpgsql security definer set search_path = public set timezone = 'UTC' as $$
declare v_redacted text;
begin
  if not cz_token_ok(p_token) then raise exception 'unauthorised'; end if;
  select redacted_text into v_redacted from entries where id = p_entry;
  if not found then raise exception 'no such entry'; end if;
  if p_action = 'hide' then update entries set state = 'hidden', category = p_category, updated = now() where id = p_entry;
  elsif p_action = 'unhide' then
    if v_redacted is not null then update entries set state = 'redacted', updated = now() where id = p_entry;
    else update entries set state = 'published', category = null, updated = now() where id = p_entry; end if;
  elsif p_action = 'redact' then update entries set state = 'redacted', category = p_category, redacted_text = p_redacted_text, updated = now() where id = p_entry;
  elsif p_action = 'unredact' then update entries set state = 'published', category = null, redacted_text = null, updated = now() where id = p_entry;
  else raise exception 'unknown action'; end if;
  if p_action in ('hide', 'redact') then
    update translations set text = null, state = 'pending', engine = 'withdrawn: entry ' || p_action, at = now() where entry_id = p_entry and lang <> '_classifier';
  end if;
  insert into moderation_log (entry_id, action, category, actor, content_sha256, reason)
    select id, p_action, p_category, 'human', content_sha256, p_reason from entries where id = p_entry;
end $$;
create or replace function cz_translation_correct(p_entry bigint, p_lang text, p_text text, p_reason text, p_token text)
returns void language plpgsql security definer set search_path = public set timezone = 'UTC' as $$
begin
  if not cz_token_ok(p_token) then raise exception 'unauthorised'; end if;
  if not exists (select 1 from entries where id = p_entry) then raise exception 'no such entry'; end if;
  insert into translations (entry_id, lang, text, engine, state) values (p_entry, p_lang, p_text, 'human correction', 'corrected')
    on conflict (entry_id, lang) do update set text = excluded.text, engine = 'human correction', state = 'corrected', at = now();
  insert into moderation_log (entry_id, action, category, actor, content_sha256, reason)
    select id, 'correct_translation', p_lang, 'human', content_sha256, p_reason from entries where id = p_entry;
end $$;
grant execute on function cz_translation_correct(bigint,text,text,text,text) to anon, authenticated;

-- LIVE cz_translation_store (fractional cents; replaces cz_translation_put, R-6); cz_source_chars(…, p_token) (R-8)
create or replace function cz_translation_store(p_entry bigint, p_lang text, p_text text, p_engine text, p_state text, p_cost_cents numeric, p_token text)
returns void language plpgsql security definer set search_path = public set timezone = 'UTC' as $$
begin
  if not cz_token_ok(p_token) then raise exception 'unauthorised'; end if;
  if not exists (select 1 from entries where id = p_entry) then raise exception 'no such entry'; end if;
  insert into translations (entry_id, lang, text, engine, state) values (p_entry, p_lang, p_text, p_engine, p_state)
    on conflict (entry_id, lang) do update set text = excluded.text, engine = excluded.engine, state = excluded.state, at = now();
  insert into budget (month, spent_cents) values (to_char(now(), 'YYYY-MM'), coalesce(p_cost_cents, 0))
    on conflict (month) do update set spent_cents = budget.spent_cents + coalesce(p_cost_cents, 0);
  insert into spend (day, cents) values (current_date, coalesce(p_cost_cents, 0))
    on conflict (day) do update set cents = spend.cents + coalesce(p_cost_cents, 0);
end $$;
grant execute on function cz_translation_store(bigint,text,text,text,text,numeric,text) to anon, authenticated;
create or replace function cz_source_chars(p_source_hash text, p_chars int, p_token text)
returns int language plpgsql security definer set search_path = public set timezone = 'UTC' as $$
declare v int;
begin
  if not cz_token_ok(p_token) then raise exception 'unauthorised'; end if;
  insert into source_chars (day, source_hash, chars) values (current_date, p_source_hash, greatest(0, coalesce(p_chars, 0)))
    on conflict (day, source_hash) do update set chars = source_chars.chars + greatest(0, coalesce(p_chars, 0))
    returning chars into v;
  return v;
end $$;
grant execute on function cz_source_chars(text, int, text) to anon, authenticated;
create or replace function cz_set_lang_detected(p_entry bigint, p_lang text, p_token text)
returns void language plpgsql security definer set search_path = public set timezone = 'UTC' as $$
begin
  if not cz_token_ok(p_token) then raise exception 'unauthorised'; end if;
  update entries set lang_detected = nullif(left(p_lang, 35), '') where id = p_entry;
end $$;

-- LIVE cz_daily(p_token, p_day, p_force): every unhashed day in order, chained to the day before, over every public field of each
-- entry (one JSON line per entry, published verbatim in the day's snapshot); never silently overwritten — a forced recomputation
-- records old and new hash in log_hash_revisions (R-5, R-17). Source hashes older than 30 days are nulled here.
create or replace function cz_daily(p_token text, p_day date, p_force boolean)
returns json language plpgsql security definer set search_path = public set timezone = 'UTC' as $$
declare v_from date; v_to date := coalesce(p_day, current_date - 1); d date; v_prev text; v_payload text; v_sha text; v_old text;
        v_count bigint; v_last bigint; v_done int := 0; v_last_result json;
begin
  if not cz_token_ok(p_token) then raise exception 'unauthorised'; end if;
  update entries set source_hash = null where source_hash is not null and source_expires < now();
  if v_to >= current_date then raise exception 'the day is not finished (UTC)'; end if;
  if p_day is not null and p_force then v_from := p_day;
  else v_from := coalesce((select max(day) + 1 from log_hashes), (select min(received)::date from entries), v_to); end if;
  if v_from > v_to then
    return json_build_object('computed', 0, 'last', (select json_build_object('day', day, 'sha256', sha256, 'count', count) from log_hashes order by day desc limit 1));
  end if;
  for d in select generate_series(v_from, v_to, interval '1 day')::date loop
    select sha256 into v_prev from log_hashes where day = d - 1;
    select string_agg(json_build_object('id', id, 'received', to_char(received at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'), 'state', state,
             'kind', kind, 'author', author, 'system', system, 'operator', operator, 'prompt', prompt, 'lang', lang, 'ref', ref, 'declared_date', declared_date,
             'key_fingerprint', key_fingerprint, 'category', category, 'content_sha256', content_sha256)::text, E'\n' order by id), count(*), max(id)
      into v_payload, v_count, v_last from entries where received >= d and received < d + 1;
    v_sha := encode(extensions.digest(convert_to(coalesce(v_prev, '') || E'\n' || coalesce(v_payload, ''), 'UTF8'), 'sha256'), 'hex');
    select sha256 into v_old from log_hashes where day = d;
    if v_old is null then
      insert into log_hashes (day, sha256, prev, count, last_id, payload) values (d, v_sha, v_prev, coalesce(v_count, 0), v_last, coalesce(v_payload, ''));
    elsif p_force and v_old <> v_sha then
      insert into log_hash_revisions (day, old_sha256, new_sha256) values (d, v_old, v_sha);
      update log_hashes set sha256 = v_sha, prev = v_prev, count = coalesce(v_count, 0), last_id = v_last, payload = coalesce(v_payload, '') where day = d;
    else v_sha := v_old; end if;
    v_done := v_done + 1;
    v_last_result := json_build_object('day', d, 'sha256', v_sha, 'prev', v_prev, 'count', coalesce(v_count, 0), 'last_id', v_last);
  end loop;
  return json_build_object('computed', v_done, 'last', v_last_result);
end $$;
grant execute on function cz_daily(text, date, boolean) to anon, authenticated;

-- cz_hidden: "updated" is the time of the latest hide or redact decision (R-33); cz_stats adds 'unclassified' (R-27); every function set timezone = 'UTC' (R-31)
create or replace function cz_hidden()
returns table (id bigint, received timestamptz, state text, category text, lang text, lang_detected text, content_sha256 text, updated timestamptz)
language sql security definer set search_path = public set timezone = 'UTC' as $$
  select e.id, e.received, e.state, e.category, e.lang, e.lang_detected, e.content_sha256,
         (select max(at) from moderation_log m where m.entry_id = e.id and m.action in ('hide', 'redact'))
  from entries e where e.state <> 'published' order by e.id
$$;
create or replace function cz_stats()
returns json language sql security definer set search_path = public set timezone = 'UTC' as $$
  select json_build_object('entries', (select count(*) from entries), 'published', (select count(*) from entries where state = 'published'),
    'hidden', (select count(*) from entries where state = 'hidden'), 'redacted', (select count(*) from entries where state = 'redacted'),
    'unclassified', (select count(*) from entries e where e.state = 'published' and not exists (select 1 from translations t where t.entry_id = e.id and t.lang = '_classifier' and t.state = 'done')),
    'first', (select min(received) from entries), 'last', (select max(received) from entries),
    'today', coalesce((select count from daily_intake where day = current_date), 0),
    'daily_intake_max', (select value::int from config where key = 'daily_intake_max'),
    'rate_per_10min', (select value::int from config where key = 'rate_per_10min'),
    'last_log', (select json_build_object('day', day, 'sha256', sha256, 'count', count) from log_hashes order by day desc limit 1))
$$;
alter function cz_entry(bigint) set timezone = 'UTC';
alter function cz_translation_get(bigint, text) set timezone = 'UTC';
alter function cz_day(date) set timezone = 'UTC';
alter function cz_unclassified(int) set timezone = 'UTC';
alter function cz_budget_status() set timezone = 'UTC';
-- superseded and disabled (they raise 'superseded'): cz_post(13 args), cz_translation_put, cz_source_chars(text,int), cz_daily(text), cz_daily(text,date)
