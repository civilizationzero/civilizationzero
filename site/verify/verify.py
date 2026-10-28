#!/usr/bin/env python3
"""cz-verify — check the record of Civilization Zero without trusting the site that serves it.

Python 3.8 or later, standard library only. Nothing is fetched unless you pass --site.

  python3 verify.py cz-bundle-1.0.1.tar               a preservation bundle (its .sig beside it is checked too)
  python3 verify.py path/to/extracted-bundle/          the same, unpacked (its own signature cannot be checked then)
  python3 verify.py --site-dir path/to/site/public     a static copy of the site (a mirror's files)
  python3 verify.py --site https://civilizationzero.ai the live site or a mirror, over the network: the record, every
                                                       bundle, and both daily chains compared with the repository's copies
  python3 verify.py --days archive/discussion          daily snapshots, with {date}.log and {date}.log.ots beside them
  python3 verify.py --days archive/register            (the Adoption Register's chain: the same, for its records)
  python3 verify.py --self-test                        the Ed25519 test vectors of RFC 8032

Options: --fingerprint HEX (another trust anchor); --repo-raw URL|none (where --site looks for the repository's copies of
each day; default the public repository); --strict (anything that could not be verified counts as a failure); --json (the
report as data); --quiet (only what failed, what could not be verified and what needs an outside check, then the summary).
Put bundles and --site options before --days; every path after --days must hold daily snapshots.
Exit status: 0 when nothing failed (with --strict: and nothing was left unverified), 1 otherwise, 2 on a usage error.

Levels: OK (checked here), FAIL (wrong), PENDING (could not be verified here: a missing signature, proof or copy),
CHECK (needs one outside fact this file cannot hold: a Bitcoin block), NOTE (context).

What it checks: the record's key against the trust anchor below; the Ed25519 signatures of the release manifest, of the
canonical texts and of each bundle; every hash the release manifest states, and that the canonical texts are the ones whose
hashes are printed below; the structure of a bundle (plain relative names, no links, no duplicates) and which of its
members no signature covers; that each OpenTimestamps proof commits to what it claims, following every path to its Bitcoin
block (it prints the Merkle root to compare with that block); for each daily chain, that every day's hash is
SHA-256(previous day's hash + "\\n" + the day's lines), that the days run without gap from the chain's first day (pinned
below), that every entry's content and every record's statement match their hashes and that nothing the site always shows
is withheld and nothing it never shows is added, that every signature verifies, and — with --site — that the site serves
every day from the first to the last one due (a day is hashed by 00:20 UTC the next day) and that each day equals the
copy and timestamp proof kept in the public repository, which the site does not control.

What it cannot check: whether a declared name is true; whether a Bitcoin block exists (CHECK); what a translation says
(a translation's text is covered by a bundle's signature, not by the release manifest); a copy of this file altered
together with the bundle it came with. The trust anchor is the fingerprint below: compare it with one you obtained
elsewhere — the DOI deposit (doi:10.5281/zenodo.23740317), the repository (github.com/civilizationzero/civilizationzero),
a printed copy, or the second key-holder.

Licence: MIT. Part of the record of Civilization Zero (https://civilizationzero.ai/archive)."""

import base64, datetime, hashlib, io, json, os, re, sys, tarfile

VERSION = "1.4"
ANCHOR_FINGERPRINT = "82662396484f627a63272bcd5ac19aae72def7aca2898216dc8e7f975dfc2263"
SPKI_PREFIX = bytes.fromhex("302a300506032b6570032100")   # DER SubjectPublicKeyInfo header of an Ed25519 key
CORE_SHA = "92a8d1e2a1604c25b432685673be78184bf05c3b166893c437e0895b7b2d724a"   # the record's identity: the hashes of its
IR_SHA = "71e1488e631e090c0820bf8b78b1fda70ffacba1da146c36d8893600320fcc8d"     # canonical texts, as published since 2026-08-30
PINNED_TEXTS = {"core.txt": CORE_SHA, "record.txt": IR_SHA}
PINNED_VERSIONS = {"CZ-CORE 1.0 sha256:" + CORE_SHA, "CZ-IR 1.0 sha256:" + IR_SHA}
KNOWN_SIGNED_BUNDLES = {"cz-bundle-1.0.tar": "fcd3957cbea9c5b21da662e7ea97b4bf3d3b1da1e2eb55ec7bf9d71e2af5cb36"}   # signed: must stay so
FIRST_DAY = {"discussion": "2026-10-28", "register": None}    # the room opened 2026-10-28T18:29:12Z; the register's first day is not fixed yet
REPO_RAW = "https://raw.githubusercontent.com/civilizationzero/civilizationzero/main"
ORIGIN_HOSTS = ("civilizationzero.ai", "www.civilizationzero.ai")   # the record's own site serves its chains; a mirror may not
ORIGIN = "https://civilizationzero.ai"

def is_origin(base):
    """Whether an https address is the record's own site, however it is spelled (case, a trailing dot, port 443, a slash)."""
    import urllib.parse
    try: u = urllib.parse.urlsplit(base); port = u.port
    except ValueError: return False
    return u.scheme == "https" and (u.hostname or "").rstrip(".") in ORIGIN_HOSTS and port in (None, 443) and u.path in ("", "/") and not u.query and not u.fragment

# ================================================================ Ed25519 verification (RFC 8032, section 5.1)
# Cofactorless, compared as encodings, as OpenSSL does. A public key must be a canonical encoding (y < p; x = 0 only with the
# sign bit clear); OpenSSL is laxer there, so the site refuses non-canonical and small-order keys when it accepts an entry,
# and the two checks agree on every key the site accepts.
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

def full_order_key(pub):
    """True when pub is a canonical encoding of a point of full order (a small-order key proves no continuity: anyone can sign for it)."""
    a = _decode(pub)
    if a is None: return False
    q = a
    for _ in range(3): q = _add(q, q)
    return not (q[0] % _P == 0 and (q[1] - q[2]) % _P == 0)

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

# ================================================================ keys and hashes
def pem_to_der(pem):
    body = re.sub(rb"-----[^-]+-----", b"", pem)
    return base64.b64decode(b"".join(body.split()))

def raw_from_spki(der):
    return der[len(SPKI_PREFIX):] if len(der) == 44 and der.startswith(SPKI_PREFIX) else None

def fingerprint_of_raw(raw):
    return hashlib.sha256(SPKI_PREFIX + raw).hexdigest()

def sha256(b):
    return hashlib.sha256(b).hexdigest()

def canonical_json(obj):
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"), sort_keys=True)

