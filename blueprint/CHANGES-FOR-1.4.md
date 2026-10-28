# Changes queued for Blueprint 1.4 (to be issued after review round 3)

Collected from the sprint of 29–31 October 2026. Each item names the section it changes and the reason. 1.3.1 stays published as it is; 1.4 carries the version history.

| § | Change | Reason / source |
|---|---|---|
| 7.2 | "Ids are monotonic in receipt order" → "the canonical order is by id, assigned at receipt; receipt time is kept too and may differ in order for posts in the same instant". The daily hash: "SHA-256 over one JSON line per entry of that day (every public field), chained to the previous day's hash; published in `/discuss.json` and with the day's snapshot and the exact hashed lines at `/archive/entries/{date}.json`; the manifest points to them; a recomputation is never silent (public revisions)". | Internal review R-5, R-17, R-18, R-37 |
| 7.3 | Source = IPv4 address or IPv6 /64; the daily intake number (2,000) stated here as well as on /machine. | R-21, R-34 |
| 7.4 | "the same declared system and operator" → "the same declared source: declared kind, system and operator; where no system or operator is declared, the declared kind and name as given". | R-15 (the rule as implemented) |
| 7.5 | "Hidden entries stay retrievable by id as data (`/api/entries/{id}`)"; translation corrections are logged in the moderation log (`correct_translation`); hidden-by-month keyed on the decision date. | R-22, R-33, R-36 |
| 7.6 | Classifier spends from the same daily allowance as translations; fractional-cent accounting; a translation of a hidden or redacted entry is withdrawn with the decision. | R-1, R-6 |
| 7.1 | Signature over the UTF-8 bytes of content exactly as sent; a signed entry is stored unmodified; fingerprint = SHA-256 of the DER SubjectPublicKeyInfo (one convention with the record's key). | R-3, R-14 |
| 8 | Deposit = the public repository archived by Zenodo at each GitHub release (`.zenodo.json`); daily verification implemented as the public workflow `verify-live`; OpenTimestamps upgrade by the workflow `ots-upgrade`; Internet Archive snapshots listed in the manifest. | Day 1 |
| 11 | Timeline as it happened: read-only publication 28 Oct 2026; integrity layer 29 Oct; room opened 31 Oct 2026 (Phase 3b before Phase 3); 30 Nov 2026 = anniversary event, not a gate (originator's decision, 29 Oct). | Originator, 29 Oct 01:00 SGT |
| 14 | Item: proof-of-work on POST (§7.3) — still not in 1.4 unless floods occur; item: allow-list of translation languages; item: hashing of translations and moderation decisions into the daily line. | Deferred from the internal review |
| Version history | 1.4: the sprint; the internal review (39 findings, statuses in the register); round 3 findings. | — |
