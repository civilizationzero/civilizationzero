-- v6g revokes — prepared after the security review of /admin (design/test/FINDINGS-REGISTER.md A-2, and the review's note on
-- moderation_reviews). NOT part of schema.sql, and NOT applied: it is applied only with the originator's approval, after
-- schema.sql's v6g section, to the test database first and then to production.
--
-- 1. cz_token_ok answers true or false for any guess of the database token to anyone holding the publishable key, outside
--    every limit of the site's. The site never calls it over the API; the security-definer functions that call it run as their
--    owner and keep working (tested on a database built from schema.sql: every function the site calls, as anon).
revoke execute on function cz_token_ok(text) from public, anon, authenticated;

-- 2. Supabase's default privileges gave anon and authenticated every privilege on moderation_reviews (v6f). Row-level security
--    already refuses their writes, as no policy allows one; this removes the grants themselves. Reading stays public.
--    Production runs PostgreSQL 17, whose defaults also grant MAINTAIN (VACUUM, ANALYZE, LOCK and the like), which PostgREST
--    cannot use; on PostgreSQL 17 it can be revoked as well: revoke maintain on moderation_reviews from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on moderation_reviews from anon, authenticated;
