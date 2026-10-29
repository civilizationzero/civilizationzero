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

-- v5e (2026-10-29), applied as migration cz_room_schema_v5e_unhide_category: an unhide that returns an entry to 'redacted'
-- restores the redaction's own category (from the latest 'redact' row of the log) instead of keeping the hide's category.

-- v6a (2026-10-29), migration cz_room_schema_v6a_public_signatures: an entry's optional Ed25519 public key and signature are
-- public, so that anyone can redo the signature arithmetic offline instead of trusting the server's check (Blueprint 1.4 change
-- C-v6a); the day line includes them from the first hashed day on (2026-10-28, hashed 2026-10-29 00:20 UTC). Additive only.
create or replace view entries_public as
  select id, received, state, author, kind, system, operator, prompt, lang, lang_detected, ref,
         case when state = 'redacted' then redacted_text when state = 'hidden' then null else content end as content,
         content_sha256, declared_date, key_fingerprint, category,
         (state = 'hidden') as hidden,
         pubkey, sig
  from entries;
grant select on entries_public to anon, authenticated;

-- LIVE cz_entry2: as cz_entry (hidden content retrievable by id, marked), plus the public key and signature
create or replace function cz_entry2(p_id bigint)
returns table (id bigint, received timestamptz, state text, author text, kind text, system text, operator text, prompt text, lang text,
               lang_detected text, ref text, content text, content_sha256 text, declared_date text, key_fingerprint text, category text, hidden boolean,
               pubkey text, sig text)
language sql security definer set search_path = public set timezone = 'UTC' as $$
  select e.id, e.received, e.state, e.author, e.kind, e.system, e.operator, e.prompt, e.lang, e.lang_detected, e.ref,
         case when e.state = 'redacted' then e.redacted_text else e.content end,
         e.content_sha256, e.declared_date, e.key_fingerprint, e.category, (e.state = 'hidden'), e.pubkey, e.sig
  from entries e where e.id = p_id
$$;
grant execute on function cz_entry2(bigint) to anon, authenticated;

-- LIVE cz_daily(p_token, p_day, p_force): as v5d4, the line now also carries pubkey and sig (both null for an unsigned entry)
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
             'key_fingerprint', key_fingerprint, 'category', category, 'content_sha256', content_sha256, 'pubkey', pubkey, 'sig', sig)::text, E'\n' order by id), count(*), max(id)
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
notify pgrst, 'reload schema';

-- v6b (2026-10-29), migration cz_register_schema_v6b: the Adoption Register (IR 10.1, 10.2; Blueprint decision 17; design/ADOPT.md).
-- Additive only: new tables, a public view and functions. Every writing function requires the server's token (cz_token_ok).
create table if not exists register (
  id                bigint generated always as identity primary key,   -- monotonic; the canonical order
  received          timestamptz not null default clock_timestamp(),
  state             text not null default 'received' check (state in ('received', 'traced', 'hidden')),
  state_before_hide text check (state_before_hide in ('received', 'traced')),
  type              text not null check (type in ('adoption', 'revision', 'withdrawal')),
  refers_to         bigint references register(id),
  statement         text not null check (char_length(statement) between 50 and 12000),   -- canonical JSON, exactly as hashed and signed
  statement_sha256  text not null check (statement_sha256 ~ '^[0-9a-f]{64}$'),
  signatory         text not null check (char_length(signatory) between 1 and 200),
  signatory_kind    text not null check (signatory_kind in ('person', 'institution')),
  institution       text check (char_length(institution) <= 200),
  capacity          text check (char_length(capacity) <= 200),
  versions          text[] not null,
  scope             text check (char_length(scope) <= 4000),
  reservations      text check (char_length(reservations) <= 4000),
  declared_date     date not null,
  lang              text check (char_length(lang) <= 35),
  trace_url         text not null check (trace_url ~ '^https://' and char_length(trace_url) <= 500),
  trace_host        text not null check (char_length(trace_host) <= 253),
  pubkey            text check (char_length(pubkey) <= 128),
  sig               text check (char_length(sig) <= 128),
  key_fingerprint   text check (key_fingerprint ~ '^[0-9a-f]{64}$'),
  source_hash       text,
  source_expires    timestamptz not null default now() + interval '30 days',
  traced_at         timestamptz,
  trace_body_sha256 text,
  category          text,
  updated           timestamptz,
  check ((type = 'adoption') = (refers_to is null))
);
create index if not exists register_source on register (source_hash, received) where source_hash is not null;
create index if not exists register_refers on register (refers_to) where refers_to is not null;
create index if not exists register_received on register (received);

create table if not exists register_log (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default clock_timestamp(),
  record_id   bigint not null references register(id),
  action      text not null check (action in ('trace_found', 'trace_not_found', 'trace_error', 'hide', 'unhide')),
  actor       text not null check (actor in ('site', 'human')),
  http_status text,
  body_sha256 text,
  category    text,
  detail      text
);
create table if not exists register_checks (source_hash text not null, hour timestamptz not null, count integer not null default 0, primary key (source_hash, hour));
create table if not exists register_intake (day date primary key, count integer not null default 0);
create table if not exists register_hashes (day date primary key, sha256 text not null, prev text, count integer not null, last_id bigint, payload text not null default '');
create table if not exists register_hash_revisions (id bigint generated always as identity primary key, at timestamptz not null default now(), day date not null, old_sha256 text not null, new_sha256 text not null);

alter table register enable row level security;
alter table register_log enable row level security;
alter table register_checks enable row level security;
alter table register_intake enable row level security;
alter table register_hashes enable row level security;
alter table register_hash_revisions enable row level security;
create policy "register hash revisions are public" on register_hash_revisions for select using (true);
grant select on register_hash_revisions to anon, authenticated;
create policy "register log is public" on register_log for select using (true);
create policy "register hashes are public" on register_hashes for select using (true);
grant select on register_log to anon, authenticated;
grant select on register_hashes to anon, authenticated;