# ================================================================ OpenTimestamps proofs (the .ots format of opentimestamps-client)
OTS_MAGIC = b"\x00OpenTimestamps\x00\x00Proof\x00\xbf\x89\xe2\xe8\x84\xe8\x92\x94"
ATT_BITCOIN, ATT_PENDING, ATT_LITECOIN = bytes.fromhex("0588960d73d71901"), bytes.fromhex("83dfe30d2ef90c8e"), bytes.fromhex("06869a0d73d71b45")
MAX_PROOF, MAX_MSG = 65536, 4096    # the client's own limits: a message or a result longer than 4,096 bytes is invalid

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
    def varbytes(self, limit=MAX_MSG):
        n = self.varuint()
        if n > limit: raise ValueError("field longer than %d bytes" % limit)
        return self.take(n)

def _ots_op(tag, r, msg):
    """One operation. Returns the new message, or None when this file cannot compute it (keccak256, or a RIPEMD-160 this
    Python lacks): the branch is still read to its end, and attestations below it are reported as not followed."""
    if tag in (0xf0, 0xf1):
        arg = r.varbytes(MAX_MSG)
        if msg is None: return None
        out = msg + arg if tag == 0xf0 else arg + msg
    elif tag not in (0x08, 0x02, 0x03, 0x67, 0xf2, 0xf3): raise ValueError("unknown operation 0x%02x" % tag)
    elif msg is None or tag == 0x67: return None
    elif tag == 0x08: out = hashlib.sha256(msg).digest()
    elif tag == 0x02: out = hashlib.sha1(msg).digest()
    elif tag == 0x03:
        try: out = hashlib.new("ripemd160", msg).digest()
        except ValueError: return None
    elif tag == 0xf2: out = msg[::-1]
    else: out = msg.hex().encode()
    if len(out) > MAX_MSG: raise ValueError("an operation's result is longer than %d bytes" % MAX_MSG)
    return out

def parse_ots(b):
    """Returns (hash algorithm, committed digest, attestations); each attestation is (kind, detail, message at that point)."""
    if len(b) > MAX_PROOF: raise ValueError("proof longer than %d bytes" % MAX_PROOF)
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
                kind = r.take(8); payload = _Reader(r.varbytes(8192))
                if kind == ATT_BITCOIN: atts.append(("bitcoin", payload.varuint(), msg))
                elif kind == ATT_LITECOIN: atts.append(("litecoin", payload.varuint(), msg))
                elif kind == ATT_PENDING: atts.append(("pending", payload.varbytes(1000).decode("utf-8", "replace"), msg))
                else: atts.append(("unknown", kind.hex(), msg))
            else:
                stamp(_ots_op(tag, r, msg), depth + 1)
        tag = r.byte()
        while tag == 0xff:
            one(r.byte()); tag = r.byte()
        one(tag)
    stamp(digest, 0)
    if r.i != len(b): raise ValueError("%d bytes after the end of the proof" % (len(b) - r.i))
    return algo[0], digest, atts

# ================================================================ the report
LEVELS = ("OK", "FAIL", "PENDING", "CHECK", "NOTE")
_UNSAFE = re.compile("[\x00-\x1f\x7f-\x9f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]")   # control and bidirectional-override characters from input

def clean(s):
    return _UNSAFE.sub(lambda m: "\\u%04x" % ord(m.group()), str(s))

class Report:
    def __init__(self, quiet=False, as_json=False):
        self.items, self.quiet, self.as_json, self.area = [], quiet, as_json, ""
    def section(self, title):
        self.area = clean(title)
        if not self.as_json and not self.quiet: print("\n[" + self.area + "]")
    def add(self, level, msg):
        msg = clean(msg)
        self.items.append({"level": level, "area": self.area, "message": msg})
        if not self.as_json and (not self.quiet or level in ("FAIL", "PENDING", "CHECK")):
            print(("  %-8s%s" % (level, msg)) if not self.quiet else ("%-8s[%s] %s" % (level, self.area, msg)))
    def ok(self, m): self.add("OK", m)
    def fail(self, m): self.add("FAIL", m)
    def note(self, m): self.add("NOTE", m)
    def pending(self, m): self.add("PENDING", m)
    def checkout(self, m): self.add("CHECK", m)
    def check(self, cond, ok_msg, fail_msg):
        (self.ok if cond else self.fail)(ok_msg if cond else fail_msg)
        return cond
    def counts(self):
        c = dict.fromkeys(LEVELS, 0)
        for i in self.items: c[i["level"]] += 1
        return c

# ================================================================ sources: a bundle (tar or directory), a site directory, a site over https
class TarSource:
    """A bundle read from its tar bytes, never extracted. Its structure is checked: every member a regular file with a plain
    relative name, none twice, none differing from another only in case — so that what is checked here is what any tool
    would extract."""
    kind = "bundle"
    def __init__(self, data):
        self.t = tarfile.open(fileobj=io.BytesIO(data), mode="r:")
        self.names, self.problems, folded = {}, [], {}
        for m in self.t.getmembers():
            n = m.name
            if m.isdir(): continue
            if not m.isfile():
                self.problems.append("member %r is a %s, not a regular file" % (n, "link" if (m.islnk() or m.issym()) else "special file")); continue
            if n.startswith("/") or "\\" in n or any(p in ("", ".", "..") for p in n.split("/")):
                self.problems.append("member name %r is not a plain relative path" % n); continue
            if n in self.names: self.problems.append("member %r appears more than once" % n); continue
            f = n.casefold()
            if f in folded: self.problems.append("members %r and %r differ only in case" % (folded[f], n)); continue
            folded[f] = n; self.names[n] = m
    def get(self, p):
        m = self.names.get(p)
        return self.t.extractfile(m).read() if m else None
    def list(self, prefix=""): return sorted(n for n in self.names if n.startswith(prefix))

class DirSource:
    def __init__(self, root, kind):
        self.root, self.kind, self.problems = os.path.realpath(root), kind, []
    def get(self, p):
        f = os.path.join(self.root, *p.split("/"))
        if not os.path.isfile(f) and self.kind == "site" and os.path.isfile(f + ".html"): f += ".html"
        if not os.path.isfile(f): return None
        if os.path.islink(f) or not os.path.realpath(f).startswith(self.root + os.sep):
            self.problems.append("%s is a link or leads outside the directory" % p); return None
        with open(f, "rb") as fh: return fh.read()
    def list(self, prefix=""):
        out = []
        for dp, _, fs in os.walk(self.root):
            for f in fs:
                rel = os.path.relpath(os.path.join(dp, f), self.root).replace(os.sep, "/")
                if rel.startswith(prefix): out.append(rel)
        return sorted(out)

