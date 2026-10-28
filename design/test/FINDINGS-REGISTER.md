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