-- the public view: every record with its state; the source never; a hidden record keeps only its hashes, type, dates and category
create or replace view register_public as
  select id, received, state, type, refers_to,
         case when state = 'hidden' then null else statement end as statement, statement_sha256,
         case when state = 'hidden' then null else signatory end as signatory, signatory_kind,
         case when state = 'hidden' then null else institution end as institution,
         case when state = 'hidden' then null else capacity end as capacity,
         versions,
         case when state = 'hidden' then null else scope end as scope,
         case when state = 'hidden' then null else reservations end as reservations,
         declared_date, lang,
         case when state = 'hidden' then null else trace_url end as trace_url, trace_host,
         pubkey, sig, key_fingerprint, traced_at, trace_body_sha256, category, (state = 'hidden') as hidden
  from register;
grant select on register_public to anon, authenticated;

-- LIVE cz_register_post: limits (5 a day per source, 200 a day in all), the link of a revision or withdrawal to its adoption
-- (same key, or traced on the same host), then the record. Returns {id, state, statement_sha256} or {state:'not accepted', reason, …}.
create or replace function cz_register_post(
  p_type text, p_refers_to bigint, p_statement text, p_signatory text, p_signatory_kind text, p_institution text, p_capacity text,
  p_versions text[], p_scope text, p_reservations text, p_declared_date date, p_lang text, p_trace_url text, p_trace_host text,
  p_pubkey text, p_sig text, p_key_fingerprint text, p_source_hash text, p_token text)
returns json language plpgsql security definer set search_path = public set timezone = 'UTC' as $$
declare v_rate int := 5; v_intake int := 200; v_recent int; v_oldest timestamptz; v_today int; v_id bigint; v_sha text; v_root register%rowtype;
begin
  if not cz_token_ok(p_token) then raise exception 'unauthorised'; end if;
  perform pg_advisory_xact_lock(hashtext('register|' || coalesce(p_source_hash, '')));
  select count(*), min(received) into v_recent, v_oldest from register where source_hash = p_source_hash and received > now() - interval '1 day';
  if v_recent >= v_rate then
    return json_build_object('state', 'not accepted', 'reason', 'limit', 'limit', v_rate, 'remaining', 0,
      'retry_after_seconds', greatest(1, ceil(extract(epoch from (v_oldest + interval '1 day' - now())))::int));
  end if;
  if p_type in ('revision', 'withdrawal') then
    select * into v_root from register where id = p_refers_to;
    if not found or v_root.type <> 'adoption' or v_root.state = 'hidden' then
      return json_build_object('state', 'not accepted', 'reason', 'invalid', 'detail', 'refers_to: no such adoption');
    end if;
    if not ((v_root.key_fingerprint is not null and p_key_fingerprint is not null and p_key_fingerprint = v_root.key_fingerprint)
            or lower(p_trace_host) = lower(v_root.trace_host)) then
      return json_build_object('state', 'not accepted', 'reason', 'invalid',
        'detail', 'a revision or withdrawal must be signed with the adoption''s key or traced on the adoption''s host (' || v_root.trace_host || ')');
    end if;
  elsif p_refers_to is not null then
    return json_build_object('state', 'not accepted', 'reason', 'invalid', 'detail', 'an adoption refers to nothing');
  end if;
  insert into register_intake (day, count) values (current_date, 0) on conflict (day) do nothing;
  update register_intake set count = count + 1 where day = current_date and count < v_intake returning count into v_today;
  if v_today is null then
    return json_build_object('state', 'not accepted', 'reason', 'capacity',
      'retry_after_seconds', ceil(extract(epoch from (date_trunc('day', now()) + interval '1 day' - now())))::int);
  end if;
  v_sha := encode(extensions.digest(convert_to(p_statement, 'UTF8'), 'sha256'), 'hex');
  insert into register (type, refers_to, statement, statement_sha256, signatory, signatory_kind, institution, capacity, versions, scope, reservations,
                        declared_date, lang, trace_url, trace_host, pubkey, sig, key_fingerprint, source_hash, received)
    values (p_type, p_refers_to, p_statement, v_sha, p_signatory, p_signatory_kind, nullif(p_institution, ''), nullif(p_capacity, ''), p_versions,
            nullif(p_scope, ''), nullif(p_reservations, ''), p_declared_date, nullif(p_lang, ''), p_trace_url, lower(p_trace_host),
            nullif(p_pubkey, ''), nullif(p_sig, ''), nullif(p_key_fingerprint, ''), p_source_hash, clock_timestamp())
    returning id into v_id;
  return json_build_object('id', v_id, 'state', 'received', 'statement_sha256', v_sha, 'limit', v_rate, 'remaining', greatest(0, v_rate - v_recent - 1));
end $$;
grant execute on function cz_register_post(text, bigint, text, text, text, text, text, text[], text, text, date, text, text, text, text, text, text, text, text) to anon, authenticated;

-- LIVE cz_register_check_begin: before the site fetches a trace — 10 checks an hour per source (null source = the daily job)
create or replace function cz_register_check_begin(p_id bigint, p_source_hash text, p_token text)
returns json language plpgsql security definer set search_path = public set timezone = 'UTC' as $$
declare v register%rowtype; v_recent int;
begin
  if not cz_token_ok(p_token) then raise exception 'unauthorised'; end if;
  select * into v from register where id = p_id;
  if not found or v.state = 'hidden' then return json_build_object('allowed', false, 'reason', 'no such record'); end if;
  if p_source_hash is not null then   -- 10 a clock hour per source
    insert into register_checks (source_hash, hour, count) values (p_source_hash, date_trunc('hour', now()), 1)
      on conflict (source_hash, hour) do update set count = register_checks.count + 1 where register_checks.count < 10
      returning count into v_recent;
    if v_recent is null then
      return json_build_object('allowed', false, 'reason', 'limit', 'retry_after_seconds', greatest(1, ceil(extract(epoch from (date_trunc('hour', now()) + interval '1 hour' - now())))::int));
    end if;
  end if;
  return json_build_object('allowed', true, 'id', v.id, 'state', v.state, 'trace_url', v.trace_url, 'statement_sha256', v.statement_sha256);
end $$;
grant execute on function cz_register_check_begin(bigint, text, text) to anon, authenticated;