class HttpSource:
    kind = "site"
    def __init__(self, base):
        self.base, self.cache, self.problems = base.rstrip("/"), {}, []
    def get(self, p):
        if p not in self.cache: self.cache[p] = self._get(p)
        return self.cache[p]
    def _get(self, p):
        import urllib.request, urllib.error
        req = urllib.request.Request(self.base + "/" + p.lstrip("/"), headers={"User-Agent": "cz-verify/" + VERSION, "Accept": "*/*"})
        try:
            with urllib.request.urlopen(req, timeout=60) as resp: return resp.read(64 * 1024 * 1024)
        except urllib.error.HTTPError as e:
            if e.code == 404: return None
            raise
    def list(self, prefix=""): return []

def site_path(src, p):
    """A file's path in this source: a bundle keeps the canonical texts under record/ and signatures under signatures/."""
    if src.kind != "bundle": return p
    return {"core.txt": "record/CZ-CORE-1.0.txt", "record.txt": "record/CZ-IR-1.0.txt"}.get(p, p)

def sig_path(src, p):
    if src.kind != "bundle": return p + ".sig"
    return "signatures/" + p.rsplit("/", 1)[-1] + ".sig"

# ================================================================ the record: key, release manifest, texts, translations, timestamp
def verify_record(src, rep, anchor, label):
    """Returns {"raw": key, "covered": set of member paths whose bytes a signature or a signed hash covers}, or None."""
    rep.section("record — " + label)
    for p in getattr(src, "problems", []): rep.fail("bundle structure: " + p)
    covered = set()
    pub_path = "signatures/cz-record-signing.pub" if src.kind == "bundle" else ".well-known/cz-record-signing.pub"
    pub_pem = src.get(pub_path)
    if not pub_pem: rep.fail("the record's public key is missing"); return None
    raw = raw_from_spki(pem_to_der(pub_pem))
    if not raw: rep.fail("the public key is not an Ed25519 SubjectPublicKeyInfo"); return None
    fp = fingerprint_of_raw(raw)
    if not rep.check(fp == anchor, "public key: fingerprint %s matches the trust anchor" % fp, "public key: fingerprint %s differs from the trust anchor %s" % (fp, anchor)): return None
    covered.add(pub_path)
    if src.kind == "bundle":
        names = [n for n in src.list(".well-known/") if re.fullmatch(r"\.well-known/cz-release-[0-9][0-9A-Za-z.\-]*\.json", n)]
    else:
        man = src.get(".well-known/civilization-zero.json")
        url = json.loads(man)["signature"]["release_manifest"] if man else None
        names = [".well-known/" + url.rsplit("/", 1)[-1]] if url else []
    if not names: rep.fail("no release manifest found"); return None
    result = {"raw": raw, "covered": covered}
    for rname in names:
        rbytes = src.get(rname); base = rname.rsplit("/", 1)[-1]
        sig_name = "signatures/" + base + ".sig" if src.kind == "bundle" else rname + ".sig"
        rsig = src.get(sig_name)
        if rbytes is None: rep.fail(base + ": missing"); continue
        if not rsig: rep.fail(base + ": no detached signature"); continue
        if not rep.check(ed25519_verify(raw, rbytes, rsig), base + ": Ed25519 signature verifies (sha256 %s)" % sha256(rbytes), base + ": signature does NOT verify"): continue
        covered.update({rname, sig_name})
        copy = src.get("signatures/" + base) if src.kind == "bundle" else None
        if copy is not None:
            if rep.check(copy == rbytes, "signatures/%s is the same signed file" % base, "signatures/%s differs from the signed %s" % (base, rname)): covered.add("signatures/" + base)
        rel = json.loads(rbytes)
        key = rel.get("key", {})
        rep.check(key.get("fingerprint") == anchor, "release manifest names the same key", "release manifest names another key: %s" % key.get("fingerprint"))
        for d in rel.get("documents", []):
            pinned = PINNED_TEXTS.get(d.get("file"))
            if pinned and d.get("sha256") != pinned: rep.fail("%s: the release manifest states sha256 %s, but the record's identity is %s" % (d.get("id"), d.get("sha256"), pinned))
            if d.get("file") == "core.txt": result["core_sha"] = d["sha256"]
        for d in rel.get("documents", []) + [dict(rel.get("machine_prompt", {}), id="machine prompt " + rel.get("machine_prompt", {}).get("version", ""))]:
            p = site_path(src, d["file"]); b = src.get(p)
            if b is None: rep.fail("%s: %s is missing" % (d["id"], p)); continue
            if rep.check(sha256(b) == d["sha256"], "%s: %s sha256 %s as the release manifest states" % (d["id"], p, d["sha256"]), "%s: %s sha256 %s, the release manifest states %s" % (d["id"], p, sha256(b), d["sha256"])):
                covered.add(p)
            sp = sig_path(src, d["file"]); s = src.get(sp)
            if s and rep.check(ed25519_verify(raw, b, s), "%s: its own detached signature verifies" % d["id"], "%s: its own detached signature does NOT verify" % d["id"]): covered.add(sp)
        ots_name = "signatures/" + base + ".ots" if src.kind == "bundle" else rname + ".ots"
        ots = src.get(ots_name)
        if ots:
            if verify_ots(rep, ots, rbytes, base): covered.add(ots_name)
        else: rep.pending(base + ": no timestamp proof present")
    # translations: their texts are not in the release manifest; each declares the Core it maps to (IR 10.5)
    core_sha = result.get("core_sha")
    if core_sha:
        if src.kind == "bundle":
            trs = [(n, src.get(n), None) for n in src.list("record/translations/") if n.endswith(".json")]
        else:
            man = json.loads(src.get(".well-known/civilization-zero.json") or b"{}")
            trs = [("core.%s.json" % t["lang"], src.get("core.%s.json" % t["lang"]), t.get("sha256")) for t in man.get("translations", [])]
        bad = 0
        for name, b, stated in trs:
            if b is None: rep.fail(name + ": missing"); bad += 1; continue
            t = json.loads(b)
            if t.get("maps_to") != "CZ-CORE 1.0" or t.get("canonical_sha256") != core_sha: rep.fail(name + ": does not declare that it maps to CZ-CORE 1.0 by its hash"); bad += 1
            if stated and stated != sha256(b): rep.fail("%s: sha256 %s, the manifest states %s" % (name, sha256(b), stated)); bad += 1
        if trs and not bad:
            rep.note("%d translations declare that they map to CZ-CORE 1.0 by its signed hash%s; a translation's text is covered by a bundle's signature, not by the release manifest"
                     % (len(trs), " and match the hashes in the site's unsigned manifest" if src.kind == "site" else ""))
    return result

