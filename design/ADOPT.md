# The Adoption Register — design with recorded reasons

Status: implemented and tested on the test alias on 28 October 2026 (UTC); reviewed adversarially the same evening by a separate
agent, which found twelve problems (design/test/FINDINGS-REGISTER.md, G-1 to G-12); revised (v6d) and tested again end to end
against an outside host. **Closed in production until the originator opens it** (Blueprint 1.3.1 decision 17 places it in
Phase 4; like the room, it opens after its rules are implemented, tested and reviewed).
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
 "signatory":"…","signatory_kind":"person|institution","trace_url":"https://…","type":"adoption","versions":["CZ-CORE 1.0 sha256:92a8…"]}
```

The trace address is a field of the statement (from v6d): it is hashed and, when the statement is signed, signed — so a
signed statement cannot be replayed at an address its signer did not choose (G-3). It is kept in its normal form (WHATWG URL:
scheme and host in lower case, no default port, no trailing dot); a signed statement must already give it so. A statement is
recorded once: its SHA-256 is unique in the register (G-3).

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
**traced**: when it is recorded, its sender — and no one else — receives one line, `civilizationzero.ai/adopt/{id}
trace:{token}`, with a random 128-bit token; the signatory publishes it on the page the statement names (`trace_url`), and the
site finds the token in that page.

Why a secret token (G-1): the record's address and the statement's SHA-256 are public, and the submitter knows them in advance,
so a page the signatory does not control could carry them — a site search that prints what it is asked, an archive or a proxy
that copies this site's own pages. The token is shown once, in the answer to the submission, and never on a public page or in
the data; after the trace it is on the signatory's page, which is the point. The rules of the fetch keep the page's content
the page's own: the address has no query (`?…`) or fragment; the token must not appear in any address fetched (as given or
percent-decoded); redirects are followed only on the same origin, so the host shown is the host where the token was found
(G-2).

- Until then the record is **received**, shown as received and not as an adoption, and listed separately (R: "the historical
  record … must remain visible"; nothing is hidden for being untraced).
- The check is made when anyone asks for it (`POST /api/adopt` with `action: "trace"`), and by the daily job, for 30 days after
  receipt — at most once in 10 minutes for a record (G-7); after 30 days an untraced statement can no longer be traced and stays
  at its address as received. Each check is logged publicly: time, result, HTTP status, the address fetched, and the SHA-256 of
  the bytes fetched.
- A trace shows that the line appeared on that page. It does not verify identity; the register shows the **page's full
  address** beside every adoption so a reader can judge whose page it is (E: continuity, not identity, as in the room). If
  others can publish on that page — comments, issues, a wiki — they can trace statements there too, and revise or withdraw an
  unsigned adoption there (second review, G2-1): the form, the rules, the answer and every unsigned record say so, and point to
  signing. A traced record is not checked again; a line later removed is not a withdrawal (a withdrawal is a statement).
- The fetch is guarded (C): `https` on port 443 only, a host name (no IP literal), every resolved address public — the
  special-purpose ranges of the IANA registries refused exactly, and every IPv6 range that embeds or translates an IPv4 address
  refused whole (G-10) — checked in the resolver itself so the connection cannot be redirected after the check; an agent of its
  own, so no proxy from the environment can resolve the name instead (G-9); at most three redirects on the same origin;
  8 seconds and 512 KB for the whole check (G-6).

Optional **key continuity** (as in the room, §7.1): `pubkey` and `sig` (Ed25519 over the canonical bytes). Both are public; the
fingerprint is shown.

## 4. Revision and withdrawal (R)

"An adopter may later withdraw or revise its commitment." A revision is a whole new statement; a withdrawal is a statement with
`type: "withdrawal"`. Either is linked to the adoption it names only if the adoption is traced and the new statement comes from the same adopter:
if the adoption was signed, signed by the **same key**; if it was not, traced at **the same page** (the identical normalised
address — a shared host such as a code-hosting site is not one adopter, G-3). Otherwise it is not accepted. The adoption's
current status (in force, revised, withdrawn) is derived from the linked, traced records, the one received last governing;
every earlier statement stays at its address (R: "the historical record of adoption and withdrawal must remain visible"). A
replayed statement is refused (a statement is recorded once), and a signed one cannot be moved to another address.

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
  and every signature, and that each revision or withdrawal names an earlier, traced adoption and comes from its key (if it
  was signed) or its page (if not) — the rule of §4, checked on the hashed lines. The public `daily-archive` job copies each
  hashed day to the repository (`archive/register/{date}.json`, `.log` = the exact hashed bytes, `.log.ots` = the
  OpenTimestamps proof of the day's hash), as it does the room's; `ots-upgrade` upgrades those proofs and `verify-live` checks
  the copies.
- Limits: 5 statements per day per source (a salted hash of the network address, cleared after 30 days), 200 a day in all; 10
  trace checks per hour per source; one check of a record in 10 minutes (a check refused for that reason costs nothing); the
  daily job re-checks up to 50 received statements, those that waited longest since their last check (or their receipt)
  first, each claimed as it is checked, five at a time, after the day's hashes are computed (the hashes come first).
  Disclosed (C). The numbers are in the database's config, as the room's are, and the numbers in force are shown on `/adopt`
  and in `/adopt.json`.
- Writes come from this site's pages or from programs: a `POST` whose `Origin` is another site is refused, and its answers carry
  no CORS headers, so another site's page cannot read a submitter's token or post in its visitors' names (G2-5). Reads stay
  open to every origin.
- Paging: `/adopt.json` reads the whole register in pages and says `complete` (and where to continue when it is not); a record's
  page shows the newest 100 log rows and links to the whole log, page by page (G-7).
- Moderation: the room's grounds for hiding (§7.5) apply — harassment or threats, a private person's information, deceptive
  impersonation of an identifiable person or institution, advertising spam, resource abuse. A hidden record keeps its hash and
  is retrievable by id; every decision is in the public log with its category.
- Everything is also data (M): `/adopt.json`, `/api/adopt?id=`, the OpenAPI contract, the manifest.

## 7. Opening, and closing

The register opens when the originator decides, after this design and its implementation have been reviewed (round 3 covers
it). Until then `/adopt` shows these rules and `POST /api/adopt` answers `503` with the reason. The switches are
`REGISTER_OPEN` and `REGISTER_OPENED` (the UTC date it first opened) in `site/lib.py`; the test alias runs it open against the
test database. When it opens, the verifier pins the register's first day, as it pins the room's.

Once opened, closing it stops new statements and trace checks only: its records, its data and its daily chain stay served and
hashed (G-8; IR 10.1: "The historical record of adoption and withdrawal must remain visible").