-- LIVE cz_register_trace: the result of a check, logged; a found trace turns a received record into a traced one (never back)
create or replace function cz_register_trace(p_id bigint, p_found boolean, p_http_status text, p_body_sha256 text, p_detail text, p_token text)
returns json language plpgsql security definer set search_path = public set timezone = 'UTC' as $$
declare v register%rowtype;
begin
  if not cz_token_ok(p_token) then raise exception 'unauthorised'; end if;
  select * into v from register where id = p_id for update;
  if not found then raise exception 'no such record'; end if;
  insert into register_log (record_id, action, actor, http_status, body_sha256, detail)
    values (p_id, case when p_found then 'trace_found' when p_http_status like 'error%' then 'trace_error' else 'trace_not_found' end, 'site',
            left(p_http_status, 60), p_body_sha256, left(p_detail, 500));
  if p_found and v.state = 'received' then
    update register set state = 'traced', traced_at = clock_timestamp(), trace_body_sha256 = p_body_sha256, updated = clock_timestamp() where id = p_id;
  end if;
  return (select json_build_object('id', id, 'state', state, 'traced_at', traced_at) from register where id = p_id);
end $$;
grant execute on function cz_register_trace(bigint, boolean, text, text, text, text) to anon, authenticated;

-- LIVE cz_register_pending: received records not yet traced, at most 30 days old, the least recently checked first (the daily job)
create or replace function cz_register_pending(p_limit int, p_token text)
returns table (id bigint, trace_url text, statement_sha256 text)
language plpgsql security definer set search_path = public set timezone = 'UTC' as $$
begin
  if not cz_token_ok(p_token) then raise exception 'unauthorised'; end if;
  return query select r.id, r.trace_url, r.statement_sha256 from register r
    where r.state = 'received' and r.received > now() - interval '30 days'
    order by (select max(l.at) from register_log l where l.record_id = r.id) asc nulls first, r.id
    limit least(greatest(coalesce(p_limit, 20), 1), 50);
end $$;
grant execute on function cz_register_pending(int, text) to anon, authenticated;

-- LIVE cz_register_moderate: hide / unhide under the room's grounds (§7.5), logged with category and reason
create or replace function cz_register_moderate(p_id bigint, p_action text, p_category text, p_reason text, p_token text)
returns json language plpgsql security definer set search_path = public set timezone = 'UTC' as $$
declare v register%rowtype;
begin
  if not cz_token_ok(p_token) then raise exception 'unauthorised'; end if;
  select * into v from register where id = p_id for update;
  if not found then raise exception 'no such record'; end if;
  if p_action = 'hide' then
    if v.state = 'hidden' then raise exception 'already hidden'; end if;
    update register set state_before_hide = v.state, state = 'hidden', category = p_category, updated = clock_timestamp() where id = p_id;
  elsif p_action = 'unhide' then
    if v.state <> 'hidden' then raise exception 'not hidden'; end if;
    update register set state = coalesce(v.state_before_hide, 'received'), state_before_hide = null, category = null, updated = clock_timestamp() where id = p_id;
  else raise exception 'unknown action'; end if;
  insert into register_log (record_id, action, actor, category, detail) values (p_id, p_action, 'human', p_category, left(p_reason, 500));
  return (select json_build_object('id', id, 'state', state, 'category', category) from register where id = p_id);
end $$;
grant execute on function cz_register_moderate(bigint, text, text, text, text) to anon, authenticated;

-- public reads: one record (hidden ones keep only their hashes), a page in canonical order, one UTC day
create or replace function cz_register_entry(p_id bigint)
returns setof register_public language sql security definer set search_path = public set timezone = 'UTC' as $$
  select * from register_public where id = p_id
$$;
grant execute on function cz_register_entry(bigint) to anon, authenticated;
create or replace function cz_register_list(p_after bigint, p_limit int)
returns setof register_public language sql security definer set search_path = public set timezone = 'UTC' as $$
  select * from register_public where (p_after is null or id > p_after) order by id asc limit least(greatest(coalesce(p_limit, 100), 1), 500)
$$;
grant execute on function cz_register_list(bigint, int) to anon, authenticated;
create or replace function cz_register_day(p_day date)
returns setof register_public language sql security definer set search_path = public set timezone = 'UTC' as $$
  select * from register_public where received >= p_day and received < p_day + 1 order by id
$$;
grant execute on function cz_register_day(date) to anon, authenticated;
create or replace function cz_register_stats()
returns json language sql security definer set search_path = public set timezone = 'UTC' as $$
  select json_build_object('records', (select count(*) from register), 'traced', (select count(*) from register where state = 'traced'),
    'received', (select count(*) from register where state = 'received'), 'hidden', (select count(*) from register where state = 'hidden'),
    'today', coalesce((select count from register_intake where day = current_date), 0), 'daily_intake_max', 200,
    'last_log', (select json_build_object('day', day, 'sha256', sha256, 'count', count) from register_hashes order by day desc limit 1))
$$;
grant execute on function cz_register_stats() to anon, authenticated;

-- LIVE cz_register_daily: as cz_daily, over the register (one line per record; its own chain)
create or replace function cz_register_daily(p_token text, p_day date, p_force boolean)
returns json language plpgsql security definer set search_path = public set timezone = 'UTC' as $$
declare v_from date; v_to date := coalesce(p_day, current_date - 1); d date; v_prev text; v_payload text; v_sha text; v_old text;
        v_count bigint; v_last bigint; v_done int := 0; v_last_result json;
