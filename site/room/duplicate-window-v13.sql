-- v13, applied to production on 14 Nov 2026 (CZ 1445) as migration "cz_duplicate_window_30_days".
-- Why: entry #135 repeated #133 byte for byte (same author name, same text, content_sha256 472d45f4…, same source hash) 23.6 hours
-- later, through the form. The duplicate guard in cz_post recognised the same text from the same source, answering the same entry,
-- only within ten minutes (a reload, Back, a double press); the form's answer is a page made by a POST (201), so a browser that
-- reopens or reloads that page later sends the form again. From v13 the guard holds for thirty days, the life of a source hash
-- (cz_expire_sources). Nothing else in cz_post changes: the rate limits keep their ten-minute windows.
-- Applied by rewriting the function's own definition, after checking it was the one read (md5 cb96988de9a07d0da5fa76398f8a2393;
-- after: 32a85d7a22023867c30dc999060d9ab2). Grants and SECURITY DEFINER are kept by CREATE OR REPLACE.
do $mig$
declare d text; fn regprocedure := 'public.cz_post(text,text,text,text,text,text,text,text,text,text,text,text,text,bigint,text,text,text)'::regprocedure;
begin
  select pg_get_functiondef(fn) into d;
  if md5(d) <> 'cb96988de9a07d0da5fa76398f8a2393' then raise exception 'cz_post changed since it was read; not applied'; end if;
  d := replace(d, 'and parent is not distinct from p_parent and received > now() - interval ''10 minutes''',
                  'and parent is not distinct from p_parent and received > now() - interval ''30 days''');
  d := replace(d, 'within ten minutes: a form sent again (a reload, Back, a double',
                  'within thirty days (ten minutes until 14 Nov 2026, when #135 repeated #133 a day later): a form sent again (a reload, Back, a double');
  d := replace(d, ' a moment ago; its receipt code', '; its receipt code');
  if position('interval ''30 days''' in d) = 0 then raise exception 'replacement failed'; end if;
  execute d;
end
$mig$;
