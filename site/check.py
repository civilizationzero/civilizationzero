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

FUNCTION_ROUTES = {"/", "/index.json", "/index.txt", "/api/entries", "/discuss", "/discuss.json", "/respond", "/api/moderation", "/api/cron/daily", "/archive/entries.json",
                   "/adopt", "/adopt.json", "/api/adopt", "/archive/register.json", "/api/calendar", "/calendar.json"}
def resolves(path):
    if any(path == f"/themes/{t['slug']}" for t in THEMES): return True   # a theme's page, served by the room's function
    if path in FUNCTION_ROUTES or re.match(r"^/(api/entries|discuss|adopt)/\d+$", path) or re.match(r"^/archive/(entries|register)/\d{4}-\d{2}-\d{2}\.json$", path): return True
    p = path.lstrip("/")
    return (PUBLIC / p).exists() or (PUBLIC / (p + ".html")).exists()

pages = sorted(PUBLIC.glob("*.html")) + [SITE / "preview" / "index.html"]
DT = json.loads((SITE / "api" / "discuss-templates.json").read_text("utf-8"))
def dshell(title, body, path): return DT["shell"].replace("__TITLE__", title).replace("__DESC__", "d").replace("__PATH__", path).replace("__HEAD__", "").replace("__BODY__", body)
VIRTUAL = {"discuss.html": dshell("The open discussion", DT["closed"], "/discuss"),
           "discuss-open.html": dshell("The open discussion", "<main><h1>The open discussion</h1><p>x</p>" + DT["rules"] + "</main>", "/discuss"),
           "respond.html": dshell("Respond", DT["respond_closed"], "/respond"), "respond-open.html": dshell("Respond", DT["respond_open"], "/respond")}
check(DT["open"] == ROOM_OPEN and DT["opens_not_later_than"] == "2026-11-30" and (not ROOM_OPEN or DT["opened"]), "discuss templates state")
ids_by_page = {}
parsed = {}
for f in pages + [pathlib.Path("virtual") / n for n in VIRTUAL]:
    h = VIRTUAL[f.name] if f.parent.name == "virtual" else f.read_text("utf-8"); p = P(); p.feed(h); parsed[f] = p
    name = "/" if f.name == "index.html" else "/" + f.stem.replace("-open", "")
    ids_by_page[name] = p.ids
    check(not p.err and not p.stack, f"{f.name}: HTML nesting {p.err} unclosed {p.stack}")
    check(p.h1 == 1, f"{f.name}: {p.h1} h1 elements")
    expected_lang = f.stem.split(".")[1] if f.stem.startswith("core.") and f.stem.count(".") == 1 else "en"
    check(p.lang == expected_lang, f"{f.name}: lang {p.lang!r}, expected {expected_lang!r}")
    check({"utf-8", "viewport", "description", "icon", "service-desc"} | ({"canonical"} if f.name != "404.html" else set()) <= p.attrs_seen, f"{f.name}: head metadata {p.attrs_seen}")
    for t in p.times:
        check(re.fullmatch(r"\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?Z)?|P\d+D", t), f"{f.name}: invalid datetime {t!r}")
    for bad in ("civilization0.ai", "observator", "N-H", "N-M", "N-F", "__YEAR__", "__ASOF"):
        check(bad not in h, f"{f.name}: forbidden string {bad!r}")
    noscript = re.sub(r"<(script|style).*?</\1>", "", h, flags=re.S)
    check("{{" not in noscript and "}}" not in noscript, f"{f.name}: unexpanded braces")
    for m in re.findall(r'<script type="application/ld\+json">(.*?)</script>', h, re.S):
        try: json.loads(m)
        except Exception as e: fails.append(f"{f.name}: JSON-LD {e}")
    check(len(to_text(h)) > 500 or f.parent.name == "virtual", f"{f.name}: text extraction too short")
# links and fragments, after all ids are known
for f, p in parsed.items():
    for href in p.hrefs:
        if href.startswith(("http", "mailto:")): continue
        path, _, frag = href.partition("#")
        path = path.partition("?")[0]   # a query names a view of a page the function serves (/discuss?ref=6), not another page
        if path == "" : path = "/" if f.name == "index.html" else "/" + f.stem
        check(resolves(path), f"{f.name}: dead link {href}")
        if frag:
            target = "/" if path in ("/", "") else path
            if target in ids_by_page: check(frag in ids_by_page[target], f"{f.name}: missing anchor {href}")

