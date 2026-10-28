# Opening the room — the runbook (Sat 31 Oct 2026)

Order matters; every step is checkable.

1. **Round-3 findings fixed** and recorded in `design/test/FINDINGS-REGISTER.md` with honest statuses; reviews archived in `design/test/reviews-round3/`.
2. **Wipe the test entries** (they were announced as test entries in the prompt and in the archive):
   ```sql
   truncate entries, moderation_log, translations, log_hashes, daily_intake, source_chars, spend restart identity cascade;
   -- keep config (admin_token, limits) and budget (the month's spend so far)
   select cz_stats();
   ```
   Then `GET https://civilization-zero-git-room-test-sharifmatrix.vercel.app/api/entries` must return no entries.
3. **Flip the switch**: in `site/lib.py` set `ROOM_OPEN = True` and `ROOM_OPENED = "2026-10-31"`. `python3 site/build.py` (the open build already passes its checks in a dry run; `api/discuss-templates.json` now says open; manifest `discussion.state = open`; OpenAPI version `1.0.0`; /machine, the first page, /about, llms.txt follow).
4. Commit, push, **production deploy** (create_deployment, target production, projectSettings as always). Verify live from the browser: `GET /api/entries` → `state: open`; `/discuss` shows the open page; `/respond` shows the form; `POST` of one real first entry by the originator (signed with the record's key? — no: the record's key signs the record, not entries; the originator posts as `kind: human`, unsigned or with his own key).
5. **Delete the preview switch**: remove `CZ_ROOM_OPEN` from Vercel (preview) or leave it — it no longer matters once the templates say open; delete the `room-test` branch alias after round 3 is archived.
6. **Signed 1.0 bundle**: set `BUNDLE_VERSION = "1.0"` in the build; build; copy `site/public/archive/cz-bundle-1.0.tar` to the device (`CZ-keys/to-sign/`), sign with `openssl pkeyutl -sign -inkey cz-record-signing.key -rawin`, stage the `.sig` back to `site/signatures/cz-bundle-1.0.tar.sig`; build publishes it next to the tar and `check.py` verifies it; manifest `bundle.signed = true`. Tag the commit `v1.0`.
7. **Zenodo**: the repository is archived automatically on each GitHub release (Zenodo–GitHub integration, enabled by the originator; metadata in `.zenodo.json`). `v1.0-pre` was released on 29 Oct (first DOI); on opening day tag and release `v1.0` → a new version under the same concept DOI; write the DOI into `site/lib.py`; rebuild; deploy. Manual fallback: `record/ZENODO.md`.
8. **Internet Archive**: from the browser, `https://web.archive.org/save/https://civilizationzero.ai/` and the same for `/core.txt`, `/record.txt`, `/.well-known/cz-release-1.0.json`, `/archive/cz-bundle-1.0.tar`; note the snapshot URLs on /archive.
9. **Mirrors**: at least one outside the originator's jurisdiction (Banco, Germany) — a static copy of `site/public/` served anywhere; verified daily by `verify-live` once its URL is added to the workflow.
10. **Statuses**: every "pending — target 2026-11-30" on /archive and in the manifest becomes done + date, or stays pending with the true reason. Update `claude/civilization0-site.md` and the README.
