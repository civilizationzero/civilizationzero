#!/usr/bin/env python3
"""Build-time verification for civilizationzero.ai (Blueprint 1.3.1 §10). Exits non-zero on any drift.
Run by build.py; can be run alone: python3 site/check.py"""
import json, pathlib, re, sys, tarfile
from html.parser import HTMLParser
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from lib import *

fails = []
def check(cond, msg):
    if not cond: fails.append(msg)

# 1. canonical bytes and reconstructions
check((PUBLIC / "core.txt").read_bytes() == CORE_BYTES, "core.txt is not the canonical bytes")
check((PUBLIC / "record.txt").read_bytes() == IR_BYTES, "record.txt is not the canonical bytes")
check(core_reconstruct() == CORE_TXT, "CZ-CORE-1.0.json does not reconstruct the canonical text")
check(ir_reconstruct() == IR_TXT, "CZ-IR-1.0.txt parse does not reconstruct the canonical text")
cj = json.loads((PUBLIC / "core.json").read_text("utf-8"))
check(cj["sha256_of_core_txt"] == CORE_SHA and cj["canonical_url"] == f"{ORIGIN}/core", "core.json metadata")
rj = json.loads((PUBLIC / "record.json").read_text("utf-8"))
check(rj["sha256_of_record_txt"] == IR_SHA and rj["declaration"] == declaration_lines(), "record.json metadata")

# 2. every HTML page
class P(HTMLParser):
    VOID = {"br", "meta", "link", "img", "hr", "input", "source", "path", "col", "wbr"}
    def __init__(self):
        super().__init__(); self.stack = []; self.err = []; self.ids = set(); self.hrefs = []; self.times = []; self.h1 = 0; self.lang = None; self.attrs_seen = set()
    def handle_starttag(self, t, a):
        a = dict(a)
        if t == "html": self.lang = a.get("lang")
        if "id" in a: self.ids.add(a["id"])
        if t == "a" and "href" in a: self.hrefs.append(a["href"])
        if t == "time": self.times.append(a.get("datetime", ""))
        if t == "h1": self.h1 += 1
        if t == "meta": self.attrs_seen.add(a.get("charset") or a.get("name"))
        if t == "link": self.attrs_seen.add(a.get("rel"))
        if t not in self.VOID: self.stack.append(t)
    def handle_endtag(self, t):
        if t in self.VOID: return
        if self.stack and self.stack[-1] == t: self.stack.pop()
        else: self.err.append((t, self.stack[-3:]))

FUNCTION_ROUTES = {"/", "/index.json", "/index.txt", "/api/entries"}
def resolves(path):
    if path in FUNCTION_ROUTES or re.match(r"^/api/entries/\d+$", path): return True
    p = path.lstrip("/")
    return (PUBLIC / p).exists() or (PUBLIC / (p + ".html")).exists()

pages = sorted(PUBLIC.glob("*.html")) + [SITE / "preview" / "index.html"]
ids_by_page = {}
parsed = {}
for f in pages:
    h = f.read_text("utf-8"); p = P(); p.feed(h); parsed[f] = p
    name = "/" if f.name == "index.html" else "/" + f.stem
    ids_by_page[name] = p.ids
    check(not p.err and not p.stack, f"{f.name}: HTML nesting {p.err} unclosed {p.stack}")
    check(p.h1 == 1, f"{f.name}: {p.h1} h1 elements")
    check(p.lang == "en", f"{f.name}: lang")
    check({"utf-8", "viewport", "description", "canonical", "icon", "service-desc"} <= p.attrs_seen, f"{f.name}: head metadata {p.attrs_seen}")
    for t in p.times:
        check(re.fullmatch(r"\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?Z)?|P\d+D", t), f"{f.name}: invalid datetime {t!r}")
    for bad in ("civilization0.ai", "observator", "N-H", "N-M", "N-F", "__YEAR__", "__ASOF"):
        check(bad not in h, f"{f.name}: forbidden string {bad!r}")
    noscript = re.sub(r"<(script|style).*?</\1>", "", h, flags=re.S)
    check("{{" not in noscript and "}}" not in noscript, f"{f.name}: unexpanded braces")
    for m in re.findall(r'<script type="application/ld\+json">(.*?)</script>', h, re.S):
        try: json.loads(m)
        except Exception as e: fails.append(f"{f.name}: JSON-LD {e}")
    check(len(to_text(h)) > 500, f"{f.name}: text extraction too short")
