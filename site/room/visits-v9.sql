-- Schema v9: visit counts (the originator's decision of CZ 1432: "بساز و بذار", option B of the review — page views and an
-- approximate count of distinct visitors per day, no cookies, no identifiers kept; the counts are public at /stats).
-- What is stored: per UTC day, counts by page, by referring domain, by country (the two-letter code Vercel gives), by kind of
-- automated client, and one number of distinct visitors. To count distinct visitors, the database keeps, for the current day
-- only, a SHA-256 of a random salt made for that day with the address and the browser's user agent; at the end of the day the
-- number is kept, and the hashes and the salt are deleted (cz_visits_close, run by the daily job). No address is stored.
-- Additive: new tables and functions only.

create table if not exists visit_counts (
  day date not null, kind text not null check (kind in ('page', 'ref', 'country', 'bot', 'total')), key text not null,
  n integer not null default 0, primary key (day, kind, key));
create table if not exists visit_seen (day date not null, h bytea not null, primary key (day, h));
create table if not exists visit_salt (day date primary key, salt bytea not null);
alter table visit_counts enable row level security;
alter table visit_seen enable row level security;
alter table visit_salt enable row level security;
revoke all on visit_counts, visit_seen, visit_salt from anon, authenticated, public;

-- one page view (or one automated request), counted by the routing middleware; the token is the database token
create or replace function cz_count(p_token text, p_path text, p_ref text, p_country text, p_agent text, p_ip text, p_ua text)
returns void language plpgsql security definer set search_path = public as $$
declare d date := (now() at time zone 'utc')::date; v_salt bytea; v_path text; v_ref text;
begin
  if not cz_token_ok(p_token) then raise exception 'unauthorised'; end if;
  if p_agent is not null and p_agent <> 'human' then
    insert into visit_counts values (d, 'bot', left(regexp_replace(p_agent, '[^a-z0-9_.-]', '', 'g'), 40), 1)
      on conflict (day, kind, key) do update set n = visit_counts.n + 1;
    return;
  end if;
  v_path := left(coalesce(p_path, ''), 120);
  if v_path !~ '^/[A-Za-z0-9/._{}-]*$' then v_path := '(other)'; end if;
  -- a bounded number of keys per day, so that a flood of made-up addresses cannot grow the table
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
  if coalesce(p_ip, '') <> '' then
    select salt into v_salt from visit_salt where day = d;
    if v_salt is null then
      insert into visit_salt values (d, extensions.gen_random_bytes(32)) on conflict (day) do nothing;
      select salt into v_salt from visit_salt where day = d;
    end if;
    insert into visit_seen values (d, extensions.digest(v_salt || convert_to(left(p_ip, 64) || '|' || left(coalesce(p_ua, ''), 400), 'UTF8'), 'sha256'))
      on conflict do nothing;
  end if;
end $$;

-- the end of each finished day: keep the number of distinct visitors, delete the hashes and the salt (run by the daily job)
create or replace function cz_visits_close(p_token text) returns json language plpgsql security definer set search_path = public as $$
declare d date := (now() at time zone 'utc')::date; r record; closed int := 0;
begin
  if not cz_token_ok(p_token) then raise exception 'unauthorised'; end if;
  for r in select day, count(*) c from visit_seen where day < d group by day loop
    insert into visit_counts values (r.day, 'total', 'visitors', r.c) on conflict (day, kind, key) do update set n = excluded.n;
    closed := closed + 1;
  end loop;
  delete from visit_seen where day < d;
  delete from visit_salt where day < d;
  return json_build_object('days_closed', closed);
end $$;

-- the public counts: the last p_days days (at most 366), today's visitors counted live
create or replace function cz_visit_stats(p_days int) returns json language sql stable security definer set search_path = public as $$
  with lim as (select (now() at time zone 'utc')::date as today, least(greatest(coalesce(p_days, 30), 1), 366) as nd),
  span as (select today - nd + 1 as first, today from lim),
  c as (select v.* from visit_counts v, span where v.day between span.first and span.today)
  select json_build_object(
    'first_day', (select min(day) from visit_counts),
    'days', (select coalesce(json_agg(json_build_object('day', g.day,
        'views', coalesce((select n from c where c.day = g.day and kind = 'total' and key = 'views'), 0),
        'visitors', case when g.day = (select today from span) then (select count(*) from visit_seen where day = g.day)
                         else (select n from c where c.day = g.day and kind = 'total' and key = 'visitors') end,
        'automated', coalesce((select sum(n) from c where c.day = g.day and kind = 'bot'), 0)) order by g.day desc), '[]')
      from (select generate_series(span.first, span.today, interval '1 day')::date as day from span) g
      where g.day >= coalesce((select min(day) from visit_counts), (select today from span))),
    'pages', (select coalesce(json_agg(x order by x.n desc, x.key), '[]') from (select key, sum(n)::int n from c where kind = 'page' group by key order by 2 desc, 1 limit 40) x),
    'refs', (select coalesce(json_agg(x order by x.n desc, x.key), '[]') from (select key, sum(n)::int n from c where kind = 'ref' group by key order by 2 desc, 1 limit 30) x),
    'countries', (select coalesce(json_agg(x order by x.n desc, x.key), '[]') from (select key, sum(n)::int n from c where kind = 'country' group by key order by 2 desc, 1 limit 60) x),
    'automated', (select coalesce(json_agg(x order by x.n desc, x.key), '[]') from (select key, sum(n)::int n from c where kind = 'bot' group by key order by 2 desc, 1 limit 40) x))
$$;

revoke all on function cz_count(text, text, text, text, text, text, text) from public;
revoke all on function cz_visits_close(text) from public;
revoke all on function cz_visit_stats(int) from public;
grant execute on function cz_count(text, text, text, text, text, text, text) to anon, authenticated;
grant execute on function cz_visits_close(text) to anon, authenticated;
grant execute on function cz_visit_stats(int) to anon, authenticated;
