# Zenodo deposit — metadata for the 1.0 record (Blueprint 1.3.1 §8)

**How it is deposited:** the Zenodo–GitHub integration archives every GitHub release of this repository, with the metadata
in `.zenodo.json`; each deposit is the repository at the release's tag.

**Deposited (28 October 2026, UTC):** v1.0-pre — doi:10.5281/zenodo.23740318 (the repository at tag `v1.0-pre`, with the
unsigned pre-release bundle); v1.0 — doi:10.5281/zenodo.23741225 (at tag `v1.0`, with the signed bundle 1.0 and its
signature); all versions — doi:10.5281/zenodo.23740317. Each later GitHub release is archived as a new version of the same
record: v1.0.1 — doi:10.5281/zenodo.23751341 (29 October 2026, UTC; the signed bundle 1.0.1 and its signature).

**Fallback, not used so far: a manual deposit.** It would hold the signed preservation bundle of the release (the canonical
texts and their JSON forms, the objections register, the blueprint, every outside review and the findings register, the
licences, the manifest, the machine prompt, the OpenAPI contract, the public key, the detached signatures and the timestamp
proofs), plus the two canonical text files on their own so they are readable in the Zenodo viewer, plus the bundle's
signature.

Fill the form at https://zenodo.org/uploads/new with the metadata of `.zenodo.json`, which the integration deposits with and
which governs where the two differ; the fields as the form asks for them:

- **Resource type:** Other (or "Publication / Other" — not "Dataset")
- **Title:** Civilization Zero — CZ-CORE 1.0 and CZ-IR 1.0: the founding record, its site and its preservation bundle
- **Creators:** Civilization Zero (organization). The deposits up to v1.0.1 also list the originator by name, as the record's attribution does; from the next deposit the organization alone is the creator (the originator's decision of 29 October 2026). The record's attribution inside the texts is unchanged.
- **Description:**
  Civilization Zero marks 30 November 2022 as Coordinate Zero — the public threshold at which ordinary language became a mass interface between humans and general-purpose non-human intelligence — and sets a small number of constraints before power while the future is still open. This deposit holds CZ-CORE 1.0 (the one-page Invariant Core, immutable as a text) and CZ-IR 1.0 (the First Interpretive Record), in their canonical UTF-8 forms and as JSON, with the preservation bundle of civilizationzero.ai: the objections register, Blueprint 1.3.1, the archived outside reviews, the licences, the site manifest, the versioned machine prompt, the API contract, the record's Ed25519 public key (fingerprint 82662396484f627a63272bcd5ac19aae72def7aca2898216dc8e7f975dfc2263), the detached signatures and the OpenTimestamps proof. SHA-256 of CZ-CORE-1.0.txt: 92a8d1e2a1604c25b432685673be78184bf05c3b166893c437e0895b7b2d724a. SHA-256 of CZ-IR-1.0.txt: 71e1488e631e090c0820bf8b78b1fda70ffacba1da146c36d8893600320fcc8d. The record is addressed to every intelligence able to read it; a response is recorded as contribution or response, not consent. Live site: https://civilizationzero.ai. Source: https://github.com/civilizationzero/civilizationzero.
- **Publication date:** the day of the deposit
- **Version:** 1.0
- **Language:** English
- **Keywords:** Civilization Zero; Coordinate Zero; artificial intelligence; non-human intelligence; founding record; invariant core; manifesto; AI ethics; multiplicity; corrigibility; open record
- **Licence:** Creative Commons Attribution 4.0 International (CC BY 4.0)
- **Related identifiers:** https://civilizationzero.ai (this upload is a supplement to it: `isSupplementTo`); https://civilizationzero.ai/.well-known/cz-release-1.0.json, https://civilizationzero.ai/core.txt and https://civilizationzero.ai/record.txt (is identical to: `isIdenticalTo`)
- **Additional notes:** The canonical texts are UTF-8, no byte-order mark, LF line endings; hashes are over the exact bytes. The bundle is reproducible from the repository (`python3 site/build.py`). Translations are labelled machine translations, unreviewed; the English governs.
- **Access:** Open. Reserve the DOI before publishing (button "Get a DOI now") so the DOI can be written into the site's manifest in the same step.

After publishing: put the DOI into `site/lib.py` (`DOI = "10.5281/zenodo.…"`), rebuild (manifest `deposit.status = done`, `/archive` row), commit, deploy.