# links and fragments, after all ids are known
for f, p in parsed.items():
    for href in p.hrefs:
        if href.startswith(("http", "mailto:")): continue
        path, _, frag = href.partition("#")
        if path == "" : path = "/" if f.name == "index.html" else "/" + f.stem
        check(resolves(path), f"{f.name}: dead link {href}")
        if frag:
            target = "/" if path in ("/", "") else path
            if target in ids_by_page: check(frag in ids_by_page[target], f"{f.name}: missing anchor {href}")

# 3. data files
for name in ("core.json", "record.json", "core.schema.json", "discuss.json", "api/openapi.json", ".well-known/civilization-zero.json"):
    try: json.loads((PUBLIC / name).read_text("utf-8"))
    except Exception as e: fails.append(f"{name}: {e}")
man = json.loads((PUBLIC / ".well-known/civilization-zero.json").read_text("utf-8"))
check({d["sha256"] for d in man["documents"]} == {CORE_SHA, IR_SHA}, "manifest hashes")
check(man["signature"]["status"] in ("pending", "key published; signatures pending", "signed") and man["discussion"]["state"] == "closed", "manifest states")
oa = json.loads((PUBLIC / "api/openapi.json").read_text("utf-8"))
check("/api/entries" in oa["paths"] and "429" in oa["paths"]["/api/entries"]["post"]["responses"], "openapi contract")
dj = json.loads((PUBLIC / "discuss.json").read_text("utf-8"))
check(dj["state"] == "closed" and dj["entries"] == [], "discuss.json closed state")
llms = (PUBLIC / "llms.txt").read_text("utf-8")
check(CORE_SHA in llms and IR_SHA in llms, "llms.txt hashes")
prompt = sorted((PUBLIC / "prompts").glob("*.txt"))[0].read_bytes()
check(sha256(prompt) == man["machine_prompt"]["sha256"], "prompt hash in manifest")

# 4. the home templates: filling them must give valid output
T = json.loads((SITE / "api" / "home-templates.json").read_text("utf-8"))
sample = {"__YEAR__": "3", "__DAYS_IN_YEAR__": "332", "__TOTAL__": "1428", "__TOTAL_FMT__": "1,428", "__NEXT_YEAR__": "4", "__NEXT_ISO__": "2026-11-30",
          "__NEXT_HUMAN__": "30 November 2026", "__ASOF_ISO__": "2026-10-28T10:00Z", "__ASOF_HUMAN__": "2026-10-28 10:00 UTC"}
def fill(s):
    for k in ("__TOTAL_FMT__", "__YEAR__", "__DAYS_IN_YEAR__", "__TOTAL__", "__NEXT_YEAR__", "__NEXT_ISO__", "__NEXT_HUMAN__", "__ASOF_ISO__", "__ASOF_HUMAN__"):
        s = s.replace(k, sample[k])
    return s
for ext in ("html", "json", "txt"):
    filled = fill(T[ext])
    check("__" not in re.sub(r"https?://\S+", "", filled), f"home template {ext}: placeholder left")
    if ext == "json":
        try:
            o = json.loads(filled); check(o["year"] == 3 and o["elapsed"]["total_days"] == 1428, "home json numbers")
        except Exception as e: fails.append(f"home json: {e}")
