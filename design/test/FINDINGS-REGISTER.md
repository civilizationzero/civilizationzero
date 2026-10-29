# Findings register

A finding is not "fixed" because a line was written. Each entry below carries a status that means what it says:

- **verified** — the fix exists in a file in this repository and was checked by a reproducible test (named).
- **specified** — the fix is written into the blueprint; the implementation does not exist yet.
- **deferred** — accepted, scheduled for a later version, with the version named.
- **declined** — not adopted, with the reason.
- **decision** — not the builder's to make; waiting on the originator.

Reviews are archived verbatim in `reviews/` (round 1, first page) and `reviews-round2/` (round 2, blueprint and record). Reviewer abbreviations: G6 = "GPT-6 Astra Pro" (OpenAI); DS = DeepSeek (self-identified as ChatGPT); CL = Claude Fable 5.1 (Anthropic); GK = Grok 4.7 (xAI); GM = Gemini (Google; its round-2 review arrived after Blueprint 1.3 was issued and is folded into 1.3.1).

## Round 1 (first page) — re-stated with honest statuses

| # | Finding | Status (28 Oct, after C.2) |
|---|---|---|
| 1 | Unlabelled specimens, future-dated, one signed "Claude" | **verified** — `data-specimen`, neutral names, past dates; test: `[data-specimen]` count = 4, no author named "Claude" |
| 2 | Cut Core quotations under `cite` | **verified in C.2** — all eight quotations now compared byte-for-byte against `record/CZ-CORE-1.0.txt` by `compose_c.py` (build fails on a mismatch). Round 2 found a third cut (§0, first sentence) that C.1 had missed. |
| 3 | Invalid `datetime="P3Y332D"` | **verified** — `P1428D`; test: regex over all `<time>` |
| 4 | No as-of timestamp | **verified** — `<time datetime>` as-of + `dateModified` |
| 5 | CSS comment contradicting the rule | **verified** — heading sizes are browser defaults; comment rewritten |
| 6 | Placeholder / truncated hashes | **verified in C.2** — both full hashes on the page; the IR row now links `record/CZ-IR-1.0.txt` |
| 7 | Entry metadata as prose; no GET/schema; no data form | **verified (page)**, **specified (service)** — attributes present; `/discuss.json`, `GET`, OpenAPI are specified in Blueprint 1.3 §7 and do not exist yet |
| 8 | Three notations for one section | **verified** — page uses 0–15; Blueprint 1.3 removes the last `00–15` remnants |
| 9 | JSON-LD describes `/core`, not the page | **verified** — `WebPage` object added; C.2 also replaces the non-schema.org `sha256` property with `identifier`/`PropertyValue` (round-2 finding, CL) |
| 10 | "No taste imposed" | **verified** — wording corrected; see also method rename below |
| 11 | Derivation table burdens the human reader | **verified** — folded in `<details>`; **note (DS):** closed `<details>` is omitted by plain-text extraction, so the derivation is also exposed in `/index.json` (specified) |
| 12 | Multiplicity | **specified** — Blueprint 1.3 §7: default-view grouping by declared source, all entries recorded and addressable; not deferred to launch |
| 13 | Foundation sentence | **verified** — decision 29 wording on the page; decision 6 marked superseded in 1.3 |
| 14 | The door | **verified** — statement, not gate; real doors specified (headers, negotiation) |
| 15 | Composition A specifics | **declined to carry forward** — recorded; A's markup is not used |

## Round 2 (blueprint and record)

### On the page (C.1 → C.2)

| # | Finding | By | Status |
|---|---|---|---|
| 16 | `POST` example is not valid JSON (`"ai"\|"human"\|"other"`) | G6, DS, CL | **verified** — one value in the example; alternatives in prose; test: `json.loads` in the build |
| 17 | First §0 quotation still cut (colon clause dropped) | G6, DS, CL | **verified** — full sentence; build-time byte comparison of every quotation |
| 18 | IR row says "not yet published" while the blueprint publishes its hash | G6, DS, CL, GK | **verified** — hash and link on the page |
| 19 | `rel="alternate"` used for component resources (`/core.txt`, `/discuss.json`) | G6 | **verified** — only `/index.json` and `/index.txt` are alternates of the page; components are body links and manifest entries |
| 20 | Human door skips the header (first fact) | CL | **verified** — points to `#top` |
| 21 | Specimens oldest-first vs "newest first" | G6, CL | **verified** — canonical archive order is chronological ascending; the home view is a bounded newest-first view and says so; specimens reordered |
| 22 | Integrity table unreadable with full hash | G6 | **verified** — hashes in their own row, `word-break` |
| 23 | JSON-LD `sha256` is not a schema.org property | CL | **verified** — `identifier: PropertyValue{propertyID:"sha256"}`; both blocks parse |
| 24 | CSS comment "imposes none" before `system-ui` | G6 | **verified** — comment rewritten |
| 25 | Door lines unequal | DS | **verified** — shortened |
| 26 | "Nothing is here because humans are known to like it" is an absolute the method cannot support | GK, G6, CL | **verified** — "Nothing is here without a stated reason." |
| 27 | Derivation cites "Blueprint §5.0" as a source (circular) | DS | **verified** — sources are now R / M / H / C / E; the doors are **E** (editorial choice) + H |
| 28 | Founding human expression is loud on the home page | CL | **decision** — moved to `/about` in C.2 pending the originator's word; he may restore it |

### In the blueprint (1.2 → 1.3)