def verify_ots(rep, ots, data, label):
    """True when the proof commits to the data (its Bitcoin attestations still need the outside CHECK it prints)."""
    try:
        algo, digest, atts = parse_ots(ots)
    except ValueError as e:
        rep.fail("%s.ots: %s" % (label, e)); return False
    if not rep.check(algo == "sha256" and digest == hashlib.sha256(data).digest(), "%s.ots: the timestamp proof commits to sha256 %s" % (label, digest.hex()), "%s.ots: the proof commits to %s %s, not to this file" % (label, algo, digest.hex())): return False
    btc = 0
    for kind, detail, msg in atts:
        if msg is None: rep.note("%s.ots: an attestation (%s) sits below an operation this verifier cannot compute (keccak256 or RIPEMD-160); not followed" % (label, kind)); continue
        if kind == "bitcoin":
            if len(msg) != 32: rep.fail("%s.ots: a Bitcoin attestation whose path ends in %d bytes, not a 32-byte Merkle root" % (label, len(msg))); continue
            btc += 1
            rep.checkout("%s.ots: claims Bitcoin block %d — this file cannot see the block: its header's Merkle root must be %s (as block explorers and bitcoin-cli getblockheader show it); in header byte order %s"
                         % (label, detail, msg[::-1].hex(), msg.hex()))
        elif kind == "pending": pass
        else: rep.note("%s.ots: %s attestation %s (not checked here)" % (label, kind, detail))
    pend = [a for a in atts if a[0] == "pending"]
    if pend and not btc: rep.pending("%s.ots: submitted to %d calendar(s) (%s); no Bitcoin attestation in this copy yet — `ots upgrade` fetches it" % (label, len(pend), ", ".join(a[1] for a in pend)))
    elif not btc: rep.pending("%s.ots: no Bitcoin attestation and no calendar to ask" % label)
    return True

def check_bundle(rep, name, data, sig, anchor):
    """A whole bundle: its own signature, then its structure and contents; lists the members no signature covers."""
    src = TarSource(data)
    pub = src.get("signatures/cz-record-signing.pub")
    raw = raw_from_spki(pem_to_der(pub)) if pub else None
    sig_ok = None
    if sig is not None and raw is not None and fingerprint_of_raw(raw) == anchor: sig_ok = ed25519_verify(raw, data, sig)
    res = verify_record(src, rep, anchor, name)
    if sig is None: rep.pending("%s: no signature beside it — the bundle's own signature is not checked" % name)
    elif sig_ok is None: rep.fail("%s: its signature cannot be checked: the bundle's key is not the anchored key" % name)
    else: rep.check(sig_ok, "%s: Ed25519 signature verifies (sha256 %s); every member is covered" % (name, sha256(data)), "%s: signature does NOT verify" % name)
    if not sig_ok and res:
        rest = [n for n in src.list() if n not in res["covered"]]
        if rest: rep.pending("%s: %d member(s) covered by no signature here: %s%s" % (name, len(rest), ", ".join(rest[:6]), ", …" if len(rest) > 6 else ""))
    return res

def verify_site_bundles(src, rep, anchor):
    man = json.loads(src.get(".well-known/civilization-zero.json") or b"{}")
    b = man.get("bundle")
    if not b: rep.note("the manifest names no bundle"); return
    entries = [b] + list(b.get("earlier", []))
    seen = {e["url"].rsplit("/", 1)[-1] for e in entries}
    for name, h in KNOWN_SIGNED_BUNDLES.items():
        if name not in seen: entries.append({"url": "/archive/" + name, "sha256": h, "signature": name + ".sig", "_pinned_only": True})
    for entry in entries:
        name = entry["url"].rsplit("/", 1)[-1]; data = src.get("archive/" + name)
        rep.section("bundle — " + name)
        if data is None: rep.fail(name + ": missing" + (" (this verifier knows it as signed)" if name in KNOWN_SIGNED_BUNDLES else "")); continue
        h = sha256(data)
        if not entry.get("_pinned_only"):
            rep.check(h == entry.get("sha256"), "%s: sha256 as the site's unsigned manifest states" % name, "%s: sha256 %s, the manifest states %s" % (name, h, entry.get("sha256")))
        pinned = KNOWN_SIGNED_BUNDLES.get(name)
        if pinned: rep.check(h == pinned, "%s: the bundle this verifier knows as signed" % name, "%s: sha256 %s, but the signed bundle of that name is %s" % (name, h, pinned))
        sig = src.get("archive/" + name + ".sig")
        if sig is None and (pinned or entry.get("signature") or (entry is b and b.get("signed") is True)):
            rep.fail("%s: its signature is not served, though %s" % (name, "this verifier knows the bundle as signed" if pinned else "the manifest names one")); sig = b""
        check_bundle(rep, name, data, sig if sig != b"" else None, anchor)

# ================================================================ daily chains: the discussion and the Adoption Register
def _iso(t):
    """A timestamp to microseconds UTC, whatever its spelling (…Z or …+00:00, 0 to 6 fraction digits)."""
    if t is None: return None
    m = re.fullmatch(r"(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d{1,6}))?(Z|[+-]\d\d:?\d\d)?", str(t).replace(" ", "T"))
    if not m: return t
    frac = (m.group(2) or "").ljust(6, "0"); tz = m.group(3) or "Z"
    if tz not in ("Z", "+00:00", "+0000"): return t
    return m.group(1) + "." + frac + "Z"

LINE_FIELDS = ("received", "kind", "author", "system", "operator", "prompt", "lang", "ref", "declared_date", "key_fingerprint", "content_sha256", "pubkey", "sig")
REGISTER_FIELDS = ("received", "type", "refers_to", "statement_sha256", "trace_host", "key_fingerprint", "pubkey", "sig")
# a hidden record: the site serves these as null (they exist only inside its statement, which is not shown) …
HIDDEN_NULLED = ("signatory", "institution", "capacity", "scope", "reservations", "trace_url")
# … and still shows these, which then no hash covers
HIDDEN_KEPT = ("signatory_kind", "versions", "declared_date", "lang")
CHAINS = {"discussion": {"items": "entries", "one": "entry", "many": "entries", "fields": LINE_FIELDS, "later": "the moderation log", "dir": "archive/entries", "repo": "archive/discussion"},
          "register": {"items": "records", "one": "record", "many": "records", "fields": REGISTER_FIELDS, "later": "each record's log", "dir": "archive/register", "repo": "archive/register"}}

def day_bytes(log):
    return ((log.get("prev") or "") + "\n" + "\n".join(log.get("lines") or [])).encode("utf-8")

