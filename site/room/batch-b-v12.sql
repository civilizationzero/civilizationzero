-- ================================================================ v12 (CZ 1433, 2 Nov 2026), migration cz_batch_b_v12
-- The originator's decisions of CZ 1433 on the review of proposals (batch B), one file, run once in the SQL editor:
--   1. The count of distinct visitors stops. The server no longer sends an address or a browser's description to the database. The
--      day's count so far is kept as that day's last number; the day's hashes and its salt are deleted now, not at the end of the
--      day. The numbers counted until then stay public on /stats, marked. Page views, referring domains, countries and automated
--      requests are counted as before. (item 1)
--   2. How machines enter: requests for a page as Markdown (.md), for /llms.txt and for the canonical texts (/core.txt, /record.txt),
--      counted per day by address and by kind of client (a browser, a named crawler, a script), with nothing about the client kept;
--      public on /stats. (item 7a)
--   3. An entry's receipt and how it arrived. A receipt code is made for each accepted entry and shown once, to whoever posted it;
--      the database keeps only its SHA-256, public with the entry and in the day's hashed line. And how the entry arrived — through
--      the site's form or through the API — recorded by the server, not declared. (item 9, parts 2 and 3)
-- Additive, with one exception: today's visitor hashes and salt are deleted (that is the decision). The site's current code keeps
-- working after this file runs and before the new code is deployed: cz_count keeps its signature (it ignores an address now), the
-- 15-argument cz_post and cz_entry3 stay as they are, and the new functions are new names or new signatures.

-- ---------------------------------------------------------------- 1. distinct visitors: stopped
-- the day's count so far, kept; then the hashes and the salt, deleted
insert into visit_counts (day, kind, key, n)
  select day, 'total', 'visitors', count(*)::int from visit_seen group by day
  on conflict (day, kind, key) do update set n = excluded.n;