# 2b. for indexers and link previews (Blueprint §3.1): each page names its address and its preview; the Core's languages link
# to each other both ways; the sitemaps list every public page; the not-found page is not for indexing
import struct, xml.etree.ElementTree as ET
core_cluster = sorted(PUBLIC.glob("core*.html"))
cluster_links = {f'<link rel="alternate" hreflang="en" href="{ORIGIN}/core">', f'<link rel="alternate" hreflang="x-default" href="{ORIGIN}/core">'} | \
    {f'<link rel="alternate" hreflang="{f.stem.split(".", 1)[1]}" href="{ORIGIN}/{f.stem}">' for f in core_cluster if "." in f.stem}
canonicals = set()
for f in pages + [pathlib.Path("virtual") / n for n in VIRTUAL]:
    h = VIRTUAL[f.name] if f.parent.name == "virtual" else f.read_text("utf-8")
    if f.name == "404.html":
        check('<meta name="robots" content="noindex">' in h and 'rel="canonical"' not in h, "404.html: noindex and no canonical address"); continue
    canon = re.search(r'<link rel="canonical" href="([^"]+)">', h)
    check(canon and f'<meta property="og:url" content="{canon.group(1)}">' in h, f"{f.name}: og:url is not the canonical address")
    if canon: canonicals.add(canon.group(1))
    check(f'<meta property="og:image" content="{ORIGIN}/og.png">' in h and '<meta name="twitter:card" content="summary_large_image">' in h, f"{f.name}: link-preview metadata")
    check(h.count("<title>") == 1 and "__TITLE__" not in h.split("<body>")[0], f"{f.name}: one title")
    if f in core_cluster: check(cluster_links <= set(re.findall(r'<link rel="alternate" hreflang="[^"]+" href="[^"]+">', h)), f"{f.name}: hreflang group incomplete")
sm = ET.fromstring((PUBLIC / "sitemap.xml").read_bytes())
NS = "{http://www.sitemaps.org/schemas/sitemap/0.9}"
locs = [u.find(NS + "loc").text for u in sm.findall(NS + "url")]
check(len(locs) == len(set(locs)) and canonicals - {f"{ORIGIN}/discuss", f"{ORIGIN}/respond"} <= set(locs) and {f"{ORIGIN}/discuss", f"{ORIGIN}/respond", f"{ORIGIN}/adopt"} <= set(locs),
      f"sitemap.xml: pages missing {sorted(canonicals - set(locs))}")
check((PUBLIC / "sitemap.txt").read_text("utf-8").split() == locs, "sitemap.txt and sitemap.xml differ")
rb = (PUBLIC / "robots.txt").read_text("utf-8")
check(f"Sitemap: {ORIGIN}/sitemap.xml" in rb and "Disallow: /admin" in rb, "robots.txt: sitemap and the administrator's page")
og = (PUBLIC / "og.png").read_bytes()
check(og[:8] == b"\x89PNG\r\n\x1a\n" and struct.unpack(">II", og[16:24]) == (1200, 630), "og.png: a 1200x630 PNG")
# the icons: every page names them; each file is what its name says (a PNG of its size; an ICO of 16, 32 and 48 pixels)
ICON_HEAD = ('<link rel="icon" href="/favicon-96x96.png" type="image/png" sizes="96x96"><link rel="icon" href="/favicon.svg" type="image/svg+xml">'
             '<link rel="shortcut icon" href="/favicon.ico"><link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180">'
             '<link rel="manifest" href="/site.webmanifest">')
for f in pages + [pathlib.Path("virtual") / n for n in VIRTUAL]:
    h = VIRTUAL[f.name] if f.parent.name == "virtual" else f.read_text("utf-8")
    check(h.split("</head>")[0].count(ICON_HEAD) == 1, f"{f.name}: the icon links")
def png_size(b): return struct.unpack(">II", b[16:24]) if b[:8] == b"\x89PNG\r\n\x1a\n" else None
for name, side in (("apple-touch-icon.png", 180), ("favicon-96x96.png", 96), ("icon-192.png", 192), ("icon-512.png", 512), ("icon-maskable-512.png", 512)):
    check(png_size((PUBLIC / name).read_bytes()) == (side, side), f"{name}: a {side}x{side} PNG")
