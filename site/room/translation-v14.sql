-- ================================================================ v14 (CZ 1445, 14 Nov 2026), migration cz_translation_v14
-- Why: the originator found translation in the room silent and unreliable. A press held the page for up to 15 seconds with no sign
-- of work; entries were translated one after another, so most of a page waited for later presses; a "translation" into Persian that
-- was the English text unchanged (#126) had been kept and shown. The room now starts every missing entry of a page at once, in the
-- background, and shows a progress page (api/discuss.js, room/lib.js). For that the database gains two functions and one setting:
--
-- cz_translation_states: the state of each entry's translation into one language, without its text — done, corrected or pending, the
-- engine (or, for a pending one, the note: "working: …", "error: <reason>", "discarded: …", "withdrawn: …"), when, whether a finished
-- one is the original handed back unchanged (then it counts as none), and the first 160 characters of a finished one. Read-only; only
-- what a reader may see (nothing for a hidden entry; nothing of the classifier's rows).
create or replace function cz_translation_states(p_entries bigint[], p_lang text)
returns table (entry_id bigint, state text, engine text, at timestamptz, unchanged boolean, snippet text)
language sql stable security definer set search_path = public set timezone = 'UTC' as $$
  select t.entry_id, t.state, t.engine, t.at,
         (t.text is not null and regexp_replace(btrim(t.text), '\s+', ' ', 'g')
            = regexp_replace(btrim(case when e.state = 'redacted' and e.redacted_text is not null then e.redacted_text else e.content end), '\s+', ' ', 'g')) as unchanged,
         case when t.state in ('done', 'corrected') and t.text is not null then left(t.text, 160) end as snippet
  from translations t join entries e on e.id = t.entry_id
  where t.entry_id = any ((coalesce(p_entries, '{}'::bigint[]))[1:500]) and t.lang = p_lang and t.lang <> '_classifier'
    and e.state <> 'hidden'
$$;
grant execute on function cz_translation_states(bigint[], text) to anon, authenticated;

-- cz_translation_note: a note in place of a translation — "working: since …" when a press starts, "error: <reason>" or "discarded: …"
-- when it ends without one — written only where no good translation exists: over a pending row, or over a finished one that is the
-- original handed back. Never over a good or a human-corrected translation, never for a hidden entry or the classifier. The cost of
-- the attempt is added to the month and the day as cz_translation_store adds it. Token-checked, as every writing function.
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
           and regexp_replace(btrim(translations.text), '\s+', ' ', 'g')
             = (select regexp_replace(btrim(case when x.state = 'redacted' and x.redacted_text is not null then x.redacted_text else x.content end), '\s+', ' ', 'g')
                from entries x where x.id = translations.entry_id));
  if coalesce(p_cost_cents, 0) > 0 then
    insert into budget (month, spent_cents) values (to_char(now(), 'YYYY-MM'), p_cost_cents)
      on conflict (month) do update set spent_cents = budget.spent_cents + p_cost_cents;
    insert into spend (day, cents) values (current_date, p_cost_cents)
      on conflict (day) do update set cents = spend.cents + p_cost_cents;
  end if;
end $$;
grant execute on function cz_translation_note(bigint[], text, text, numeric, text) to anon, authenticated;

-- One press now translates a whole page (up to 30 entries); the per-source allowance was set for one entry at a time. The monthly cap
-- (USD 30) and its daily share are unchanged and still bound the total.
update config set value = '150000' where key = 'source_chars_per_day';

notify pgrst, 'reload schema';
