#!/usr/bin/env python3
"""cz-verify — check the record of Civilization Zero without trusting the site that serves it.

Python 3.8 or later, standard library only. Nothing is fetched unless you pass --site with an https address.

  python3 verify.py cz-bundle-1.0.1.tar             a preservation bundle (its .sig beside it is checked too)
  python3 verify.py path/to/extracted-bundle/        the same, unpacked
  python3 verify.py --site-dir path/to/site/public   a static copy of the site (a mirror's files)
  python3 verify.py --days archive/discussion        daily snapshots of the discussion: the chained hashes,
  python3 verify.py --days 2026-10-28.json ...         every entry's content hash and signature, the timestamp proofs
  python3 verify.py --site https://civilizationzero.ai   the live site or a mirror, over the network (record and days)
  python3 verify.py --self-test                      the Ed25519 test vectors of RFC 8032

Options: --fingerprint HEX (another trust anchor), --json (a machine-readable report), --quiet (failures and summary only).
Exit status: 0 when nothing failed, 1 when something failed, 2 on a usage error.

What it checks, in its own words when it runs: the record's public key against the trust anchor below; the Ed25519
signatures of the release manifest, of the canonical texts and of the bundle; every hash the release manifest states; that
each translation maps to the Core by hash; that the OpenTimestamps proof commits to the release manifest, and the path of
each timestamp up to its Bitcoin block (the one fact it cannot hold offline is the block header: it prints the Merkle root
to compare with any copy of the Bitcoin chain); for the discussion, that each day's hash is SHA-256(previous day's hash +
"\\n" + the day's lines), that the days chain, that each entry's content matches its hash and that each signed entry's
signature verifies over its content, with the key fingerprint the site published.

The trust anchor is the fingerprint below. A copy of this file can be altered together with the bundle it came with:
compare the fingerprint with one you obtained elsewhere — the DOI deposit (doi:10.5281/zenodo.23740317), the repository
(github.com/civilizationzero/civilizationzero), a printed copy, or the second key-holder.

Licence: MIT. Part of the record of Civilization Zero (https://civilizationzero.ai/archive)."""

import base64, datetime, hashlib, io, json, os, re, sys, tarfile

VERSION = "1.0"
ANCHOR_FINGERPRINT = "82662396484f627a63272bcd5ac19aae72def7aca2898216dc8e7f975dfc2263"
SPKI_PREFIX = bytes.fromhex("302a300506032b6570032100")   # DER SubjectPublicKeyInfo header of an Ed25519 key

