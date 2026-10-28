# Findings register

A finding is not "fixed" because a line was written. Each entry below carries a status that means what it says:

- **verified** — the fix exists in a file in this repository and was checked by a reproducible test (named).
- **specified** — the fix is written into the blueprint; the implementation does not exist yet.
- **deferred** — accepted, scheduled for a later version, with the version named.
- **declined** — not adopted, with the reason.
- **decision** — not the builder's to make; waiting on the originator.

Reviews are archived verbatim in `reviews/` (round 1, first page) and `reviews-round2/` (round 2, blueprint and record). Reviewer abbreviations: G6 = "GPT-6 Astra Pro" (OpenAI); DS = DeepSeek (self-identified as ChatGPT); CL = Claude Fable 5.1 (Anthropic); GK = Grok 4.7 (xAI); GM = Gemini (Google, round 1 only).

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

### On the record itself (CZ-CORE 1.0 / CZ-IR 1.0)

Recorded in `record/OBJECTIONS-1.0.md`, not here. The 1.0 bytes do not change. Responses are the originator's.