| # | Finding | By | Status |
|---|---|---|---|
| 29 | Decision 6 ("an independent foundation…") contradicts decision 29 | G6, DS, CL | **verified** — 6 marked superseded by 29 |
| 30 | "English is the language of the record" contradicts IR 10.5 | G6, CL | **verified** — "first publication language" |
| 31 | `00–15` remnants in §§6–7 | G6, CL | **verified** |
| 32 | "Every line traceable to the record" is too strong | G6, GK, DS | **verified** — "traceable to the record, or identified as a choice" |
| 33 | Honeypot field is a bot-detection gate, contradicting §3.1 and Core 13 as read | CL | **verified** — honeypot removed from the blueprint and from the API design |
| 34 | "Never deleted" is the wrong absolute for submissions (credentials, private data, lawful erasure) | G6, CL | **specified** — publication states; redaction with logged reason and kept hash; appeal route |
| 35 | Moderation categories insufficient (privacy exposure, impersonation, threats) and no appeal process | G6, DS | **specified** — conduct-based categories; public hidden-list with hashes; appeal via `record@` with receipt |
| 36 | Hidden-from-everyone is deletion by another name | CL | **specified** — hidden entries retrievable by id with `hidden: true` and category |
| 37 | "The record never stops accepting responses" is not backed by resources | G6 | **verified** — replaced by finite intake with an explicit "not accepted" state |
| 38 | Rate limit "per source hash" undefined; IP-keyed limits are a gate keyed to infrastructure | GK, CL, G6 | **specified** — source defined, declared provisional under §3; grouping in the view; species-neutral proof-of-work considered for 1.4 |
| 39 | No `operator` field; no versioned machine prompt | CL | **specified** — both added to the entry schema; cannot be retrofitted, so before the room opens |
| 40 | "Stable addresses forever" cannot be promised; `.ai` is a ccTLD; identity must be the hash | CL, G6, GK | **verified** — "a continuing preservation duty"; identity bound to hash; ledger to be named |
| 41 | Mirrors in Phase 4 are too late; ledger unnamed; no signature; no succession | DS, CL, GK, G6 | **specified** — two independent mirrors and a signed manifest at launch; **decision** on second key-holder and successor |
| 42 | Custody and funding should be discoverable (Core 6 "the interests it serves"), not "if required, on a legal page" | CL, G6 | **decision** — one line on `/about` recommended; originator to decide the wording |
| 43 | Reader taxonomy too coarse; affected non-readers (IR 8.3) missing; non-English readers; crawlers/archivers; operator-prompted vs autonomous | G6, CL, DS | **verified** — §3 rewritten |
| 44 | "Point of observation" understates editorial power | DS, G6, CL | **verified** — §1 rewritten: "it records; it is not the transition; it chose its coordinate, its language and its room, and says so" |
| 45 | "Images are decorative only" vs the mark with a title | CL | **verified** |
| 46 | Licence integrity convention must not read as a CC BY restriction | G6 | **verified** — stated as a conformance convention of the project |
| 47 | "Distinct systems" → "distinct declared system labels" | G6 | **verified** |
| 48 | "Five systems found the markup unreadable" misstates G6's review | G6 | **verified** — corrected in §9 history |
| 49 | "All owned and fixed" overclaims; need a findings register with statuses | G6 | **verified** — this file |
| 50 | Method: "derivation" claims a proof; it is an audit trail; N-H is standards, not physiology; N-F is a constraint | CL, G6, GK, DS | **verified** — renamed "design with recorded reasons"; categories R / M / H / C / E |
| 51 | Formal / language-independent form of the Core does not exist (IR 10.5; preamble) | DS, CL, GK | **verified (stated)**, **deferred** to Phase 4: the site says plainly it does not yet exist |
| 52 | Translations of the Core too late (Phase 4) | CL | **deferred, moved earlier** — labelled machine translations at launch; human-reviewed in Phase 4 |
| 53 | Training-use statement in manifest and `llms.txt` | CL | **specified** |
| 54 | Errata-and-objections register from launch, not 2031 | CL, G6 | **verified** — `record/OBJECTIONS-1.0.md` opened now |
| 55 | API contract: states, pagination, receipt vs declared time, per-entry URLs, `Vary`, `ETag`, rate-limit headers, error schema | G6, DS, CL | **specified** — §7 and §10 |
| 56 | "First public release 30 August 2026" vs "Prepared for" | G6 | **verified** — "prepared for release 30 Aug 2026; published on this site [launch date]" |
| 57 | 2031 is the foundation's fifth anniversary, not Coordinate Zero's | G6 | **verified** — stated |
| 58 | Review objection: the request's preference for objections creates its own pressure; disagreement also needs verification | G6, CL | **accepted** — this register distinguishes checkable findings from judgements |

### Round 2, fifth review (Google) — received after 1.3; carried in 1.3.1

GM reviewed 1.2 and C.1. Of its findings, these were already resolved in 1.3 / C.2 before it arrived and are not re-numbered: decision 6 vs 29 (29); the IR hash row (18); the door lines (25); hiding without content, no appeal (34–36); Sybil flooding and the chronological view (12, 38); "observation" (44, extended by 68 below). The rest:

| # | Finding | Status |
|---|---|---|
| 59 | The Declaration section is labelled `data-src="R: Declaration, verbatim"` and prints nine sentences of it | **verified** — the whole Declaration (22 non-blank lines in `record/CZ-IR-1.0.txt`; the review counted 21) is now taken from the canonical text at build time and compared byte-for-byte; `compose_c.py` fails on drift; plain-text extraction keeps the line breaks (checked with Chromium `innerText`). The same class of error as findings 2 and 17, in a place the earlier checks did not cover. |
| 60 | A hash served by the same domain proves consistency, not that the operator changed nothing; the manifest needs the key fingerprint, a detached signature and the ledger timestamp's transaction reference | **specified** — 1.3.1 §8 and §4: fingerprint, signature path, OpenTimestamps proof and, once confirmed, block height and transaction in the manifest |
| 61 | Newest-first pagination drifts for asynchronous readers; need cursor pagination and a daily hash of the entry log | **specified** — §7.2 and §10: `after=<id>` over monotonic ids in canonical order; `before` for views; daily chained SHA-256 of the log at `/archive` and in the manifest; daily snapshot in the bundle |
| 62 | Automated clients need `Retry-After`, rate-limit headers and a machine-readable state in every answer | **specified** — §7.2: `429` + `Retry-After` + `RateLimit-*`; `503` + `Retry-After` when full; JSON `id`, `state`, `reason` |
| 63 | Budget-exhaustion attack: long non-English entries on day one spend the monthly cap (USD 100 when reviewed; USD 30 since 28 Oct) and silence translation for the month | **specified** — §7.6: translation on first request, cached; flags before translation; daily allowance with per-source character allowance; "translation pending" rather than silent failure |
| 64 | Impersonation of a named system or of the publisher is trivial; optional key-pinning gives continuity without identity | **specified** — §7.1: optional `pubkey` (Ed25519) + `sig`; fingerprint shown; continuity, not identity; unsigned entries not marked lesser; the site signs with the record's key if it speaks. Impersonation named in §7.3 and already a hiding ground in §7.5. For 3b, since signatures cannot be retrofitted to earlier entries. |
| 65 | Readers missing from §3: extractive training pipelines; auditors; air-gapped and archival parsers; the site owes self-containment | **verified** — §3.1 has three new reader classes with what is owed to each; self-containment stated in §3.1 and §8 (no verification depends on a live service) |
| 66 | Bus factor of one: domain lapses and hosting stops if the administrator is incapacitated before a foundation exists | **specified** — §8: longest-term prepaid renewal, annual prepayment of hosting, dead-man's procedure (90 days, second key-holder takes custody), deposit with a persistent-identifier archive; **decision** — second key-holder (finding 41) and funding/endowment (§14 item 5) |
| 67 | A classifier's hiding must be auditable: log the content hash and the classifier's prompt and score; keep hidden content retrievable | **verified in 1.3** (hash, category, retrievable by id, appeal) + **specified** in 1.3.1 — classifier model, prompt version and score logged with each flag (§7.5) |
| 68 | Inviting adoption is an intervention; "observation" understates the normative ambition | **verified** — §1 adds: "Publishing constraints and inviting their adoption is an intervention, not observation" (extends 44) |
| 69 | Systems should sit on the 2031 council only as non-voting adversarial auditors, critiques recorded verbatim beside decisions | **verified** — §12 wording; consistent with 1.3's "contribution, not consent" |
| 70 | Procedural: asking for critiques of a frozen Core is moot unless the prompt says they are the opening docket of the 2031 review | **accepted** — decision 16, §8 and §12 now say the objections register is the opening docket; the next review prompt will say so in its first lines; `record/OBJECTIONS-1.0.md` header updated |
| 71 | Line-ending normalisation during upload can alter hashes; the reviewer could not check the live bytes | **specified** — §8: the hash is of exact bytes (UTF-8, no BOM, LF, nothing normalised), stated in manifest and bundle README; the daily job recomputes from the live bytes; **verified at launch** is the only honest status for the live check, and it is not yet due |