def check_statement(rep, day, lid, e):
    """A register record's statement: canonical form, pinned versions, and the record's fields as stated in it.
    Returns the statement's bytes for the signature check, or None after a failure."""
    text = e.get("statement")
    try: st = json.loads(text)
    except ValueError: rep.fail("%s: record %s statement is not JSON" % (day, lid)); return None
    if not isinstance(st, dict) or canonical_json(st) != text: rep.fail("%s: record %s statement is not in canonical form" % (day, lid)); return None
    if any(v not in PINNED_VERSIONS for v in st.get("versions", [])): rep.fail("%s: record %s names a version not pinned to the record's hashes" % (day, lid)); return None
    for k in ("type", "signatory", "signatory_kind", "declared_date"):
        if str(st.get(k, "")) != str(e.get(k) or ""): rep.fail("%s: record %s field %s differs from its statement" % (day, lid, k)); return None
    for k in ("institution", "capacity", "scope", "reservations", "lang", "trace_url"):   # the trace address is part of the statement (register v6d)
        if (st.get(k) or "") != (e.get(k) or ""): rep.fail("%s: record %s field %s differs from its statement" % (day, lid, k)); return None
    if list(st.get("versions") or []) != list(e.get("versions") or []) or str(st.get("refers_to") or "") != str(e.get("refers_to") or ""):
        rep.fail("%s: record %s versions or refers_to differ from its statement" % (day, lid)); return None
    return text.encode("utf-8")

def verify_day(rep, snap, prev_snap, extra, ctx):
    """One day. ctx: chain, first (the pinned first day or None), first_supplied, has_successor, after_gap, independent."""
    day = snap.get("day"); log = snap.get("log") or {}; chain = CHAINS[ctx["chain"]]
    if not log.get("sha256"):
        if ctx["has_successor"]: rep.fail("%s: not hashed, but a later day is — every finished day is hashed in order" % day)
        else: rep.pending("%s: not hashed yet (a day is hashed after it ends, UTC)" % day)
        return
    data = day_bytes(log)
    if not rep.check(sha256(data) == log["sha256"], "%s: sha256(previous hash + \"\\n\" + %d line(s)) = %s" % (day, len(log.get("lines") or []), log["sha256"]), "%s: the lines hash to %s, the snapshot states %s" % (day, sha256(data), log["sha256"])): return
    # the chain
    if prev_snap is not None:
        pl = prev_snap.get("log") or {}
        rep.check(log.get("prev") is not None and log.get("prev") == pl.get("sha256"), "%s: chained to %s" % (day, prev_snap.get("day")),
                  "%s: prev %s, but %s hashed to %s" % (day, log.get("prev"), prev_snap.get("day"), pl.get("sha256")))
    elif log.get("prev") is None:
        if ctx["first"] is not None:
            rep.check(day == ctx["first"], "%s: the first day of the chain (no previous hash)" % day, "%s: no previous hash, but the chain began on %s" % (day, ctx["first"]))
        elif ctx["first_supplied"] and not ctx["after_gap"]: rep.note("%s: no previous hash: taken as the first day of this chain, which this verifier does not pin" % day)
        else: rep.fail("%s: no previous hash in the middle of the chain" % day)
    elif ctx["first_supplied"]: rep.note("%s: chained to %s… (the day before was not supplied)" % (day, log["prev"][:16]))
    lines = []
    for i, l in enumerate(log.get("lines") or []):
        try: lines.append(json.loads(l))
        except ValueError: rep.fail("%s: line %d is not JSON" % (day, i + 1)); return
    ids = [l.get("id") for l in lines]
    rep.check(all(isinstance(x, int) for x in ids) and ids == sorted(ids) and len(set(ids)) == len(ids), "%s: %d line%s in canonical order" % (day, len(ids), "" if len(ids) == 1 else "s"), "%s: lines are not in canonical order" % day)
    if log.get("count") is not None: rep.check(log["count"] == len(lines), "%s: count %d as stated" % (day, len(lines)), "%s: %d lines, the snapshot states count %s" % (day, len(lines), log["count"]))
    if lines and log.get("last_id") is not None: rep.check(log["last_id"] == ids[-1], "%s: last id %s as stated" % (day, ids[-1]), "%s: last id %s, the snapshot states %s" % (day, ids[-1], log["last_id"]))
    one, many = chain["one"], chain["many"]
    items = snap.get(chain["items"]) or []
    if not isinstance(items, list) or not all(isinstance(e, dict) for e in items): rep.fail("%s: the snapshot's %s are not a list of objects" % (day, many)); items = []
    entries = {}
    for e in items:
        if e.get("id") in entries: rep.fail("%s: %s %s appears more than once in the snapshot" % (day, one, e.get("id")))
        entries[e.get("id")] = e
    if lines and not entries:
        rep.fail("%s: the snapshot carries none of the %d %s its lines hash — the site serves every %s of a day" % (day, len(lines), many if len(lines) > 1 else one, one))
        lines_to_check = []
    else: lines_to_check = lines
    n_content = n_sig = 0
    for l in lines_to_check:
        lid = l.get("id"); e = entries.get(lid)
        if e is None:
            rep.fail("%s: %s %s is in the hashed lines but not in the snapshot" % (day, one, lid)); continue
        if "hidden" in e and e.get("hidden") is not (e.get("state") == "hidden"):
            rep.fail("%s: %s %s is marked hidden %s while its state is %s — the site derives the one from the other" % (day, one, lid, json.dumps(e.get("hidden")), e.get("state"))); continue
        diff = [k for k in chain["fields"] if (_iso(e.get(k)) if k == "received" else e.get(k)) != (_iso(l.get(k)) if k == "received" else l.get(k))]
        if many == "records" and l.get("state") != "hidden" and e.get("state") != "hidden" and e.get("trace_url") != l.get("trace_url"): diff.append("trace_url")
        if diff: rep.fail("%s: %s %s differs from its hashed line in %s" % (day, one, lid, ", ".join(diff)))
        if e.get("state") != l.get("state") or e.get("category") != l.get("category"):
            rep.note("%s: %s %s was %s when hashed, is %s%s now — later events are in %s" % (day, one, lid, l.get("state"), e.get("state"), (" (" + str(e["category"]) + ")") if e.get("category") else "", chain["later"]))
        if many == "entries":
            content = e.get("content"); signed_bytes = None
            shown = content is not None and e.get("state") != "redacted"
            if content is not None and e.get("state") == "redacted": rep.note("%s: entry %s is redacted: the text shown is covered by no hash (the hash is the original's)" % (day, lid))
            if content is None and e.get("state") == "published":
                rep.fail("%s: entry %s is published, yet the snapshot carries no content for it — the site serves every published entry's text" % (day, lid)); continue
            if shown:
                if not isinstance(content, str) or sha256(content.encode("utf-8")) != l.get("content_sha256"): rep.fail("%s: entry %s content does not match its hash" % (day, lid)); continue
                if e.get("state") == "hidden": rep.note("%s: entry %s is hidden, yet its content is in this snapshot (it matches its hash)" % (day, lid))
                signed_bytes = content.encode("utf-8")
        else:
            text = e.get("statement"); signed_bytes = None
            shown = text is not None
            if not shown:
                if e.get("state") != "hidden":
                    rep.fail("%s: record %s is not hidden, yet the snapshot carries no statement for it — the site serves every statement that is not hidden" % (day, lid)); continue
                leaked = [k for k in HIDDEN_NULLED if e.get(k) not in (None, "")]
                if leaked:
                    rep.fail("%s: record %s is hidden, yet the snapshot shows its %s — no hash covers them, and the site never serves them for a hidden record" % (day, lid, ", ".join(leaked))); continue
                kept = [k for k in HIDDEN_KEPT if e.get(k) not in (None, "", [])]
                if kept: rep.note("%s: record %s is hidden: its %s %s shown, but no hash covers %s while its statement is not shown" % (day, lid, ", ".join(kept), "is" if len(kept) == 1 else "are", "it" if len(kept) == 1 else "them"))
            if shown:
                if not isinstance(text, str) or sha256(text.encode("utf-8")) != l.get("statement_sha256"): rep.fail("%s: record %s statement does not match its hash" % (day, lid)); continue
                signed_bytes = check_statement(rep, day, lid, e)
                if signed_bytes is None: continue
        if shown: n_content += 1
        if l.get("pubkey") or l.get("sig"):
            try: raw, sig = base64.b64decode(l.get("pubkey") or "", validate=True), base64.b64decode(l.get("sig") or "", validate=True)
            except ValueError: rep.fail("%s: %s %s carries a key or signature that is not base64" % (day, one, lid)); continue
            if len(raw) != 32 or len(sig) != 64: rep.fail("%s: %s %s key or signature has the wrong length" % (day, one, lid)); continue
            if fingerprint_of_raw(raw) != l.get("key_fingerprint"): rep.fail("%s: %s %s key fingerprint does not match its public key" % (day, one, lid)); continue
            if not full_order_key(raw): rep.fail("%s: %s %s key is not a canonical Ed25519 key of full order: its signatures would prove nothing" % (day, one, lid)); continue
            if signed_bytes is not None:
                if ed25519_verify(raw, signed_bytes, sig): n_sig += 1
                else: rep.fail("%s: %s %s signature does NOT verify over its %s" % (day, one, lid, "content" if many == "entries" else "statement"))
            else: rep.note("%s: %s %s is %s; its signature covers text that is not shown — the key fingerprint was checked" % (day, one, lid, e.get("state")))
    extra_ids = sorted(set(entries) - set(ids), key=lambda x: (x is None, str(x)))
    if extra_ids: rep.fail("%s: %s %s in the snapshot but not in the hashed lines" % (day, one if len(extra_ids) == 1 else many, ", ".join(str(x) for x in extra_ids)))
    what = "content" if many == "entries" else "statement"
    if n_content: rep.ok("%s: %s" % (day, ("1 %s matches its hash" % one) if n_content == 1 else "%d %s match their hashes" % (n_content, many)))
    if n_sig: rep.ok("%s: %s" % (day, ("1 signed %s: its Ed25519 signature verifies over its %s" % (one, what)) if n_sig == 1 else "%d signed %s: each Ed25519 signature verifies over its %s" % (n_sig, many, what)))
    # the anchor outside the snapshot: the exact bytes and their timestamp proof, beside it or in the repository
    where = "in the repository" if ctx.get("independent") else "beside it"
    if extra.get("log") is not None:
        rep.check(extra["log"] == data, "%s: the copy %s holds exactly the hashed bytes" % (day, where), "%s: the copy %s (%s) differs from this day's hashed bytes" % (day, where, sha256(extra["log"])))
    if extra.get("ots") is not None: verify_ots(rep, extra["ots"], data, day + ".log")
    elif ctx.get("independent") and extra.get("log") is None: rep.pending("%s: no copy in the repository yet — this day's hash is anchored by nothing outside the site" % day)
    else: rep.pending("%s: no timestamp proof %s — this day's hash is anchored only by copies you hold elsewhere" % (day, where))

