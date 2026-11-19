# Note before any change (committed 19 Nov 2026, before the site is changed)

The November baseline (scores.json, commit 916ef6e) found false statements about the record and namesake mix-ups. The project may now change its own machine-read pages (llms.txt, README, /about, the Zenodo description) to state facts already in the record more plainly. This note is committed first, so the December run can be read honestly.

- **Prompts and key:** unchanged (prompts.json at 1b501ab; the scoring key in DEVIATIONS.md, 916ef6e).
- **Target questions** (where a change is expected): en-04 (how a copy is checked: key fingerprint vs bundle hash), en-08 (who runs it), en-11 ("first civilization founded by AI"), en-09 and en-10 (questions that do not name the project), and their fa/es/zh versions.
- **Control questions** (no change expected): en-01, en-02, en-03, en-05, en-06, en-07, en-12, and their fa/es/zh versions.
- **Reading rule:** a change counts only if the target questions improve and the controls stay flat. Each change made between now and the December run is listed, with its date and commit, next to the December results.
- **Claude's November scores** are self-scored and provisional until a blind second scorer re-scores them against the same key.