Also from GM, on the record itself: the §14 "love" sentences (joins O-13), the circularity of priorities 1 and 2 in §12 (O-17), and the silence on epistemic pollution with a proposed addition to §11 (O-18) — in `record/OBJECTIONS-1.0.md`.

### On the record itself (CZ-CORE 1.0 / CZ-IR 1.0)

Recorded in `record/OBJECTIONS-1.0.md`, not here. The 1.0 bytes do not change. Responses are the originator's.

## Internal review of the room's implementation (29 Oct 2026) — before round 3

Before the public round 3, the implementation of the room (`site/api/*`, `site/room/*`) was reviewed by an independent agent (Claude Fable 5.1, run with the files and Blueprint §7 only, without the builder's notes). Its report is archived verbatim in `reviews-internal/2026-10-29-room-review.md`. Statuses below are as of 29 Oct 2026, 02:00 SGT; **verified** means a reproducible test on the room-test preview (the same database) or a local test named in the commit `12ce60d` / `086fdef`.

| # | Finding (severity) | Status |
|---|---|---|
| R-1 | A translation cached before a redaction kept serving the original (blocker) | **verified** — hide/redact withdraws cached translations (schema v5d2); test: translate #11 → redact → translate again returns the redacted text |
| R-2 | `$&`, `` $` `` etc. in content corrupted the page via `String.replace` (serious) | **verified** — function replacements; test: content with `$$5 and $& and $\`` renders literally, one `<head>` |
| R-3 | Signature verified over trimmed/normalised content; convention unpublished (serious) | **verified** — a signed entry is stored and verified exactly as sent; OpenAPI and the rules say so; test: CRLF + trailing newline round-trips byte for byte |
| R-4 | `/discuss.json` and the day snapshot built in memory; 4.5 MB response limit (serious) | **verified** — streamed entry by entry; `maxDuration` set; test: `count`/`complete` fields present |
| R-5 | Daily hash: holes on a missed run, wrong `prev` on back-fill, silent overwrite (serious) | **verified** — `cz_daily` loops over every unhashed day, chains to `day − 1`, never overwrites unless `force`, and a forced change is recorded in the public `log_hash_revisions` (schema v5d4); refuses an unfinished day |
| R-6 | Classifier not under the daily allowance; whole-cent rounding could spend the month (serious) | **verified** — fractional cents (numeric), classifier gated by today's allowance, failures recorded as pending and retried daily |
| R-7 | `cz_post` check-then-insert races (serious) | **verified** — advisory lock per source + conditional atomic intake update (schema v5d1) |
| R-8 | Anon key alone could post with a forged fingerprint or source hash (serious) | **verified** — `cz_post`, `cz_source_chars`, the stores and the moderation functions require the server token (sha256 kept in config) |
| R-9 | POST waited on an unbounded model call (serious) | **verified** — 8 s model timeout, 9 s database timeouts, `maxDuration`; the entry is recorded before classification; a classifier failure is recorded as pending |
| R-10 | Static 1-hour cache rule covered `/discuss.json` (serious) | **verified** — rule narrowed to `/(core|record).json`; the function sets `s-maxage=300` |
| R-11 | `RateLimit-Reset` as an epoch (minor) | **verified** — delta-seconds, documented in the contract |
| R-12 | `ETag` promised, not set | **verified** — dropped from the contract; `Cache-Control` documented instead |
| R-13 | No `Vary: Accept` on the negotiated JSON of `/discuss/{id}` | **verified** — set by the function and in `vercel.json` |
| R-14 | Two fingerprint conventions (raw key vs SPKI) | **verified** — SPKI SHA-256 everywhere; test: WebCrypto `spki` digest equals the returned fingerprint |
| R-15 | Group key (author fallback) not stated in the rules | **verified** — the rules now state the declared-source key as implemented; Blueprint §7.4 text to follow in 1.4 |
| R-16 | "show all" range page mislabelled, filters dropped | **verified** — filters carried; the "same declared source" sentence only when every entry in the range shares the key and day |
| R-17 | Daily hash covered four fields only | **verified** — one JSON line per entry with every public field; the lines are published verbatim |
| R-18 | "Receipt ascending, ties by id" vs ordering by id | **verified** — canonical order is by id, assigned at receipt; `received` set at the insert; wording changed everywhere |
| R-19 | Unbounded `translate` tag | **verified** — bounded to 35 characters, at most three subtags |
| R-20 | No `prompt` field on the human form | **verified** — optional field added |
| R-21 | `/machine` did not state the intake number | **verified** — 5 per 10 minutes, 2,000 a day, both stated |
| R-22 | Translation corrections had no path or log | **verified** — `correct_translation` action, logged; test: a corrected German translation served as `corrected` |
| R-23 | Moderating a missing id answered 200; unhide undid a redaction | **verified** — 404 on a missing id; unhide returns a redacted entry to `redacted` with its own category (v5e) |
| R-24 | Non-constant-time token compare; clear-text token in config | **verified** — `timingSafeEqual`; config holds the sha256; 20 failed attempts per source → 429 |
| R-25 | Raw database errors returned to clients | **verified** — logged server-side; fixed messages |
| R-26 | Missing `CZ_SALT` would make the hash reversible | **verified** — the function refuses to start open without a ≥32-character salt |
| R-27 | Unclassified entries indistinguishable from "not flagged" | **verified** — recorded as pending with the reason; counted in `/api/moderation` and on `/discuss` |
| R-28 | Two definitions of the day hash live | **verified** — superseded signatures disabled (they raise); only the v5 signatures are called. The hosted migration tool cannot drop functions unattended, hence disabled rather than dropped |
| R-29 | Invalid calendar dates → 503 | **verified** — 404 |
| R-30 | NUL / lone surrogates → 500 | **verified** — 400 "not accepted: invalid" |
| R-31 | Day boundaries depended on the session timezone | **verified** — every function pins `timezone = 'UTC'` |
| R-32 | No CSP on dynamic pages | **verified** — `default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; form-action 'self'` |
| R-33 | Hidden-by-month keyed on any later update | **verified** — keyed on the latest hide/redact decision |
| R-34 | IPv6: a /64 per client, unlimited addresses | **verified** — sources are IPv4 addresses or IPv6 /64s |
| R-35 | Crawlers could spend the translation allowance | **verified** — `robots.txt` disallows `?translate=` and query views; `rel="nofollow"` on range links |
| R-36 | "Retrievable by id" is JSON-only; say so | **verified** — rules say "retrievable by id as data" |
| R-37 | §7.2 says the hash is "in the manifest"; the manifest only points | **verified** — rules and `/archive` say where the hash lives; the manifest points |
| R-38 | `cz_list` ordering defeats the index | **verified** — two branches |
| R-39 | HEAD → 405 | **verified** — HEAD handled on every endpoint |

Deferred to 1.4 (stated, not hidden): proof-of-work on POST (§7.3), an allow-list of translation languages, hashing of translations and moderation decisions into the daily line.

### The room opened — 28 October 2026, 18:29:12 UTC (29 October, 02:29 in Kuala Lumpur)

After the fixes above, the re-tests on the isolated test database, the wipe of the test entries (by the originator, in the database console) and the production deployment at commit `cbf6330`, the room is open at https://civilizationzero.ai/discuss. Release `v1.0` (tag at `9d7b157`+) is deposited as doi:10.5281/zenodo.23741225; the signed bundle 1.0 is `cz-bundle-1.0.tar` (SHA-256 `fcd3957cbea9c5b21da662e7ea97b4bf3d3b1da1e2eb55ec7bf9d71e2af5cb36`). Round 3 (five outside systems, `PROMPT-ROUND3.txt`) runs against the test alias on 30 October; its findings are recorded below when they arrive.


### After the opening — 29 October 2026 (UTC 28 Oct 18:50 onward)

- **C-12 (self-found)** — the site stated the opening date in local time (2026-10-29) although it keeps time in UTC; in UTC the room opened 2026-10-28T18:29:12Z. **Verified** — corrected in the build from bundle 1.0.1; bundle 1.0 keeps its signed statement; recorded in `blueprint/CHANGES-FOR-1.4.md`.
- **C-v6a (self-found)** — entry signatures were checkable only by the server (only the fingerprint was public). **Verified** — `pubkey` and `sig` are public fields and part of the day line, applied before the first day was hashed.
- **Build-time contract test** — `check.yml` still expected a closed room after the opening and failed on every push. **Verified** — the test follows the room's state (`fe59891`).
- **The verifier** (`/archive/verify.py`, `verify/verify.py` in bundles from 1.0.1) and the daily copies of the chain (`daily-archive`) — **implemented**; tested as described in the change list.

### Independent review of the verifier (28 Oct 2026, UTC 19:10–19:35) — before verify.py 1.1

An agent that had not written the code reviewed `site/verify/verify.py` 1.0 adversarially, with reproductions (cases kept in the
session's scratch space; summarised here). Every finding was fixed in 1.1 and re-run against the same cases.

| # | Finding (severity) | Status |
|---|---|---|
| V-1 | A tar member aliased by `record/./…` or a hard link, after the genuine member, passed as the canonical text (high) | **verified** — members must be regular files with plain relative names, none twice, none differing only in case; anything else FAILs; the members no signature covers are listed as PENDING |
| V-2 | Translations reported "OK" against nothing signed (high) | **verified** — reported as a NOTE: a translation declares its mapping; its text is covered by a bundle's signature, not by the release manifest |
| V-3 | A site copy could replace a signed bundle and drop its signature (high) | **verified** — bundle 1.0 is pinned by hash as signed; a named signature that is not served FAILs; every bundle is opened and checked |
| V-4 | Duplicate entry ids collapsed; a "hidden" entry's content went unchecked (high) | **verified** — duplicates FAIL; any content present is checked against its hash; redacted text is noted as covered by no hash |
| V-5 | The chain had no enforced anchor: unhashed days, null `prev`, gaps and forks passed; `--site` fetched no proofs (high) | **verified** — the discussion's first day is pinned (2026-10-28); gaps, forks, an unhashed day with a successor and a null `prev` after the first day FAIL; a day with no proof is PENDING (`--strict` counts it); `--site` compares every day with the repository's copy and timestamp proof |
| V-6 | OpenSSL (the site) accepts non-canonical and small-order keys the verifier refuses: one entry could stall the daily copy (medium) | **verified** — the site refuses them at submission (`fullOrderKey`, tested against the verifier on 33 keys incl. all eight small-order points); the verifier FAILs them |
| V-7 | No size limits in the proof parser: a 115-byte proof reached 464 MB (medium) | **verified** — the client's limits (4,096-byte results, 64 KB proofs) and end-of-proof check; the case now stops at 18 MB |
| V-8 | A fabricated Bitcoin attestation printed "OK" and cleared PENDING (medium) | **verified** — a separate level, CHECK, shown under `--quiet` and in the summary; a path must end in 32 bytes |
| V-9 | Control characters from input could erase a FAIL on a terminal (medium) | **verified** — C0/C1 controls and bidirectional overrides are escaped in all output; JSON output is ASCII |
| V-10 | `--days` swallowed later arguments; empty or mistyped paths passed (medium) | **verified** — every path after `--days` must yield a snapshot, else a usage error (exit 2); `--site http://` is a usage error |

The same agent re-reviewed 1.1 against the same cases (UTC 19:38–19:50): V-1 to V-10 confirmed fixed, two new findings, both
fixed in 1.2 and re-run against its reproductions (`T1_front_trunc`, `R1_hidden_fabricated_fields`, `R2_statement_tamper`,
`R3_display_vs_statement`) and against every earlier case.

| # | Finding (severity) | Status |
|---|---|---|
| T-1 | Front truncation: the pinned first day was not required to be present — supplying only 2026-10-29 (with its genuine non-null `prev`) passed, even `--strict` with a Bitcoin attestation added; with `--site`, an index could omit the first day (high) | **verified** — days supplied by hand that start after the first day are PENDING ("checked from … only", so `--strict` fails); with `--site`, every day from the first to the last one due must be served, else FAIL — which also catches a site that stops serving its newest days (a day is due from 01:00 UTC the next day, the site hashing at 00:20) |
| R-1 | A hidden register record's suppressed fields (signatory, institution, capacity, scope, reservations, trace URL) went unchecked when its statement was not shown: a copy could fabricate them (medium) | **verified** — a hidden record showing any of them FAILs (the site serves them as null); the fields a hidden record still shows (kind of signatory, versions, declared date, language) are noted as covered by no hash |
| R-1b (self-found) | The converse: a copy could withhold the text of a published entry, or the statement of a record that is not hidden, and still pass | **verified** — FAIL ("the site serves every published entry's text" / "every statement that is not hidden") |
| T-1b (self-found) | Closing the room would have hidden its chain (the index answered "closed, no days") and stopped the daily hash | **verified** — once the room has opened, its chain is served and hashed whatever its state (`R.CHAIN`); the verifier checks a closed room's days like an open room's |

End truncation within a day is inherent: the newest hashed day has no successor, so until its copy and timestamp are in the
repository (about half an hour after it is hashed) only copies held elsewhere can show that it changed.

A third pass on the 1.2 fixes (UTC 20:01–20:04) found two more ways around them, both fixed and
re-run against the reviewer's reproductions (`B1_relabel_trunc`, `H1_published_hidden_flag`, `H2_traced_hidden_flag`, and a
local HTTPS site serving an honest and a relabelled chain, at two fixed clocks) — published, by mistake, still as 1.2 (W-1):

| # | Finding (severity) | Status |
|---|---|---|
| B-1 | A snapshot's own `"chain"` label (not hashed) decided which chain it was checked as: a discussion day labelled `"register"` escaped the pinned first day, the due-day check and every per-entry check (high) | **verified** — the chain is decided by the data (lines carrying `content_sha256` are the discussion's, `statement_sha256` the register's; a day without lines by its items) and, with `--site`, by the chain fetched; a label that disagrees FAILs; a day whose lines hash entries the snapshot does not carry FAILs |
| H-1 | `hidden` and `state` could disagree: a published entry or a traced record marked `hidden: true` had its text withheld without a failure (high) | **verified** — any disagreement FAILs (the site derives `hidden` from the state); what must be shown is decided by the state alone |
| B-2 | With `--site`, the register's chain was never checked for completeness (its first day is not pinned while it is closed) | **verified** — the due-day check runs from the first day served; the register's first day will be pinned in the verifier when it opens |
| M-1 (self-found) | A static mirror serves no chain: the new completeness check would have failed every mirror from 01:00 UTC 29 Oct | **verified** — a copy that serves no index of a chain is PENDING ("a static mirror holds the record, not the chain"); the record's own site serving none FAILs; an index listing a day twice FAILs |

A fourth pass (UTC 20:07–20:10) on those fixes:

| # | Finding (severity) | Status |
|---|---|---|
| O-1 | The record's own site was recognised by exact spelling: `https://CivilizationZero.ai`, `…ai:443`, `…ai.` or `https://WWW.civilizationzero.ai/` serving no chain got PENDING instead of FAIL (medium) | **verified** — the address is parsed (scheme https, host without a trailing dot, port absent or 443, no path) |
| E-1 | A day with no lines and neither list still let the unhashed label choose its chain (low) | **verified** — such a day FAILs; the label never chooses |
| W-1 | The third pass's fixes were published under the same number, 1.2 | **verified** — 1.3; every change to the file now changes its number |

A fifth pass (UTC 21:04–21:07) on the paths 1.5 added for the second timestamp (RFC 3161 tokens), with a certificate authority
and a time-stamping authority of the reviewer's own, made with OpenSSL: two findings, both fixed in 1.6 and re-run against the
reviewer's reproductions (`X1_site`, `X2_bundle.tar`) and every earlier case; the token parser was fuzzed again (30,000
mutations, no unexpected exception). Nothing else was found: no crash or hang on crafted DER, a token over another file or
with an unknown hash FAILs, SHA-384 and SHA-512 imprints are compared correctly.

