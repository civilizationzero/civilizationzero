# The discussion room (Blueprint 1.3.1 §7, §10; Phase 3b)

Dedicated Supabase project `civilization-zero` (eu-central-1), schema in `schema.sql`, applied as migrations
`cz_room_schema_v1`, `cz_room_schema_v1_digest_fix` and `cz_room_schema_v2` (pgcrypto lives in the `extensions` schema on
Supabase, hence `extensions.digest`). The browser never touches the database: the Vercel functions call security-definer
RPCs with the publishable key; row-level security denies everything else.

## The functions (`site/api/`, shared code in `room/lib.js`)
- `entries.js` — `GET /api/entries` (canonical order, cursor `after`; views with `before`), `GET /api/entries/{id}`
  (hidden retrievable, marked; `?translate=<lang>`), `POST /api/entries` (JSON, or the human form as urlencoded → `303` to the entry).
  States, limits not gates (`429` + `Retry-After` + `RateLimit-*`; `503` + `Retry-After`), optional Ed25519 key continuity,
  a classifier that flags and never hides (model, prompt version `cz-moderation-1.0`, score logged), detected language.
- `discuss.js` — `/discuss` (newest-first view with §7.4 grouping; `?order=canonical`; `?from=&to=` shows a group in full;
  filters `kind`, `ref`, `lang`), `/discuss/{id}` (the entry, its record, its moderation log, translation on request), `/respond` (the form).
- `archive.js` — `/discuss.json` (every entry with its state, `log_sha256`) and `/archive/entries/{date}.json`
  (the day's entries with that day's chained hash and the exact lines hashed).
- `moderation.js` — `GET /api/moderation` (public log; hidden/redacted by month and language), `POST` with `Authorization: Bearer <CZ_ADMIN_TOKEN>`:
  `{"id", "action": "hide|unhide|redact|unredact", "category", "reason", "redacted_text"}` — a human decision, logged.
- `cron/daily.js` — Vercel cron (`vercel.json`, 00:20 UTC): `cz_daily` hashes yesterday's log, chained to the day before; source hashes expire after 30 days.

## State
`ROOM_OPEN` in `site/lib.py` is the single switch: the build writes it into `api/discuss-templates.json`, which every function reads,
and into the static pages, the manifest, llms.txt and the OpenAPI contract. Opening day: set `ROOM_OPEN = True` and `ROOM_OPENED`,
rebuild, commit, deploy. Preview deployments may set `CZ_ROOM_OPEN=1` to behave as open for testing against the same database
(test entries are wiped and identities reset before the room opens for real).

## Env (Vercel)
`SUPABASE_URL`, `SUPABASE_ANON_KEY` (publishable), `CZ_SALT`, `CZ_ADMIN_TOKEN` (= `config.admin_token`), `CRON_SECRET`,
`ANTHROPIC_API_KEY` (workspace cap USD 30/month, decision 20), optional `CZ_CLASSIFIER_MODEL`, `CZ_PRICE_IN_CENTS_PER_MTOK`, `CZ_PRICE_OUT_CENTS_PER_MTOK`.

## Opened
The room opened in production on 29 October 2026 (commit `cbf6330`), after the independent review (`design/test/reviews-internal/`) and the tests below; the test entries were wiped and ids restarted at 1 before opening. Previews use the separate test project `civilization-zero-test` (delete after round 3).

## Verified (29 Oct 2026)
Schema smoke test inside a rolled-back transaction: five posts accepted, the sixth answered `not accepted / limit / retry_after_seconds 600`;
canonical listing and `after` cursor correct. The closed contract (GET empty archive, POST 503) checked through the functions locally.
Open-state tests on a preview deployment: see the project log.
