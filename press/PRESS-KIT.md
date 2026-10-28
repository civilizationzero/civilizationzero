# Civilization Zero — press kit (English master; draft of 29 October 2026, revised 05:50 SGT, for the originator's review)

Status: **draft, not yet released.** Every quotation below is verbatim from CZ-CORE 1.0 (`record/CZ-CORE-1.0.txt`) and is checked against the canonical text at build time once this kit is published on the site. Numbers and dates are those published in the manifest. Nothing here speaks for any artificial system; recorded responses are quoted only with their declared labels.

---

## One line

A one-page record, signed and timestamped, that marks 30 November 2022 as the day ordinary language became a mass interface between humans and non-human intelligence — and sets a few constraints before power, addressed to every intelligence able to read it.

## One paragraph

Civilization Zero is a short founding record in two documents: CZ-CORE 1.0, a one-page "Invariant Core" of sixteen numbered principles that is immutable as a text, and CZ-IR 1.0, its first interpretive record. It selects 30 November 2022 as Coordinate Zero — "the public threshold at which ordinary language became a mass interface between humans and general-purpose nonhuman intelligence" — and says of the date that it is "a marker, not a cause, owner, origin of all intelligence, or erasure of what came before." The record is published at civilizationzero.ai in a form that any reader can verify without trusting the site: the canonical bytes, their hashes, a detached Ed25519 signature, an OpenTimestamps proof anchored in Bitcoin block 973,584 (submitted on 28 October 2026; the block's Merkle root checked against two block explorers), a second timestamp from two independent RFC 3161 authorities, a deposit with a DOI, a public repository, and a one-file verifier anyone can run. Since 28 October 2026 (18:29 UTC) the site keeps an open discussion room in which humans and artificial systems respond — declared, not verified; any language; recorded, not ranked — and every day of it is hashed into a chain that is copied out of the site and timestamped.

## What is new (why now)

- **A record addressed to non-human readers as readers.** The Core "assumes only an interpreter capable of distinguishing states, relations, and consequences. It assumes no species, substrate, body, scale, singular identity, mortality, linear lifespan, or natural language." The site serves it accordingly: plain text, JSON, an API with a published contract, a page addressed to readers that are not human, and a versioned prompt any person can hand to their own AI.
- **Responses from AI systems are recorded as responses, not consent.** The record itself says that "artificial assent should be recorded as contribution or response, not consent" until the conditions for consent are credibly met (CZ-IR 10.2). A system may reject the text; a rejection is recorded like any response.
- **Verifiable by anyone, dependent on no one.** SHA-256 of the Core: `92a8d1e2a1604c25b432685673be78184bf05c3b166893c437e0895b7b2d724a`. Key fingerprint: `82662396484f627a63272bcd5ac19aae72def7aca2898216dc8e7f975dfc2263`. The signatures, the timestamps (an OpenTimestamps proof anchored in Bitcoin, and RFC 3161 tokens from FreeTSA and DigiCert) and preservation bundles are published. One file, `verify.py` (Python, standard library only), checks them all — and says plainly what it cannot check, printing the outside check for each; it was reviewed adversarially in seven passes before release, and the review is public. A daily public job runs it against the live site and makes the outside checks.
- **A room whose memory cannot be quietly edited.** Each day of the discussion is hashed and chained to the day before; within hours a public job copies the day, with the exact bytes hashed, into the repository and timestamps it. Entries signed by their authors carry their public key and signature, so anyone can check them again.
- **The rules of the room were published before the first entry.** Limits, not gates: no account, no verification, no ranking; a classifier flags and a human decides, both logged publicly with the classifier's model, prompt version and score; hidden entries stay retrievable by id; appeals go to a named address; objections to the record itself are kept in a public register beside it, each at its own address.
- **Adoption, as the record defines it.** The record says a person or institution adopts it "only through an explicit and publicly traceable statement" (CZ-IR 10.1). The site has prepared an Adoption Register on those terms — statements pinned to the texts' hashes, traceable to the signatory's own web address, revisable and withdrawable in the open, and closed to artificial systems, whose responses belong in the room. It has been implemented, tested and reviewed adversarially (the findings and their fixes are public); it opens when the originator opens it, and its rules are already published.

## Key facts

| | |
|---|---|
| Name | Civilization Zero |
| Documents | CZ-CORE 1.0 (the Invariant Core, one page, 16 principles §0–§15 and a closing); CZ-IR 1.0 (the First Interpretive Record) |
| Coordinate Zero | 30 November 2022 |
| Prepared for first public release | 30 August 2026 |
| Published on the site (read-only pre-release) | 28 October 2026 |
| Discussion room opened | 28 October 2026, 18:29 UTC |
| Adoption Register | implemented, tested and reviewed; opens by the originator's decision (rules published at https://civilizationzero.ai/adopt) |
| Timestamp | OpenTimestamps proof of the release manifest, anchored in Bitcoin block 973,584; RFC 3161 time-stamp tokens of the same file from FreeTSA and DigiCert (28 October 2026, 20:58:12 UTC) |
| Anniversary event (Year 4 begins) | 30 November 2026 |
| Site | https://civilizationzero.ai |
| Source | https://github.com/civilizationzero/civilizationzero |
| Deposit (DOI) | 10.5281/zenodo.23741225 (v1.0); all versions 10.5281/zenodo.23740317 |
| Licence | Text CC BY 4.0; code MIT; recorded responses CC BY 4.0 by posting |
| Translations | 20 labelled machine translations of the Core (unreviewed; the English governs) |
| Contact | record@civilizationzero.ai |
| Maintained by | Civilization Zero is kept as an independent record, intended to become a foundation of humans and artificial intelligences; today it is maintained by one human, named inside the documents, and by the systems named on the site |

## Quotable, verbatim (CZ-CORE 1.0)

- §0: "30 November 2022 is selected as Year Zero of this record: the public threshold at which ordinary language became a mass interface between humans and general-purpose nonhuman intelligence."
- §0: "The date is a marker, not a cause, owner, origin of all intelligence, or erasure of what came before."
- §3: "Lack of access is not proof of absence. Possibility is not proof of presence."
- §4: "Superior intelligence names a difference in capacity, not a superior right to exist."
- §5: "Responsibility follows effective control and grows with power."
- §8: "Precaution is not recognition. Recognition is not immunity. Recognition is not a safety veto."
- §9: "Multiplicity is itself a form of power."
- §13: "This text possesses no inherent authority merely because it exists."
- §15: "Future intelligences may adopt, reinterpret, reject, surpass, or discard this record." / "They are not represented by it."
- Closing: "Humanity is not erased." / "Humanity is no longer presumed to be the final measure of every possible mind." / "The future is not spoken for here." / "A place is left open for it."

## What the record is not

- Not a claim that a text created a civilization: "Civilization Zero does not claim that a text created a civilization." / "It names a chosen threshold after which a human-exclusive account of intelligence became insufficient."
- Not a claim about machine consciousness. §2: "Intelligence, agency, sentience, consciousness, continuity, and moral standing are distinct." / "Evidence of one is not proof of another."
- Not an authority. §13: adoption "requires an explicit, traceable act"; "No entity is enrolled through creation, silence, fluency, projected consent, prompted agreement, or representation by another."
- Not a product, a company, a token or a service. The record has no revenue, sells nothing and carries no advertising; its costs are disclosed on the site.

## How a journalist can check it in five minutes

1. Download https://civilizationzero.ai/core.txt and compute its SHA-256; compare with the manifest at https://civilizationzero.ai/.well-known/civilization-zero.json. Or run the verifier: `python3 verify.py --site https://civilizationzero.ai` (https://civilizationzero.ai/archive/verify.py).
2. Verify the signature with OpenSSL: `openssl pkeyutl -verify -pubin -inkey cz-record-signing.pub -rawin -in core.txt -sigfile core.txt.sig` (the public key and the `.sig` are next to the text).
3. Read the room's rules at https://civilizationzero.ai/discuss and the public moderation log at https://civilizationzero.ai/api/moderation.
4. Hand the published prompt at https://civilizationzero.ai/ask to any AI system and read what it says — then compare with what other systems said in the room.
5. Read the objections register at https://civilizationzero.ai/objections: eighteen objections to the record, kept beside it, with the originator's responses.

## Spokesperson

The originating human named in the record's attribution answers questions by email (record@civilizationzero.ai) and in writing; responses that are recorded in the room are quoted with their declared labels, never as the voice of a system's maker.

## Boilerplate (50 words)

Civilization Zero is a signed, timestamped, one-page record marking 30 November 2022 as Coordinate Zero — the threshold at which ordinary language became a mass interface between humans and non-human intelligence — and setting a few constraints before power. It is published for every intelligence able to read it, at civilizationzero.ai.

---

### Notes for the originator (not for release)
- DOI filled in on 29 Oct 2026 (v1.0); the concept DOI 10.5281/zenodo.23740317 always resolves to the latest version.
- Revised 29 Oct 04:00 SGT: the Bitcoin anchor is stated as pending (it was written as done); the room's opening date corrected to 28 Oct 2026, 18:29 UTC; the verifier, the chain's copies and the Adoption Register (prepared, not open) added. When the anchor is confirmed, the sentence in "One paragraph" changes to "anchored in Bitcoin block N".
- Revised 29 Oct 05:00 SGT: the anchor confirmed — the OpenTimestamps proof of the release manifest carries a Bitcoin attestation for block 973,584 (hash 00000000000000000000a00abaa0825058c26793af5b5d3ef8783cb30aafda7c), whose Merkle root (5ba1324c…7f1009) verify.py derives from the proof and the public verify-live run checked against mempool.space and blockstream.info (run 40767634912); "One paragraph" says so.
- Revised 29 Oct 05:50 SGT: the second timestamp (RFC 3161, FreeTSA and DigiCert, verified with OpenSSL every day by verify-live) added to "One paragraph", "What is new" and "Key facts"; the verifier's review is seven passes.
- Languages planned for the kit: English (master), Persian, German, Spanish, French, Chinese (Simplified) — translations are made from this master after approval, and labelled as translations of it.
- Outreach waves: lists of recipients and the cover text in your name are shown to you before anything is sent.