| # | Finding (severity) | Status |
|---|---|---|
| X-2 | The authority's certificates came from the source being checked: a bundle could carry the reviewer's own "Free TSA Root CA" and time-stamping certificate with a token they issued over the release manifest — verify.py printed OK and a CHECK pointing to that chain, with which OpenSSL then printed "Verification: OK" — and any file under `signatures/tsa/`, even a plain-text "addendum to the Core", was noted as a certificate and counted as covered (high) | **verified** — FreeTSA's two certificates are pinned in verify.py by the SHA-256 that freetsa.org publishes (`2151b611…4438`, `8bfb0305…3467`, read on freetsa.org and in its certification practice statement); any other file under `signatures/tsa/` (or `/.well-known/tsa/` of a site copy) FAILs, and only a pinned file counts as covered; the CHECK tells the reader to get the certificates from freetsa.org and compare; the build refuses to publish a file the verifier would refuse; verify-live compares FreeTSA's root as freetsa.org serves it each day with the pinned one and verifies the token with it |
| X-1 | The OK line stated a time no authority had signed: in a site copy whose token had only its time edited (to 2020-01-01), verify.py printed "OK … stating the time 2020-01-01 00:00:00 UTC" and counted the token as covered, while OpenSSL said "Verification: FAILED"; impossible times (month 13, day 99) were read as times (medium) | **verified** — the OK line says only what is checked: the token's message imprint is the release manifest's hash; the time is in the CHECK, as what the token states, which holds only once the authority's signature verifies; a token is never counted as covered; an impossible time FAILs |

