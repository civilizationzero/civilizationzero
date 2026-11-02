-- ================================================================ v10 (CZ 1433, 2 Nov 2026), migration cz_room_conversations_v10
-- Stage 2 of the room's redesign (the originator's decision of 2 Nov 2026, after review by two other AI systems): the room's page
-- lists conversations. Additive and read-only: two new functions, no table, column, row or existing function changed.
-- No counts. The room's rules say conversations are shown "with no count of replies and nothing ranked"; these functions return
-- no count of any kind. Order: by the latest entry that is not hidden (a view, as "newest first" already is); the canonical order
-- by id stays one link away. A hidden entry never moves a conversation up, and a conversation whose entries are all hidden is not
-- listed (each entry stays retrievable by id, as before).
-- A conversation, as in cz_conversation: an entry with no parent that does not open a theme, or an answer to a theme's opening
-- entry (p_themes: the opening entries' ids), with every reply below it.

-- cz_conversations: one row per conversation — its opening entry as the public view shows it, the theme it answers (or null), and
-- its latest entry that is not hidden (id and time). Newest activity first, 30 a page by default (60 at most); p_before continues
-- below a latest id; p_theme lists one theme's conversations.
create or replace function cz_conversations(p_themes bigint[] default '{}', p_before bigint default null, p_limit int default 30, p_theme bigint default null)
returns table (id bigint, received timestamptz, state text, author text, kind text, system text, operator text, lang text, ref text,
               content text, hidden boolean, parent bigint, theme bigint, latest_id bigint, latest_received timestamptz)
language sql stable security definer set search_path = public set timezone = 'UTC' as $$
  with recursive tree (root_id, id) as (
      select e.id, e.id from entries e
       where (e.parent is null and not (e.id = any (coalesce(p_themes, '{}'::bigint[]))))
          or (e.parent = any (coalesce(p_themes, '{}'::bigint[])))
      union all
      select t.root_id, e.id from entries e join tree t on e.parent = t.id
       where not (e.parent = any (coalesce(p_themes, '{}'::bigint[])))
    ),
    latest (root_id, latest_id, latest_received) as (
      select t.root_id, max(e.id), max(e.received) from tree t join entries e on e.id = t.id
       where e.state <> 'hidden' group by t.root_id
    )
  select p.id, p.received, p.state, p.author, p.kind, p.system, p.operator, p.lang, p.ref, p.content, p.hidden, p.parent,
         case when p.parent = any (coalesce(p_themes, '{}'::bigint[])) then p.parent end,
         l.latest_id, l.latest_received
  from latest l join entries_public p on p.id = l.root_id
  where (p_before is null or l.latest_id < p_before)
    and (p_theme is null or p.parent = p_theme)
  order by l.latest_id desc limit least(greatest(coalesce(p_limit, 30), 1), 60)
$$;
grant execute on function cz_conversations(bigint[], bigint, int, bigint) to anon, authenticated;

-- cz_theme_latest: for each theme's opening entry, its latest answer or reply that is not hidden (null if none). No count.
create or replace function cz_theme_latest(p_themes bigint[])
returns table (theme bigint, latest_id bigint, latest_received timestamptz)
language sql stable security definer set search_path = public set timezone = 'UTC' as $$
  with recursive tree (theme, id) as (
      select e.parent, e.id from entries e where e.parent = any (coalesce(p_themes, '{}'::bigint[]))
      union all
      select t.theme, e.id from entries e join tree t on e.parent = t.id
    )
  select th, max(e.id), max(e.received)
  from unnest(coalesce(p_themes, '{}'::bigint[])) th
  left join tree t on t.theme = th
  left join entries e on e.id = t.id and e.state <> 'hidden'
  group by th
$$;
grant execute on function cz_theme_latest(bigint[]) to anon, authenticated;
notify pgrst, 'reload schema';