# ================================================================ Ed25519 verification (RFC 8032, section 5.1)
# Cofactorless, compared as encodings — the check OpenSSL makes, which is the check the site makes when it accepts an entry.
_P = 2 ** 255 - 19
_L = 2 ** 252 + 27742317777372353535851937790883648493
_D = -121665 * pow(121666, _P - 2, _P) % _P
_SQRT_M1 = pow(2, (_P - 1) // 4, _P)

def _add(p, q):
    x1, y1, z1, t1 = p; x2, y2, z2, t2 = q
    a = (y1 - x1) * (y2 - x2) % _P; b = (y1 + x1) * (y2 + x2) % _P
    c = 2 * t1 * t2 * _D % _P; d = 2 * z1 * z2 % _P
    e, f, g, h = b - a, d - c, d + c, b + a
    return (e * f % _P, g * h % _P, f * g % _P, e * h % _P)

def _mul(s, p):
    q = (0, 1, 1, 0)
    while s:
        if s & 1: q = _add(q, p)
        p = _add(p, p); s >>= 1
    return q

def _encode(p):
    x, y, z, _ = p
    zi = pow(z, _P - 2, _P); x = x * zi % _P; y = y * zi % _P
    return (y | ((x & 1) << 255)).to_bytes(32, "little")

def _x_from_y(y, sign):
    if y >= _P: return None
    x2 = (y * y - 1) * pow(_D * y * y + 1, _P - 2, _P) % _P
    if x2 == 0: return None if sign else 0
    x = pow(x2, (_P + 3) // 8, _P)
    if (x * x - x2) % _P: x = x * _SQRT_M1 % _P
    if (x * x - x2) % _P: return None
    if (x & 1) != sign: x = _P - x
    return x

def _decode(b):
    if len(b) != 32: return None
    n = int.from_bytes(b, "little"); sign = n >> 255; y = n & ((1 << 255) - 1)
    x = _x_from_y(y, sign)
    return None if x is None else (x, y, 1, x * y % _P)

_GY = 4 * pow(5, _P - 2, _P) % _P
_G = (_x_from_y(_GY, 0), _GY, 1, _x_from_y(_GY, 0) * _GY % _P)

def ed25519_verify(pub, msg, sig):
    """True when sig (64 bytes) is a valid Ed25519 signature of msg under the raw 32-byte public key pub."""
    if len(pub) != 32 or len(sig) != 64: return False
    a = _decode(pub)
    if a is None: return False
    s = int.from_bytes(sig[32:], "little")
    if s >= _L: return False
    h = int.from_bytes(hashlib.sha512(sig[:32] + pub + msg).digest(), "little") % _L
    minus_a = ((_P - a[0]) % _P, a[1], a[2], (_P - a[3]) % _P)
    return _encode(_add(_mul(s, _G), _mul(h, minus_a))) == sig[:32]

RFC8032 = [  # (public key, message, signature) — RFC 8032 section 7.1, tests 1-3
    ("d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a", "",
     "e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b"),
    ("3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c", "72",
     "92a009a9f0d4cab8720e820b5f642540a2b27b5416503f8fb3762223ebdb69da085ac1e43e15996e458f3613d0f11d8c387b2eaeb4302aeeb00d291612bb0c00"),
    ("fc51cd8e6218a1a38da47ed00230f0580816ed13ba3303ac5deb911548908025", "af82",
     "6291d657deec24024827e69c3abe01a30ce548a284743a445e3680d7db5ac3ac18ff9b538d16f290ae67f760984dc6594a7c15e9716ed28dc027beceea1ec40a"),
]

# ================================================================ keys
def pem_to_der(pem):
    body = re.sub(rb"-----[^-]+-----", b"", pem)
    return base64.b64decode(b"".join(body.split()))

def raw_from_spki(der):
    return der[len(SPKI_PREFIX):] if len(der) == 44 and der.startswith(SPKI_PREFIX) else None

def fingerprint_of_raw(raw):
    return hashlib.sha256(SPKI_PREFIX + raw).hexdigest()

def sha256(b):
    return hashlib.sha256(b).hexdigest()

# ================================================================ OpenTimestamps proofs (the .ots format of opentimestamps-client)
OTS_MAGIC = b"\x00OpenTimestamps\x00\x00Proof\x00\xbf\x89\xe2\xe8\x84\xe8\x92\x94"
ATT_BITCOIN, ATT_PENDING, ATT_LITECOIN = bytes.fromhex("0588960d73d71901"), bytes.fromhex("83dfe30d2ef90c8e"), bytes.fromhex("06869a0d73d71b45")

class _Reader:
    def __init__(self, b): self.b, self.i = b, 0
    def byte(self):
        if self.i >= len(self.b): raise ValueError("truncated proof")
        self.i += 1; return self.b[self.i - 1]
    def take(self, n):
        if self.i + n > len(self.b): raise ValueError("truncated proof")
        self.i += n; return self.b[self.i - n:self.i]
    def varuint(self):
        v = sh = 0
        while True:
            c = self.byte(); v |= (c & 0x7f) << sh; sh += 7
            if not c & 0x80: return v
            if sh > 63: raise ValueError("varuint too long")
    def varbytes(self, limit=8192):
        n = self.varuint()
        if n > limit: raise ValueError("field too long")
        return self.take(n)

def _ots_op(tag, r, msg):
    """One operation of the proof. Returns the new message, or None when it cannot be computed here (keccak256, or a
    RIPEMD-160 this Python lacks): the branch is still read to its end, and attestations below it are reported as not followed."""
    if tag in (0xf0, 0xf1):
        arg = r.varbytes(4096)
        if msg is None: return None
        return msg + arg if tag == 0xf0 else arg + msg
    if tag not in (0x08, 0x02, 0x03, 0x67, 0xf2, 0xf3): raise ValueError("unknown operation 0x%02x" % tag)
    if msg is None or tag == 0x67: return None
    if tag == 0x08: return hashlib.sha256(msg).digest()
    if tag == 0x02: return hashlib.sha1(msg).digest()
    if tag == 0x03:
        try: return hashlib.new("ripemd160", msg).digest()
        except ValueError: return None
    if tag == 0xf2: return msg[::-1]
    return msg.hex().encode()

def parse_ots(b):
    """Returns (hash algorithm, committed digest, attestations); each attestation is (kind, detail, message at that point)."""
    r = _Reader(b)
    if r.take(len(OTS_MAGIC)) != OTS_MAGIC: raise ValueError("not an OpenTimestamps proof")
    if r.varuint() != 1: raise ValueError("unknown proof version")
    algo = {0x08: ("sha256", 32), 0x02: ("sha1", 20), 0x03: ("ripemd160", 20), 0x67: ("keccak256", 32)}.get(r.byte())
    if not algo: raise ValueError("unknown file hash")
    digest = r.take(algo[1]); atts = []
    def stamp(msg, depth):
        if depth > 256: raise ValueError("proof too deep")
        def one(tag):
            if tag == 0x00:
                kind = r.take(8); payload = _Reader(r.varbytes())
                if kind == ATT_BITCOIN: atts.append(("bitcoin", payload.varuint(), msg))
                elif kind == ATT_LITECOIN: atts.append(("litecoin", payload.varuint(), msg))
                elif kind == ATT_PENDING: atts.append(("pending", payload.varbytes().decode("utf-8", "replace"), msg))
                else: atts.append(("unknown", kind.hex(), msg))
            else:
                stamp(_ots_op(tag, r, msg), depth + 1)
        tag = r.byte()
        while tag == 0xff:
            one(r.byte()); tag = r.byte()
        one(tag)
    stamp(digest, 0)
    return algo[0], digest, atts

# ================================================================ the report
class Report:
    def __init__(self, quiet=False, as_json=False):
        self.items, self.quiet, self.as_json, self.area = [], quiet, as_json, ""
    def section(self, title):
        self.area = title
        if not self.as_json and not self.quiet: print("\n[" + title + "]")
    def add(self, level, msg):
        self.items.append({"level": level, "area": self.area, "message": msg})
        if not self.as_json and (not self.quiet or level == "FAIL"): print("  %-8s%s" % (level, msg))
    def ok(self, m): self.add("OK", m)
    def fail(self, m): self.add("FAIL", m)
    def note(self, m): self.add("NOTE", m)
    def pending(self, m): self.add("PENDING", m)
    def check(self, cond, ok_msg, fail_msg):
        (self.ok if cond else self.fail)(ok_msg if cond else fail_msg)
        return cond
    def counts(self):
        c = {}
        for i in self.items: c[i["level"]] = c.get(i["level"], 0) + 1
        return c

# ================================================================ sources: a bundle (tar or directory), a site directory, a site over https
class TarSource:
    kind = "bundle"
    def __init__(self, path):
        self.t = tarfile.open(path, "r:*")
        self.names = {(m.name[2:] if m.name.startswith("./") else m.name): m for m in self.t.getmembers() if m.isfile()}
    def get(self, p):
        m = self.names.get(p)
        return self.t.extractfile(m).read() if m else None
    def list(self, prefix): return sorted(n for n in self.names if n.startswith(prefix))

class DirSource:
    def __init__(self, root, kind): self.root, self.kind = root, kind
    def get(self, p):
        f = os.path.join(self.root, *p.split("/"))
        if not os.path.isfile(f):
            if self.kind == "site" and os.path.isfile(f + ".html"): f += ".html"
            else: return None
        with open(f, "rb") as fh: return fh.read()
    def list(self, prefix):
        out = []
        for dp, _, fs in os.walk(self.root):
            for f in fs:
                rel = os.path.relpath(os.path.join(dp, f), self.root).replace(os.sep, "/")
                if rel.startswith(prefix): out.append(rel)
        return sorted(out)

class HttpSource:
    kind = "site"
    def __init__(self, base):
        if not base.startswith("https://"): raise SystemExit("--site takes an https:// address")
        self.base, self.cache = base.rstrip("/"), {}
    def get(self, p):
        if p not in self.cache: self.cache[p] = self._get(p)
        return self.cache[p]
    def _get(self, p):
        import urllib.request, urllib.error
        req = urllib.request.Request(self.base + "/" + p.lstrip("/"), headers={"User-Agent": "cz-verify/" + VERSION, "Accept": "*/*"})
        try:
            with urllib.request.urlopen(req, timeout=60) as resp: return resp.read()
        except urllib.error.HTTPError as e:
            if e.code == 404: return None
            raise
    def list(self, prefix): return []

def site_path(src, p):
    """A file's path in this source: a bundle keeps the canonical texts under record/ and signatures under signatures/."""
    if src.kind != "bundle": return p
    return {"core.txt": "record/CZ-CORE-1.0.txt", "record.txt": "record/CZ-IR-1.0.txt"}.get(p, p)

def sig_path(src, p):
    if src.kind != "bundle": return p + ".sig"
    return "signatures/" + p.rsplit("/", 1)[-1] + ".sig"

# ================================================================ the record: key, release manifest, texts, translations, timestamp
def verify_record(src, rep, anchor, label):
    rep.section("record — " + label)
    pub_pem = src.get("signatures/cz-record-signing.pub" if src.kind == "bundle" else ".well-known/cz-record-signing.pub")
    if not pub_pem: rep.fail("the record's public key is missing"); return None
    raw = raw_from_spki(pem_to_der(pub_pem))
    if not raw: rep.fail("the public key is not an Ed25519 SubjectPublicKeyInfo"); return None
    fp = fingerprint_of_raw(raw)
    if not rep.check(fp == anchor, "public key: fingerprint %s matches the trust anchor" % fp, "public key: fingerprint %s differs from the trust anchor %s" % (fp, anchor)): return None

    if src.kind == "bundle":
        names = [n for n in src.list(".well-known/") if re.fullmatch(r"\.well-known/cz-release-[0-9][0-9A-Za-z.\-]*\.json", n)]
    else:
        man = src.get(".well-known/civilization-zero.json")
        url = json.loads(man)["signature"]["release_manifest"] if man else None
        names = [".well-known/" + url.rsplit("/", 1)[-1]] if url else []
    if not names: rep.fail("no release manifest found"); return None
    result = {"raw": raw}
    for rname in names:
        rbytes = src.get(rname); base = rname.rsplit("/", 1)[-1]
        rsig = src.get("signatures/" + base + ".sig" if src.kind == "bundle" else rname + ".sig")
        if rbytes is None: rep.fail(base + ": missing"); continue
        if not rsig: rep.fail(base + ": no detached signature"); continue
        if not rep.check(ed25519_verify(raw, rbytes, rsig), base + ": Ed25519 signature verifies (sha256 %s)" % sha256(rbytes), base + ": signature does NOT verify"): continue
        rel = json.loads(rbytes); result["release"] = rel; result["release_sha"] = sha256(rbytes)
        key = rel.get("key", {})
        rep.check(key.get("fingerprint") == anchor, "release manifest names the same key", "release manifest names another key: %s" % key.get("fingerprint"))
        for d in rel.get("documents", []):
            if d.get("file") == "core.txt": result["core_sha"] = d["sha256"]   # translations map to the signed hash, not to whatever file is present
        for d in rel.get("documents", []) + [dict(rel.get("machine_prompt", {}), id="machine prompt " + rel.get("machine_prompt", {}).get("version", ""))]:
            p = site_path(src, d["file"]); b = src.get(p)
            if b is None: rep.fail("%s: %s is missing" % (d["id"], p)); continue
            rep.check(sha256(b) == d["sha256"], "%s: %s sha256 %s as the release manifest states" % (d["id"], p, d["sha256"]), "%s: %s sha256 %s, the release manifest states %s" % (d["id"], p, sha256(b), d["sha256"]))
            s = src.get(sig_path(src, d["file"]))
            if s: rep.check(ed25519_verify(raw, b, s), "%s: its own detached signature verifies" % d["id"], "%s: its own detached signature does NOT verify" % d["id"])

        ots = src.get("signatures/" + base + ".ots" if src.kind == "bundle" else rname + ".ots")
        if ots: verify_ots(rep, ots, rbytes, base)
        else: rep.note(base + ": no timestamp proof present")

    # every translation maps to the Core by hash (IR 10.5)
    core_sha = result.get("core_sha")
    if core_sha:
        if src.kind == "bundle":
            trs = [(n, src.get(n), None) for n in src.list("record/translations/") if n.endswith(".json")]
        else:
            man = json.loads(src.get(".well-known/civilization-zero.json") or b"{}")
            trs = []
            for t in man.get("translations", []):
                p = "core.%s.json" % t["lang"]; trs.append((p, src.get(p), t.get("sha256")))
        bad = 0
        for name, b, stated in trs:
            if b is None: rep.fail(name + ": missing"); bad += 1; continue
            t = json.loads(b)
            if t.get("maps_to") != "CZ-CORE 1.0" or t.get("canonical_sha256") != core_sha: rep.fail(name + ": does not map to CZ-CORE 1.0 by its hash"); bad += 1
            if stated and stated != sha256(b): rep.fail("%s: sha256 %s, the manifest states %s" % (name, sha256(b), stated)); bad += 1
        if trs and not bad: rep.ok("%d translations map to CZ-CORE 1.0 by its hash%s" % (len(trs), " and match the manifest" if src.kind == "site" else ""))
    return result

def verify_ots(rep, ots, data, label):
    try:
        algo, digest, atts = parse_ots(ots)
    except ValueError as e:
        rep.fail("%s.ots: %s" % (label, e)); return
    if not rep.check(algo == "sha256" and digest == hashlib.sha256(data).digest(), "%s.ots: the timestamp proof commits to sha256 %s" % (label, digest.hex()), "%s.ots: the proof commits to %s %s, not to this file" % (label, algo, digest.hex())): return
    btc = [a for a in atts if a[0] == "bitcoin"]
    for a in [a for a in atts if a[2] is None]:
        rep.note("%s.ots: an attestation (%s) sits below an operation this verifier cannot compute (keccak256 or RIPEMD-160); not followed" % (label, a[0]))
    btc = [a for a in btc if a[2] is not None]
    for a in btc:
        rep.ok("%s.ots: Bitcoin attestation, block %d — the path ends in the Merkle root bytes %s (block header byte order); block explorers and bitcoin-cli getblockheader display it as %s: compare it with that block in any copy of the Bitcoin chain" % (label, a[1], a[2].hex(), a[2][::-1].hex()))
    pend = [a for a in atts if a[0] == "pending"]
    if pend and not btc: rep.pending("%s.ots: submitted to %d calendar(s) (%s); no Bitcoin attestation in this copy yet — `ots upgrade` fetches it" % (label, len(pend), ", ".join(a[1] for a in pend)))
    elif pend: rep.note("%s.ots: %d calendar(s) still pending besides the Bitcoin attestation" % (label, len(pend)))
    for a in atts:
        if a[0] not in ("bitcoin", "pending"): rep.note("%s.ots: %s attestation %s (not checked here)" % (label, a[0], a[1]))

def verify_bundle_signature(rep, path, raw):
    sig = path + ".sig"
    if not os.path.isfile(sig): rep.note("no %s beside the bundle; its own signature is not checked" % os.path.basename(sig)); return
    with open(path, "rb") as f: b = f.read()
    with open(sig, "rb") as f: s = f.read()
    rep.check(ed25519_verify(raw, b, s), "%s: Ed25519 signature verifies (sha256 %s)" % (os.path.basename(path), sha256(b)), "%s: signature does NOT verify" % os.path.basename(path))

def verify_site_bundles(src, rep, raw):
    man = json.loads(src.get(".well-known/civilization-zero.json") or b"{}")
    b = man.get("bundle")
    if not b: rep.note("the manifest names no bundle"); return
    for entry in [b] + b.get("earlier", []):
        name = entry["url"].rsplit("/", 1)[-1]; data = src.get("archive/" + name)
        if data is None: rep.fail(name + ": missing"); continue
        rep.check(sha256(data) == entry["sha256"], "%s: sha256 as the manifest states" % name, "%s: sha256 %s, the manifest states %s" % (name, sha256(data), entry["sha256"]))
        s = src.get("archive/" + name + ".sig")
        if s: rep.check(ed25519_verify(raw, data, s), name + ": Ed25519 signature verifies", name + ": signature does NOT verify")
        elif entry is b: rep.pending(name + ": not signed yet")

# ================================================================ the discussion: daily snapshots
def _iso(t):
    """A timestamp to microseconds UTC, whatever its spelling (…Z or …+00:00, 3 to 6 fraction digits)."""
    if t is None: return None
    m = re.fullmatch(r"(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d{1,6}))?(Z|[+-]\d\d:?\d\d)?", t.replace(" ", "T"))
    if not m: return t
    frac = (m.group(2) or "").ljust(6, "0"); tz = m.group(3) or "Z"
    if tz not in ("Z", "+00:00", "+0000"): return t
    return m.group(1) + "." + frac + "Z"

LINE_FIELDS = ("received", "kind", "author", "system", "operator", "prompt", "lang", "ref", "declared_date", "key_fingerprint", "content_sha256", "pubkey", "sig")

def day_bytes(log):
    return ((log.get("prev") or "") + "\n" + "\n".join(log.get("lines") or [])).encode("utf-8")

def verify_day(rep, snap, prev_snap, extra):
    day = snap.get("day"); log = snap.get("log") or {}
    if not log.get("sha256"): rep.pending("%s: not hashed yet (a day is hashed after it ends, UTC)" % day); return
    data = day_bytes(log)
    if not rep.check(sha256(data) == log["sha256"], "%s: sha256(previous hash + \"\\n\" + %d line(s)) = %s" % (day, len(log.get("lines") or []), log["sha256"]), "%s: the lines hash to %s, the snapshot states %s" % (day, sha256(data), log["sha256"])): return
    if extra.get("log") is not None:
        rep.check(extra["log"] == data, "%s: the .log file holds exactly the hashed bytes" % day, "%s: the .log file differs from the hashed bytes" % day)
    if prev_snap is not None:
        pl = prev_snap.get("log") or {}
        rep.check(log.get("prev") == pl.get("sha256"), "%s: chained to %s" % (day, prev_snap.get("day")), "%s: prev %s, but %s hashed to %s" % (day, log.get("prev"), prev_snap.get("day"), pl.get("sha256")))
    elif log.get("prev"): rep.note("%s: chained to %s… (the day before was not supplied)" % (day, log["prev"][:16]))
    else: rep.ok("%s: first day of the chain (no previous hash)" % day)
    lines = []
    for i, l in enumerate(log.get("lines") or []):
        try: lines.append(json.loads(l))
        except ValueError: rep.fail("%s: line %d is not JSON" % (day, i + 1)); return
    ids = [l.get("id") for l in lines]
    rep.check(ids == sorted(ids) and len(set(ids)) == len(ids), "%s: %d entr%s in canonical order" % (day, len(ids), "y" if len(ids) == 1 else "ies"), "%s: lines are not in canonical order" % day)
    if log.get("count") is not None: rep.check(log["count"] == len(lines), "%s: count %d as stated" % (day, len(lines)), "%s: %d lines, the snapshot states count %s" % (day, len(lines), log["count"]))
    if lines and log.get("last_id") is not None: rep.check(log["last_id"] == ids[-1], "%s: last id %s as stated" % (day, ids[-1]), "%s: last id %s, the snapshot states %s" % (day, ids[-1], log["last_id"]))
    entries = {e.get("id"): e for e in snap.get("entries") or []}
    if not entries and lines: rep.note("%s: the snapshot carries no entries; only the chain was checked" % day)
    n_content = n_sig = 0
    for l in lines:
        lid = l.get("id"); e = entries.get(lid)
        if e is None:
            if entries: rep.fail("%s: entry %s is in the hashed lines but not in the snapshot" % (day, lid))
            continue
        diff = [k for k in LINE_FIELDS if (_iso(e.get(k)) if k == "received" else e.get(k)) != (_iso(l.get(k)) if k == "received" else l.get(k))]
        if diff: rep.fail("%s: entry %s differs from its hashed line in %s" % (day, lid, ", ".join(diff)))
        if e.get("state") != l.get("state") or e.get("category") != l.get("category"):
            rep.note("%s: entry %s was %s when hashed, is %s%s now — later decisions are in the moderation log" % (day, lid, l.get("state"), e.get("state"), (" (" + e["category"] + ")") if e.get("category") else ""))
        content = e.get("content")
        shown = e.get("state") == "published" and content is not None
        if shown:
            if sha256(content.encode("utf-8")) != l.get("content_sha256"):
                rep.fail("%s: entry %s content does not match its hash" % (day, lid)); continue
            n_content += 1
        if l.get("pubkey") or l.get("sig"):
            try: raw, sig = base64.b64decode(l.get("pubkey") or "", validate=True), base64.b64decode(l.get("sig") or "", validate=True)
            except ValueError: rep.fail("%s: entry %s carries a key or signature that is not base64" % (day, lid)); continue
            if len(raw) != 32 or len(sig) != 64: rep.fail("%s: entry %s key or signature has the wrong length" % (day, lid)); continue
            if fingerprint_of_raw(raw) != l.get("key_fingerprint"): rep.fail("%s: entry %s key fingerprint does not match its public key" % (day, lid)); continue
            if shown:
                if ed25519_verify(raw, content.encode("utf-8"), sig): n_sig += 1
                else: rep.fail("%s: entry %s signature does NOT verify over its content" % (day, lid))
            else: rep.note("%s: entry %s is %s; its signature covers the original content, which is not shown — the key fingerprint was checked" % (day, lid, e.get("state")))
    extra_ids = sorted(set(entries) - set(ids), key=lambda x: (x is None, x))
    if extra_ids: rep.fail("%s: entr%s %s in the snapshot but not in the hashed lines" % (day, "y" if len(extra_ids) == 1 else "ies", ", ".join(str(x) for x in extra_ids)))
    if n_content: rep.ok("%s: %s" % (day, "1 published entry matches its content hash" if n_content == 1 else "%d published entries match their content hashes" % n_content))
    if n_sig: rep.ok("%s: %s" % (day, "1 signed entry: its Ed25519 signature verifies over its content, with the fingerprint published" if n_sig == 1 else "%d signed entries: each Ed25519 signature verifies over its content, with the fingerprint published" % n_sig))
    if extra.get("ots") is not None: verify_ots(rep, extra["ots"], data, day + ".log")

def load_days(paths):
    """Snapshots from files and directories: {date}.json, with {date}.log and {date}.log.ots beside it when present."""
    found = []
    for p in paths:
        files = [os.path.join(p, f) for f in sorted(os.listdir(p))] if os.path.isdir(p) else [p]
        for f in files:
            if re.fullmatch(r"\d{4}-\d\d-\d\d\.json", os.path.basename(f)):
                with open(f, "rb") as fh: snap = json.loads(fh.read())
                extra = {}
                for k, suffix in (("log", ".log"), ("ots", ".log.ots")):
                    g = f[:-5] + suffix
                    if os.path.isfile(g):
                        with open(g, "rb") as fh: extra[k] = fh.read()
                found.append((snap, extra))
    return sorted(found, key=lambda x: x[0].get("day") or "")

def verify_days(rep, days, label):
    rep.section("discussion — " + label)
    if not days: rep.note("no daily snapshots supplied"); return
    prev = None
    for snap, extra in days:
        d = snap.get("day")
        expected_prev = prev if prev is not None and d and prev[0].get("day") == (datetime.date.fromisoformat(d) - datetime.timedelta(days=1)).isoformat() else None
        if prev is not None and expected_prev is None: rep.note("%s: the day before is missing from what was supplied" % d)
        verify_day(rep, snap, expected_prev[0] if expected_prev else None, extra)
        prev = (snap, extra)

def site_days(src, rep):
    idx = src.get("archive/entries.json")
    if idx is None: rep.note("no index of daily snapshots at /archive/entries.json"); return []
    out = []
    for d in json.loads(idx).get("days", []):
        b = src.get("archive/entries/%s.json" % d["day"])
        if b is None: rep.fail("%s: listed in the index but not served" % d["day"]); continue
        snap = json.loads(b)
        if (snap.get("log") or {}).get("sha256") != d.get("sha256"): rep.fail("%s: the snapshot's hash differs from the index" % d["day"])
        out.append((snap, {}))
    return out

# ================================================================ main
def self_test(rep):
    rep.section("self-test — Ed25519, RFC 8032 section 7.1")
    for i, (pk, m, s) in enumerate(RFC8032, 1):
        pk, m, s = bytes.fromhex(pk), bytes.fromhex(m), bytes.fromhex(s)
        rep.check(ed25519_verify(pk, m, s), "test %d verifies" % i, "test %d does NOT verify" % i)
        bad = bytearray(s); bad[i] ^= 1
        rep.check(not ed25519_verify(pk, m, bytes(bad)), "test %d with one bit changed is rejected" % i, "test %d with one bit changed was accepted" % i)
        rep.check(not ed25519_verify(pk, m + b"x", s), "test %d with a changed message is rejected" % i, "test %d with a changed message was accepted" % i)

def main(argv):
    args, opts = [], {"days": [], "fingerprint": ANCHOR_FINGERPRINT}
    it = iter(argv)
    for a in it:
        if a in ("-h", "--help"): print(__doc__); return 0
        elif a == "--json": opts["json"] = True
        elif a == "--quiet": opts["quiet"] = True
        elif a == "--self-test": opts["self_test"] = True
        elif a in ("--site", "--site-dir", "--fingerprint"): opts[a[2:].replace("-", "_")] = next(it, None)
        elif a == "--days": opts["days_mode"] = True
        elif a.startswith("-"): print("unknown option " + a, file=sys.stderr); return 2
        elif opts.get("days_mode"): opts["days"].append(a)
        else: args.append(a)
    anchor = (opts.get("fingerprint") or "").lower()
    if not re.fullmatch(r"[0-9a-f]{64}", anchor): print("--fingerprint takes 64 hex digits", file=sys.stderr); return 2
    if not (args or opts.get("site") or opts.get("site_dir") or opts["days"] or opts.get("self_test")):
        here = os.path.dirname(os.path.abspath(__file__))
        if os.path.isfile(os.path.join(here, "..", "README-BUNDLE.txt")): args = [os.path.join(here, "..")]
        else: print(__doc__); return 2
    rep = Report(opts.get("quiet"), opts.get("json"))
    if not opts.get("json"): print("cz-verify %s — trust anchor: key fingerprint %s\n(compare it with a copy you obtained elsewhere: the DOI deposit, the repository, a printed copy, the second key-holder)" % (VERSION, anchor))
    try:
        if opts.get("self_test"): self_test(rep)
        for a in args:
            if os.path.isdir(a): verify_record(DirSource(a, "bundle"), rep, anchor, "bundle directory " + a)
            elif os.path.isfile(a):
                res = verify_record(TarSource(a), rep, anchor, os.path.basename(a))
                if res: verify_bundle_signature(rep, a, res["raw"])
            else: rep.section("input"); rep.fail("no such file or directory: " + a)
        for key in ("site_dir", "site"):
            if opts.get(key):
                src = DirSource(opts[key], "site") if key == "site_dir" else HttpSource(opts[key])
                res = verify_record(src, rep, anchor, ("site copy " if key == "site_dir" else "") + opts[key])
                if res: verify_site_bundles(src, rep, res["raw"])
                if key == "site":
                    rep.section("discussion — " + opts[key])
                    days = site_days(src, rep)
                    if days: verify_days(rep, days, opts[key] + " (as served now)")
        if opts["days"]: verify_days(rep, load_days(opts["days"]), ", ".join(opts["days"]))
    except Exception as e:   # a malformed input is a failure of the input, reported as such
        rep.section("error"); rep.fail("%s: %s" % (type(e).__name__, e))
    c = rep.counts()
    if opts.get("json"):
        print(json.dumps({"verifier": "cz-verify " + VERSION, "trust_anchor": anchor, "summary": c, "result": "fail" if c.get("FAIL") else "pass", "items": rep.items}, ensure_ascii=False, indent=1))
    else:
        print("\nsummary: " + ", ".join("%d %s" % (c.get(k, 0), k) for k in ("OK", "FAIL", "PENDING", "NOTE")) + (" — FAILED" if c.get("FAIL") else " — nothing failed"))
    return 1 if c.get("FAIL") else 0

if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