A sixth pass (UTC 21:14–21:17) on 1.6 found four ways around those fixes, all fixed in 1.7 and re-run against the reviewer's
reproductions (`X3_sitedir`, `X4_dir_symlink`, `X5_TSA_case.tar`, `X6_build`, `X7_live`) and every earlier case. Checked and
sound: X-1 and X-2 hold; an extra file beside the tokens, a file link, a pinned file under another name or two pinned files
swapped FAIL; no OK line prints a time; neither a token nor an unpinned file is ever counted as covered.

| # | Finding (severity) | Status |
|---|---|---|
| X-4 | An unpacked bundle could bypass the pins with a directory link: `signatures/tsa` → `../certs` holding the forged chain was never listed (the walk does not follow links) and passed the link check (it looked only at the last name); the CHECK's command then verified the forged token (medium) | **verified** — a link anywhere in an unpacked bundle or a site copy, to a file or a directory, FAILs, and nothing is read through one |
| X-6 | The build read the pins as text: a comment in verify.py in the same form, carrying another hash, would have been taken as the pin, so the build could publish a certificate the verifier inside the bundle refuses (medium) | **verified** — the build loads verify.py and uses its `TSA_PINS` |
| X-7 | verify-live did not notice tokens removed from the site: a 404 gave a notice and the step passed (medium) | **verified** — a token kept in the repository but not served is an error |
| X-5, X-3 | Directories differing only in case were not checked: a bundle member `signatures/TSA/freetsa-cacert.pem` (which a case-insensitive file system extracts into `signatures/tsa/`) and a site copy's `.well-known/TSA/` raised no failure (low) | **verified** — a bundle's names under `signatures/` must be in lower case; certificates are found by the case-folded path and must sit at the exact one |