ico = (PUBLIC / "favicon.ico").read_bytes()
reserved, kind, count = struct.unpack("<HHH", ico[:6])
check(reserved == 0 and kind == 1 and sorted((ico[6 + 16 * i] or 256) for i in range(count)) == [16, 32, 48], "favicon.ico: 16, 32 and 48 pixels")
check(re.fullmatch(r"[0-9a-f]{32}", INDEXNOW_KEY) and (PUBLIC / f"{INDEXNOW_KEY}.txt").read_text("utf-8") == INDEXNOW_KEY, "the IndexNow key file")
check(ATPROTO_DID is None or (re.fullmatch(r"did:plc:[a-z2-7]{24}", ATPROTO_DID) and (PUBLIC / ".well-known/atproto-did").read_text("utf-8") == ATPROTO_DID), "the Bluesky handle file")
# the originator's key: its fingerprint is the SHA-256 of its DER SubjectPublicKeyInfo, and /about publishes both exactly
import base64 as _b64, hashlib as _hl
_ok = json.loads((SITE / "room" / "originator.json").read_text("utf-8"))
_raw = _b64.b64decode(_ok["pubkey"], validate=True)
check(len(_raw) == 32 and _b64.b64encode(_raw).decode() == _ok["pubkey"], "the originator's key is 32 bytes in canonical base64")
check(_hl.sha256(bytes.fromhex("302a300506032b6570032100") + _raw).hexdigest() == _ok["fingerprint"], "the originator's key's fingerprint matches the key")
_about = (PUBLIC / "about.html").read_text("utf-8")
check(_ok["pubkey"] in _about and _ok["fingerprint"] in _about and 'id="originator-key"' in _about, "/about publishes the originator's key")
check(all(u.startswith("https://") for u in SOCIAL), "the project's accounts are https addresses")
# Mastodon checks the address in a profile's field for a rel="me" link back to the profile, on the page as it is served to it
# (the first page: /, through api/home.js); the author attribution names an account that is one of them
_m = re.fullmatch(r"@([A-Za-z0-9_]+)@([a-z0-9.-]+)", FEDIVERSE_CREATOR or "")
check(FEDIVERSE_CREATOR is None or (_m and f"https://{_m[2]}/@{_m[1]}" in SOCIAL), "the Mastodon author attribution names one of the project's accounts")
_heads = {p.name: p.read_text("utf-8") for p in PUBLIC.glob("*.html")}
_heads["/ (api/home.js)"] = json.loads((SITE / "api" / "home-templates.json").read_text("utf-8"))["html"]
_tag = f'<meta name="fediverse:creator" content="{FEDIVERSE_CREATOR}">' if FEDIVERSE_CREATOR else None
_miss = [n for n, h in _heads.items() if not all(f'<link rel="me" href="{u}">' in h for u in SOCIAL) or (_tag and _tag not in h)]
check(not _miss, f"every page carries the accounts' rel=\"me\" links and the author attribution (missing: {_miss[:5]})")
# the press kit, once published: every quotation in it (straight double quotes, 12 characters or more) is verbatim from the
# Core or the interpretive record, whitespace aside; the originator's notes and the draft status line are not on the page
if PRESS_PUBLISHED:
    _press = to_text((PUBLIC / "press.html").read_text("utf-8"))
    _norm = lambda t: re.sub(r"\s+", " ", t)
    _bad = [q for q in re.findall(r'"([^"]*)"', _press) if len(q) >= 12 and _norm(q) not in _norm(CORE_TXT) and _norm(q) not in _norm(IR_TXT)]
    check(not _bad, f"press: quotations not verbatim: {_bad[:3]}")
    check("Notes for the originator" not in _press and "draft, not yet released" not in _press, "press: the originator's notes and the draft line stay off the page")
svg = (PUBLIC / "favicon.svg").read_text("utf-8")
check(svg.startswith("<svg") and "prefers-color-scheme:dark" in svg, "favicon.svg: the mark, light and dark")
# the mark is one geometry (site/assets/mark.py, the originator's choice of 30 Oct 2026): the small drawing in the favicon, the large on
# the first page; the mark it replaced is gone from every page
_mo, _mz, _ = MARK_GEOMETRY.paths(MARK_GEOMETRY.SMALL); _lo, _lz, _ = MARK_GEOMETRY.paths(MARK_GEOMETRY.LARGE)
check(f'd="{_mo}"' in svg and f'd="{_mz}"' in svg and f'd="{_lo}"' in MARK and f'd="{_lz}"' in MARK and MARK_ALT in MARK, "the mark: favicon and page drawn from site/assets/mark.py")
check(all("M56.57,41.93" not in p.read_text("utf-8") and "ring left open" not in p.read_text("utf-8") for p in PUBLIC.rglob("*.html")), "the mark: the earlier ring and Z are on no page")
wm = json.loads((PUBLIC / "site.webmanifest").read_text("utf-8"))
check(wm["display"] == "browser" and wm["start_url"] == "/" and all(png_size((PUBLIC / i["src"].lstrip("/")).read_bytes()) == tuple(map(int, i["sizes"].split("x"))) for i in wm["icons"]),
      "site.webmanifest: its icons exist at the sizes it states")

