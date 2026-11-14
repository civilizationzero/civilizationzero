-- ================================================================ v14b (CZ 1445, 14 Nov 2026), migration cz_translation_v14b
-- After an independent review of v14 the same day. Four changes, all to translation:
--
-- 1. cz_norm_text: one rule, in the database and in room/lib.js (normText), for "the same text": Unicode NFC, every run of white
--    space (the characters JavaScript's \s matches, listed by code point, so that no locale changes it) one space, none at either end. v14 compared
--    with btrim and \s, which differ from the code's rule for a text ending in a line break or holding a non-breaking space: the page
--    could call a stored "translation" the original handed back while the database called it good, and the entry was never
--    translated again.
-- 2. cz_translation_states and cz_translation_note use it; and a human correction (state 'corrected') is never "unchanged" and never
--    written over.
-- 3. cz_translation_claim: a press claims its entries in one statement — those no one is translating now (no "working" note younger
--    than p_window_s seconds) are marked "working" and returned — so that two presses at once (a double click, two readers) never
--    translate the same entry twice or charge for it twice.
-- 4. LIVE cz_translation_store: as before, word for word, except that a machine translation no longer writes over a human correction
--    made while it was being translated.
create or replace function cz_norm_text(p text) returns text language sql immutable set search_path = public as $$
  select btrim(regexp_replace(normalize(coalesce(p, ''), NFC),
    '[' || chr(9) || chr(10) || chr(11) || chr(12) || chr(13) || chr(32) || chr(160) || chr(5760) || chr(8192) || '-' || chr(8202)
       || chr(8232) || chr(8233) || chr(8239) || chr(8287) || chr(12288) || chr(65279) || ']+', ' ', 'g'), ' ')
$$;
grant execute on function cz_norm_text(text) to anon, authenticated;

create or replace function cz_translation_states(p_entries bigint[], p_lang text)
returns table (entry_id bigint, state text, engine text, at timestamptz, unchanged boolean, snippet text)
language sql stable security definer set search_path = public set timezone = 'UTC' as $$
  select t.entry_id, t.state, t.engine, t.at,
         (t.state = 'done' and t.text is not null
          and cz_norm_text(t.text) = cz_norm_text(case when e.state = 'redacted' and e.redacted_text is not null then e.redacted_text else e.content end)) as unchanged,
         case when t.state in ('done', 'corrected') and t.text is not null then left(t.text, 160) end as snippet
  from translations t join entries e on e.id = t.entry_id
  where t.entry_id = any ((coalesce(p_entries, '{}'::bigint[]))[1:500]) and t.lang = p_lang and t.lang <> '_classifier'
    and e.state <> 'hidden'
$$;

create or replace function cz_translation_note(p_entries bigint[], p_lang text, p_note text, p_cost_cents numeric, p_token text)
returns void language plpgsql security definer set search_path = public set timezone = 'UTC' as $$
begin
  if not cz_token_ok(p_token) then raise exception 'unauthorised'; end if;
  if p_lang is null or p_lang = '_classifier' or p_lang !~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8}){0,3}$' then raise exception 'not a language tag'; end if;
  insert into translations (entry_id, lang, text, engine, state)
    select e.id, p_lang, null, left(coalesce(p_note, ''), 300), 'pending'
    from entries e where e.id = any ((coalesce(p_entries, '{}'::bigint[]))[1:100]) and e.state <> 'hidden'
  on conflict (entry_id, lang) do update set text = null, engine = excluded.engine, state = 'pending', at = now()
    where translations.state = 'pending'
       or (translations.state = 'done' and translations.text is not null
           and cz_norm_text(translations.text) = (select cz_norm_text(case when x.state = 'redacted' and x.redacted_text is not null then x.redacted_text else x.content end)
                                                  from entries x where x.id = translations.entry_id));
  if coalesce(p_cost_cents, 0) > 0 then
    insert into budget (month, spent_cents) values (to_char(now(), 'YYYY-MM'), p_cost_cents)
      on conflict (month) do update set spent_cents = budget.spent_cents + p_cost_cents;
    insert into spend (day, cents) values (current_date, p_cost_cents)
      on conflict (day) do update set cents = spend.cents + p_cost_cents;
  end if;
end $$;

create or replace function cz_translation_claim(p_entries bigint[], p_lang text, p_window_s int, p_token text)
returns table (entry_id bigint) language plpgsql security definer set search_path = public set timezone = 'UTC' as $$
#variable_conflict use_column
begin
  if not cz_token_ok(p_token) then raise exception 'unauthorised'; end if;
  if p_lang is null or p_lang = '_classifier' or p_lang !~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8}){0,3}$' then raise exception 'not a language tag'; end if;
  return query with claimed as (
  insert into translations as t (entry_id, lang, text, engine, state)
    select e.id, p_lang, null, 'working: since ' || to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'pending'
    from entries e where e.id = any ((coalesce(p_entries, '{}'::bigint[]))[1:100]) and e.state <> 'hidden'
  on conflict (entry_id, lang) do update set text = null, engine = excluded.engine, state = 'pending', at = now()
    where (t.state = 'pending' and not (t.engine like 'working:%' and t.at > now() - make_interval(secs => greatest(0, least(coalesce(p_window_s, 125), 600)))))
       or (t.state = 'done' and t.text is not null
           and cz_norm_text(t.text) = (select cz_norm_text(case when x.state = 'redacted' and x.redacted_text is not null then x.redacted_text else x.content end)
                                       from entries x where x.id = t.entry_id))
  returning t.entry_id) select claimed.entry_id from claimed;
end $$;
grant execute on function cz_translation_claim(bigint[], text, int, text) to anon, authenticated;

create or replace function cz_translation_store(p_entry bigint, p_lang text, p_text text, p_engine text, p_state text, p_cost_cents numeric, p_token text)
returns void language plpgsql security definer set search_path = public set timezone = 'UTC' as $$
begin
  if not cz_token_ok(p_token) then raise exception 'unauthorised'; end if;
  if not exists (select 1 from entries where id = p_entry) then raise exception 'no such entry'; end if;
  insert into translations (entry_id, lang, text, engine, state) values (p_entry, p_lang, p_text, p_engine, p_state)
    on conflict (entry_id, lang) do update set text = excluded.text, engine = excluded.engine, state = excluded.state, at = now()
    where translations.state <> 'corrected';
  insert into budget (month, spent_cents) values (to_char(now(), 'YYYY-MM'), coalesce(p_cost_cents, 0))
    on conflict (month) do update set spent_cents = budget.spent_cents + coalesce(p_cost_cents, 0);
  insert into spend (day, cents) values (current_date, coalesce(p_cost_cents, 0))
    on conflict (day) do update set cents = spend.cents + coalesce(p_cost_cents, 0);
end $$;

notify pgrst, 'reload schema';