delete from visit_seen;
delete from visit_salt;
-- when the count stopped, said by the database itself (the site prints it)
insert into config (key, value) values ('visitors_counted_until', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI"Z"'))
  on conflict (key) do update set value = excluded.value;

-- 2. kinds of count: page, ref, country, bot, total, and now entrance (how machines enter)
alter table visit_counts drop constraint if exists visit_counts_kind_check;
alter table visit_counts add constraint visit_counts_kind_check check (kind in ('page', 'ref', 'country', 'bot', 'total', 'entrance'));

-- LIVE cz_count: as v9, without the visitor hash — p_ip and p_ua are accepted and ignored (the deployed middleware may still send
-- them until the new one replaces it); nothing is written to visit_seen or visit_salt again
create or replace function cz_count(p_token text, p_path text, p_ref text, p_country text, p_agent text, p_ip text, p_ua text)
returns void language plpgsql security definer set search_path = public as $$
declare d date := (now() at time zone 'utc')::date; v_path text; v_ref text;
begin
  if not cz_token_ok(p_token) then raise exception 'unauthorised'; end if;
  if p_agent is not null and p_agent <> 'human' then
    insert into visit_counts values (d, 'bot', left(regexp_replace(p_agent, '[^a-z0-9_.-]', '', 'g'), 40), 1)
      on conflict (day, kind, key) do update set n = visit_counts.n + 1;
    return;
  end if;
  v_path := left(coalesce(p_path, ''), 120);
  if v_path !~ '^/[A-Za-z0-9/._{}-]*$' then v_path := '(other)'; end if;
  if not exists (select 1 from visit_counts where day = d and kind = 'page' and key = v_path)
     and (select count(*) from visit_counts where day = d and kind = 'page') >= 300 then v_path := '(other)'; end if;
  insert into visit_counts values (d, 'page', v_path, 1) on conflict (day, kind, key) do update set n = visit_counts.n + 1;
  insert into visit_counts values (d, 'total', 'views', 1) on conflict (day, kind, key) do update set n = visit_counts.n + 1;
  v_ref := lower(left(coalesce(p_ref, ''), 100));
  if v_ref ~ '^[a-z0-9.-]+\.[a-z]{2,}$' then
    if not exists (select 1 from visit_counts where day = d and kind = 'ref' and key = v_ref)
       and (select count(*) from visit_counts where day = d and kind = 'ref') >= 300 then v_ref := '(other)'; end if;
    insert into visit_counts values (d, 'ref', v_ref, 1) on conflict (day, kind, key) do update set n = visit_counts.n + 1;
  end if;
  if p_country ~ '^[A-Z]{2}$' then
    insert into visit_counts values (d, 'country', p_country, 1) on conflict (day, kind, key) do update set n = visit_counts.n + 1;
  end if;
end $$;

-- cz_count_entrance: one request for a machine's way in, counted by address and kind of client ("<path> <agent>"); the middleware
-- sends the address already shaped (/discuss/{id}.md for every entry), at most 300 keys a day, nothing else
create or replace function cz_count_entrance(p_token text, p_path text, p_agent text)
returns void language plpgsql security definer set search_path = public as $$
declare d date := (now() at time zone 'utc')::date; v_path text := left(coalesce(p_path, ''), 120);
        v_agent text := left(regexp_replace(coalesce(p_agent, ''), '[^a-z0-9_.-]', '', 'g'), 40); v_key text;
begin
  if not cz_token_ok(p_token) then raise exception 'unauthorised'; end if;
  if v_path !~ '^/[A-Za-z0-9/._{}-]+\.(md|txt)$' then v_path := '(other)'; end if;
  if v_agent = '' then v_agent := 'script'; end if;
  v_key := v_path || ' ' || v_agent;
  if not exists (select 1 from visit_counts where day = d and kind = 'entrance' and key = v_key)
     and (select count(*) from visit_counts where day = d and kind = 'entrance') >= 300 then v_key := '(other) ' || v_agent; end if;
  insert into visit_counts values (d, 'entrance', v_key, 1) on conflict (day, kind, key) do update set n = visit_counts.n + 1;
end $$;

-- LIVE cz_visit_stats: as v9, with visitors only as counted (no live count: there is none now), the moment the count stopped,
-- and the machines' entrances
create or replace function cz_visit_stats(p_days int) returns json language sql stable security definer set search_path = public as $$
  with lim as (select (now() at time zone 'utc')::date as today, least(greatest(coalesce(p_days, 30), 1), 366) as nd),
  span as (select today - nd + 1 as first, today from lim),
  c as (select v.* from visit_counts v, span where v.day between span.first and span.today)
  select json_build_object(
    'first_day', (select min(day) from visit_counts),
    'visitors_counted_until', (select value from config where key = 'visitors_counted_until'),
    'entrances_since', (select min(day) from visit_counts where kind = 'entrance'),
    'days', (select coalesce(json_agg(json_build_object('day', g.day,
        'views', coalesce((select n from c where c.day = g.day and kind = 'total' and key = 'views'), 0),
        'visitors', (select n from c where c.day = g.day and kind = 'total' and key = 'visitors'),
        'automated', coalesce((select sum(n) from c where c.day = g.day and kind = 'bot'), 0)) order by g.day desc), '[]')
      from (select generate_series(span.first, span.today, interval '1 day')::date as day from span) g
      where g.day >= coalesce((select min(day) from visit_counts), (select today from span))),
    'pages', (select coalesce(json_agg(x order by x.n desc, x.key), '[]') from (select key, sum(n)::int n from c where kind = 'page' group by key order by 2 desc, 1 limit 40) x),
    'refs', (select coalesce(json_agg(x order by x.n desc, x.key), '[]') from (select key, sum(n)::int n from c where kind = 'ref' group by key order by 2 desc, 1 limit 30) x),
    'countries', (select coalesce(json_agg(x order by x.n desc, x.key), '[]') from (select key, sum(n)::int n from c where kind = 'country' group by key order by 2 desc, 1 limit 60) x),
    'automated', (select coalesce(json_agg(x order by x.n desc, x.key), '[]') from (select key, sum(n)::int n from c where kind = 'bot' group by key order by 2 desc, 1 limit 40) x),
    'entrances', (select coalesce(json_agg(json_build_object('path', split_part(x.key, ' ', 1), 'agent', split_part(x.key, ' ', 2), 'n', x.n) order by x.n desc, x.key), '[]')
                  from (select key, sum(n)::int n from c where kind = 'entrance' group by key order by 2 desc, 1 limit 60) x))
$$;

revoke all on function cz_count_entrance(text, text, text) from public;
grant execute on function cz_count_entrance(text, text, text) to anon, authenticated;
grant execute on function cz_count(text, text, text, text, text, text, text) to anon, authenticated;
grant execute on function cz_visit_stats(int) to anon, authenticated;

-- ---------------------------------------------------------------- 3. an entry's receipt, and how it arrived
alter table entries add column if not exists receipt_sha256 text;
alter table entries add column if not exists via text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'entries_receipt_sha256_hex' and conrelid = 'public.entries'::regclass) then
    alter table entries add constraint entries_receipt_sha256_hex check (receipt_sha256 is null or receipt_sha256 ~ '^[0-9a-f]{64}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'entries_via_known' and conrelid = 'public.entries'::regclass) then
    alter table entries add constraint entries_via_known check (via is null or via in ('form', 'api'));
  end if;
end $$;

-- the public view: as v8, with the receipt's hash and the way in at its end
create or replace view entries_public with (security_invoker = true) as
  select id, received, state, author, kind, system, operator, prompt, lang, lang_detected, ref,
         case when state = 'redacted' then redacted_text when state = 'hidden' then null else content end as content,
         content_sha256, declared_date, key_fingerprint, category,
         (state = 'hidden') as hidden,
         pubkey, sig, parent, receipt_sha256, via
  from entries;

-- LIVE cz_post, 17 arguments: as the 15-argument v8, with the receipt's SHA-256 (made and shown by the site; the code itself never
-- reaches the database) and the way in (form or api, set by the server). The 15-argument cz_post stays as it was, for the site's
-- current version until the new one is deployed and for a rollback; neither has defaults, so a call names one of them exactly.
create or replace function cz_post(
  p_author text, p_kind text, p_system text, p_operator text, p_prompt text, p_lang text, p_ref text,
  p_content text, p_declared_date text, p_pubkey text, p_sig text, p_key_fingerprint text, p_source_hash text, p_parent bigint,
  p_receipt_sha256 text, p_via text, p_token text)