# 3. data files
for name in ("core.json", "record.json", "core.schema.json", "api/openapi.json", ".well-known/civilization-zero.json", "objections.json"):
    try: json.loads((PUBLIC / name).read_text("utf-8"))
    except Exception as e: fails.append(f"{name}: {e}")
man = json.loads((PUBLIC / ".well-known/civilization-zero.json").read_text("utf-8"))
check({d["sha256"] for d in man["documents"]} == {CORE_SHA, IR_SHA}, "manifest hashes")
oj = json.loads((PUBLIC / "objections.json").read_text("utf-8"))
check(oj["total"] == len(oj["objections"]) == sum(oj["counts"].values()) and all(f'id="{o["id"]}"' in (PUBLIC / "objections.html").read_text("utf-8") for o in oj["objections"]), "objections: data and anchors")
check(man["signature"]["status"] in ("pending", "key published; signatures pending", "signed") and man["discussion"]["state"] == ("open" if ROOM_OPEN else "closed"), "manifest states")
oa = json.loads((PUBLIC / "api/openapi.json").read_text("utf-8"))
check("/api/entries" in oa["paths"] and "429" in oa["paths"]["/api/entries"]["post"]["responses"], "openapi contract")
check(not (PUBLIC / "discuss.json").exists() and not (PUBLIC / "discuss.html").exists() and not (PUBLIC / "respond.html").exists(), "discuss/respond must be served by the function, not static files")
llms = (PUBLIC / "llms.txt").read_text("utf-8")
check(CORE_SHA in llms and IR_SHA in llms, "llms.txt hashes")
prompt = sorted((PUBLIC / "prompts").glob("*.txt"))[0].read_bytes()
check(sha256(prompt) == man["machine_prompt"]["sha256"], "prompt hash in manifest")

# 4. the home templates: filling them must give valid output
T = json.loads((SITE / "api" / "home-templates.json").read_text("utf-8"))
sample = {"__YEAR__": "3", "__DAYS_IN_YEAR__": "332", "__TOTAL__": "1428", "__TOTAL_FMT__": "1,428", "__NEXT_YEAR__": "4", "__NEXT_ISO__": "2026-11-30",
          "__NEXT_HUMAN__": "30 November 2026", "__ASOF_ISO__": "2026-10-28T10:00Z", "__ASOF_HUMAN__": "2026-10-28 10:00 UTC",
          "__CZ_ISO__": "2026-10-28", "__CZ_STAMP__": "CZ 1428", "__CZ_DOYN__": "332", "__CZ_SINCE__": "3 years and 332 days", "__CZ_TO_NEXT_N__": "33", "__CZ_TO_NEXT__": "33 days", "__CZ_NEXT_DAY__": "1461"}
# the room's two places on the first page (Phase 1, 29 Oct 2026) are filled by api/home.js from the database, after the clock and
# last of all, so that nothing in an entry is ever filled again; with the database slow or down, both are left empty
import subprocess
ROOM_KEYS = ("__ROOM_COUNT__", "__ROOM_LATEST__")
def fill(s, room=("", "")):
    for k in ("__TOTAL_FMT__", "__YEAR__", "__DAYS_IN_YEAR__", "__TOTAL__", "__NEXT_YEAR__", "__NEXT_ISO__", "__NEXT_HUMAN__", "__ASOF_ISO__", "__ASOF_HUMAN__",
              "__CZ_ISO__", "__CZ_STAMP__", "__CZ_DOYN__", "__CZ_SINCE__", "__CZ_TO_NEXT_N__", "__CZ_TO_NEXT__", "__CZ_NEXT_DAY__"):
        s = s.replace(k, sample[k])
    for k, v in zip(ROOM_KEYS, room):
        s = s.replace(k, v)
    return s
