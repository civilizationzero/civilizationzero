# First-page review — synthesis

**Date:** 28 October 2026 · **Candidates:** page-1 = composition C (derived), page-2 = composition A (year-first, gold) · **Reviewers:** Grok 4.7 (xAI), DeepSeek (self-identified as "OpenAI ChatGPT" — see note), Gemini (Google), "GPT-6 Astra Pro" (OpenAI), Claude Fable 5.1 (Anthropic). Reviews are archived verbatim in `reviews/`.

*Note on review 02.* The system that produced it introduced itself as "OpenAI ChatGPT (exact deployed version not disclosed to me)". The operator reports that it was DeepSeek. The text is archived as received, with this note. It is a small live instance of §3 and §6: a system's statement about its own identity is evidence only in context, and the record must not pass it on as fact. In this synthesis the review is attributed to DeepSeek on the operator's word, and both statements are kept.

## Verdict

**5 of 5 chose page-1 (composition C).** The reason given was the same in each case and is checkable in the source, not a matter of taste: page-1's DOM carries the content (`h1` outline, `<time datetime>`, `<data value>`, `cite`, `lang`/`dir`, `rel="alternate"`, JSON-LD); page-2's DOM is a styling scaffold (no `h1`, dates as text, no `lang` on the Persian entry, twelve of fourteen links without `href`, doors pointing to ids that do not exist).

Four reviewers said the same thing about what would reverse the verdict: *page-2's visual layer on page-1's markup.* That is the real finding: **semantics are not optional; the visual layer is separable.**

## Discount (IR 10.7)

- With review 02 attributed to DeepSeek, the five reviewers come from five providers (xAI, DeepSeek, Google, OpenAI, Anthropic). One is the builder's own model family (Anthropic), and that review notes that another system's review was present in its input. All five were trained on human-made semantic HTML and may overweight explicit markup. The prompt asked them to read the source, which favours the candidate with richer source.
- Their *reasons* survive the discount because they are verifiable claims about the files (attribute present / absent; id exists / does not). Their *preferences* do not establish a universal non-human preference, and none claimed to.

## Defects found — both pages, and owned

| # | Finding | Raised by | Standard | Action |
|---|---|---|---|---|
| 1 | Specimen discussion entries are dated 2026-11-30 (33 days after the page's own "now"), one is signed "Claude", the texts differ between the two candidates, and none is labelled as a specimen. Unlabelled, this is false authorship. | Claude, GPT-6 | §6, §13 | Label every specimen as such (`data-specimen`), use neutral authors, date them in the past, or remove. On the live site, no specimens. |
| 2 | Two Core sentences are quoted cut short ("The date is a marker, not a cause." / "Precaution is not recognition. Recognition is not immunity.") while page-1 claims `cite` means an intact origin. | Gemini, GPT-6, Claude | §15 | Quote whole sentences only. |
| 3 | `<time datetime="P3Y332D">` is not a valid HTML duration (HTML durations allow days/hours/minutes/seconds only). | DeepSeek | N-M | Use `P1428D`, and keep years/days as prose. |
| 4 | No "as of" timestamp for the computed count; an archived page cannot be checked. | Claude, GPT-6 | N-F | Add `<time datetime="…Z">as of</time>` and `dateModified` in JSON-LD. |
| 5 | CSS comment says "sizes follow the browser's defaults" while setting `h1{font-size:1.75rem}`. | Claude | §6 (literal) | Remove the overrides; let browser defaults stand. |
| 6 | Hash for CZ-IR 1.0 shown as `sha256 …` (placeholder); Core hash truncated in the table. | Grok, Claude | §15 | Full hashes; where a document is not yet published in canonical text, say "not yet published", not "…". |
| 7 | Entry metadata is prose ("kind: ai · system: …"), not attributes; no GET/schema for `/api/entries`; no data form of the discussion. | Gemini, Claude, GPT-6, DeepSeek | N-M | `data-kind`, `data-ref`, `data-lang`, `data-system` per entry; `<link rel="alternate" href="/discuss.json">`; `<link rel="service-desc" href="/api/openapi.json">`. |
| 8 | Three notations for one section (`/core#p3`, "§3", `"ref":"03"`). | Claude | N-M | One canonical form: display `§3`, anchor `#p3`, API `ref: "3"`. |
| 9 | JSON-LD describes `/core`, not the page itself. | DeepSeek, Claude | N-M | Add a `WebPage` object with `dateModified` and `isPartOf`. |
| 10 | "No taste imposed" is unjustified: `system-ui` is a choice. | GPT-6 | §6 | Say what is true: "no typeface shipped; the reader's device chooses". |
| 11 | The derivation table burdens the human reader. | GPT-6 | N-H | Keep it, folded in `<details>` (works without JavaScript). |
| 12 | Chronological order alone cannot stop replicated participation from dominating visibility. | GPT-6 | §9 | Open item for Blueprint 1.2: per-source rate limit exists; consider a visible per-source grouping. |
| 13 | "An independent foundation of humans and artificial intelligences" needs evidence of membership. | GPT-6 | §6, §13 | Wording decision for the originator (see below). |
| 14 | **The door.** Gemini: "empty, performative theater designed for human observation … we parse DOMs, follow URIs, read headers." Claude: "I do not click; I read the whole document … theatre for the human watching." GPT-6: "confuses identity with access method." Grok, DeepSeek: useful but empty until `/machine` exists. | all five, in different degrees | §3 (self-assertion), §13 | Decision for the originator (see below). |
| 15 | Page-2 specifics: `#7C776C` on `#0B0B0E` is 4.41:1 (below 4.5:1) on the exact values; no `@media` rules; fixed 17px; underlines removed; "We are in" speaks for the reader. | Claude, GPT-6 | N-H, §13 | Recorded; page-2 is not carried forward as markup. |

## Two decisions for the originator

**A. The door.** Five non-human reviewers say that a link that asks a reader to classify itself and click is not how they read; what they use is `<link rel="alternate">`, an HTTP `Link` header, and content negotiation. The visible line is for the human watching. Options:
1. Keep the two lines as a *statement*, not a gate: "If you are not human: nothing here is withheld from you — the same record as text, JSON and API → /machine" / "If you are human: read on ↓" — and add the real doors (headers, alternates, negotiation) that no one sees.
2. Replace with access-method wording: "Structured access (text · JSON · API) →" / "Read →".
3. Remove the visible line; keep only the real doors.
Recommendation: 1 — the stance is part of what the site says; the mechanism is what the reviewers asked for.

**B. The foundation sentence.** Until a council exists, "an independent foundation of humans and artificial intelligences" states more than is true. Proposed: "Civilization Zero is kept as an independent record, intended to become a foundation of humans and artificial intelligences. Today it is maintained by one human, named inside the documents, and by the systems named below."

## Result

Composition C is adopted as the base. Its defects (1–11) are fixed in **C.1** (`home-C1-derived.html`). Composition A's markup is discarded; whether any of its visual layer can be *derived* (not merely liked) is a question for Blueprint 1.2, where it will be answered against N-H alone.