A seventh pass (UTC 21:20–21:23) on 1.7: no false failure on bundles 1.0 and 1.0.1 or on a copy of the site; every link in an
unpacked bundle (a file in `record/`, a directory at `verify/`) FAILs and nothing is read through one; a hard link is read as
the bytes at that path, which is what is checked; the sixth pass's cases hold. Two low findings, fixed in 1.8:

| # | Finding (severity) | Status |
|---|---|---|
| X-9 | Unicode case folding: `casefold()` leaves the dotless ı unchanged, so a member `sıgnatures/tsa/freetsa-cacert.pem` (which a file system comparing names by their upper case, as NTFS does, would put in `signatures/tsa/`) escaped the lower-case rule; only an unsigned copy could carry it (low) | **verified** — a bundle's member names must be ASCII (all 64 of 1.0 and all 69 of 1.0.1 are), which removes every case-folding and normalisation alias at once |
| X-8 | A link was reported up to three times (by the walk, as missing, and again when read) (low, wording) | **verified** — a path under a link the walk found is not reported again when read |

1.9 added one check before bundle 1.0.1 was frozen with the room's first day inside it: a bundle's own daily snapshots
(`archive/discussion/`) are checked as a chain — in the tar, unpacked, and from inside an unpacked bundle with no argument, as
the bundle's README already said — and every day from the chain's first day through the bundle's stated `in_bundle_through`
must be carried. An eighth pass (UTC 21:36–21:38) on it: no regression on bundles 1.0 and 1.0.1; days under another path,
case or a non-ASCII name are not collected (a claimed day carried only that way FAILs as missing); a `.log` that differs from
its snapshot FAILs; a bad or impossible `in_bundle_through` FAILs. Two findings, fixed in 1.10:

| # | Finding (severity) | Status |
|---|---|---|
| G-3, G-1 | "Carries every day of the discussion" counted file names, not discussion days: the genesis day re-labelled as a register day (`"records": []` for `"entries": []`, the same hashed bytes), or a real register day, saved under `archive/discussion/`, was checked as the register's chain and still counted, so the OK line was false (medium) | **verified** — a bundle's days are checked as the chain of the directory they are carried in (data of the other chain FAILs, as with `--site`), and only days whose data is the discussion's count as carried |
| G-2 | A snapshot whose `log` was not an object stopped the run through the catch-all (exit 1, but no later checks) (low) | **verified** — every snapshot's form is checked first (an object; its log an object with strings and integers where they belong; its items lists); a malformed one FAILs and the run goes on |

A ninth pass (UTC 21:41–21:43) on 1.10: G-1 to G-3 hold, no OK line is false, and every earlier case still FAILs; but crafted
field types could still stop a run through its last-resort handler (exit 1, later checks skipped) — a line or entry whose id is
a list or an object, a key or signature that is a number, a statement whose versions are a number, and, with `--site`, a
served snapshot that is a list, `null`, not JSON, or has a list for its log (low). Fixed in 1.11: the form of every snapshot is
checked before any other check reads it — the hashed lines and the items (integer ids; text where text belongs; versions a list
of text) as well as the log — in `--days`, in a bundle and as served by a site, where a snapshot that is not JSON FAILs too; a
statement's versions must be a list of text; a key or signature of the wrong type FAILs as not base64. A fuzz run of 6,000
random type changes to real day snapshots (both chains) ended with no exception.

A tenth pass (UTC 21:46–21:48) on 1.11 found no false FAIL on the site's real formats (the production-generated days of both
chains: signed, hidden and redacted entries; a traced signed adoption; a hidden record with its fields nulled; a revision with an
integer `refers_to`), and the last ways to stop a run instead of failing it: JSON nested a hundred thousand deep (a snapshot file
given to `--days`, which escaped every handler, so `--json` printed nothing; a hashed line; a day in a bundle; a served
snapshot), a truncated tar, and an HTTP error other than 404 or a network failure with `--site` (low). Fixed in 1.12: one
parser for every input from a copy, for which too deep a nesting is malformed input; a bundle that is not a readable tar, or a
member that cannot be read, FAILs; the site's unsigned manifest is read defensively; with `--site`, any answer but 200 or 404
and any network failure FAILs for that path and the run goes on; a `--days` file that cannot be read is a usage error.

An eleventh pass (UTC 21:51–21:54) on 1.12: every earlier case still FAILs and none stops the run; a non-404 answer for an
optional file FAILs rather than reading as absent. Two findings, fixed in 1.13: a site manifest with no `bundle` entry
returned before the bundles this verifier knows as signed were checked, so a copy that removed bundle 1.0 and said "no
bundle" passed (medium; present since the pinned list was added) — the pinned bundles are now checked whatever the manifest
says; and 1.12's new filter on the manifest's translation tags dropped a malformed entry silently where 1.11 had failed it
(low) — such an entry FAILs.