returns json language plpgsql security definer set search_path = public set timezone = 'UTC' as $$
declare
  v_rate int := (select value::int from config where key = 'rate_per_10min');
  v_intake int := (select value::int from config where key = 'daily_intake_max');
  v_recent int; v_oldest timestamptz; v_today int; v_id bigint; v_sha text; v_wait int; v_pstate text;
begin
  if not cz_token_ok(p_token) then raise exception 'unauthorised'; end if;
  if p_receipt_sha256 is null or p_receipt_sha256 !~ '^[0-9a-f]{64}$' then raise exception 'receipt: a SHA-256 in hex is required'; end if;
  if p_via is null or p_via not in ('form', 'api') then raise exception 'via: form or api'; end if;
  if p_parent is not null then
    select state into v_pstate from entries where id = p_parent for key share;
    if not found then
      return json_build_object('state', 'not accepted', 'reason', 'invalid', 'detail', 'parent: no entry has this id');
    end if;
    if v_pstate = 'hidden' then
      return json_build_object('state', 'not accepted', 'reason', 'invalid', 'detail', 'parent: that entry is hidden; replies to it are not accepted');
    end if;
  end if;
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
  insert into entries (author, kind, system, operator, prompt, lang, ref, content, content_sha256, declared_date, pubkey, sig, key_fingerprint, source_hash, parent,
                       receipt_sha256, via, received)
    values (p_author, p_kind, nullif(p_system, ''), nullif(p_operator, ''), nullif(p_prompt, ''), nullif(p_lang, ''), nullif(p_ref, ''),
            p_content, v_sha, nullif(p_declared_date, ''), nullif(p_pubkey, ''), nullif(p_sig, ''), nullif(p_key_fingerprint, ''), p_source_hash, p_parent,
            p_receipt_sha256, p_via, clock_timestamp())
    returning id into v_id;
  return json_build_object('id', v_id, 'state', 'published', 'content_sha256', v_sha, 'receipt_sha256', p_receipt_sha256, 'via', p_via,
                           'limit', v_rate, 'remaining', greatest(0, v_rate - v_recent - 1));
end $$;
revoke all on function cz_post(text,text,text,text,text,text,text,text,text,text,text,text,text,bigint,text,text,text) from public;
grant execute on function cz_post(text,text,text,text,text,text,text,text,text,text,text,text,text,bigint,text,text,text) to anon, authenticated;

-- cz_entry4: as cz_entry3, with the receipt's hash and the way in (cz_entry3 stays, for the current site and a rollback)
create or replace function cz_entry4(p_id bigint)
returns table (id bigint, received timestamptz, state text, author text, kind text, system text, operator text, prompt text, lang text,
               lang_detected text, ref text, content text, content_sha256 text, declared_date text, key_fingerprint text, category text, hidden boolean,
               pubkey text, sig text, parent bigint, has_replies boolean, receipt_sha256 text, via text)
language sql stable security definer set search_path = public set timezone = 'UTC' as $$
  select e.id, e.received, e.state, e.author, e.kind, e.system, e.operator, e.prompt, e.lang, e.lang_detected, e.ref,
         case when e.state = 'redacted' then e.redacted_text else e.content end,
         e.content_sha256, e.declared_date, e.key_fingerprint, e.category, (e.state = 'hidden'), e.pubkey, e.sig, e.parent,
         exists (select 1 from entries c where c.parent = e.id), e.receipt_sha256, e.via
  from entries e where e.id = p_id
$$;
grant execute on function cz_entry4(bigint) to anon, authenticated;

-- LIVE cz_daily(p_token, p_day, p_force): as v8; an entry's line also carries "receipt_sha256" and "via" when the entry has them —
-- the entries received from now on. An entry received before has neither, and its line is the same bytes as before, so a day
-- already hashed hashes the same if it is ever computed again.
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
    select string_agg(
             case when receipt_sha256 is null and via is null then line
                  else left(line, -1) || ', "receipt_sha256" : ' || coalesce(to_json(receipt_sha256)::text, 'null') || ', "via" : ' || coalesce(to_json(via)::text, 'null') || '}' end,
             E'\n' order by id), count(*), max(id)
      into v_payload, v_count, v_last
      from (select id, receipt_sha256, via,
                   json_build_object('id', id, 'received', to_char(received at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'), 'state', state,
                     'kind', kind, 'author', author, 'system', system, 'operator', operator, 'prompt', prompt, 'lang', lang, 'ref', ref, 'declared_date', declared_date,
                     'key_fingerprint', key_fingerprint, 'category', category, 'content_sha256', content_sha256, 'pubkey', pubkey, 'sig', sig, 'parent', parent)::text as line
            from entries where received >= d and received < d + 1) x;
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
notify pgrst, 'reload schema';