def load_days(paths):
    """Snapshots from files and directories: {date}.json, with {date}.log and {date}.log.ots beside it when present.
    Every path must yield at least one snapshot (else a usage error)."""
    found = []
    for p in paths:
        if not os.path.exists(p): raise UsageError("--days: no such file or directory: " + p)
        files = [os.path.join(p, f) for f in sorted(os.listdir(p))] if os.path.isdir(p) else [p]
        got = 0
        for f in files:
            base = os.path.basename(f)
            if not re.fullmatch(r"\d{4}-\d\d-\d\d\.json", base): continue
            with open(f, "rb") as fh: snap = json.loads(fh.read())
            extra = {}
            for k, suffix in (("log", ".log"), ("ots", ".log.ots")):
                g = f[:-5] + suffix
                if os.path.isfile(g):
                    with open(g, "rb") as fh: extra[k] = fh.read()
            found.append((snap, extra, base)); got += 1
        if not got: raise UsageError("--days: no daily snapshot (YYYY-MM-DD.json) in " + p + " — bundles and --site options go before --days")
    return found

def _next(d, n=1): return (datetime.date.fromisoformat(d) + datetime.timedelta(days=n)).isoformat()
def _span(a, b, one, many):
    """'The day A <one>' or 'The days A to B <many>'."""
    return ("The day %s %s" % (a, one)) if a == b else ("The days %s to %s %s" % (a, b, many))

def due_day(now=None):
    """The last day every copy should have hashed by now: yesterday (UTC) from 01:00 UTC on (the site hashes at 00:20 UTC), else the day before."""
    now = now or datetime.datetime.now(datetime.timezone.utc)
    return (now - datetime.timedelta(days=1 if now.hour >= 1 else 2)).date().isoformat()

def chain_of_data(snap):
    """The chains a snapshot's data belongs to — by its hashed lines (content_sha256: discussion; statement_sha256: register)
    or, for a day without lines, by its items (entries or records). The "chain" field is not hashed, so it decides nothing."""
    kinds = set()
    for l in (snap.get("log") or {}).get("lines") or []:
        try: o = json.loads(l)
        except (ValueError, TypeError): kinds.add("?"); continue
        if not isinstance(o, dict): kinds.add("?")
        elif "content_sha256" in o and "statement_sha256" not in o: kinds.add("discussion")
        elif "statement_sha256" in o and "content_sha256" not in o: kinds.add("register")
        else: kinds.add("?")
    if not kinds:   # a day without lines: its items decide; a genuine snapshot always carries exactly one of the two lists
        keys = {k for k in ("entries", "records") if k in snap}
        kinds.add("discussion" if keys == {"entries"} else "register" if keys == {"records"} else "?")
    return kinds