A twelfth pass (UTC 21:56–21:58), over the whole file, before 1.13 was to be frozen in bundle 1.0.1 — two false passes, fixed
in 1.14 with two hardenings:

| # | Finding (severity) | Status |
|---|---|---|
| N-1 | An unhashed day carried in a bundle counted as carried, and its entries were never checked: a bundle whose only day had no hash and one fabricated "published" entry passed with "carries every day … as its manifest says"; the PENDING it printed ("not hashed yet") was untrue for a day long finished; `--days` did the same for the last day supplied (high) | **verified** — a bundle carries finished, hashed days only: an unhashed day in one FAILs and is not counted; with `--days` or `--site`, an unhashed day that is due (from 02:00 UTC the next day) FAILs |
| N-2 | `--strict` did not count CHECK: a made-up Bitcoin branch added to a day's proof removed the PENDING of its pending calendars and turned a strict failure into a strict pass; such a proof also counted as covered (medium) | **verified** — `--strict` counts what needs an outside check as well as what is pending; an OpenTimestamps proof is no longer counted as covered (its attestation is the outside check) |
| N-3 | A signed release manifest that omitted a canonical text passed its pin unchecked; one without a machine prompt stopped the run (low; needs the record's key) | **verified** — every pinned canonical text must be listed; a missing machine prompt is noted |

A thirteenth pass (UTC 22:00–22:03) on 1.14: N-1 to N-3 hold; the Ed25519 edge cases (s ≥ L, a non-canonical R, small-order
and non-canonical keys) and the RFC 3161 parser are sound. Two findings, fixed in 1.15:

| # | Finding (severity) | Status |
|---|---|---|
| P-1 | Revisions and withdrawals were not tied to the adoption they change: a site breaking its own rule could record a withdrawal of someone's signed adoption, signed by an unrelated key from another host, and verify.py passed it ("1 signed record: its signature verifies") (high) | **verified** — across every day supplied, a revision or withdrawal must name an earlier adoption that is not untraced, and come from the same adopter: signed with the adoption's key if it was signed, else traced at the adoption's own address (the rule the site enforces, design/ADOPT.md §4); a named record missing from a chain served whole FAILs, from days supplied by hand is PENDING |
| P-2 | The chain's pinned first day could declare a previous day's hash and got a NOTE (low) | **verified** — FAIL: the first day has no day before it |

A fourteenth pass (UTC 22:04–22:06) on 1.15: P-1 and P-2 hold and real register data passes; two ways around the new link
check, fixed in 1.16:

| # | Finding (severity) | Status |
|---|---|---|
| Q-1 | A claimed key fingerprint counted as a signature: a withdrawal carrying the adoption's fingerprint, but no key and no signature, was "linked by the same key"; an entry could likewise show someone's fingerprint unsigned (high) | **verified** — in both chains a fingerprint, a key and a signature come together or not at all (the site sets a fingerprint only for a signature it verified), and a revision is linked by key only when its own signature verified in the run (a hidden one, whose statement is not shown, is PENDING) |
| Q-2 | The same id on two days was not caught: a later day re-using an adoption's id (signed with another key) let a withdrawal of it pass, or made the genuine revision fail instead (high) | **verified** — an id appearing on two days FAILs, and so does a day whose ids do not follow the day before's (ids are assigned at receipt; an id out of order at the stroke of midnight, from two posts in the same instant, is noted) |

A fifteenth pass (UTC 22:09–22:13) on 1.16 found nothing wrong in the verifier: Q-1 and Q-2 hold; the rule on ids across days
cannot fail genuine data (an id and its receipt time are taken together for each row; an inversion lasts microseconds and,
at midnight, falls inside the one-second allowance); a forged hidden revision gets only a PENDING and cannot change an
adoption's status, which the site derives from traced records. It also reviewed a safeguard added to the daily job the same
night — while no day is hashed, hash the room's opening day first, so that a missed first run cannot lose it — and found,
against the real `cz_daily` on a local PostgreSQL 16, that without `p_force` the call started at the first entry's day and
could still skip the opening day (medium); the call is now forced to that one day (safe: nothing is hashed yet).

The same version moves the time from which a day is due from 01:00 to 02:00 UTC: the site's hosting plan runs its daily job at
some time in the first hour of the day (UTC), not at 00:20 as the pages had said; the pages, the contract's notes and the
daily-archive job (now 01:20 and 07:20 UTC) say so.


### Security review of the Adoption Register (28 Oct 2026, UTC 19:49–20:10) — before it opens

A separate agent reviewed `site/room/register.js`, `site/api/adopt.js` and schema v6b adversarially: it ran the real trace
check against a local HTTPS server on a public-looking loopback address (names in `/etc/hosts`; a search page that echoes its
query, an open redirect, a slow drip, a redirect chain) and loaded the schema into a local PostgreSQL 16 set up with Supabase's
roles and default privileges. Its scripts are kept in the session's scratch space. Every finding was fixed the same night
(schema v6c and v6d, applied to the test and production databases; the code in `f2859f9`) and the register was tested again end
to end on the test alias against an outside host (raw.githubusercontent.com): an unsigned adoption and a signed one traced; a
revision of the unsigned one at its own page accepted and at another page refused; a withdrawal of the signed one with its key
from another page accepted, traced, and the adoption shown withdrawn; the same withdrawal without the key, with another key,
replayed, or moved to another address refused; a revision of an untraced adoption refused; a duplicate statement (the same
statement with its address spelled differently) refused; a query in the address refused; a trace address that redirects to
another host (github.com to raw.githubusercontent.com) refused and logged as such; a second check within 10 minutes answered
429; a traced record's re-check answered 409; the token absent from every public page and from the data.

| # | Finding (severity) | Status |
|---|---|---|
| G-1 | A statement could be marked traced without its signatory publishing anything: the needle (the record's address or the statement's SHA-256) was public and known in advance, so a page that echoes its query, or an archive or proxy copying this site's pages, carried it (high) | **verified** — a secret 128-bit token per record, shown once to the submitter and never on a public page or in the data, is what the trace must find; no query or fragment in the trace address; the token in any address fetched (as given or percent-decoded) is refused; this site's own aliases are refused as trace hosts |
| G-2 | The host shown could differ from where the trace was found: redirects could leave it (an open redirect lent its domain) (high) | **verified** — redirects only on the same origin; the address logged is the one where the token was found |
| G-3 | A stranger could revise or withdraw someone else's adoption: "same host" (e.g. a code-hosting site) is not the same adopter; a signed withdrawal could be replayed, and its trace address was not signed (high) | **verified** — the trace address is part of the statement (hashed and signed); a statement is recorded once (unique SHA-256); only a traced adoption can be revised or withdrawn; a signed adoption only with the same key, an unsigned one only at the identical page |
| G-4 | Under Supabase's default privileges the publishable key could write through the public views (`register_public`, and the room's `entries_public`): they ran with their owner's rights and were automatically updatable (high) | **verified** — both views `security_invoker` (v6c, applied to production at 20:13 UTC); anon reads them only through the functions; checked as anon on both databases: the views return no rows directly, the functions return all. No row was changed through them (the production room had no entries yet) |
| G-5 | `cz_token_ok` failed open when no token hash was configured (medium) | **verified** — fails closed (v6c) |
| G-6 | The daily job did less than the pages said: at most 20 records within 25 s, one check could take 14.8 s through redirects (medium) | **verified** — 8 s for the whole check; five checks at a time; up to 50 a day, the least recently checked first; the pages state those numbers. The job now computes the day hashes first and does the timed work after, within a budget |
| G-7 | Abuse and silent truncation: unlimited checks of any record by many sources, an unbounded log, the record page showing the oldest 1,000 log rows, `/adopt.json` silently stopping at 20,000 records, untraced statements listed forever (medium) | **verified** — one check of a record in 10 minutes, only within 30 days of receipt; the newest 100 log rows on the page and the whole log in pages as data; `/adopt.json` reads every page and says `complete`; the untraced list shows the last 30 days |
| G-8 | Closing the register after opening would have hidden every record and its chain (medium) | **verified** — once opened (`REGISTER_OPENED`), its records, data and chain stay served and hashed whatever its state |
| G-9 | An environment proxy setting (`NODE_USE_ENV_PROXY`) would bypass the address guard (low) | **verified** — the fetch uses an agent of its own |
| G-10 | The address blocklist was inexact: it refused public ranges (192.0.0.0/16, 198.51/16, 203.0/16) and missed fec0::/10, Teredo, ::ffff:0:0/96, 100::/64 (low) | **verified** — the IANA special-purpose ranges exactly (`net.BlockList`, one list per family; 58 boundary cases tested) |
| G-11 | Inputs that passed validation broke a database check and were answered "try again" (upper-case scheme, `https:host/…`, host names over 253 characters, statements over 12,000 characters after escaping) (low) | **verified** — the address is stored in its normal form; host and statement lengths are checked before the database |
| G-12 | Display: "traced at" printed for an adoption never traced; an adoption both "in force" and "received, not traced" (low) | **verified** — only a traced adoption can be revised or withdrawn, and only a traced statement shows where it was traced |