ROOM_EVER = DT["open"] is True or bool(re.fullmatch(r"\d{4}-\d\d-\d\d", DT.get("opened") or ""))   # as room/lib.js's CHAIN
if ROOM_EVER:
    _hd, _rest = T["html"].split("</header>", 1)
    check(T["html"].count("__ROOM_COUNT__") == 1 and "__ROOM_COUNT__" in _hd.rsplit('<p class="room-line"', 1)[-1], "home: the room's line, with its count, is in the first screen (the header)")
    _disc = re.search(r'<section id="discussion".*?</section>', T["html"], re.S)
    check(T["html"].count("__ROOM_LATEST__") == 1 and _disc and "__ROOM_LATEST__" in _disc.group(0), "home: the latest entries are in the discussion section")
    check(T["html"].index('id="discussion"') < T["html"].index('id="h-decl"'), "home: the discussion follows the Core's lines, before the Declaration")
    # a preview as room/lib.js renders it, from entries that try to break out of their place (markup, a placeholder, a long text)
    _rows = [{"id": 3, "received": "2026-10-29T10:00:00+00:00", "state": "published", "author": "</p><script>x</script>", "kind": "ai", "system": "S __YEAR__", "operator": None,
              "prompt": None, "lang": "en", "ref": "6", "content": "Text with </article> and __ASOF_HUMAN__ " + "word " * 80, "content_sha256": "0" * 64, "declared_date": None,
              "key_fingerprint": None, "hidden": False},
             {"id": 2, "received": "2026-10-29T09:00:00+00:00", "state": "published", "author": "A", "kind": "human", "system": None, "operator": None, "prompt": None,
              "lang": None, "ref": None, "content": "Short.", "content_sha256": "1" * 64, "declared_date": None, "key_fingerprint": None, "hidden": False}]
    _r = subprocess.run(["node", "-e", "process.stdout.write(require(process.argv[1]).previewHtml(JSON.parse(process.argv[2])))", str(SITE / "room" / "lib.js"), json.dumps(_rows)],
                        capture_output=True, env={"PATH": "/usr/bin:/bin:/usr/local/bin", "CZ_SALT": "check-only-" + "0" * 32})
    check(_r.returncode == 0 and "<h3>The latest entries</h3>" in _r.stdout.decode(), f"home: the room's preview renders ({_r.stderr.decode()[:200]})")
    _prev = _r.stdout.decode()
    for _room in (("", ""), (' (<data value="2">2</data> entries)', _prev)):
        _pg = P(); _pg.feed(fill(T["html"], _room)); check(not _pg.err and not _pg.stack, f"home with the room {'filled' if _room[1] else 'empty'}: HTML nesting {_pg.err[:3]} {_pg.stack[-3:]}")
    check("<script>" not in _prev and "S __YEAR__" in _prev and "__ASOF_HUMAN__" in _prev and _prev.count('<article class="entry">') == 2, "home: the preview escapes entries, and is never filled again")
else:
    check(not any("__ROOM_" in T[x] for x in ("html", "json", "txt")), "home: no room placeholders before the room has opened")
check("__ROOM_" not in T["json"], "home: the data form carries no room placeholder (api/home.js reads the room for the page only; the text form's are left empty)")
for ext in ("html", "json", "txt"):
    filled = fill(T[ext])
    check("__" not in re.sub(r"https?://\S+", "", filled), f"home template {ext}: placeholder left")
    if ext == "json":
        try:
            o = json.loads(filled); check(o["year"] == 3 and o["elapsed"]["total_days"] == 1428 and o["cz_time"]["day"] == 1428 and o["cz_time"]["day_of_year"] == 332
                                          and o["cz_time"]["next_year_begins"] == {"date": "CZ 1461", "day": 1461, "in_days": 33} and o["cz_time"]["date"] == "CZ 1428", "home json numbers")
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
b = PUBLIC / "archive" / man["bundle"]["url"].rsplit("/", 1)[1]
check(b.exists(), "the manifest's bundle is not published")
for e in man["bundle"].get("earlier", []):
    eb = PUBLIC / "archive" / e["url"].rsplit("/", 1)[1]
    check(eb.exists() and sha256(eb.read_bytes()) == e["sha256"], f"earlier bundle {eb.name}: missing or hash drift")
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
for fn in ("api/home.js", "api/entries.js", "api/discuss.js", "api/archive.js", "api/moderation.js", "api/cron/daily.js", "api/adopt.js", "room/lib.js", "room/register.js"):
    check((SITE / fn).exists(), f"function missing: {fn}")
