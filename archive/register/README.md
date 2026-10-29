# The Adoption Register's daily chain — copies

Once the Adoption Register has opened, the public job `daily-archive` (`.github/workflows/daily-archive.yml`, 01:20 and
07:20 UTC) copies into this folder each day the site has hashed, after checking the whole chain with the published verifier:

- `{date}.json` — the day's snapshot, as https://civilizationzero.ai/archive/register/{date}.json served it;
- `{date}.log` — the exact bytes that were hashed: the previous day's hash, a line break, one line per record;
- `{date}.log.ots` — the OpenTimestamps proof of the day's hash; `ots-upgrade` adds its Bitcoin attestation once the
  calendars have one.

Check them with the verifier: `python3 site/verify/verify.py --days archive/register`. The job never edits a day it has
already committed. The discussion room's chain is copied the same way into `archive/discussion/`.

The register opened on 29 October 2026 (UTC). Its first day is hashed in the first hour of the next day (UTC) and copied here by the job's next run; until then this folder holds no day.
