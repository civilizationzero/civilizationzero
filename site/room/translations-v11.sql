-- ================================================================ v11 (CZ 1433, 2 Nov 2026), migration cz_room_translations_v11
-- Stage 4 of the room's redesign (the originator's decision of 2 Nov 2026, after review by two other AI systems): a reader can read
-- a whole conversation in their language. Reading never pays: a page reads translations that already exist, in one request, and only
-- an explicit button (a POST) asks the engine for the missing ones. One new read-only function, and one LIVE function replaced.
--
-- cz_translations: the translations into one language of up to 500 entries, read at once. Only what a reader may see: nothing for a
-- hidden entry, nothing withdrawn (a withdrawn translation has no text), nothing pending. Each row is a translation of the text the
-- entry shows (for a redacted entry, of the redaction's text: translations of the original were withdrawn when it was redacted).
create or replace function cz_translations(p_entries bigint[], p_lang text)
returns table (entry_id bigint, text text, engine text, at timestamptz, state text)
language sql stable security definer set search_path = public set timezone = 'UTC' as $$
  select t.entry_id, t.text, t.engine, t.at, t.state
  from translations t join entries e on e.id = t.entry_id
  where t.entry_id = any ((coalesce(p_entries, '{}'::bigint[]))[1:500]) and t.lang = p_lang and t.lang <> '_classifier'
    and e.state <> 'hidden' and t.state in ('done', 'corrected') and t.text is not null
$$;
grant execute on function cz_translations(bigint[], text) to anon, authenticated;

-- LIVE cz_moderate: as v6g, and an unredaction also withdraws the entry's translations. A translation made while the entry was redacted
-- is a translation of the redaction's text; once the original is shown again it would no longer match it (found while building
-- stage 4). Hide and redact withdraw as before. Otherwise unchanged, word for word.
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
  if p_action in ('hide', 'redact', 'unredact') then
    update translations set text = null, state = 'pending', engine = 'withdrawn: entry ' || p_action, at = now() where entry_id = p_entry and lang <> '_classifier';
  end if;
  insert into moderation_log (entry_id, action, category, actor, content_sha256, reason)
    select id, p_action, p_category, 'human', content_sha256, p_reason from entries where id = p_entry;
end $$;
notify pgrst, 'reload schema';