# every quotation in the home template is verbatim (build asserts it; re-check the emitted bytes)
for m in re.findall(r'<blockquote cite="/core#[^"]+" data-src="R"><p>(.*?)</p>', T["html"], re.S):
    import html as _h
    check(_h.unescape(m) in CORE_TXT, f"home: quotation drifted: {m[:50]}")
decl_html = re.search(r'<blockquote cite="/record#declaration" data-src="R"><p>\n(.*?)\n</p>', T["html"], re.S).group(1)
check([_h.unescape(l) for l in decl_html.split("<br>\n")] == declaration_lines(), "home: Declaration not whole")
# the POST example parses
ex = re.search(r"<pre>POST.*?\n(\{.*?\})</pre>", T["html"], re.S).group(1)
try: json.loads(_h.unescape(ex))
except Exception as e: fails.append(f"home POST example: {e}")
ex2 = re.search(r"<pre>POST.*?\n(\{.*?\})</pre>", (PUBLIC / "machine.html").read_text("utf-8"), re.S).group(1)
try: json.loads(_h.unescape(ex2))
except Exception as e: fails.append(f"machine POST example: {e}")

# 5. the bundle
b = sorted((PUBLIC / "archive").glob("cz-bundle-*.tar"))[0]
with tarfile.open(b) as tar:
    names = tar.getnames()
    check("record/CZ-CORE-1.0.txt" in names and "README-BUNDLE.txt" in names and ".well-known/civilization-zero.json" in names, "bundle members")
    check(sha256(tar.extractfile("record/CZ-CORE-1.0.txt").read()) == CORE_SHA, "bundle core hash")
    check(sha256(tar.extractfile("record/CZ-IR-1.0.txt").read()) == IR_SHA, "bundle IR hash")
check(man["bundle"]["sha256"] == sha256(b.read_bytes()), "bundle hash in manifest")

# 5b. signatures: every .sig published must verify against the published public key
import subprocess
pub = PUBLIC / ".well-known" / "cz-record-signing.pub"
sigs = sorted(PUBLIC.rglob("*.sig"))
check(not sigs or pub.exists(), "signatures published without a public key")
for sg in sigs:
    target = sg.with_suffix("") if sg.suffix == ".sig" else None
    target = pathlib.Path(str(sg)[:-4])
    r = subprocess.run(["openssl", "pkeyutl", "-verify", "-pubin", "-inkey", str(pub), "-rawin", "-in", str(target), "-sigfile", str(sg)], capture_output=True)
    check(r.returncode == 0, f"signature does not verify: {sg.relative_to(PUBLIC)}")
if pub.exists():
    der = subprocess.run(["openssl", "pkey", "-pubin", "-in", str(pub), "-outform", "DER"], capture_output=True, check=True).stdout
    check(sha256(der) == man["signature"]["key_fingerprint"], "manifest fingerprint does not match the published public key")
rel = json.loads((PUBLIC / ".well-known" / "cz-release-1.0.json").read_text("utf-8"))
check(rel["documents"][0]["sha256"] == CORE_SHA and rel["documents"][1]["sha256"] == IR_SHA, "release manifest hashes")
check(man["signature"]["release_manifest_sha256"] == sha256((PUBLIC / ".well-known" / "cz-release-1.0.json").read_bytes()), "release manifest hash in manifest")

# 6. vercel.json and the functions exist
v = json.loads((SITE / "vercel.json").read_text("utf-8"))
check(any(r.get("source") == "/" and "has" in r for r in v.get("rewrites", [])), "vercel.json: content negotiation for /")
check((SITE / "api" / "home.js").exists() and (SITE / "api" / "entries.js").exists(), "functions missing")
check(not (PUBLIC / "index.html").exists(), "public/index.html must not exist (the function serves /)")

if fails:
    print("CHECK FAILED"); [print(" -", f) for f in fails]; sys.exit(1)
print(f"check passed: {len(pages)} pages, {sum(len(p.hrefs) for p in parsed.values())} links, bundle {b.name}")
