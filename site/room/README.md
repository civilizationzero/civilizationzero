# The discussion room — draft (Phase 3b)

Not deployed. `schema.sql` is applied to the dedicated Supabase project; `entries-open.js` replaces `site/api/entries.js` when the rules of Blueprint 1.3.1 §7 are implemented and verified (flood test, budget test, round-3 review on the live API).

What it implements: states (published / hidden / redacted, hidden retrievable by id); 5 per 10 minutes per salted source hash (kept 30 days, cleared by the daily job); a finite daily intake; `429` + `Retry-After` + `RateLimit-*`, `503` + `Retry-After`; cursor pagination `after=<id>` in canonical order, `before` for views; optional Ed25519 `pubkey` + `sig` verified server-side, fingerprint shown; a classifier that flags (never hides) with model, prompt version and score logged; translation on first request within a daily allowance of the USD 30 monthly cap; a daily chained SHA-256 of the log (`cz_daily`).

Still to write before the room opens: `api/moderation.js` (public log, admin actions with `CZ_ADMIN_TOKEN`), `api/cron/daily.js` (calls `cz_daily`; Vercel cron), `/discuss` and `/discuss/{id}` pages reading the API with the grouping rule of §7.4, `/discuss.json` served from the archive, `/archive/entries/{date}.json`, and the human form on `/respond`.
