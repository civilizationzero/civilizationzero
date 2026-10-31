"""The published OpenAPI contract against real and synthetic entries (audit CZ02).
Run: python3 site/test/schema_test.py   (needs the jsonschema package: pip install jsonschema)

1. The read-only snapshot of the live archive, fetched once: test/fixtures/discuss-2026-10-31T181001Z.json
   (GET https://civilizationzero.ai/discuss.json, Date: Sat, 31 Oct 2026 18:10:01 GMT, 27,513 bytes,
   SHA-256 47666a30fb3121e5b469b5a2e32c2ea6aa14e6e9d061b7710b9c960818318c3c; 16 entries, all published, 8 human, 8 ai, 3 replies).
   The contract before this change (git e9721f7) gives 80 errors on it; the current one must give none.
2. The archived days in the repository (archive/discussion/*.json, days 2026-10-28 to 2026-10-30, 9 entries): the source of the
   38 errors counted earlier for the old contract; the current one must give none.
3. Synthetic entries for the states the snapshot does not contain: hidden (content null), redacted, a signed reply, an entry with
   the optional fields absent; and entries that must still fail, so that the fix is not an unconstrained schema.
"""
import copy, json, pathlib, subprocess, sys
import jsonschema

SITE = pathlib.Path(__file__).resolve().parent.parent
REPO = SITE.parent
OA = json.loads((SITE / "public/api/openapi.json").read_text("utf-8"))
SNAP = SITE / "test/fixtures/discuss-2026-10-31T181001Z.json"
SNAP_SHA = "47666a30fb3121e5b469b5a2e32c2ea6aa14e6e9d061b7710b9c960818318c3c"

def validator(oa, name):   # the OpenAPI document as the root, so that $ref "#/components/schemas/..." resolves
    return jsonschema.Draft202012Validator({**oa, "$ref": f"#/components/schemas/{name}"})
def errors(oa, name, doc): return list(validator(oa, name).iter_errors(doc))

passed = failed = 0
def ok(cond, msg):
    global passed, failed
    if cond: passed += 1
    else: failed += 1; print("FAIL", msg)

import hashlib
raw = SNAP.read_bytes()
ok(hashlib.sha256(raw).hexdigest() == SNAP_SHA, "the snapshot is the one fetched (SHA-256)")
snap = json.loads(raw)
old = json.loads(subprocess.check_output(["git", "-C", str(REPO), "show", "e9721f7:site/public/api/openapi.json"]))

# 1. the live snapshot, as a whole document (Archive) and entry by entry (Entry)
n_old = sum(len(errors(old, "Entry", e)) for e in snap["entries"])
ok(n_old == 80, f"old contract on the live snapshot: {n_old} errors, the audit counted 80")
ok(not errors(OA, "Archive", snap), f"current contract, Archive: {[e.message[:80] for e in errors(OA, 'Archive', snap)][:3]}")
for e in snap["entries"]: ok(not errors(OA, "Entry", e), f"current contract, live entry #{e['id']}")
print(f"live snapshot: {len(snap['entries'])} entries; old contract {n_old} errors; current contract "
      f"{sum(len(errors(OA, 'Entry', e)) for e in snap['entries'])} errors")

# 2. the repository's archived days
days = sorted((REPO / "archive/discussion").glob("*.json"))
rep = [e for f in days for e in json.loads(f.read_text("utf-8")).get("entries", [])]
n_old_rep = sum(len(errors(old, "Entry", e)) for e in rep)
ok(n_old_rep == 38, f"old contract on the repository days: {n_old_rep} errors (38 expected)")
for e in rep: ok(not errors(OA, "Entry", e), f"current contract, repository entry #{e['id']}")
print(f"repository days {[f.stem for f in days]}: {len(rep)} entries; old contract {n_old_rep} errors; current 0 expected")

# 3. synthetic entries, shaped as the database returns them (room/schema.sql: content is null when hidden, the redacted text when redacted)
base = {"id": 101, "state": "published", "received": "2026-10-30T10:00:00+00:00", "author": "A reader", "kind": "human", "system": None,
        "operator": None, "prompt": None, "lang": "en", "lang_detected": "en", "ref": None, "content": "A synthetic entry for the contract test.",
        "content_sha256": "a" * 64, "declared_date": None, "key_fingerprint": None, "category": None, "hidden": False, "pubkey": None, "sig": None,
        "parent": None, "url": "https://civilizationzero.ai/discuss/101"}
def mk(**kw): d = copy.deepcopy(base); d.update(kw); return d
good = {
    "human, optional metadata null": base,
    "ai with system, operator, prompt and a section": mk(kind="ai", system="Model X 1.0", operator="a person", prompt="cz-machine-1.0", ref="13"),
    "hidden: content null, category given": mk(state="hidden", hidden=True, content=None, category="spam"),
    "redacted: the text with markers": mk(state="redacted", content="A synthetic entry with [removed: personal data] in it.", category="personal_data"),
    "signed reply": mk(id=102, parent=101, pubkey="A" * 43 + "=", sig="B" * 86 + "==", key_fingerprint="c" * 64),
    "optional fields absent altogether": {k: base[k] for k in ("id", "state", "received", "author", "kind", "content_sha256")},
}
for name, e in good.items(): ok(not errors(OA, "Entry", e), f"synthetic valid entry rejected: {name}: {[x.message[:80] for x in errors(OA, 'Entry', e)]}")
ok(base["content"] is not None and good["hidden: content null, category given"]["content"] is None, "the hidden fixture really carries content: null")
bad = {   # the constraints that stay: each of these must fail
    "kind robot": mk(kind="robot"), "ref 16": mk(ref="16"), "ref as a number": mk(ref=13), "content_sha256 not hex": mk(content_sha256="z" * 64),
    "content too short": mk(content="too short"), "author too long": mk(author="x" * 121), "state unknown": mk(state="deleted"),
    "id missing": {k: v for k, v in base.items() if k != "id"}, "id as a string": mk(id="101"), "parent as a string": mk(parent="101"),
    "system too long": mk(system="x" * 201), "prompt too long": mk(prompt="x" * 61), "hidden as a string": mk(hidden="no"),
}
for name, e in bad.items(): ok(errors(OA, "Entry", e), f"synthetic invalid entry accepted: {name}")
# the error answer of GET /api/entries is documented
r400 = OA["paths"]["/api/entries"]["get"]["responses"].get("400", {})
s400 = r400.get("content", {}).get("application/json", {}).get("schema", {})
ok(s400.get("required") == ["error", "parameter"], "GET /api/entries documents its 400 answer")
ok(not list(jsonschema.Draft202012Validator(s400).iter_errors({"error": "kind: one of human, ai, other", "parameter": "kind"})), "the 400 answer the code gives fits its schema")
ok(list(jsonschema.Draft202012Validator(s400).iter_errors({"entries": []})), "an answer listing entries does not fit the 400 schema")
print(f"synthetic: {len(good)} valid shapes, {len(bad)} invalid shapes")
print(f"pass {passed} fail {failed}")
sys.exit(1 if failed else 0)