check(any(c.get("path") == "/api/cron/daily" for c in v.get("crons", [])), "vercel.json: daily cron")
check(any(r.get("source", "").startswith("/themes/:slug") and r.get("destination") == "/api/discuss?theme=:slug" for r in v.get("rewrites", [])), "vercel.json: /themes/<slug> → the room's function")
# the themes (Phase 2, 30 Oct 2026): each a slug, a title, the id of its opening entry and the date it opened; one at most collects proposals
_slugs = [t.get("slug") for t in THEMES]; _entries = [t.get("entry") for t in THEMES]
check(all(isinstance(t, dict) and re.fullmatch(r"[a-z0-9-]{2,40}", str(t.get("slug", ""))) and isinstance(t.get("title"), str) and 0 < len(t["title"]) <= 80
          and isinstance(t.get("entry"), int) and t["entry"] > 0 and re.fullmatch(r"\d{4}-\d\d-\d\d", str(t.get("opened", ""))) for t in THEMES)
      and len(set(_slugs)) == len(_slugs) and len(set(_entries)) == len(_entries) and sum(1 for t in THEMES if t.get("proposals")) <= 1, "THEMES: slug, title, entry and date for each; no repeats; one theme for proposals at most")
check(DT.get("themes") == THEMES, "discuss templates: the themes as in lib.py")
check(any(r.get("source") == "/discuss.json" and r.get("destination") == "/api/archive" for r in v.get("rewrites", [])), "vercel.json: /discuss.json → function")
for fn in ("api/entries.js", "api/discuss.js", "api/archive.js", "api/moderation.js", "api/cron/daily.js", "api/adopt.js", "room/lib.js", "room/register.js"):
    r = subprocess.run(["node", "--check", str(SITE / fn)], capture_output=True)
    check(r.returncode == 0, f"{fn}: syntax {r.stderr.decode()[:200]}")
check(not (PUBLIC / "index.html").exists(), "public/index.html must not exist (the function serves /)")
check(any(r.get("source") == "/archive/entries.json" and r.get("destination") == "/api/archive?index=1" for r in v.get("rewrites", [])), "vercel.json: /archive/entries.json → the chain index")
for src in ("/adopt", "/adopt.json", "/archive/register.json"):
    check(any(r.get("source") == src and "has" not in r for r in v.get("rewrites", [])), f"vercel.json: {src} → the register")
RG = json.loads((SITE / "api" / "register-templates.json").read_text("utf-8"))
check(RG["open"] == REGISTER_OPEN and RG["versions"] == [f"CZ-CORE 1.0 sha256:{CORE_SHA}", f"CZ-IR 1.0 sha256:{IR_SHA}"], "register templates: state and pinned versions")
for name in ("intro", "rules", "form"):
    pr = P(); pr.feed(RG[name]); check(not pr.err and not pr.stack, f"register {name}: HTML nesting {pr.err} {pr.stack}")
check('id="rules"' in RG["rules"] and 'id="form"' in RG["form"] and 'action="/api/adopt"' in RG["form"], "register templates: anchors and form action")
check('href="/adopt.json"' in RG["shell"] and "/discuss.json" not in RG["shell"].split("</head>")[0], "register shell: its alternate is /adopt.json")

# 7. the verifier: the published copy is the repository's, it passes its own self-test, and it verifies this build as a mirror would
VERIFY = SITE / "verify" / "verify.py"
check((PUBLIC / "archive" / "verify.py").read_bytes() == VERIFY.read_bytes(), "archive/verify.py is not site/verify/verify.py")
check(man.get("verifier", {}).get("sha256") == sha256(VERIFY.read_bytes()), "manifest: verifier hash")
for args in (["--self-test"], ["--site-dir", str(PUBLIC)]):
    r = subprocess.run([sys.executable, str(VERIFY), "--quiet", *args], capture_output=True, text=True)
    check(r.returncode == 0, f"verify.py {' '.join(args)}: {r.stdout[-600:]}")
if BUNDLE_VERSION not in ("1.0-pre", "1.0"):
    with tarfile.open(b) as tar: check("verify/verify.py" in tar.getnames() and tar.extractfile("verify/verify.py").read() == VERIFY.read_bytes(), "bundle: verify/verify.py missing or different")
    r = subprocess.run([sys.executable, str(VERIFY), "--quiet", str(b)], capture_output=True, text=True)
    check(r.returncode == 0, f"verify.py on the bundle: {r.stdout[-600:]}")

