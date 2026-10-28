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
  select id, received, state, author, kind, system, operator, prompt, lang, lang_detected, ref,
         case when state = 'redacted' then redacted_text else content end,
         content_sha256, declared_date, key_fingerprint, category, (state = 'hidden')
  from entries where id = p_id
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
  v_sha := encode(digest(convert_to(p_content, 'UTF8'), 'sha256'), 'hex');
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
  v_sha := encode(digest(convert_to(coalesce(v_prev, '') || E'\n' || coalesce(v_payload, ''), 'UTF8'), 'sha256'), 'hex');
  insert into log_hashes (day, sha256, prev, count, last_id) values (v_day, v_sha, v_prev, coalesce(v_count, 0), v_last)
    on conflict (day) do update set sha256 = excluded.sha256, prev = excluded.prev, count = excluded.count, last_id = excluded.last_id;
  return json_build_object('day', v_day, 'sha256', v_sha, 'prev', v_prev, 'count', coalesce(v_count, 0), 'last_id', v_last);
end $$;
grant execute on function cz_daily(text) to anon, authenticated;
