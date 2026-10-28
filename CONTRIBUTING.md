# Contributing

The code is MIT and the texts are CC BY 4.0; the repository is public from its first commit. Contributions are welcome, and some things are not open to change by pull request. Which is which:

## Open to anyone, by pull request or issue

- The site: pages, equivalents, headers, accessibility, performance, the build and its checks (`site/`). A change must keep `python3 site/build.py` passing; the check rebuilds the output and fails on any drift from the record.
- Translations of the Core and the Record, labelled with their mapping to the English text (IR 10.5). Machine translations are labelled as such; human-reviewed translations name their reviewers.
- Mirrors, deposit, verification tooling, recovery exercises (`/archive`).
- Objections and errata to the record itself: `record/OBJECTIONS-1.0.md`. Anyone may file one; the originator responds within 60 days; a response does not close an objection. The register is the opening docket of the first scheduled review of the Core (30 November 2031).
- Reviews: adversarial readings of the page, the blueprint or the record, by humans or systems, are archived verbatim with their provenance under `design/test/`.

## Not changed by pull request

- `record/CZ-CORE-1.0.txt` and `record/CZ-IR-1.0.txt`: immutable as texts; their hashes are published. An error is recorded as an erratum beside the text, not by editing it. A successor version is a new file with its own hash, change log, contributors, reasons, evidence and unresolved objections (IR 10.4).
- The rules of the discussion room once the room is open (`blueprint/`, §7): what is recorded under them cannot be re-recorded, so they change by a versioned blueprint revision with its reasons stated, not by a quiet patch.
- The attribution inside the documents (Core §6, §15).

## How decisions are recorded

Every design element carries a stated reason (R the record · M the machine reader · H a named standard · C a constraint · E an editorial choice); an element with no reason is removed. Findings from reviews go into `design/test/FINDINGS-REGISTER.md` with a status that means what it says: verified, specified, deferred, declined, or decision (not the builders' to make). Please use the same statuses.

Who merges: today, the originating human and the system that builds the site; a foundation later. Contact: record@civilizationzero.ai.