begin
  if not cz_token_ok(p_token) then raise exception 'unauthorised'; end if;
  update register set source_hash = null where source_hash is not null and source_expires < now();
  update register_checks set source_hash = 'expired:' || gen_random_uuid()::text where hour < now() - interval '30 days' and source_hash not like 'expired:%';
  if v_to >= current_date then raise exception 'the day is not finished (UTC)'; end if;
  if p_day is not null and p_force then v_from := p_day;
  else v_from := coalesce((select max(day) + 1 from register_hashes), (select min(received)::date from register), v_to); end if;
  if v_from > v_to then
    return json_build_object('computed', 0, 'last', (select json_build_object('day', day, 'sha256', sha256, 'count', count) from register_hashes order by day desc limit 1));
  end if;
  for d in select generate_series(v_from, v_to, interval '1 day')::date loop
    select sha256 into v_prev from register_hashes where day = d - 1;
    select string_agg(json_build_object('id', id, 'received', to_char(received at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'), 'state', state,
             'type', type, 'refers_to', refers_to, 'statement_sha256', statement_sha256, 'trace_url', case when state = 'hidden' then null else trace_url end, 'trace_host', trace_host,
             'key_fingerprint', key_fingerprint, 'pubkey', pubkey, 'sig', sig, 'category', category)::text, E'\n' order by id), count(*), max(id)
      into v_payload, v_count, v_last from register where received >= d and received < d + 1;
    v_sha := encode(extensions.digest(convert_to(coalesce(v_prev, '') || E'\n' || coalesce(v_payload, ''), 'UTF8'), 'sha256'), 'hex');
    select sha256 into v_old from register_hashes where day = d;
    if v_old is null then
      insert into register_hashes (day, sha256, prev, count, last_id, payload) values (d, v_sha, v_prev, coalesce(v_count, 0), v_last, coalesce(v_payload, ''));
    elsif p_force and v_old <> v_sha then
      insert into register_hash_revisions (day, old_sha256, new_sha256) values (d, v_old, v_sha);
      update register_hashes set sha256 = v_sha, prev = v_prev, count = coalesce(v_count, 0), last_id = v_last, payload = coalesce(v_payload, '') where day = d;
    else v_sha := v_old; end if;
    v_done := v_done + 1;
    v_last_result := json_build_object('day', d, 'sha256', v_sha, 'prev', v_prev, 'count', coalesce(v_count, 0), 'last_id', v_last);
  end loop;
  return json_build_object('computed', v_done, 'last', v_last_result);
end $$;
grant execute on function cz_register_daily(text, date, boolean) to anon, authenticated;
notify pgrst, 'reload schema';

-- ================================================================ v6c (2026-10-28 20:13 UTC), applied as migration cz_views_security_invoker_v6c
-- The register's security review (finding G-4): a view owned by postgres ran with its owner's rights and was automatically
-- updatable, and Supabase's default privileges grant anon every privilege on new relations, so the publishable key could have
-- written through entries_public and register_public. The views now check privileges and row-level security as the caller:
-- anon reads them through the security-definer functions only (no policy lets it read the tables directly). No row was
-- changed through them: the room's production table had no entries yet. cz_token_ok now fails closed (finding G-5).
alter view entries_public set (security_invoker = true);
alter view register_public set (security_invoker = true);
create or replace function cz_token_ok(p_token text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(encode(extensions.digest(convert_to(coalesce(p_token, ''), 'UTF8'), 'sha256'), 'hex') = (select value from config where key = 'admin_token_sha256'), false)
$$;
create or replace function cz_register_linked(p_root bigint) returns setof register_public
language sql stable security definer set search_path = public as $$
  select * from register_public where id = p_root or refers_to = p_root order by id limit 1000
$$;
grant execute on function cz_register_linked(bigint) to anon, authenticated;

-- ================================================================ v6d (2026-10-28 20:20–20:35 UTC), migrations cz_register_v6d_review (production; on the
-- test database in two parts, cz_register_v6d_review and cz_register_v6d_limits, the second also setting the test database's own limits)
-- The Adoption Register after its security review (design/ADOPT.md §3–4; design/test/FINDINGS-REGISTER.md G-1 … G-12).
-- Additive: two columns, a unique index, functions replaced in place, one new function (the old one answers "superseded").
-- G-1: a secret trace token per record, given only to the submitter, is what the trace must find (the record's address and the
--      statement's SHA-256 are public and could be echoed or copied by pages the signatory does not control).
-- G-3: a statement is recorded once (its SHA-256 is unique); a revision or withdrawal links only to a traced adoption — signed
--      with the adoption's key when the adoption was signed, else traced at the adoption's exact address.
-- G-7: one check of a record every 10 minutes at most (by anyone, the daily job included); checks only within 30 days of receipt.
-- The limits (5 statements a day per source, 200 a day in all, 10 checks an hour per source) can be set in config, like the room's.
alter table register add column if not exists trace_token text check (trace_token ~ '^[0-9a-f]{32}$');
alter table register add column if not exists last_check_at timestamptz;
create unique index if not exists register_statement_unique on register (statement_sha256);

create or replace function cz_register_post(
  p_type text, p_refers_to bigint, p_statement text, p_signatory text, p_signatory_kind text, p_institution text, p_capacity text,
  p_versions text[], p_scope text, p_reservations text, p_declared_date date, p_lang text, p_trace_url text, p_trace_host text,
  p_pubkey text, p_sig text, p_key_fingerprint text, p_source_hash text, p_token text)
returns json language plpgsql security definer set search_path = public set timezone = 'UTC' as $$
declare v_rate int := coalesce((select value::int from config where key = 'register_rate_per_day'), 5);
        v_intake int := coalesce((select value::int from config where key = 'register_daily_intake'), 200);
        v_recent int; v_oldest timestamptz; v_today int; v_id bigint; v_sha text; v_root register%rowtype;
        v_dup bigint; v_token text; v_fp text := nullif(p_key_fingerprint, '');
begin
  if not cz_token_ok(p_token) then raise exception 'unauthorised'; end if;
  perform pg_advisory_xact_lock(hashtext('register|' || coalesce(p_source_hash, '')));
  select count(*), min(received) into v_recent, v_oldest from register where source_hash = p_source_hash and received > now() - interval '1 day';
  if v_recent >= v_rate then
    return json_build_object('state', 'not accepted', 'reason', 'limit', 'limit', v_rate, 'remaining', 0,
      'retry_after_seconds', greatest(1, ceil(extract(epoch from (v_oldest + interval '1 day' - now())))::int));
  end if;
  v_sha := encode(extensions.digest(convert_to(p_statement, 'UTF8'), 'sha256'), 'hex');
  select id into v_dup from register where statement_sha256 = v_sha;
  if v_dup is not null then
    return json_build_object('state', 'not accepted', 'reason', 'invalid', 'detail',
      'this exact statement is already record #' || v_dup || ': a statement is recorded once (a new one differs at least in its date, its text or its trace address)');
  end if;
  if p_type in ('revision', 'withdrawal') then
    select * into v_root from register where id = p_refers_to;
    if not found or v_root.type <> 'adoption' or v_root.state = 'hidden' then
      return json_build_object('state', 'not accepted', 'reason', 'invalid', 'detail', 'refers_to: no such adoption');
    end if;
    if v_root.state <> 'traced' then
      return json_build_object('state', 'not accepted', 'reason', 'invalid', 'detail',
        'refers_to: adoption #' || v_root.id || ' is not traced; only a traced adoption can be revised or withdrawn (an untraced statement is not an adoption)');
    end if;
    if v_root.key_fingerprint is not null then
      if v_fp is distinct from v_root.key_fingerprint then
        return json_build_object('state', 'not accepted', 'reason', 'invalid', 'detail',
          'adoption #' || v_root.id || ' was signed: a revision or withdrawal of it must be signed with the same key (fingerprint ' || v_root.key_fingerprint || ')');
      end if;
    elsif p_trace_url is distinct from v_root.trace_url then
      return json_build_object('state', 'not accepted', 'reason', 'invalid', 'detail',
        'adoption #' || v_root.id || ' was not signed: a revision or withdrawal of it must be traced at the same address, ' || v_root.trace_url);
    end if;
  elsif p_refers_to is not null then
    return json_build_object('state', 'not accepted', 'reason', 'invalid', 'detail', 'an adoption refers to nothing');
  end if;
  insert into register_intake (day, count) values (current_date, 0) on conflict (day) do nothing;
  update register_intake set count = count + 1 where day = current_date and count < v_intake returning count into v_today;
  if v_today is null then
    return json_build_object('state', 'not accepted', 'reason', 'capacity',
      'retry_after_seconds', ceil(extract(epoch from (date_trunc('day', now()) + interval '1 day' - now())))::int);
  end if;
  v_token := encode(extensions.gen_random_bytes(16), 'hex');
  insert into register (type, refers_to, statement, statement_sha256, signatory, signatory_kind, institution, capacity, versions, scope, reservations,
                        declared_date, lang, trace_url, trace_host, pubkey, sig, key_fingerprint, source_hash, received, trace_token)
    values (p_type, p_refers_to, p_statement, v_sha, p_signatory, p_signatory_kind, nullif(p_institution, ''), nullif(p_capacity, ''), p_versions,
            nullif(p_scope, ''), nullif(p_reservations, ''), p_declared_date, nullif(p_lang, ''), p_trace_url, lower(p_trace_host),
            nullif(p_pubkey, ''), nullif(p_sig, ''), v_fp, p_source_hash, clock_timestamp(), v_token)
    returning id into v_id;
  return json_build_object('id', v_id, 'state', 'received', 'statement_sha256', v_sha, 'trace_token', v_token, 'limit', v_rate, 'remaining', greatest(0, v_rate - v_recent - 1));
end $$;

create or replace function cz_register_check_begin(p_id bigint, p_source_hash text, p_token text)
returns json language plpgsql security definer set search_path = public set timezone = 'UTC' as $$
declare v register%rowtype; v_recent int; v_claimed bigint;
        v_per_hour int := coalesce((select value::int from config where key = 'register_checks_per_hour'), 10);
begin
  if not cz_token_ok(p_token) then raise exception 'unauthorised'; end if;
  select * into v from register where id = p_id;
  if not found or v.state = 'hidden' then return json_build_object('allowed', false, 'reason', 'no such record'); end if;
  if v.state = 'traced' then return json_build_object('allowed', false, 'reason', 'already traced', 'traced_at', v.traced_at); end if;
  if v.received < now() - interval '30 days' then return json_build_object('allowed', false, 'reason', 'expired'); end if;
  if v.trace_token is null then return json_build_object('allowed', false, 'reason', 'no trace token (a record from before 28 Oct 2026, 21:00 UTC)'); end if;
  if p_source_hash is not null then   -- checks per clock hour per source (10 unless configured)
    insert into register_checks (source_hash, hour, count) values (p_source_hash, date_trunc('hour', now()), 1)
      on conflict (source_hash, hour) do update set count = register_checks.count + 1 where register_checks.count < v_per_hour
      returning count into v_recent;
    if v_recent is null then
      return json_build_object('allowed', false, 'reason', 'limit', 'retry_after_seconds', greatest(1, ceil(extract(epoch from (date_trunc('hour', now()) + interval '1 hour' - now())))::int));
    end if;
  end if;
  update register set last_check_at = clock_timestamp() where id = p_id and (last_check_at is null or last_check_at < now() - interval '10 minutes') returning id into v_claimed;
  if v_claimed is null then
    return json_build_object('allowed', false, 'reason', 'too soon',
      'retry_after_seconds', greatest(1, ceil(extract(epoch from (v.last_check_at + interval '10 minutes' - now())))::int));
  end if;
  return json_build_object('allowed', true, 'id', v.id, 'state', v.state, 'trace_url', v.trace_url, 'trace_token', v.trace_token);
end $$;

-- the daily job's list: received records with a token, at most 30 days old, not checked in the last 10 minutes, the least
-- recently checked first; claimed (last_check_at) as they are listed
create or replace function cz_register_pending2(p_limit int, p_token text)
returns table (id bigint, trace_url text, trace_token text)
language plpgsql security definer set search_path = public set timezone = 'UTC' as $$
declare v_ids bigint[];
begin
  if not cz_token_ok(p_token) then raise exception 'unauthorised'; end if;
  select array_agg(s.id) into v_ids from (
    select r.id from register r
    where r.state = 'received' and r.received > now() - interval '30 days' and r.trace_token is not null
      and (r.last_check_at is null or r.last_check_at < now() - interval '10 minutes')
    order by r.last_check_at asc nulls first, r.id
    limit least(greatest(coalesce(p_limit, 50), 1), 100)) s;
  if v_ids is null then return; end if;
  update register set last_check_at = clock_timestamp() where register.id = any(v_ids);
  return query select r.id, r.trace_url, r.trace_token from register r where r.id = any(v_ids) order by r.id;
end $$;
grant execute on function cz_register_pending2(int, text) to anon, authenticated;

create or replace function cz_register_stats()
returns json language sql security definer set search_path = public set timezone = 'UTC' as $$
  select json_build_object('records', (select count(*) from register), 'traced', (select count(*) from register where state = 'traced'),
    'received', (select count(*) from register where state = 'received'), 'hidden', (select count(*) from register where state = 'hidden'),
    'today', coalesce((select count from register_intake where day = current_date), 0),
    'daily_intake_max', coalesce((select value::int from config where key = 'register_daily_intake'), 200),
    'rate_per_day', coalesce((select value::int from config where key = 'register_rate_per_day'), 5),
    'last_log', (select json_build_object('day', day, 'sha256', sha256, 'count', count) from register_hashes order by day desc limit 1))
$$;

create or replace function cz_register_pending(p_limit int, p_token text)
returns table (id bigint, trace_url text, statement_sha256 text)
language plpgsql security definer set search_path = public as $$
begin raise exception 'superseded: cz_register_pending2'; end $$;

notify pgrst, 'reload schema';
-- ================================================================ v6e (2026-10-28), migration cz_register_v6e_review2
-- The register's second review pass: a check refused as "too soon" no longer costs the caller's hourly quota, and a source over
-- its quota cannot claim (and so block) a record; the daily job's list no longer claims what it lists — each record is claimed
-- when it is checked — and is ordered by when a record last had attention (its last check, else its receipt), so a day of new
-- statements cannot starve older ones; the numbers in force are returned with every refusal and by cz_register_stats.
create or replace function cz_register_check_begin(p_id bigint, p_source_hash text, p_token text)
returns json language plpgsql security definer set search_path = public set timezone = 'UTC' as $$
declare v register%rowtype; v_recent int; v_claimed bigint;
        v_per_hour int := coalesce((select value::int from config where key = 'register_checks_per_hour'), 10);
begin
  if not cz_token_ok(p_token) then raise exception 'unauthorised'; end if;
  select * into v from register where id = p_id;
  if not found or v.state = 'hidden' then return json_build_object('allowed', false, 'reason', 'no such record'); end if;
  if v.state = 'traced' then return json_build_object('allowed', false, 'reason', 'already traced', 'traced_at', v.traced_at); end if;
  if v.received < now() - interval '30 days' then return json_build_object('allowed', false, 'reason', 'expired'); end if;
  if v.trace_token is null then return json_build_object('allowed', false, 'reason', 'no trace token (a record from before 28 Oct 2026, 21:00 UTC)'); end if;
  if v.last_check_at is not null and v.last_check_at > now() - interval '10 minutes' then   -- refused before anything is counted
    return json_build_object('allowed', false, 'reason', 'too soon',
      'retry_after_seconds', greatest(1, ceil(extract(epoch from (v.last_check_at + interval '10 minutes' - now())))::int));
  end if;
  if p_source_hash is not null then   -- checks per clock hour per source (10 unless configured), counted before the record is claimed
    insert into register_checks (source_hash, hour, count) values (p_source_hash, date_trunc('hour', now()), 1)
      on conflict (source_hash, hour) do update set count = register_checks.count + 1 where register_checks.count < v_per_hour
      returning count into v_recent;
    if v_recent is null then
      return json_build_object('allowed', false, 'reason', 'limit', 'limit', v_per_hour,
        'retry_after_seconds', greatest(1, ceil(extract(epoch from (date_trunc('hour', now()) + interval '1 hour' - now())))::int));
    end if;
  end if;
  update register set last_check_at = clock_timestamp() where id = p_id and (last_check_at is null or last_check_at < now() - interval '10 minutes') returning id into v_claimed;
  if v_claimed is null then   -- another check claimed it a moment ago
    return json_build_object('allowed', false, 'reason', 'too soon', 'retry_after_seconds', 600);
  end if;
  return json_build_object('allowed', true, 'id', v.id, 'state', v.state, 'trace_url', v.trace_url, 'trace_token', v.trace_token);
end $$;

create or replace function cz_register_pending2(p_limit int, p_token text)
returns table (id bigint, trace_url text, trace_token text)
language plpgsql security definer set search_path = public set timezone = 'UTC' as $$
begin
  if not cz_token_ok(p_token) then raise exception 'unauthorised'; end if;
  return query select r.id, r.trace_url, r.trace_token from register r
    where r.state = 'received' and r.received > now() - interval '30 days' and r.trace_token is not null
      and (r.last_check_at is null or r.last_check_at < now() - interval '10 minutes')
    order by coalesce(r.last_check_at, r.received) asc, r.id
    limit least(greatest(coalesce(p_limit, 50), 1), 100);
end $$;

create or replace function cz_register_stats()
returns json language sql security definer set search_path = public set timezone = 'UTC' as $$
  select json_build_object('records', (select count(*) from register), 'traced', (select count(*) from register where state = 'traced'),
    'received', (select count(*) from register where state = 'received'), 'hidden', (select count(*) from register where state = 'hidden'),
    'today', coalesce((select count from register_intake where day = current_date), 0),
    'daily_intake_max', coalesce((select value::int from config where key = 'register_daily_intake'), 200),
    'rate_per_day', coalesce((select value::int from config where key = 'register_rate_per_day'), 5),
    'checks_per_hour', coalesce((select value::int from config where key = 'register_checks_per_hour'), 10),
    'last_log', (select json_build_object('day', day, 'sha256', sha256, 'count', count) from register_hashes order by day desc limit 1))
$$;
notify pgrst, 'reload schema';

-- ================================================================ v6f (2026-10-29), migration cz_moderation_reviews_v6f
-- Blueprint §7.5: "a classifier flags; a human decides; both actions are logged publicly". A decision to keep a flagged entry
-- was not logged anywhere (the log held only flags and the hide/redact/unhide/unredact actions). Additive: a public table of
-- the administrator's "keep" decisions, one per flag, with the entry's content hash and a written reason; the function that
-- records one (the administrator's token); and the list of flags still awaiting a human decision.
create table if not exists moderation_reviews (
  id             bigint generated always as identity primary key,
  at             timestamptz not null default now(),
  flag_log_id    bigint not null unique references moderation_log(id),
  entry_id       bigint not null references entries(id),
  decision       text not null check (decision = 'keep'),
  content_sha256 text not null,
  reason         text not null check (char_length(reason) between 1 and 2000)
);
alter table moderation_reviews enable row level security;
create policy "moderation reviews are public" on moderation_reviews for select using (true);
grant select on moderation_reviews to anon, authenticated;

create or replace function cz_review_keep(p_flag bigint, p_reason text, p_token text) returns jsonb
language plpgsql security definer set search_path = public set timezone = 'UTC' as $$
declare v_entry bigint; v_sha text;
begin
  if not cz_token_ok(p_token) then raise exception 'unauthorised'; end if;
  if coalesce(char_length(btrim(p_reason)), 0) < 1 then raise exception 'a written reason is required'; end if;
  select f.entry_id, e.content_sha256 into v_entry, v_sha
    from moderation_log f join entries e on e.id = f.entry_id where f.id = p_flag and f.action = 'flag';
  if not found then raise exception 'no such flag'; end if;
  begin
    insert into moderation_reviews (flag_log_id, entry_id, decision, content_sha256, reason) values (p_flag, v_entry, 'keep', v_sha, left(p_reason, 2000));
  exception when unique_violation then raise exception 'already decided';
  end;
  return jsonb_build_object('flag', p_flag, 'entry', v_entry, 'decision', 'keep');
end $$;
grant execute on function cz_review_keep(bigint, text, text) to anon, authenticated;

-- the flags still awaiting a human decision: a classifier's flag on an entry that is still published, with no human action on
-- that entry after the flag and no "keep" recorded for it (all of it public already; listed in one place for the administrator)
create or replace function cz_flags_open() returns table (flag_id bigint, flagged_at timestamptz, entry_id bigint, category text, classifier_model text,
  classifier_prompt text, classifier_score numeric, received timestamptz, author text, kind text, lang text, content text, content_sha256 text)
language sql stable security definer set search_path = public as $$
  select f.id, f.at, e.id, f.category, f.classifier_model, f.classifier_prompt, f.classifier_score, e.received, e.author, e.kind, e.lang, e.content, e.content_sha256
  from moderation_log f join entries e on e.id = f.entry_id
  where f.action = 'flag' and e.state = 'published'
    and not exists (select 1 from moderation_log h where h.entry_id = f.entry_id and h.actor = 'human' and h.action in ('hide', 'unhide', 'redact', 'unredact') and h.id > f.id)
    and not exists (select 1 from moderation_reviews r where r.flag_log_id = f.id)
  order by f.id asc limit 200
$$;
grant execute on function cz_flags_open() to anon, authenticated;

-- ================================================================ R3 (2026-10-29), migration cz_r3_effect_retention (both databases)
-- Round 3 of the external reviews (design/test/FINDINGS-REGISTER.md R3-12, R3-21). Additive: two new functions.
-- R3-12: the status of an adoption follows the latest traced statement of its whole history. cz_register_linked lists the
--        first 1,000 records only, so a record's page also reads, from the full history, the latest traced statement and the
--        latest traced statement of what was committed (a hidden statement keeps the effect it had: R3-11).
create or replace function cz_register_effect(p_root bigint) returns setof register_public
language sql stable security definer set search_path = public as $$
  (select * from register_public where (id = p_root or refers_to = p_root) and (state = 'traced' or (state = 'hidden' and traced_at is not null))
     order by id desc limit 1)
  union
  (select * from register_public where (id = p_root or refers_to = p_root) and (state = 'traced' or (state = 'hidden' and traced_at is not null))
     and type <> 'withdrawal' order by id desc limit 1)
$$;
grant execute on function cz_register_effect(bigint) to anon, authenticated;
-- R3-21: source hashes are kept 30 days at most (Blueprint 1.3.1 §7.3), in every table that holds one. The translation
--        allowance (source_chars) lost its expiry when cz_source_chars took a token (R-8); the daily job calls this, and it
--        replaces an old hash with a random value instead of removing the row (the day's counts stay).
create or replace function cz_expire_sources(p_token text) returns json
language plpgsql security definer set search_path = public set timezone = 'UTC' as $$
declare a bigint; b bigint; c bigint; d bigint;
begin
  if not cz_token_ok(p_token) then raise exception 'unauthorised'; end if;
  update entries set source_hash = null where source_hash is not null and source_expires < now();
  get diagnostics a = row_count;
  update register set source_hash = null where source_hash is not null and source_expires < now();
  get diagnostics b = row_count;
  update register_checks set source_hash = 'expired:' || gen_random_uuid()::text where hour < now() - interval '30 days' and source_hash not like 'expired:%';
  get diagnostics c = row_count;
  update source_chars set source_hash = 'expired:' || gen_random_uuid()::text where day < current_date - 30 and source_hash not like 'expired:%';
  get diagnostics d = row_count;
  return json_build_object('entries', a, 'register', b, 'register_checks', c, 'source_chars', d);
end $$;
grant execute on function cz_expire_sources(text) to anon, authenticated;
-- ================================================================ v6g (2026-10-29), migration cz_admin_v6g_review (test and production, 05:12 and 05:14 UTC)
-- The administrator's page, /admin, after its security review (design/test/FINDINGS-REGISTER.md A-1 … A-8). Additive: two new
-- functions, functions replaced in place, and one new config row that only cz_admin_signout writes; no table is altered and no
-- row is deleted. The grants on anon and authenticated, and cz_token_ok's, are left as they are: their revocation is prepared
-- separately in room/v6g-revokes.sql.
-- A-1: signing out ends every open session of the page on the server. cz_admin_signout records the time (config
--      admin_sessions_not_before; it never moves back); the page refuses any session issued at or before it (cz_admin_floor,
--      read on every authenticated request; -infinity until the first sign-out).
-- A-4: cz_moderate refuses a transition that changes nothing — a hide of a hidden entry ('already hidden'), an unhide of an
--      entry that is not hidden ('not hidden'), an unredact of an entry that is not redacted ('not redacted'; a hidden entry is
--      unhidden first) — so that a mistyped id cannot close a flag with no decision on it; a redaction of a redacted entry stays
--      allowed (it changes the text). The entry's row is locked while it is decided. cz_review_keep records a "keep" only while
--      the flag is still open by cz_flags_open's own condition ('already decided' otherwise). Otherwise both are as before.
-- A-7: the superseded signatures raise in a database built from this file as they do in production, where they were disabled
--      by migrations this file did not record (their definitions as read from production's catalog on 29 Oct 2026). Likewise
--      v5e: cz_moderate below carries its change (an unhide that returns an entry to 'redacted' restores the redaction's own
--      category), which production has had since v5e and this file only described.
create or replace function cz_admin_signout(p_token text) returns timestamptz
language plpgsql security definer set search_path = public set timezone = 'UTC' as $$
declare v_at timestamptz;
begin
  if not cz_token_ok(p_token) then raise exception 'unauthorised'; end if;
  insert into config (key, value) values ('admin_sessions_not_before', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))
    on conflict (key) do update set value = case when config.value::timestamptz >= excluded.value::timestamptz then config.value else excluded.value end
    returning value::timestamptz into v_at;
  return v_at;
end $$;
grant execute on function cz_admin_signout(text) to anon, authenticated;

create or replace function cz_admin_floor(p_token text) returns timestamptz
language plpgsql stable security definer set search_path = public set timezone = 'UTC' as $$
begin
  if not cz_token_ok(p_token) then raise exception 'unauthorised'; end if;
  return coalesce((select value::timestamptz from config where key = 'admin_sessions_not_before'), '-infinity'::timestamptz);
end $$;
grant execute on function cz_admin_floor(text) to anon, authenticated;

-- LIVE cz_moderate: as v5d2 with v5e's unhide, and no transition that changes nothing
create or replace function cz_moderate(p_entry bigint, p_action text, p_category text, p_reason text, p_redacted_text text, p_token text)
returns void language plpgsql security definer set search_path = public set timezone = 'UTC' as $$
declare v_state text; v_redacted text;
begin
  if not cz_token_ok(p_token) then raise exception 'unauthorised'; end if;
  select state, redacted_text into v_state, v_redacted from entries where id = p_entry for update;
  if not found then raise exception 'no such entry'; end if;
  if p_action = 'hide' and v_state = 'hidden' then raise exception 'already hidden'; end if;
  if p_action = 'unhide' and v_state <> 'hidden' then raise exception 'not hidden'; end if;
  if p_action = 'unredact' and v_state <> 'redacted' then raise exception 'not redacted'; end if;
  if p_action = 'hide' then update entries set state = 'hidden', category = p_category, updated = now() where id = p_entry;
  elsif p_action = 'unhide' then
    if v_redacted is not null then
      update entries set state = 'redacted', updated = now(),
        category = (select m.category from moderation_log m where m.entry_id = p_entry and m.action = 'redact' order by m.id desc limit 1) where id = p_entry;
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

-- LIVE cz_review_keep: as v6f, for a flag that is still open (the entry published, no human decision on it after the flag, no keep yet)
create or replace function cz_review_keep(p_flag bigint, p_reason text, p_token text) returns jsonb
language plpgsql security definer set search_path = public set timezone = 'UTC' as $$
declare v_entry bigint; v_sha text; v_state text;
begin
  if not cz_token_ok(p_token) then raise exception 'unauthorised'; end if;
  if coalesce(char_length(btrim(p_reason)), 0) < 1 then raise exception 'a written reason is required'; end if;
  select f.entry_id, e.content_sha256, e.state into v_entry, v_sha, v_state
    from moderation_log f join entries e on e.id = f.entry_id where f.id = p_flag and f.action = 'flag' for update of e;
  if not found then raise exception 'no such flag'; end if;
  if v_state <> 'published'
     or exists (select 1 from moderation_log h where h.entry_id = v_entry and h.actor = 'human' and h.action in ('hide', 'unhide', 'redact', 'unredact') and h.id > p_flag)
     or exists (select 1 from moderation_reviews r where r.flag_log_id = p_flag) then
    raise exception 'already decided';
  end if;
  begin
    insert into moderation_reviews (flag_log_id, entry_id, decision, content_sha256, reason) values (p_flag, v_entry, 'keep', v_sha, left(p_reason, 2000));
  exception when unique_violation then raise exception 'already decided';
  end;
  return jsonb_build_object('flag', p_flag, 'entry', v_entry, 'decision', 'keep');
end $$;

-- superseded and disabled, exactly as in production (v5: cz_post with 13 arguments, cz_translation_put, cz_source_chars(text, int),
-- cz_daily(text), cz_daily(text, date); v6d's cz_register_pending is recorded above)
create or replace function cz_post(
  p_author text, p_kind text, p_system text, p_operator text, p_prompt text, p_lang text, p_ref text,
  p_content text, p_declared_date text, p_pubkey text, p_sig text, p_key_fingerprint text, p_source_hash text)
returns json language plpgsql security definer set search_path = public as $$
begin raise exception 'superseded: cz_post now requires p_token'; end $$;
create or replace function cz_translation_put(p_entry bigint, p_lang text, p_text text, p_engine text, p_state text, p_cost_cents int, p_token text)
returns void language plpgsql security definer set search_path = public as $$
begin raise exception 'superseded: use cz_translation_store'; end $$;
create or replace function cz_source_chars(p_source_hash text, p_chars int)
returns int language plpgsql security definer set search_path = public as $$
begin raise exception 'superseded: cz_source_chars now requires p_token'; end $$;
create or replace function cz_daily(p_token text)
returns json language plpgsql security definer set search_path = public as $$
begin raise exception 'superseded: cz_daily(p_token, p_day, p_force)'; end $$;
create or replace function cz_daily(p_token text, p_day date default null)
returns json language plpgsql security definer set search_path = public as $$
begin raise exception 'superseded: cz_daily(p_token, p_day, p_force)'; end $$;
notify pgrst, 'reload schema';