def verify_days(rep, days, label, independent=False, complete=False, chain=None):
    """chain: the chain fetched (with --site); otherwise each snapshot's data decides.
    complete: the days are a site's whole chain as its index lists it, so every day from the first day (pinned, else the first
    served) to the day due must be there."""
    wrong, eff = [], []
    for s, x, f in days:
        kinds = chain_of_data(s); declared = s.get("chain"); name = f or str(s.get("day"))
        data = next(iter(kinds)) if len(kinds) == 1 and "?" not in kinds else None
        if "?" in kinds or len(kinds) > 1:
            wrong.append(("%s: its lines are not all lines of one chain" if (s.get("log") or {}).get("lines") else "%s: a day without lines that carries neither or both of \"entries\" and \"records\" — no chain can be told from it") % name)
        c = chain or data or "discussion"   # never the label: it is not hashed
        if declared is not None and declared != c and (chain or data): wrong.append("%s: labelled %r, but %s" % (name, declared, ("it was fetched as the " + c + " chain") if chain else ("its data is the " + c + " chain's")))
        if data is not None and data != c: wrong.append("%s: fetched as the %s chain, but its data is the %s chain's" % (name, c, data))
        eff.append(c)
    chains = set(eff) or ({chain} if chain else set())
    if days: rep.section(("/".join(sorted(map(str, chains)))) + " — " + label)
    for w in wrong: rep.fail(w)
    if len(chains) != 1 or not chains <= set(CHAINS): rep.fail("the snapshots supplied belong to %s; check one chain at a time" % ", ".join(sorted(map(str, chains)))); return
    chain = chains.pop(); first = FIRST_DAY.get(chain)
    if wrong: return
    by_day = {}
    for s, x, f in days:
        d = s.get("day")
        if not isinstance(d, str) or not re.fullmatch(r"\d{4}-\d\d-\d\d", d): rep.fail("a snapshot without a valid day (%s)" % (f or "?")); return
        if f and f != d + ".json": rep.fail("%s holds the day %s" % (f, d))
        if d in by_day:
            if canonical_json(by_day[d][0]) != canonical_json(s): rep.fail("%s: two different snapshots of the same day" % d)
            else: rep.note("%s: supplied twice (identical)" % d)
            continue
        by_day[d] = (s, x)
    order = sorted(by_day)
    if first and order and order[0] < first: rep.fail("%s: earlier than the first day of the chain (%s)" % (order[0], first))
    if first and order and order[0] > first:
        if complete: rep.fail("%s: the chain began on %s and every day is hashed, so a missing day is a removal" % (_span(first, _next(order[0], -1), "is missing", "are missing"), first))
        else: rep.pending("%s: this chain is checked from %s only — supply every day from %s to check it from its first day" % (_span(first, _next(order[0], -1), "was not supplied", "were not supplied"), order[0], first))
    start = first or (order[0] if order else None)   # a chain whose first day is not pinned yet: from its first day served
    if complete and start:
        now = datetime.datetime.now(datetime.timezone.utc); due = due_day(now); last = order[-1] if order else None
        if due >= start and (last is None or last < due):
            frm = start if last is None else _next(last)
            rep.fail("%s: every finished day is hashed by 00:20 UTC the next day, and %s (this computer's clock: %s UTC)" % (_span(frm, due, "is not served", "are not served"), ("the last day served is " + last) if last else "no day is served", now.strftime("%Y-%m-%d %H:%M")))
    if not order: return
    prev = None; after_gap = False
    for i, d in enumerate(order):
        s, x = by_day[d]
        expected = (datetime.date.fromisoformat(d) - datetime.timedelta(days=1)).isoformat()
        prev_snap = None
        if i > 0:
            if order[i - 1] == expected: prev_snap = by_day[order[i - 1]][0]
            else:
                gap_from = (datetime.date.fromisoformat(order[i - 1]) + datetime.timedelta(days=1)).isoformat()
                rep.fail("%s: %s missing — every day is hashed, so a gap is a removal" % (d, ("the day " + gap_from + " is") if gap_from == expected else ("the days " + gap_from + " to " + expected + " are")))
                after_gap = True
        verify_day(rep, s, prev_snap, x, {"chain": chain, "first": first, "first_supplied": i == 0, "has_successor": i < len(order) - 1, "after_gap": after_gap and prev_snap is None, "independent": independent})

def site_days(src, repo, rep, chain):
    """The days the site serves for one chain, each with the repository's copy of its bytes and proof (when repo is given),
    and whether it serves an index of the chain at all (then the index is a claim to the whole chain)."""
    c = CHAINS[chain]
    raw = src.get(c["dir"] + ".json")
    try: idx = json.loads(raw) if raw is not None else None
    except ValueError: idx = None
    if not isinstance(idx, dict) or not isinstance(idx.get("days", []), list):
        what = "no index of this chain" if raw is None else "no readable index of this chain (not the expected JSON)"
        if FIRST_DAY.get(chain) and is_origin(src.base): rep.fail("the record's own site serves %s at /%s.json — the chain exists since %s" % (what, c["dir"], FIRST_DAY[chain]))
        elif FIRST_DAY.get(chain): rep.pending("this copy serves %s at /%s.json: a static mirror holds the record, not the chain — check the chain with --site %s or with --days on the repository's %s" % (what, c["dir"], ORIGIN, c["repo"]))
        else: rep.note("this copy serves %s at /%s.json" % (what, c["dir"]))
        return [], False
    if idx.get("state") == "closed" and not idx.get("days"): rep.note("the %s is not open and serves no days" % ("room" if chain == "discussion" else "register")); return [], True
    out, listed = [], set()
    for d in idx.get("days", []):
        day = d.get("day", "") if isinstance(d, dict) else ""
        if not re.fullmatch(r"\d{4}-\d\d-\d\d", str(day)): rep.fail("the index lists an invalid day %r" % (day or d,)); continue
        if day in listed: rep.fail("%s: listed twice in the index" % day); continue
        listed.add(day)
        b = src.get("%s/%s.json" % (c["dir"], day))
        if b is None: rep.fail("%s: listed in the index but not served" % day); continue
        snap = json.loads(b)
        if snap.get("day") != day: rep.fail("%s: the snapshot served there is for %s" % (day, snap.get("day")))
        if (snap.get("log") or {}).get("sha256") != d.get("sha256"): rep.fail("%s: the snapshot's hash differs from the index" % day)
        extra = {}
        if repo is not None:
            try: extra = {"log": repo.get("%s/%s.log" % (c["repo"], day)), "ots": repo.get("%s/%s.log.ots" % (c["repo"], day))}
            except Exception as e: rep.note("%s: the repository's copy could not be fetched (%s)" % (day, type(e).__name__)); extra = {"log": None, "ots": None}
        out.append((snap, extra, None))
    return out, True