# 8. CZ time (the originator's decision of 30 Oct 2026): every page but the first carries the bar (the build's fallback, replaced at
# request time) before the navigation; the first page's heading is today's date, linked to /calendar, with the converter under it, and
# Coordinate Zero's Gregorian date appears once in its header and no other; the live templates are well formed; and the request-time
# code (room/cztime.js) gives the stamps lib.py gives
BAR = json.loads((SITE / "room" / "cz-bar.json").read_text("utf-8"))
for _n in ("bar", "calform", "timeform"):
    _pb = P(); _pb.feed(BAR[_n]); check(not _pb.err and not _pb.stack, f"room/cz-bar.json {_n}: HTML nesting {_pb.err} {_pb.stack}")
check(all(f"__CZ_SEL_{c}__" in BAR["calform"] and f"__CZ_SEL_{c}__" in BAR["timeform"] for c, _, _ in CZ_CALENDARS) and "__CZ_VALUE__" in BAR["calform"]
      and "__CZ_STAMP__" in BAR["bar"] and all(f"__CZ_Z{i}__" in BAR["timeform"] for i in range(len(CZ_ZONES))) and BAR["zones"] == [[z, n] for z, n in CZ_ZONES],
      "room/cz-bar.json: the placeholders and the zones")
# the top of every page shows the date and links to the converters; the converting is on /calendar (the originator, 30 Oct 2026)
check("<form" not in BAR["bar"] and 'href="/calendar#convert"' in BAR["bar"] and 'href="/calendar#time"' in BAR["bar"] and "30 November 2022" in BAR["bar"], "the bar: the date, the reason, the two converters as links, no form")
# only days are counted (the originator, 30 Oct 2026): under the date, the day count and its origin; no years, in the bar or the first page's header
check("Day __CZ_DAYS__ since Coordinate Zero," in BAR["bar"] and not re.search(r"\b[Yy]ears?\b|__CZ_(YEAR|DOYN|DOY|YEARDAY)__", BAR["bar"]),
      "the bar: 'Day N since Coordinate Zero', no years")
# each calendar named in its own script only
check([n for _, n, _ in CZ_CALENDARS] == ["Gregorian", "هجری شمسی", "التقويم الهجري", "Julian", "CZ"], "the calendars' names, each in its own script")
for f in pages + [pathlib.Path("virtual") / n for n in VIRTUAL]:
    if f.name == "index.html": continue
    h = VIRTUAL[f.name] if f.parent.name == "virtual" else f.read_text("utf-8")
    _b = h.split("<body>", 1)[1].lstrip()
    check(_b.startswith("<!--cz-now") and _b.count("<!--cz-now") == 1 and "<!--/cz-now-->" in _b and _b.index("<!--/cz-now-->") < _b.index('<nav class="site"'),
          f"{f.name}: CZ time at the top, before the navigation")
_hh = T["html"].split('<header id="top">', 1)[1].split("</header>", 1)[0]
check(_hh.count("30 November 2022") == 1 and _hh.count("2022-11-30") == 1 and not re.search(r"\b20\d\d-\d\d-\d\d\b|November 20(2[3-9]|[3-9]\d)", _hh.replace("2022-11-30", "")) and "__ASOF" not in _hh,
      "home: Coordinate Zero's date once in the header, and no other Gregorian date")
_h1 = _hh.split("</h1>")[0]
check('<h1 class="cz-h1"' in _hh and '<a href="/calendar"' in _h1 and '<time datetime="__CZ_ISO__">__CZ_STAMP__</time>' in _h1 and "<form" not in _hh
      and 'href="/calendar#convert"' in _hh and 'href="/calendar#time"' in _hh, "home: the heading is today's date in CZ time, linked to /calendar; links to the converters, no form")
check('Day <data value="__TOTAL__">__TOTAL__</data><br>since Coordinate Zero, <time datetime="2022-11-30">30 November 2022</time></p>' in _hh
      and '<p class="cz-def"' in _hh and "CZ time counts only days." in _hh
      and not re.search(r"\b[Yy]ears?\b|__CZ_(SINCE|TO_NEXT|TO_NEXT_N|NEXT_DAY|DOYN)__|__NEXT_YEAR__", _hh.replace("Year Zero", "")),
      "home: under the date only 'Day N / since Coordinate Zero, 30 November 2022' and 'CZ time counts only days.' — no years")
