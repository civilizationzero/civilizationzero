-- ================================================================ v15 (CZ 1447, 16 Nov 2026), migration cz_ask_open_v15 — NOT APPLIED: one file, to be
-- run once in the SQL editor by whoever deploys branch samurai-1-2, before or with that deploy.
-- Why: /ask gains three plain links that open another company's assistant with the short invitation (cz-short-1.0) filled in. Each
-- goes through /ask/open/<name>; the routing middleware (middleware.js) counts the press by the link's name alone — no address, no
-- cookie, nothing about the browser — and api/page.js answers with the redirect. The counts are public on /stats, as every count is.
--   1. visit_counts gains one kind, 'ask-open' (key: chatgpt, claude or perplexity). Its columns (day, kind, key, n) are unchanged.
--   2. cz_count_ask_open(p_token, p_name): one press, for one of the three names only; any other name is ignored.
--   3. LIVE cz_visit_stats: as v12 (batch-b-v12.sql), word for word, with two fields more: 'ask_open' (presses per link in the window)
--      and 'ask_open_since' (the first day one was counted).
-- The split of the AI companies' agents by purpose (CZ 1447, the same branch) needs nothing here: its counts are new keys under kind
-- 'bot' ("openai-user", "anthropic-search", …), which cz_count already writes as the middleware sends them.
-- Additive. The site's current code keeps working after this file runs and before the new code is deployed (nothing calls the new
-- function; the old /stats ignores the new fields); the new code keeps working before it runs (a press is then not counted, /stats
-- shows none, the redirect still goes). Running it twice changes nothing.
-- Before running: compare production's cz_visit_stats (select pg_get_functiondef('public.cz_visit_stats(int)'::regprocedure)) with
-- batch-b-v12.sql; if it differs, stop: this file would replace it.

alter table visit_counts drop constraint if exists visit_counts_kind_check;
alter table visit_counts add constraint visit_counts_kind_check check (kind in ('page', 'ref', 'country', 'bot', 'total', 'entrance', 'ask-open'));

create or replace function cz_count_ask_open(p_token text, p_name text)
returns void language plpgsql security definer set search_path = public as $$
declare d date := (now() at time zone 'utc')::date;
begin
  if not cz_token_ok(p_token) then raise exception 'unauthorised'; end if;
  if p_name is null or p_name not in ('chatgpt', 'claude', 'perplexity') then return; end if;
  insert into visit_counts values (d, 'ask-open', p_name, 1) on conflict (day, kind, key) do update set n = visit_counts.n + 1;
end $$;

-- LIVE cz_visit_stats: as v12, with the presses on /ask's links to an assistant
create or replace function cz_visit_stats(p_days int) returns json language sql stable security definer set search_path = public as $$
  with lim as (select (now() at time zone 'utc')::date as today, least(greatest(coalesce(p_days, 30), 1), 366) as nd),
  span as (select today - nd + 1 as first, today from lim),
  c as (select v.* from visit_counts v, span where v.day between span.first and span.today)
  select json_build_object(
    'first_day', (select min(day) from visit_counts),
    'visitors_counted_until', (select value from config where key = 'visitors_counted_until'),
    'entrances_since', (select min(day) from visit_counts where kind = 'entrance'),
    'ask_open_since', (select min(day) from visit_counts where kind = 'ask-open'),
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
                  from (select key, sum(n)::int n from c where kind = 'entrance' group by key order by 2 desc, 1 limit 60) x),
    'ask_open', (select coalesce(json_agg(x order by x.n desc, x.key), '[]') from (select key, sum(n)::int n from c where kind = 'ask-open' group by key order by 2 desc, 1 limit 10) x))
$$;

revoke all on function cz_count_ask_open(text, text) from public;
grant execute on function cz_count_ask_open(text, text) to anon, authenticated;
grant execute on function cz_visit_stats(int) to anon, authenticated;