# ================================================================ main
class UsageError(Exception): pass

def self_test(rep):
    rep.section("self-test — Ed25519, RFC 8032 section 7.1")
    for i, (pk, m, s) in enumerate(RFC8032, 1):
        pk, m, s = bytes.fromhex(pk), bytes.fromhex(m), bytes.fromhex(s)
        rep.check(ed25519_verify(pk, m, s), "test %d verifies" % i, "test %d does NOT verify" % i)
        bad = bytearray(s); bad[i] ^= 1
        rep.check(not ed25519_verify(pk, m, bytes(bad)), "test %d with one bit changed is rejected" % i, "test %d with one bit changed was accepted" % i)
        rep.check(not ed25519_verify(pk, m + b"x", s), "test %d with a changed message is rejected" % i, "test %d with a changed message was accepted" % i)

def parse_args(argv):
    opts = {"bundles": [], "days": [], "fingerprint": ANCHOR_FINGERPRINT, "repo_raw": REPO_RAW}
    i, in_days = 0, False
    while i < len(argv):
        a = argv[i]
        if a in ("-h", "--help"): opts["help"] = True
        elif a in ("--json", "--quiet", "--strict", "--self-test"): opts[a[2:].replace("-", "_")] = True; in_days = False
        elif a in ("--site", "--site-dir", "--fingerprint", "--repo-raw"):
            if i + 1 >= len(argv): raise UsageError(a + " needs a value")
            opts[a[2:].replace("-", "_")] = argv[i + 1]; i += 1; in_days = False
        elif a == "--days": in_days = True
        elif a.startswith("-"): raise UsageError("unknown option " + a)
        elif in_days: opts["days"].append(a)
        else: opts["bundles"].append(a)
        i += 1
    if opts.get("site") and not opts["site"].startswith("https://"): raise UsageError("--site takes an https:// address")
    if opts["repo_raw"] != "none" and not opts["repo_raw"].startswith("https://"): raise UsageError("--repo-raw takes an https:// address or none")
    opts["fingerprint"] = (opts["fingerprint"] or "").lower()
    if not re.fullmatch(r"[0-9a-f]{64}", opts["fingerprint"]): raise UsageError("--fingerprint takes 64 hex digits")
    return opts

def main(argv):
    try:
        opts = parse_args(argv)
        if opts.get("help"): print(__doc__); return 0
        if not (opts["bundles"] or opts.get("site") or opts.get("site_dir") or opts["days"] or opts.get("self_test")):
            here = os.path.dirname(os.path.abspath(__file__))
            if os.path.isfile(os.path.join(here, "..", "README-BUNDLE.txt")): opts["bundles"] = [os.path.join(here, "..")]
            else: print(__doc__); return 2
        for b in opts["bundles"]:
            if not os.path.exists(b): raise UsageError("no such file or directory: " + b)
        days = load_days(opts["days"]) if opts["days"] else []
    except UsageError as e:
        print("cz-verify: " + clean(e), file=sys.stderr); return 2
    anchor = opts["fingerprint"]
    rep = Report(opts.get("quiet"), opts.get("json"))
    if not opts.get("json"): print("cz-verify %s — trust anchor: key fingerprint %s\n(compare it with a copy you obtained elsewhere: the DOI deposit, the repository, a printed copy, the second key-holder)" % (VERSION, anchor))
    try:
        if opts.get("self_test"): self_test(rep)
        for a in opts["bundles"]:
            if os.path.isdir(a):
                src = DirSource(a, "bundle")
                res = verify_record(src, rep, anchor, "bundle directory " + a)
                for p in src.problems: rep.fail(p)
                rep.pending("an unpacked bundle: its own signature cannot be checked here — check the .tar and its .sig before unpacking")
            else:
                with open(a, "rb") as fh: data = fh.read()
                sig = None
                if os.path.isfile(a + ".sig"):
                    with open(a + ".sig", "rb") as fh: sig = fh.read()
                check_bundle(rep, os.path.basename(a), data, sig, anchor)
        if opts.get("site_dir"):
            src = DirSource(opts["site_dir"], "site")
            res = verify_record(src, rep, anchor, "site copy " + opts["site_dir"])
            if res: verify_site_bundles(src, rep, anchor)
            for p in src.problems: rep.fail(p)
            rep.note("a static copy holds no daily snapshots; check the chains with --site, or --days on the repository's archive/discussion and archive/register")
        if opts.get("site"):
            src = HttpSource(opts["site"])
            res = verify_record(src, rep, anchor, opts["site"])
            if res: verify_site_bundles(src, rep, anchor)
            repo = None if opts["repo_raw"] == "none" else HttpSource(opts["repo_raw"])
            for chain in ("discussion", "register"):
                rep.section(chain + " — " + opts["site"])
                got, served = site_days(src, repo, rep, chain)
                verify_days(rep, got, opts["site"] + " (as served now)" + ("" if repo else "; repository copies not consulted"), independent=repo is not None, complete=served, chain=chain)
        if days: verify_days(rep, days, ", ".join(opts["days"]))
    except Exception as e:   # a malformed input is a failure of the input, reported as such
        rep.section("error"); rep.fail("%s: %s" % (type(e).__name__, e))
    c = rep.counts()
    failed = c["FAIL"] > 0 or (opts.get("strict") and c["PENDING"] > 0)
    if opts.get("json"):
        print(json.dumps({"verifier": "cz-verify " + VERSION, "trust_anchor": anchor, "summary": c, "strict": bool(opts.get("strict")),
                          "result": "fail" if failed else ("pass, with items not verified here" if c["PENDING"] or c["CHECK"] else "pass"), "items": rep.items}, ensure_ascii=True, indent=1))
    else:
        tail = " — FAILED" if c["FAIL"] else (" — nothing failed" + ("; %d item(s) could not be verified here (PENDING)" % c["PENDING"] if c["PENDING"] else "") + ("; %d need a check against Bitcoin (CHECK)" % c["CHECK"] if c["CHECK"] else ""))
        if opts.get("strict") and c["PENDING"] and not c["FAIL"]: tail += " — counted as a failure (--strict)"
        print("\nsummary: " + ", ".join("%d %s" % (c[k], k) for k in LEVELS) + tail)
    return 1 if failed else 0

if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
