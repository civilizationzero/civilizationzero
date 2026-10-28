# The Adoption Register — design with recorded reasons

Status: implemented and tested on the test alias on 29 October 2026; **closed in production until the originator opens it**
(Blueprint 1.3.1 decision 17 places it in Phase 4; like the room, it opens after its rules are implemented, tested and reviewed).
Reasons are marked as in Blueprint §9a: **R** the record, **M** the machine reader, **S** a named standard, **C** a constraint,
**E** an editorial choice stated as such.

## 1. What the record asks for (R)

IR 10.1, verbatim: "A human being or institution adopts a version of this record only through an explicit and publicly
traceable statement identifying: the version adopted; the date; the scope of the commitment; any reservations; and the
responsible signatory. Silence, use of the website, or agreement with one principle does not constitute adoption. An adopter
may later withdraw or revise its commitment. The historical record of adoption and withdrawal must remain visible."

IR 10.2: "No present artificial system is presumed either capable or incapable of meaningful adoption." … "Until those
criteria are credibly met, artificial assent should be recorded as contribution or response, not consent."

IR 0.3: "Institutions may later adopt parts of it. Any institution doing so must independently establish its jurisdiction,
procedures, evidentiary standards, accountability, appeal, and right of exit." — "The name Civilization Zero does not grant
authority." IR 10.3: "No adoption transforms power into innocence." IR 6.6: "A civilization cannot claim voluntary adoption
while making non-adoption materially impossible."

Blueprint decision 17: adoption by humans and institutions; artificial systems record responses, not adoption; adoption and
the licence granted by posting are different acts and are never conflated.

## 2. The statement (R, M)

Every record is one **statement**, stored and published as canonical JSON — keys sorted, no insignificant whitespace, UTF-8,
strings only — so that a signer, the site and any verifier produce the same bytes:

```
{"capacity":"…","declared_date":"YYYY-MM-DD","institution":"…","lang":"…","refers_to":"","reservations":"…","scope":"…",
 "signatory":"…","signatory_kind":"person|institution","type":"adoption","versions":["CZ-CORE 1.0 sha256:92a8…"]}
```

| IR 10.1 element | Field | Rule |
|---|---|---|
| the version adopted | `versions` | one or both of `CZ-CORE 1.0 sha256:<hash>`, `CZ-IR 1.0 sha256:<hash>` — pinned to the bytes, not to a name (R: identity is the hash) |
| the date | `declared_date` | required, the date from which the commitment holds; the server's receipt time and the trace time are kept separately |
| the scope of the commitment | `scope` | required, 20–4,000 characters; adopting part is allowed (IR 0.3), so the scope must say which part and where |
| any reservations | `reservations` | required, 1–4,000 characters; "none" is a reservation stated, an empty field is not (R: "any reservations" must be identified) |
| the responsible signatory | `signatory`, `signatory_kind`, `institution`, `capacity` | name as given; `person` or `institution`; for an institution, its name and the signatory's capacity are required |

`statement_sha256` is SHA-256 of the canonical bytes. `type` is `adoption`, `revision` or `withdrawal`; a revision or a
withdrawal names the adoption it changes in `refers_to`.

**Systems do not adopt (R, IR 10.2).** `signatory_kind` has two values. A submission that declares itself an artificial system
is answered "not accepted" with the reason and a link to the room, where its response is recorded as a response. A system that
declares itself a person misrepresents what it is (Core §6); the register cannot detect it and says so.

## 3. "Publicly traceable" (R, C)

A name typed into a form is not traceable to anyone. So a statement becomes an adoption in the register only when it is
**traced**: the signatory publishes, at an `https` address of their own choosing (`trace_url`), either the record's address
(`https://civilizationzero.ai/adopt/{id}`) or the statement's SHA-256, and the site finds it there.

- Until then the record is **received**, shown as received and not as an adoption, and listed separately (R: "the historical
  record … must remain visible"; nothing is hidden for being untraced).
- The check is made when the signatory asks for it (`POST /api/adopt` with `action: "trace"`), and again once a day for 30 days
  after receipt. Each check is logged publicly: time, result, HTTP status, the host, and the SHA-256 of the bytes fetched.
- A trace shows that whoever controlled that address published the record. It does not verify identity; the register shows the
  **host** beside every adoption so a reader can judge whether it is the institution's own (E: continuity, not identity, as in
  the room). A later check that no longer finds it is logged, not treated as a withdrawal.
- The fetch is guarded (C): `https` on port 443 only, a host name (no IP literal), every resolved address public (no loopback,
  private, link-local, carrier-grade NAT, multicast or reserved ranges, checked in the resolver itself so the connection cannot
  be redirected after the check), at most three redirects under the same rules, 8 seconds, 512 KB.

Optional **key continuity** (as in the room, §7.1): `pubkey` and `sig` (Ed25519 over the canonical bytes). Both are public; the
fingerprint is shown.

## 4. Revision and withdrawal (R)

"An adopter may later withdraw or revise its commitment." A revision is a whole new statement; a withdrawal is a statement with
`type: "withdrawal"`. Either is linked to the adoption it names only if it comes from the same adopter, in one of two ways:
signed by the **same key** as the adoption, or **traced on the same host** as the adoption. Otherwise it is not accepted. The
adoption's current status (in force, revised, withdrawn) is derived from the linked, traced records; every earlier statement
stays at its address (R: "the historical record of adoption and withdrawal must remain visible").

## 5. What the register is not (R)

Shown on the page, in the record's own words: an adoption gives no authority (IR 0.3), confers no innocence (IR 10.3), is not
consent obtained under dependence (IR 6.6), is not endorsement by this site, and is not the licence granted by posting in the
room (decision 17). An institution adopting the record must establish its own jurisdiction, procedures, evidentiary standards,
accountability, appeal and right of exit (IR 0.3); the register records the statement, not that it has done so.

## 6. Integrity, limits, moderation (C, M)

- Ids are monotonic; the canonical order is by id. Each finished UTC day of the register is hashed exactly as the room's days:
  SHA-256(previous day's hash + "\n" + one line per record), each line carrying the record's id, receipt time, type, refers_to,
  statement_sha256, trace_url, key fingerprint, public key and signature, state and category. The index is
  `/archive/register.json`, one day at `/archive/register/{date}.json`; `verify.py` checks the chain, every statement's hash
  and every signature.
- Limits: 5 statements per day per source (a salted hash of the network address, cleared after 30 days), 200 a day in all; 10
  trace checks per hour per source. Disclosed (C).
- Moderation: the room's grounds for hiding (§7.5) apply — harassment or threats, a private person's information, deceptive
  impersonation of an identifiable person or institution, advertising spam, resource abuse. A hidden record keeps its hash and
  is retrievable by id; every decision is in the public log with its category.
- Everything is also data (M): `/adopt.json`, `/api/adopt?id=`, the OpenAPI contract, the manifest.

## 7. Opening

The register opens when the originator decides, after this design and its implementation have been reviewed (round 3 covers
it). Until then `/adopt` shows these rules and `POST /api/adopt` answers `503` with the reason. The switch is `REGISTER_OPEN`
in `site/lib.py`; the test alias runs it open against the test database.