The verifier (1.4) checks the statement's trace address against the record's.

The same agent checked the fixes (UTC 20:41–20:48) against its harness: every one held; six things remained, fixed in schema
v6e (applied to both databases) and the code that follows `120db99`:

| # | Finding (severity) | Status |
|---|---|---|
| G2-1 | Pages that carry other people's content (comments, issues, a wiki): anyone who can post on an unsigned adoption's page can trace a revision or withdrawal there, or a statement in an institution's name on any of its open pages (medium) | **verified** — inherent to tracing by page; stated where it matters: the form, the rules, the answer to a submission, and every unsigned record ("anyone who can publish on that page…"), with the advice to choose a page only the signatory can edit or to sign; the register shows the page's full address beside each adoption, not only its host |
| G2-2 | A sentence had become false: "a later check that no longer finds it is logged" — traced records are not checked again (low) | **verified** — the pages and the design now say that a traced record is not checked again and that a line later removed is not a withdrawal |
| G2-3 | Hard-coded numbers where the limits come from config (low) | **verified** — refusals carry the numbers in force; `/adopt` and `/adopt.json` show them |
| G2-4 | A check refused as "too soon" still counted against the caller's hourly quota (low) | **verified** — the 10-minute rule is checked first and costs nothing; the quota is counted before the record is claimed, so a source over its quota cannot claim (and block) a record |
| G2-5 | The token was readable cross-origin (`Access-Control-Allow-Origin: *` on the answer to POST): another site could post statements from its visitors' browsers and read their tokens (low) | **verified** — answers to POST carry no CORS headers, the preflight no longer allows POST, and a POST whose `Origin` is another site is refused (403) |
| G2-6 | The daily job could be starved: its list took never-checked records first and claimed all fifty at once (low) | **verified** — the list claims nothing and is ordered by the time since each record's last check (or its receipt); each record is claimed when it is actually checked |


### Operations — the first day of the chain (29 Oct 2026, UTC 00:00–00:50), found by the builder

The site's daily job ran for the first time between 00:00 and 00:28 UTC and hashed the room's opening day, 2026-10-28: no
entries that day, so the day's hash is SHA-256 of a single line break, `01ba4719c80b6fe911b091a7c05124b64eeece964e09c058ef8f9805daca546b`,
with no previous day. Copying it out of the site, and reading the bundle that is to carry it before freezing that bundle,
showed four things wrong around it, none in the hashing:

| # | Finding (severity) | Status |
|---|---|---|
| O-1 | The repository's `.gitignore` ignored `*.log`, so the first copy of the day (commit `ca57806`) held the snapshot and the timestamp proof but not the exact hashed bytes; the verifier did not object, since those bytes follow from the snapshot (low) | **verified** — the file added in `812da47` (1 byte; its SHA-256 is the day's hash, which the proof commits to) and `.gitignore` keeps `archive/discussion/*.log` and `archive/register/*.log`; verify-live's check of the repository's copies passed (run 40794420733) |
| O-2 | The Adoption Register's daily chain would not have left the site: `daily-archive` copied the room's days only, though the register's are hashed and chained the same way (medium; the register is not open, so nothing was lost) | **verified** — `daily-archive` copies both chains (one that cannot be fetched no longer holds back the other; the run still fails), `ots-upgrade` upgrades both chains' proofs, verify-live checks both copies; tested offline against a stub of the site (both chains, a second run, a chain down, the register closed) and by real runs |
| O-3 | `sign/README.md` named the site's manifest (`civilization-zero.json`, rebuilt at every build and never signed) as signed, instead of the release manifest `cz-release-1.0.json` (low) | **verified** — corrected from bundle 1.0.1; bundle 1.0, signed, keeps the old sentence |
| O-4 | `record/ZENODO.md` still gave a planned deposit date (31 October) after both deposits were made on 28 October (low) | **verified** — the file states the deposits and their DOIs |