_cal = (PUBLIC / "calendar.html").read_text("utf-8")
check(_cal.count("<!--cz-cal-->") == 1 and _cal.count("<!--cz-time-->") == 1 and all(f'id="{a}"' in _cal for a in ("convert", "time", "how", "examples", "calendars", "beyond-earth", "machines", "sources")),
      "calendar.html: the converters' places and every section")
_days = sorted(set(range(-40000, 40001)) | set(range(cz_day(datetime.date(2, 1, 1)), cz_day(datetime.date(9998, 12, 31)), 97)) | {cz_day(d) for d, _ in CZ_EXAMPLES})
_r = subprocess.run(["node", "-e", 'const C = require(process.argv[1]); process.stdout.write(JSON.parse(require("fs").readFileSync(0, "utf8")).map((D) => C.czDay(D) + " " + C.stamp(D, "-") + " " + C.converterHref(D)).join("\\n"))',
                     str(SITE / "room" / "cztime.js")], input=json.dumps(_days), capture_output=True, text=True)
_js = _r.stdout.split("\n")
check(_r.returncode == 0 and _js == [f"{cz_stamp(D)} {cz_year_day(D, '-')} {cz_href(D)}" for D in _days], f"room/cztime.js and lib.py give different dates ({_r.stderr[:200]})")
check(cz_stamp(datetime.date(2026, 10, 30)) == "CZ 1430" and cz_stamp(datetime.date(2017, 6, 12)) == "CZ −1997" and cz_year_day(datetime.date(2017, 6, 12)) == "CZ−5:171"
      and cz_year_day(datetime.date(2026, 10, 30)) == "CZ+3:334" and cz_day(datetime.date(2026, 11, 30)) == 1461, "CZ time: the published examples")
for fn in ("api/page.js", "api/calendar.js", "room/cztime.js", "api/home.js"):
    _rc = subprocess.run(["node", "--check", str(SITE / fn)], capture_output=True)
    check(_rc.returncode == 0, f"{fn}: syntax {_rc.stderr.decode()[:200]}")
check(any(r.get("source") == "/calendar" and r.get("destination") == "/api/page?p=calendar" for r in v.get("rewrites", [])), "vercel.json: /calendar → api/page.js")
for _src in ("/core", "/record", "/objections", "/ask", "/machine", "/about", "/archive"):
    check(any(r.get("source") == _src and "has" not in r and r.get("destination") == f"/api/page?p={_src[1:]}" for r in v.get("rewrites", [])), f"vercel.json: {_src} → api/page.js (CZ time at the top)")
check("public/*.html" in json.dumps(v.get("functions", {}).get("api/page.js", {})), "vercel.json: api/page.js carries the pages (includeFiles)")

# 9. every date the pages print (the originator, 30 Oct 2026: "every date on the site checked at least three times"): each CZ date in a
# <time datetime> is the day of that ISO value, counted independently here as (date − 2022-11-30).days; each link around it opens the
# converter on that same day; no year:day stamp is printed as a date outside the converter's own page
_TIME_RE = re.compile(r'(?:<a class="cz-date" href="/calendar\?d=CZ(%2B|-)(\d+)">)?<time datetime="([^"]+)">(CZ [−-]?\d+)([^<]*)</time>')
_n_dates = 0
for f in pages + [pathlib.Path("virtual") / n for n in VIRTUAL]:
    h = VIRTUAL[f.name] if f.parent.name == "virtual" else f.read_text("utf-8")
    for sign, ln, iso, shown, rest in _TIME_RE.findall(h):
        if "__" in iso: continue   # a template's placeholder, filled at request time (checked in its test)
        day = (datetime.date.fromisoformat(iso[:10]) - datetime.date(2022, 11, 30)).days
        check(int(shown[3:].replace("−", "-")) == day, f"{f.name}: {shown} printed for {iso} (day {day})")
        if ln: check((-1 if sign == "-" else 1) * int(ln) == day, f"{f.name}: the link of {shown} opens day {sign}{ln}")
        _n_dates += 1
    if f.name != "calendar.html":
        _vis = to_text(h)
        check(not re.search(r"CZ[+−-]\d+:\d{3}", _vis), f"{f.name}: a year:day stamp printed as a date")
check(_n_dates > 40, f"the dates checked: {_n_dates}")

if fails:
    print("CHECK FAILED"); [print(" -", f) for f in fails]; sys.exit(1)
print(f"check passed: {len(pages)} pages, {sum(len(p.hrefs) for p in parsed.values())} links, bundle {b.name}")
