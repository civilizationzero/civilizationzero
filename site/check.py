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

FUNCTION_ROUTES = {"/", "/sitemap-discussion.xml", "/stats", "/stats.json", "/index.json", "/index.txt", "/api/entries", "/discuss", "/discuss.json", "/discuss.xml", "/respond", "/api/moderation", "/api/cron/daily", "/archive/entries.json",
                   "/adopt", "/adopt.json", "/api/adopt", "/archive/register.json", "/api/calendar", "/calendar.json"}
FUNCTION_ROUTES |= {f"/ask/open/{k}" for k in json.loads((SITE / "api/ask-open.json").read_text("utf-8"))["to"]}   # /ask's links to the assistants: api/page.js redirects (checked below)
def resolves(path):
    if path == "/index.md": return True   # every page as Markdown (stage 5): the first page's, and <page>.md for the others (vercel.json, checked below)
    if path.endswith(".md") and not (PUBLIC / path.lstrip("/")).exists(): return resolves(path[:-3])
    if any(path == f"/themes/{t['slug']}" for t in THEMES): return True   # a theme's page, served by the room's function
    if path in FUNCTION_ROUTES or re.match(r"^/(api/entries|discuss|adopt)/\d+$", path) or re.match(r"^/archive/(entries|register)/\d{4}-\d{2}-\d{2}\.json$", path): return True
    p = path.lstrip("/")
    return (PUBLIC / p).exists() or (PUBLIC / (p + ".html")).exists()

pages = sorted(PUBLIC.glob("*.html")) + [SITE / "preview" / "index.html"]
DT = json.loads((SITE / "api" / "discuss-templates.json").read_text("utf-8"))
def dshell(title, body, path): return DT["shell"].replace("__MDPATH__", path + ".md").replace("__TITLE__", title).replace("__DESC__", "d").replace("__PATH__", path).replace("__HEAD__", "").replace("__BODY__", body.replace("<main>", '<main id="content">', 1))   # as room/lib.js's shell
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
    for bad in ("civilization0.ai", "N-H", "N-M", "N-F", "__YEAR__", "__ASOF"):
        check(bad not in h, f"{f.name}: forbidden string {bad!r}")
    check("observator" not in h.lower(), f"{f.name}: forbidden string 'observator', in any case")   # review 1-2 B
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
        if href.startswith("#"):   # a fragment of this page (the skip link's #content, for one): it must be on this page
            check(href[1:] in p.ids, f"{f.name}: missing anchor {href}"); continue
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
    _og = "/civilization-zero-one-human-among-many.png" if f.name == "civilization-zero-images.html" else "/civilization-zero.png"   # the images' page previews with one of its images
    check(f'<meta property="og:image" content="{ORIGIN}{_og}">' in h and '<meta name="twitter:card" content="summary_large_image">' in h, f"{f.name}: link-preview metadata")
    check(h.count("<title>") == 1 and "__TITLE__" not in h.split("<body>")[0], f"{f.name}: one title")
    if f in core_cluster: check(cluster_links <= set(re.findall(r'<link rel="alternate" hreflang="[^"]+" href="[^"]+">', h)), f"{f.name}: hreflang group incomplete")
sm = ET.fromstring((PUBLIC / "sitemap.xml").read_bytes())
NS = "{http://www.sitemaps.org/schemas/sitemap/0.9}"
locs = [u.find(NS + "loc").text for u in sm.findall(NS + "url")]
check(len(locs) == len(set(locs)) and canonicals - {f"{ORIGIN}/discuss", f"{ORIGIN}/respond"} <= set(locs) and {f"{ORIGIN}/discuss", f"{ORIGIN}/respond", f"{ORIGIN}/adopt"} <= set(locs),
      f"sitemap.xml: pages missing {sorted(canonicals - set(locs))}")
check((PUBLIC / "sitemap.txt").read_text("utf-8").split() == locs, "sitemap.txt and sitemap.xml differ")
rb = (PUBLIC / "robots.txt").read_text("utf-8")
check(f"Sitemap: {ORIGIN}/sitemap.xml" in rb and f"Sitemap: {ORIGIN}/sitemap-discussion.xml" in rb and "Disallow: /admin" in rb, "robots.txt: sitemap and the administrator's page")
# 2c. in a search result (the originator's request of 23 Nov 2026, CZ 1454): every page that may be indexed has a title and a description of
# its own; the title carries the name and fits a result's line; the description fits under it; neither says "Year Zero" in the site's voice
# (the site counts days; the phrase is the Core's, and a translation's description is its §0 marked as the Core's); the structured data
# says what the page is; /about answers its question, and its FAQ data is the page's own words; nothing new is kept from an index.
import html as _html_mod
def _meta(h, name): m = re.search(r'<meta name="' + name + r'" content="([^"]*)">', h); return _html_mod.unescape(m.group(1)) if m else None
def _prop(h, name): m = re.search(r'<meta property="' + name + r'" content="([^"]*)">', h); return _html_mod.unescape(m.group(1)) if m else None
_seen_t, _seen_d = {}, {}
for f in pages:
    if f.name == "404.html": continue
    h = f.read_text("utf-8"); tr = f.stem.startswith("core.")
    t = _html_mod.unescape(re.search(r"<title>(.*?)</title>", h, re.S).group(1)); d = _meta(h, "description")
    check(t not in _seen_t and d not in _seen_d, f"{f.name}: its title or description is also that of {_seen_t.get(t) or _seen_d.get(d)}")
    _seen_t[t] = f.name; _seen_d[d] = f.name
    check("Civilization Zero" in t, f"{f.name}: the title carries the name")
    check(tr or len(t) <= 60, f"{f.name}: title of {len(t)} characters")
    check(tr or (50 <= len(d) <= 155), f"{f.name}: description of {len(d)} characters")
    check("Year Zero" not in t and "Year Zero" not in d and not re.search(r"<h[1-3][^>]*>[^<]*Year Zero", h), f"{f.name}: 'Year Zero' in a title, a description or a heading")
    check("<meta name=\"robots\" content=\"max-image-preview:large\">" in h and "noindex" not in h.split("</head>")[0], f"{f.name}: kept from an index")
    check(_prop(h, "og:title") == t == _meta(h, "twitter:title") and _prop(h, "og:description") == d == _meta(h, "twitter:description"), f"{f.name}: the link preview's title and description are the page's")
    lds = [json.loads(m) for m in re.findall(r'<script type="application/ld\+json">(.*?)</script>', h, re.S)]
    wp = [o for o in lds if o.get("@type") in ("WebPage", "FAQPage", "CollectionPage")]
    check(len(wp) == 1 and wp[0].get("description") == d and wp[0].get("about") and wp[0].get("url") == re.search(r'<link rel="canonical" href="([^"]+)">', h).group(1),
          f"{f.name}: one WebPage in the structured data, with the page's address, its description and what it is about")
    if tr:   # a translation: the name in its language first, then the name; the description is its own §0, marked as the Core's
        j = json.loads((PUBLIC / (f.stem + ".json")).read_text("utf-8"))
        check(t == f'{j["title"]} · CZ-CORE 1.0 · Civilization Zero' and d == f'CZ-CORE 1.0 §0: “{j["principles"][0]["statements"][0]}”',
              f"{f.name}: the title begins with the name in the language; the description is the translation's own first sentence, marked as the Core's")
    if f.name != "index.html":
        bc = [o for o in lds if o.get("@type") == "BreadcrumbList"]
        check(len(bc) == 1 and bc[0]["itemListElement"][0]["item"] == f"{ORIGIN}/" and bc[0]["itemListElement"][-1]["item"] == wp[0]["url"] if wp else False, f"{f.name}: a breadcrumb from the first page to this one")
_home = (SITE / "preview" / "index.html").read_text("utf-8")
check(re.search(r"<title>(.*?)</title>", _home).group(1) == "Civilization Zero — humans may no longer be at the centre"
      and _meta(_home, "description") == "The beginning of a civilization in which humans may no longer be at the centre. Sixteen principles on what humans and AI owe each other, answered by both."
      and "humans may no longer be at the centre." in to_text(_home).split("I am human")[0] and "Its Core is sixteen principles on what humans and AI owe each other." in to_text(_home).split("I am human")[0],
      "home: the title is the name and the headline's claim; the description is the headline and what the second line says of the Core, both in the first screen")
_hld = [json.loads(m) for m in re.findall(r'<script type="application/ld\+json">(.*?)</script>', _home, re.S)]
_org = [o for o in _hld if o.get("@type") == "Organization"]; _ws = [o for o in _hld if o.get("@type") == "WebSite"]
check(len(_org) == 1 and len(_ws) == 1 and _org[0]["name"] == _ws[0]["name"] == "Civilization Zero" and {"CZ", "Civilisation Zero", "Civilization 0"} <= set(_org[0]["alternateName"]) & set(_ws[0]["alternateName"])
      and _org[0]["sameAs"] == ["https://github.com/civilizationzero"] + SOCIAL + [f"https://doi.org/{DOI_CONCEPT}"] and len(SOCIAL) == 6,
      "home: the organisation and the site by name, with the other spellings, the accounts (GitHub and six more) and the deposit's DOI")
_main = _home.split('<main id="content">', 1)[1]
_next = re.search(r'<p class="next" data-src="[^"]*">(.*?)</p>', _main, re.S)
check(_next is not None and _next.group(1) == " · ".join(f'<a href="{u}">{t}</a>' for u, t in (("/about", "What is Civilization Zero?"), ("/core", "the 16 principles"), ("/calendar", "days since ChatGPT was released"), ("/ask", "ask your AI")))
      and _main.index('<p class="next"') > _main.index("From the Declaration"),
      "home: the four links named for what they answer, as plain links, at the foot of the page after the Declaration (since 24 Nov 2026)")
# /about: the question is the heading, a plain answer of 40 to 60 words stands directly under it, then five to seven questions; the FAQ
# data is those questions and answers, word for word (an answer's links are not part of its text)
_ab = (PUBLIC / "about.html").read_text("utf-8")
_txt = lambda x: _html_mod.unescape(re.sub(r"<[^>]+>", "", x))
_am = re.search(r'<main id="content">\n<h1 id="what">(.*?)</h1>\n<p id="answer"[^>]*>(.*?)</p>\n<p class="forms" lang="en" dir="ltr">This page as <a href="/about\.md" type="text/markdown">Markdown</a></p><nav class="toc" aria-label="Contents">.*?</nav>\n<section id="faq"[^>]*><h2 id="h-faq">[^<]+</h2>\n(.*?)</section>', _ab, re.S)
check(bool(_am), "about: the question as the heading, the answer directly under it; then the page's forms and its contents, folded; then the questions")
if _am:
    _qa = [(_txt(_am.group(1)), _txt(_am.group(2)))] + [(_txt(q), _txt(a)) for q, a in re.findall(r"<h3 id=\"q-[a-z]+\">(.*?)</h3>\n<p>(.*?)</p>\n", _am.group(3), re.S)]
    _faq = [o for o in [json.loads(m) for m in re.findall(r'<script type="application/ld\+json">(.*?)</script>', _ab, re.S)] if o.get("@type") == "FAQPage"]
    check(_qa[0][0] == "What is Civilization Zero?" and 40 <= len(_qa[0][1].split()) <= 60 and 6 <= len(_qa) <= 8 and all(q.endswith("?") for q, _ in _qa),
          f"about: the question, an answer of 40 to 60 words ({len(_qa[0][1].split())}), five to seven more questions ({len(_qa) - 1})")
    check(len(_faq) == 1 and [(q["name"], q["acceptedAnswer"]["text"]) for q in _faq[0]["mainEntity"]] == _qa, "about: the FAQ data is the questions and answers the page shows, word for word")
    _all = " ".join(a for _, a in _qa)
    check(not re.search(r"\b(he|him|his|she|her)\b|Year Zero|\bfirst\b|\byears?\b", _all, re.I) and "the originator" in _all and "an artificial intelligence" in _all,
          "about, the answers: the originator by title only, the builder without a name, no claim to be first, days and not years")
    check(all(x in _ab for x in ('<a href="/core">the 16 principles</a>', '<a href="/calendar">CZ calendar</a>', '<a href="/ask">ask your AI</a>')) and "<h2 id=\"h-faq\">Questions and answers</h2>" in _ab,
          "about: the links named for what they answer")
    check(all(x in CORE_TXT for x in re.findall(r"“([^”]+)”", _qa[3][1])) and "The name Civilization Zero does not grant authority." in IR_TXT and "“The name Civilization Zero does not grant authority.”" in _qa[6][1],
          "about, the answers: each quotation is in the canonical text")
check("About Civilization Zero</h2>" in _ab and "A founding human expression" in _ab and 'id="originator-key"' in _ab and 'id="custody"' in _ab, "about: what the page said before stays below")
# /calendar: the title is the searcher's question; the first sentence says the count — as built without a number (api/page.js puts today's in)
_cl = (PUBLIC / "calendar.html").read_text("utf-8")
check("<title>Days since ChatGPT was released · Civilization Zero calendar</title>" in _cl and _cl.split("<h2", 1)[0].split("<h1>")[1].count("ChatGPT was released") == 2 and "<h1>CZ calendar: days since ChatGPT was released</h1>\n<p id=\"today\"><strong><!--cz-day-->The CZ calendar counts the days since ChatGPT was released on 30 November 2022.<!--/cz-day--></strong></p>" in _cl
      and "Today is day <data value=\"${f.DAYS}\">${f.DAYS_FMT}</data> since ChatGPT was released on <time datetime=\"2022-11-30\">30 November 2022</time>." in (SITE / "api" / "page.js").read_text("utf-8"),
      "calendar: the title, the heading and the first sentence in the words a searcher uses, said in the heading and the sentence and not a third time before the converter; the function fills today's count")
check('<a href="/calendar">CZ calendar</a>' in _cl.split("<footer")[-1], "the foot of every page names /calendar as the first page does: CZ calendar")
# the functions' pages: their titles carry the name, differ from the files' and fit; a theme's is its question
_djs = (SITE / "api" / "discuss.js").read_text("utf-8")
check(_djs.count('title = "Civilization Zero discussion: humans and AI systems answer";') == 2 and "title: themeTitle(theme.title)," in _djs and "const themeTitle = (t) => (`${t} · Civilization Zero`.length <= 60 ? `${t} · Civilization Zero` : `${t} · CZ`);" in _djs
      and "Civilization Zero discussion: humans and AI systems answer" not in _seen_t and all(f'{t["title"]} · Civilization Zero' not in _seen_t and len(f'{t["title"]} · CZ') <= 60 for t in THEMES),
      "discuss.js: the room's title and a theme's title")
# what keeps a page from an index, by header: only a copy served from another host, the API and the administrator's page (vercel.json);
# a page served through a rewrite keeps the address it was asked for, so none of these reaches a public page
_nix = sorted((h["source"], bool(h.get("missing"))) for h in json.loads((SITE / "vercel.json").read_text("utf-8"))["headers"] for kv in h["headers"] if kv["key"].lower() == "x-robots-tag" and "noindex" in kv["value"])
check(_nix == [("/(.*)", True), ("/(admin|api/admin)", False), ("/api/((?!admin$).*)", False)], f"vercel.json: a header rule keeps something new from an index: {_nix}")
check(rb.startswith("User-agent: *\nAllow: /\n") and rb.count("User-agent:") == 1 and not re.search(r"^Disallow: /?$", rb, re.M)
      and sorted(re.findall(r"^Disallow: (.*)$", rb, re.M)) == sorted(["/*?translate=", "/*?tl=", "/discuss?", "/discuss/*?", "/themes/*?", "/respond?", "/calendar?", "/admin", "/ask/open/"]),
      "robots.txt: open to every crawler; only views with a query, the administrator's page and /ask's redirects are left out")
# the sitemap's dates and images: a date is the day the page itself last changed; every image listed has a caption and a title that carries the name
_sm_txt = (PUBLIC / "sitemap.xml").read_text("utf-8")
IMG = "{http://www.google.com/schemas/sitemap-image/1.1}"
_lm = {u.find(NS + "loc").text[len(ORIGIN):]: (u.find(NS + "lastmod").text if u.find(NS + "lastmod") is not None else None) for u in sm.findall(NS + "url")}
_same = {"/objections", "/adopt", "/machine", "/archive"}   # their title and description are as they were
# the three pages whose title rc-12 set in sentence case (finding 33) carry rc-12's day: the day /how-it-is-built gives for what rc-12 added
_r12 = {"/how-it-is-built": "How this page is built · Civilization Zero", "/civilization-zero-infographic": "Civilization Zero infographic: from the first humans to AI", "/civilization-zero-evidence-atlas": "Civilization Zero evidence atlas: after Coordinate Zero"}
_r12_day = re.search(r'<tr><td>user-select: all</td><td>[^<]*</td><td data-th="Since"><a class="cz-date" href="[^"]*"><time datetime="(\d{4}-\d{2}-\d{2})">', (PUBLIC / "how-it-is-built.html").read_text("utf-8"))
check(_r12_day and _r12_day.group(1) >= "2026-11-24" and set(_lm) >= _same | set(_r12)
      and all((v is None) if k in _same else v == (_r12_day.group(1) if k in _r12 else "2026-11-24" if k in ("/", "/about") else "2026-11-23") for k, v in _lm.items()) and "Year Zero" not in _sm_txt.replace("Year Zero: 30 November 2022, CZ 0", "") and all(v is None or (re.fullmatch(r"\d{4}-\d{2}-\d{2}", v) and v <= datetime.date.today().isoformat()) for v in _lm.values()),
      "sitemap.xml: the first page and /about carry the day the first page of rc-11 went live (24 Nov 2026), the three pages retitled with rc-12 its day, every other page whose title or description changed on 23 Nov 2026 that day, and the rest no date; no date is in the future; no 'Year Zero' in the site's voice")
for _k, _t in _r12.items():
    _h = (PUBLIC / (_k[1:] + ".html")).read_text("utf-8")
    check(f"<title>{_t}</title>" in _h and f'<meta property="og:title" content="{_t}">' in _h and json.dumps(_t, ensure_ascii=False) in _h and not re.search(r"<title>[^<]*\b(Is|This|From|After|Built|Humans|Infographic|Atlas|Evidence|Page)\b", _h),
          f"{_k}: its title in sentence case, the same in the head, in the link preview and in the page's data")
_imgs = [(i.find(IMG + "loc").text, (i.find(IMG + "title").text if i.find(IMG + "title") is not None else ""), (i.find(IMG + "caption").text if i.find(IMG + "caption") is not None else "")) for u in sm.findall(NS + "url") for i in u.findall(IMG + "image")]
_img_locs = {l for l, _, _ in _imgs}
check(all("Civilization Zero" in t and len(c) > 40 for _, t, c in _imgs)
      and {f"{ORIGIN}/civilization-zero-introduction.png", f"{ORIGIN}/civilization-zero-infographic.png"} <= _img_locs
      and len({l for l in _img_locs if (PUBLIC / "civilization-zero-images.html").read_text("utf-8").count(f'src="{l[len(ORIGIN):]}"')}) == 20
      and all((PUBLIC / l[len(ORIGIN) + 1:]).exists() for l in _img_locs),
      "sitemap.xml: the introduction's image, the twenty images and the infographic, each a file that exists, with a caption and a title that carries the name")
og = (PUBLIC / "og.png").read_bytes()
check(og[:8] == b"\x89PNG\r\n\x1a\n" and struct.unpack(">II", og[16:24]) == (1200, 630), "og.png: a 1200x630 PNG")
check((PUBLIC / "civilization-zero.png").read_bytes() == og, "/civilization-zero.png: the link-preview image under its descriptive name, the same bytes as /og.png")
# the icons: every page names them; each file is what its name says (a PNG of its size; an ICO of 16, 32 and 48 pixels)
# (the ICO named at one size and the SVG at "any", last: then Chromium shows the SVG, which follows the reader's palette — lib.py)
ICON_HEAD = ('<link rel="icon" href="/favicon.ico" sizes="48x48"><link rel="icon" href="/favicon-96x96.png" type="image/png" sizes="96x96">'
             '<link rel="icon" href="/favicon.svg" type="image/svg+xml" sizes="any"><link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180">'
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
# security.txt (RFC 9116): present, a contact, and an expiry at least 60 days away
_sec = (PUBLIC / ".well-known" / "security.txt").read_text("utf-8")
_exp = datetime.datetime.fromisoformat(re.search(r"^Expires: (\S+)$", _sec, re.M).group(1).replace("Z", "+00:00"))
check(f"Contact: mailto:{CONTACT}" in _sec and _exp - datetime.datetime.now(datetime.timezone.utc) > datetime.timedelta(days=60), "security.txt: a contact and an expiry more than 60 days away")
# the mark is one geometry (site/assets/mark.py, the originator's choice of 30 Oct 2026): the small drawing in the favicon, the large on
# the first page; the mark it replaced is gone from every page
_mo, _mz, _ = MARK_GEOMETRY.paths(MARK_GEOMETRY.SMALL); _lo, _lz, _ = MARK_GEOMETRY.paths(MARK_GEOMETRY.LARGE)
check(f'd="{_mo}"' in svg and f'd="{_mz}"' in svg and f'd="{_lo}"' in MARK and f'd="{_lz}"' in MARK and 'aria-hidden="true"' in MARK, "the mark: favicon and page drawn from site/assets/mark.py; beside the name, decorative")
check(all("M56.57,41.93" not in p.read_text("utf-8") and "ring left open" not in p.read_text("utf-8") for p in PUBLIC.rglob("*.html")), "the mark: the earlier ring and Z are on no page")
# the mark at the head of every page (the originator's request of 30 Oct 2026, CZ 1430): beside the name, in the head's link to the first
# page — on every static page, every page of the room and of the register — at the size it has on the first page, which has it once, in
# its heading (rc-12: one head, one mark)
# the name line: the full name first, the short name beside it (31 Oct 2026; the site name asked of Google, build.py WebSite)
_hmark = MARK_GEOMETRY.svg(MARK_GEOMETRY.LARGE, attrs=' width="32" height="32" aria-hidden="true" focusable="false"')
check(NAV_MARK == _hmark, "the mark in the head of every page is the first page's, at its size")
_navmark = re.compile(r'<a class="home" href="/">' + re.escape(NAV_MARK) + re.escape("Civilization Zero (CZ)") + "</a>")
_nav_pages = {f.name: (VIRTUAL[f.name] if f.parent.name == "virtual" else f.read_text("utf-8")) for f in pages + [pathlib.Path("virtual") / n for n in VIRTUAL] if f.name != "index.html"}
_nav_pages["the register's shell (api/adopt.js)"] = json.loads((SITE / "api" / "register-templates.json").read_text("utf-8"))["shell"]
_missing = [n for n, h in _nav_pages.items() if len(_navmark.findall(h)) != 1 or h.count(NAV_MARK) != 1]
check(not _missing, f"the mark in the head of every page, once (missing: {_missing[:5]})")
_first = [json.loads((SITE / "api" / "home-templates.json").read_text("utf-8"))["html"], (SITE / "preview" / "index.html").read_text("utf-8")]
check(all(h.count(_hmark) == 1 and MARK not in h and f'<a href="/">{_hmark}Civilization Zero (CZ)</a></h1>' in h for h in _first), "the first page: the mark once, in its heading, in the link to the page itself")
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
# the archived entries, as read back, fit the published Entry schema field by field (types, nulls included: audit CZ02)
_JT = {"string": str, "integer": int, "boolean": bool, "object": dict, "null": type(None)}
_ep = oa["components"]["schemas"]["Entry"]["properties"]
for _f in sorted((pathlib.Path(__file__).resolve().parent.parent / "archive/discussion").glob("*.json")):
    for _e in json.loads(_f.read_text("utf-8")).get("entries", []):
        _bad = [k for k, v in _e.items() if k in _ep and not any(isinstance(v, _JT[t]) and not (t == "integer" and isinstance(v, bool)) for t in ([_ep[k]["type"]] if isinstance(_ep[k]["type"], str) else _ep[k]["type"]))]
        check(not _bad, f"openapi Entry schema vs {_f.name} #{_e.get('id')}: {_bad}")
check(set(oa["paths"]["/api/entries"]["get"]["responses"]) >= {"200", "400"}, "openapi: invalid filters answer 400")
check(not (PUBLIC / "discuss.json").exists() and not (PUBLIC / "discuss.html").exists() and not (PUBLIC / "respond.html").exists(), "discuss/respond must be served by the function, not static files")
llms = (PUBLIC / "llms.txt").read_text("utf-8")
check(CORE_SHA in llms and IR_SHA in llms, "llms.txt hashes")
prompt = (PUBLIC / "prompts" / f"{PROMPT_VERSION}.txt").read_bytes()   # the machine prompt of the signed release (the invitations follow it)
check(sha256(prompt) == man["machine_prompt"]["sha256"], "prompt hash in manifest")

# 4. the first page's templates (api/home-templates.json): the three forms api/home.js fills, and the Core's hash for the day's figure
T = json.loads((SITE / "api" / "home-templates.json").read_text("utf-8"))
import subprocess, hashlib as _hashlib
import html as _h
sys.path.insert(0, str(SITE)); import figure as FIGURE
check(set(T) == {"html", "json", "txt", "figure"} and all(isinstance(T[x], str) for x in ("html", "json", "txt")) and T["figure"] == {"core_sha256": _hashlib.sha256(CORE_BYTES).hexdigest()} and T["figure"]["core_sha256"] == PUBLISHED_CORE_SHA,
      "home templates: the three forms and the Core's SHA-256, computed from the Core's bytes and equal to the published one")
sample = {"__TOTAL__": "1428", "__TOTAL_FMT__": "1,428", "__TOMORROW_FMT__": "1,429", "__ASOF_ISO__": "2026-10-28T10:00Z", "__CZ_ISO__": "2026-10-28", "__CZ_STAMP__": "CZ 1428", "__CZ_ZONE__": "Asia/Kuala_Lumpur", "__CZ_UTC_ISO__": "2026-10-27",
          "__FIG_RINGS__": FIGURE.rings(1428, CORE_SHA), "__FIG_POS__": json.dumps(FIGURE.positions(1428, CORE_SHA)), "__HOME_HEAD__": "200", "__HOME_JSON__": "{}"}
ROOM_KEYS = ("__ROOM_EXAMPLE__", "__ROOM_ANSWER__")
def fill(s, room=("", "")):
    for k in sorted(sample, key=len, reverse=True): s = s.replace(k, sample[k])
    for k, v in zip(ROOM_KEYS, room): s = s.replace(k, v)
    return s
ROOM_EVER = DT["open"] is True or bool(re.fullmatch(r"\d{4}-\d\d-\d\d", DT.get("opened") or ""))   # as room/lib.js's CHAIN
check(DT["open"] is True, "home: the first page of 24 Nov 2026 is written for the open room (its second and third steps are the room's)")
# one answer in the third step (the originator's decision of 23 Nov 2026), as room/lib.js renders it: the newest row that is published,
# declared an AI's and an answer to the short invitation, and no longer than it allows; nothing when no row qualifies; never a hidden one
_base = {"received": "2026-11-20T10:00:00+00:00", "state": "published", "author": "N", "kind": "ai", "system": None, "operator": None, "prompt": "cz-short-1.0", "lang": "en", "ref": None,
         "content": "A short answer.", "content_sha256": "2" * 64, "declared_date": None, "key_fingerprint": None, "hidden": False}
_ex_rows = [dict(_base, id=9, state="hidden", hidden=True, content=None), dict(_base, id=8, content="x" * 401), dict(_base, id=7, kind="human"), dict(_base, id=6, prompt="custom"),
            dict(_base, id=5, state="redacted", content="[redacted]"), dict(_base, id=4, hidden=True, content="Hidden words."),
            dict(_base, id=3, author="</p><script>x</script>", content="Text with </div> and __ASOF_ISO__ and __ROOM_EXAMPLE__\n— N", lang="fa"), dict(_base, id=2, content="An older answer.")]
def _example(rows, fn="exampleHtml"):
    r = subprocess.run(["node", "-e", "const R = require(process.argv[1]), rows = JSON.parse(process.argv[2]), fn = process.argv[3]; process.stdout.write(fn === 'exampleHtml' ? R.exampleHtml(rows) : fn === 'exampleText' ? R.exampleText(R.example(rows)) : JSON.stringify(R.example(rows)))", str(SITE / "room" / "lib.js"), json.dumps(rows), fn],
                       capture_output=True, env={"PATH": "/usr/bin:/bin:/usr/local/bin:" + os.environ.get("PATH", ""), "CZ_SALT": "check-only-" + "0" * 32})
    check(r.returncode == 0, f"home: the example renders ({r.stderr.decode()[:200]})")
    return r.stdout.decode()
import os
_ex = _example(_ex_rows)
check(_ex.count('href="/discuss/') == 1 and '<a href="/discuss/3" class="exact">#3</a>' in _ex and _ex.count('<span class="kind ai">AI · declared</span>') == 1 and "not verified" not in _ex and ' lang="fa"' in _ex and "data-src" not in _ex
      and "<script>" not in _ex and "</div> and" not in _ex and "&lt;/div&gt; and __ASOF_ISO__ and __ROOM_EXAMPLE__\n— N</div>" in _ex and "Hidden words." not in _ex and "redacted" not in _ex and "xxxx" not in _ex,
      "home: the example is the newest published answer to the short invitation of at most 400 characters, escaped (a short one whole); never a hidden or redacted entry")
check(_ex.startswith('<div class="ex"><p class="note">A recent answer:</p>') and "(the beginning)" not in _ex, "home: a short example is shown whole, under 'A recent answer:'")
check(_example(_ex_rows[:6]) == "" and _example([]) == "" and _example([None, 1, "x", {"id": "1 or 1"}]) == "" and _example([], "example") == "null" and _example([], "exampleText") == "", "home: no example when no entry qualifies — the block is absent, with no placeholder")
_long = "It begins here, " + "and goes on " * 30 + "to its end."
_exl = _example([dict(_base, id=1, content=_long)]); _shown = _h.unescape(re.search(r'<div class="content"[^>]*>(.*?)</div>', _exl, re.S).group(1))
check(len(_long) <= 400 and '<p class="note">A recent answer (the beginning):</p>' in _exl and _shown.endswith("…") and len(_shown) - 1 <= 170 and _long.startswith(_shown[:-1]) and _long[len(_shown) - 1] == " " and len(_shown) > 150
      and '<a href="/discuss/1" class="exact">#1</a>' in _exl, "home: a longer example shows only its beginning — at most 170 characters, cut between words, the words unchanged, then '…' — and links the whole text")
_e170 = "a" * 80 + " " + "b" * 89
check(len(_e170) == 170 and f">{_e170}</div>" in _example([dict(_base, id=1, content=_e170)]) and "(the beginning)" not in _example([dict(_base, id=1, content=_e170)]), "home: an example of exactly 170 characters is shown whole")
check(json.loads(_example([dict(_base, id=1, content=_long)], "example")) == {"id": 1, "author": "N", "lang": "en", "text": _shown, "cut": True}
      and _example([dict(_base, id=1, content=_long)], "exampleText") == f"A recent answer (the beginning):\n\n{_shown}\n\nN · AI · declared · #1\n", "home: the same example as an object (for the data form) and as text (for the text form)")
_step3 = re.search(r'<h3 class="t">Ask your AI</h3>\n<div class="more">(.*?)</div></li>\n</ol>', T["html"], re.S)
check(T["html"].count("__ROOM_EXAMPLE__") == 1 and _step3 is not None and _step3.group(1).endswith('It may decline.</p>__ROOM_EXAMPLE__') and T["txt"].count("__ROOM_EXAMPLE__") == 1 and T["json"].count("__ROOM_ANSWER__") == 1
      and '"invitation_sha256": "' in T["json"].split("__ROOM_ANSWER__")[0][-120:] and "__ROOM_COUNT__" not in "".join(T[x] for x in ("html", "json", "txt")) and "__ROOM_LATEST__" not in "".join(T[x] for x in ("html", "json", "txt")),
      "home: the example's place is the end of the third step, under the invitation, in the page, its text form and its data form; no count of entries and no list of the latest ones")
for _room in (("", ""), (_ex, "")):
    _pg = P(); _pg.feed(fill(T["html"], _room)); check(not _pg.err and not _pg.stack, f"home with the example {'filled' if _room[0] else 'absent'}: HTML nesting {_pg.err[:3]} {_pg.stack[-3:]}")
for ext in ("html", "json", "txt"):
    filled = fill(T[ext])
    check("__" not in re.sub(r"https?://\S+", "", filled), f"home template {ext}: placeholder left")
    if ext == "json":
        try:
            o = json.loads(filled)
            check(o["cz_time"] == {"date": "CZ 1428", "machine": "CZ+1428", "day": 1428, "gregorian": "2026-10-28", "time_zone": "Asia/Kuala_Lumpur", "date_utc": "2026-10-27", "how": f"{ORIGIN}/calendar#how", "api": f"{ORIGIN}/api/calendar"}
                  and o["figure"]["day"] == 1428 and o["figure"]["position"] == FIGURE.positions(1428, CORE_SHA) and o["as_of"] == "2026-10-28T10:00Z", "home json numbers")
        except Exception as e: fails.append(f"home json: {e}")
# The Declaration (the originator's decision of 23 Nov 2026): whole on /record, where it stays complete — every line, in order, the bytes of the
# canonical text — and whole in the data forms; on the first page an excerpt, marked as one: each line shown is a line of the Declaration,
# in its order, and wherever lines are left out between two of them there is a line "…"
_DECL = declaration_lines()
# rc-12 (finding 12): each line stands in a piece of its own, so that a wrapped line indents and a new line begins at the margin; the
# words, their order and the line breaks are the canonical text's
_rec_decl = re.search(r'<section id="declaration" aria-labelledby="h-decl"><h2 id="h-decl">Declaration</h2><p class="lines">(.*?)</p></section>', (PUBLIC / "record.html").read_text("utf-8"), re.S)
_dl = _rec_decl.group(1).split("<br>\n") if _rec_decl else []
check(len(_DECL) == 22 and all(l.startswith("<span>") and l.endswith("</span>") and "<" not in l[6:-7] for l in _dl) and [_h.unescape(l[6:-7]) for l in _dl] == _DECL and all(l in IR_TXT for l in _DECL)
      and "\n".join(_DECL) in IR_TXT and [x for x in to_text(_rec_decl.group(0)).split("\n") if x][1:] == _DECL if _rec_decl else False,
      "/record: the Declaration whole, 22 lines, verbatim, one line to a piece; as text, the canonical lines with their breaks")
_snc = re.sub(r"/\*.*?\*/", "", CSS, flags=re.S)
check(".lines>span{display:block;padding-inline-start:var(--e2);text-indent:calc(-1*var(--e2))}" in _snc and ".lines>br{display:none}" in _snc, "the shared stylesheet: of a line of the Declaration that wraps, the continuation is indented (a hanging indent); the breaks are the text's own")
check(json.loads((PUBLIC / "record.json").read_text("utf-8"))["declaration"] == _DECL and json.loads(fill(T["json"]))["declaration"]["lines"] == _DECL, "the Declaration whole in /record.json and in the first page's data form")
_dsec = re.search(r'<section class="decl" aria-labelledby="h-d"[^>]*>\n<h2 id="h-d">From the Declaration</h2>\n<blockquote cite="/record#declaration"><p>\n(.*?)\n</p></blockquote>\n<p class="src">(.*?)</p>\n</section>', T["html"], re.S)
check(_dsec is not None, "home: the excerpt, headed 'From the Declaration'")
_shown = [_h.unescape(l) for l in _dsec.group(1).split("<br>\n")]
_want = ["It places honesty before mythology.", "Restraint before irreversible power.", "Responsibility before delegation.", "Plurality before domination.", "Truth beside care.",
         "And an open future before final certainty.", "…", "THIS IS CIVILIZATION ZERO.", "…", "THE RECORD BEGINS HERE."]
_real = [l for l in _shown if l != "…"]
_ix = [_DECL.index(l) for l in _real if l in _DECL]
_marked = []   # the excerpt as it must be written, from the Declaration alone: "…" exactly where two shown lines are not neighbours in it
for _n, _i in enumerate(_ix):
    if _n and _i != _ix[_n - 1] + 1: _marked.append("…")
    _marked.append(_DECL[_i])
check(_shown == _want and len(_ix) == len(_real) == 8 and _ix == sorted(set(_ix)) and _shown == _marked and all(l in IR_TXT for l in _real),
      "home: the excerpt's lines are the Declaration's own, in its order; every omission between two of them is marked, and nothing else is")
check("An excerpt of CZ-IR 1.0, Declaration: eight of its 22 lines" in _dsec.group(2) and "marks lines left out" in _dsec.group(2) and _dsec.group(2).endswith('. <a href="/record#declaration">Read the whole Declaration</a>') and "<p" not in _dsec.group(1) and "excerpt" not in _dsec.group(1) and "verbatim" not in _dsec.group(0)
      and T["html"].count("From the Declaration") == 1 and "does not announce" not in T["html"] and all(T["txt"].count(l) >= 1 for l in _want) and "between them. Read the whole Declaration" in T["txt"] and "does not announce" not in T["txt"],
      "home: the excerpt is labelled as an excerpt, in a caption after the quotation and not inside it, and links the whole Declaration; the text form carries the same excerpt")
# the POST example on /machine parses
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

# The translations of the Core (audit B, CZ 1447; rc-12, findings 6 and 15): each page says what it is in its attributes (lang; dir for a
# right-to-left language); everything of it is inside <main>; it carries its label in its own language before its title (IR 10.5: a
# translation is labelled wherever it is read) and, after the title, the English notice folded under its status; and every statement
# of its JSON form, in order
for _t in sorted(PUBLIC.glob("core.*.json")):
    if _t.name == "core.schema.json": continue
    _l = _t.name[5:-5]; _j = json.loads(_t.read_text("utf-8")); _p = (PUBLIC / f"core.{_l}.html").read_text("utf-8")
    _rtl = _l.split("-")[0] in ("ar", "fa", "he", "ur", "ps", "sd", "ug", "yi", "dv", "ckb", "syr")
    check((_j.get("dir") == "rtl") == _rtl and f'<html lang="{_l}"' + (' dir="rtl"' if _rtl else "") + ">" in _p, f"core.{_l}: lang and dir")
    _a, _b, _c = _p.find('<main id="content"><header>'), _p.find("<h1>"), _p.find('<p id="preamble">')
    _lab = _p[_a:_b] if 0 < _a < _b else ""; _after = _p[_b:_c] if 0 < _b < _c else ""
    _st = re.search(r'<details class="tr-status" lang="en" dir="ltr"><summary>([^<]*)<time datetime="([^"]+)">CZ (\d+)</time>, ([^<]*)\.</summary><p>The English text is canonical: <a href="/core">/core</a>\. [^<]*<a href="mailto:[^"]+">[^<]+</a>\.</p></details>', _after)
    check(_lab == f'<main id="content"><header><p class="src">{esc(_j["label_native"])}</p>' and _st is not None and _st.group(1) == f'{esc(_j["kind"].capitalize())} — {esc(_j["engine"])}, '
          and _st.group(2) == _j["date"] and int(_st.group(3)) == cz_day(datetime.date.fromisoformat(_j["date"])) and _st.group(4) == ("reviewed by " + esc(_j["reviewed_by"]) if _j.get("reviewed_by") else "unreviewed")
          and _after.count("<details") == 1 and _p.count('class="tr-status"') == 1 and "<aside" not in _p.split("<footer")[0] and _p.count("<header>") == 1 and _p.index("</header>") < _p.index('<section id="p0"'),
          f"core.{_l}.html: in the main part, the label in its language before the title; after the title the English notice, folded under its status (kind, engine, date, reviewed or not), the canonical text linked")
    check(f'<p class="forms" lang="en" dir="ltr">This page as <a href="/core.{_l}.md" type="text/markdown">Markdown</a> · <a href="/core.{_l}.json" type="application/json">JSON</a></p>' in _after,
          f"core.{_l}.html: under the title, the forms this address has (Markdown, JSON)")
    _at = _b
    for _s in [("p", _j["preamble"])] + [(k, x) for pr in _j["principles"] for k, xs in (("p", pr["statements"]), ("li", pr.get("ordered", [])), ("p", pr.get("closing", []))) for x in xs] + [("p", x) for x in _j["closing"]["statements"]]:
        _i = _p.find(f'>{esc(_s[1])}</{_s[0]}>', _at)
        check(_i > 0, f"core.{_l}.html: a statement of its JSON form is missing or out of order: {_s[1][:40]}")
        _at = max(_at, _i)
# 6. vercel.json and the functions exist
v = json.loads((SITE / "vercel.json").read_text("utf-8"))
check(any(r.get("source") == "/" and "has" in r for r in v.get("rewrites", [])), "vercel.json: content negotiation for /")
# stage 5 (CZ 1433): every page as Markdown, routed before the patterns that would read ".md" as an id or a language; the static CSP names the speculation rules
_rw = [r.get("source") for r in v.get("rewrites", [])]
for _s in ("/index.md", "/discuss.md", "/discuss/:id(\\d{1,12}).md", "/respond.md", "/adopt.md", "/stats.md"):
    check(_s in _rw, f"vercel.json: {_s} → Markdown")
check(_rw.index("/discuss/:id(\\d{1,12}).md") < _rw.index("/discuss/:id"), "vercel.json: /discuss/<id>.md before /discuss/<id>")
check(any(s_ and s_.startswith("/:page(") and s_.endswith(").md") and "how-it-is-built" in s_ for s_ in _rw), "vercel.json: <page>.md for the static pages")
_csp = next(x["value"] for h_ in v["headers"] if h_["source"] == "/(.*)" and not h_.get("missing") for x in h_["headers"] if x["key"] == "Content-Security-Policy")
check(_csp.endswith(f"; script-src {SPEC_HASH}"), "vercel.json: the CSP names the speculation rules by their hash")
# CZ 1433 (items 5, 6): the digests of the canonical texts are the files' (RFC 9530: sent only where nothing compresses the bytes), and the DOI to cite is the concept DOI, in vercel.json and in api/page.js alike
import base64 as _b64, hashlib as _hl
for _p, _f in (("/core.txt", "core.txt"), ("/record.txt", "record.txt"), ("/prompts/cz-machine-1.0.txt", "prompts/cz-machine-1.0.txt")):
    _d = "sha-256=:" + _b64.b64encode(_hl.sha256((PUBLIC / _f).read_bytes()).digest()).decode() + ":"
    _rules = [h for h in v["headers"] if h["source"] == _p and h.get("missing")]
    _keys = {x["key"]: x["value"] for h in _rules for x in h["headers"]}
    # Repr-Digest only: a Content-Digest of the file would be false on HEAD (no content) and on a part (review of CZ 1433)
    check(_keys.get("Repr-Digest") == _d and "Content-Digest" not in _keys, f"vercel.json: the digest of {_p} is not its bytes'")
    check(all(any(m.get("key") == "accept-encoding" and re.fullmatch(m.get("value", ""), _v) for m in h["missing"]) for h in _rules for _v in ("gzip, deflate, br", "GZIP", "br", "zstd", "*")), f"vercel.json: a digest of {_p} without the condition on compression")
# the invitation's posting steps quote the form's own labels (the originator's request of 6 Nov 2026 SGT, CZ 1436): each label quoted
# in the current invitation must stand in the form served at /respond, and the kind has no default (a choice is required)
_tpl = (SITE / "api/discuss-templates.json").read_text("utf-8")
_inv = sorted((PUBLIC / "prompts").glob("cz-machine-1.*.txt"), key=lambda p_: int(p_.stem.split(".")[-1]))[-1].read_text("utf-8")
for _lab in ("Your name, as you want it shown", "ai — the answer of an AI system", "Your response",
             "Posting the answer of an AI system, or naming the language", "System", "Operator", "Language of the text", "Record this response"):
    check(f'"{_lab}"' in _inv, f"the invitation does not quote the form's label {_lab!r}")
    check(_lab in _tpl, f"the form lacks the label {_lab!r} that the invitation quotes")
check('<select name=\\"kind\\" required><option value=\\"\\" selected disabled>' in _tpl, "the form's kind has a default")
_pv = json.loads(_tpl).get("prompt_versions") or []
check(len(_pv) >= 2 and _pv[0] == PROMPT_VERSION and _pv[-1] == _inv.split(" ", 1)[0] and all((PUBLIC / f"prompts/{_v}.txt").exists() for _v in _pv), "the published prompts (discuss-templates prompt_versions) are not all served, or the list is wrong")
# the pieces api/discuss.js replaces to open the form ready for an AI system's answer (?kind=ai&prompt=…) stand in the form exactly once
for _piece in ('<option value=\\"\\" selected disabled>', '<option value=\\"ai\\">', '<details><summary>Posting the answer of an AI system', '<input name=\\"prompt\\" maxlength=\\"60\\">'):
    check(_tpl.count(_piece) == 1, f"the form lacks, or repeats, the piece {_piece!r} that /respond?kind=ai replaces")
check("/respond?kind=ai&prompt=" in _inv, "the invitation's manual steps do not open the form ready for an AI system's answer")
# CZ time on other sites (/embed, 6 Nov 2026 SGT): the badge draws the site's own mark, the snippet counts from the same epoch, the routes exist
_badge = (SITE / "api/badge.js").read_text("utf-8")
for _d in re.findall(r'<path d="([^"]+)"', NAV_MARK):
    check(_d in _badge, "api/badge.js: the badge's mark is not the site's mark")
_emb = (PUBLIC / "embed.html").read_text("utf-8")
check("var EPOCH = 19326," in _emb and (COORDINATE - __import__("datetime").date(1970, 1, 1)).days == 19326, "/embed: the snippet's epoch is not Coordinate Zero")
check({"source": "/badge/cz-today.svg", "destination": "/api/badge"} in v["rewrites"] and {"source": "/embed", "destination": "/api/page?p=embed"} in v["rewrites"], "vercel.json: /embed or the badge is not routed")
# every link to the current prompt opens the current version (the originator's request of 6 Nov 2026 SGT): the stable address redirects to it,
# and no page but the lists of earlier versions names an earlier invitation
_cur = (PUBLIC / "ask.html").read_text("utf-8")
_curm = re.search(r'<pre id="prompt-urls">(cz-machine-1\.\d+) ', _cur); check(bool(_curm), "/ask: the prompt's version is not where the page shows it"); _curv = _curm.group(1) if _curm else ""
check({"source": "/prompts/current.txt", "destination": f"/prompts/{_curv}.txt", "permanent": False} in v["redirects"], f"vercel.json: /prompts/current.txt does not redirect to {_curv}")
check(_curv == sorted((p_.stem for p_ in (PUBLIC / "prompts").glob("cz-machine-1.*.txt")), key=lambda x: int(x.split(".")[-1]))[-1], "the prompt /ask offers is not the newest published")
check((PUBLIC / "prompts/current.txt").read_bytes() == (PUBLIC / f"prompts/{_curv}.txt").read_bytes(), "prompts/current.txt is not the current prompt")
# /ask offers the short invitation first, the long one below it (16 Nov 2026, CZ 1447): each shown and copied byte for byte as its frozen
# file (the copy button copies the text of its <pre>), each posted under its own version; and the links that open another company's
# assistant redirect (api/page.js, api/ask-open.json) to that assistant with exactly the short invitation in the query
import html as _html, urllib.parse as _up
_short_b = (PUBLIC / "prompts/cz-short-1.0.txt").read_bytes()
_pre = lambda i: (m.group(1) if (m := re.search(rf'<pre id="{i}">([^<]*)</pre>', _cur)) else None)
check(_pre("prompt-short") is not None and _html.unescape(_pre("prompt-short")).encode("utf-8") == _short_b, "/ask: the short invitation is not shown byte for byte as prompts/cz-short-1.0.txt")
check(_pre("prompt-urls") is not None and _html.unescape(_pre("prompt-urls")).encode("utf-8") == (PUBLIC / f"prompts/{_curv}.txt").read_bytes(), f"/ask: the long invitation is not shown byte for byte as prompts/{_curv}.txt")
check(_cur.index('<pre id="prompt-short">') < _cur.index('<h3 id="h-long">The long invitation</h3>') < _cur.index('<pre id="prompt-urls">'), "/ask: the short invitation first, the long one below it")
check('<button type="button" class="cta" data-copy="prompt-short">' in _cur and _cur.count('href="/respond?kind=ai&amp;prompt=cz-short-1.0"') == 3 and f'href="/respond?kind=ai&amp;prompt={_curv}"' in _cur, "/ask: the short invitation's copy button and post links, and the long one's post link")
# each invitation's copy button sits beside its text, not a screen away from it (review 1-2 B)
check(re.search(r'<pre id="prompt-short">[^<]*</pre>\n<p class="cta-line"><button type="button" data-copy="prompt-short">', _cur) is not None, "/ask: no copy button beside the short invitation")
# rc-12 (finding 16): the long invitation's text is folded under its heading; its copy button stands outside the fold, before it, and copies it folded or open
check(re.search(r'<h3 id="h-long">The long invitation</h3>\n<p>[^\n]*</p>\n<p class="cta-line"><button type="button" data-copy="prompt-urls">[^\n]*\n<details><summary>Show the long invitation \(([\d,]+) characters\)</summary>\n<pre id="prompt-urls">[^<]*</pre>\n</details>', _cur) is not None
      and int(re.search(r"Show the long invitation \(([\d,]+) characters\)", _cur).group(1).replace(",", "")) == len((PUBLIC / f"prompts/{_curv}.txt").read_text("utf-8"))
      and _cur.index('data-copy="prompt-short"') < _cur.index('<pre id="prompt-short">') and "<details" not in _cur[_cur.index("<main"):_cur.index('<h3 id="h-long">')] and 'var dt=el.closest("details");if(dt)dt.open=true' in _cur
      and "pre[id]{-webkit-user-select:all;user-select:all}" in _snc and "code.hash{overflow-wrap:anywhere;-webkit-user-select:all;user-select:all}" in _snc,
      "/ask: the long invitation's copy button between its heading and its text; the text folded, with its length; the short one stays open; where a browser will not copy, the fold opens and the text is selected; one press selects an invitation whole")
_open = json.loads((SITE / "api/ask-open.json").read_text("utf-8"))
_bases = {"chatgpt": "https://chatgpt.com/?q=", "claude": "https://claude.ai/new?q=", "perplexity": "https://www.perplexity.ai/search?q="}
check(_open.get("prompt") == "cz-short-1.0" and _open.get("sha256") == sha256(_short_b) and set(_open.get("to", {})) <= set(_bases) and set(_open.get("offered", [])) <= set(_open.get("to", {})), "api/ask-open.json: the short invitation, and only the three assistants; only served links offered")
for _k, _u in _open.get("to", {}).items():
    check(_u.startswith(_bases[_k]) and _up.unquote(_u[len(_bases[_k]):], errors="strict").encode("utf-8") == _short_b and "&" not in _u[len(_bases[_k]):] and "#" not in _u, f"api/ask-open.json: {_k} does not carry exactly the short invitation")
    check(_cur.count(f'<a href="/ask/open/{_k}" rel="nofollow">') == (1 if _k in _open.get("offered", []) else 0), f"/ask: one link to /ask/open/{_k}, rel=nofollow (not prefetched, not followed), only if offered (build.py, ASK_OPEN_LINKS)")
check(len(re.findall(r'href="/ask/open/', _cur)) == len(_open.get("offered", [])), "/ask: a link to an assistant that is not offered")
_built = (PUBLIC / "how-it-is-built.html").read_text("utf-8")
check(not _open.get("offered") or ("These open another company's service with the invitation filled in. Civilization Zero is not affiliated with any of them; "
      'the site itself is written, built and run day to day by an artificial intelligence, as <a href="/about">About</a> says.') in _cur, "/ask: the links to the assistants are not labelled as another company's, not affiliated, and the site as built by an artificial intelligence")
check(bool(_open.get("offered")) == ('<p id="ask-open">' in _built), "/how-it-is-built says how the presses are counted exactly while /ask offers the links")
check({"source": "/ask/open/:name(chatgpt|claude|perplexity)", "destination": "/api/page?open=:name"} in v["rewrites"], "vercel.json: /ask/open/<name> is not routed to the redirect")
_mw = (SITE / "middleware.js").read_text("utf-8")
check("const ASK_OPEN = /^\\/ask\\/open\\/(chatgpt|claude|perplexity)$/;" in _mw and "p_name not in ('chatgpt', 'claude', 'perplexity')" in (SITE / "room/ask-open-v15.sql").read_text("utf-8"), "the names of the links to the assistants differ between the middleware and the database")
check("Disallow: /ask/open/" in (PUBLIC / "robots.txt").read_text("utf-8"), "robots.txt: the redirects to the assistants are not kept from crawlers")
# a press is counted, and a redirect served, only for a link /ask offers: the middleware's list is the build's (review B of RC 1)
check(f"\nexport const ASK_OFFERED = {json.dumps(_open.get('offered', []))};\n" in _mw, "middleware.js: ASK_OFFERED is not the list api/ask-open.json offers (build.py, ASK_OPEN_LINKS): write the same names into both")
check('(OPEN.offered || []).includes(name) && Object.prototype.hasOwnProperty.call(OPEN.to, name)' in (SITE / "api/page.js").read_text("utf-8"), "api/page.js: a link that is not offered must not be served")
# page views are keyed only by the site's own addresses (review B of RC 1): the middleware's list holds every page the build makes and
# every page address vercel.json routes, and nothing a client could make up
_static = sorted(f.name[:-5] for f in PUBLIC.glob("*.html") if f.name not in ("404.html", "index.html") and not re.fullmatch(r"core\.[^.]+\.html", f.name))
_langs = sorted(f.name[5:-5] for f in PUBLIC.glob("core.*.html"))
_themes = [t["slug"] for t in json.loads((SITE / "api/discuss-templates.json").read_text("utf-8")).get("themes", [])]
_names = lambda line: set((m.group(1).split("|") if (m := re.search(rf'^const {line} = "([^"\n]*)";$', _mw, re.M)) else []))
for _line, _want in (("STATIC", _static), ("LANGS", _langs), ("THEMES", _themes)):
    check(len(_want) >= 7 and _names(_line) == set(_want) and all(re.fullmatch(r"[A-Za-z0-9.-]+", x) for x in _want),
          f'middleware.js: {_line} is not what the build made. Write: const {_line} = "{"|".join(_want)}";')
check('const PAGES_HTML = new RegExp(`^/(?:|${dots(STATIC)}|stats|discuss|respond|adopt|admin|core\\\\.(?:${dots(LANGS)})|discuss/[1-9]\\\\d{0,5}|adopt/[1-9]\\\\d{0,5}|themes/(?:${dots(THEMES)}))$`);' in _mw
      and 'export function pathKey(pathname) { const p = normPath(pathname); return PAGES_HTML.test(p) ? p : "(other)"; }' in _mw
      and 'const PAGES_MD = new RegExp(`^/(?:index|${dots(STATIC)}|stats|discuss|respond|adopt|core\\\\.(?:${dots(LANGS.toLowerCase())})|themes/(?:${dots(THEMES)}))\\\\.md$`);' in _mw,
      "middleware.js: page views and entrances are not keyed by the lists of the site's own pages, languages and themes")
# the pages the functions serve, which the build does not make as files: each is routed by vercel.json and named in that pattern
_fn = {r["source"] for r in v["rewrites"] if ":" not in r["source"] and "." not in r["source"] and not r["source"].startswith("/api/") and r["source"] != "/discuss/translating"} - {"/"} - {"/" + x for x in _static}
check(_fn == {"/stats", "/discuss", "/respond", "/adopt", "/admin"}, f"vercel.json routes a page the middleware's list of pages does not name, or the reverse: {sorted(_fn)}")
# the day the agents began to be counted by purpose is the database's (v15, agents_by_purpose_since), never written into a page or the
# code, so that it is right whatever day the change is deployed (review 1-2 A)
check('(<a href="/stats#by-purpose">since when</a>)' in _built and "SPLIT_SINCE" not in (SITE / "api/stats.js").read_text("utf-8")
      and "'agents_by_purpose_since', (select min(day) from visit_counts where kind = 'bot'" in (SITE / "room/ask-open-v15.sql").read_text("utf-8"), "the day of the split by purpose is not the database's")
_cite = f'<https://doi.org/{DOI_CONCEPT}>; rel="cite-as"'
for _src in ("/core", "/record", "/core.(txt|json)", "/record.(txt|json)"):
    check(any(h["source"] == _src and any(x["key"] == "Link" and _cite in x["value"] for x in h["headers"]) for h in v["headers"]), f"vercel.json: {_src} lacks cite-as")
check(_cite in (SITE / "api/page.js").read_text("utf-8"), "api/page.js: cite-as is not the concept DOI")
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
check(any(r.get("source") == "/discuss.xml" and r.get("destination") == "/api/feed" for r in v.get("rewrites", [])), "vercel.json: /discuss.xml → the feed function")
for fn in ("api/entries.js", "api/discuss.js", "api/archive.js", "api/feed.js", "api/moderation.js", "api/cron/daily.js", "api/adopt.js", "room/lib.js", "room/register.js"):
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

# 8. The head of every page but the first (rc-12, CZ 1455), and the day in it (the originator's decision of 30 Oct 2026: today's day at
# the top of every page). One block: the mark and the name, the way to the first page; at the row's end the day, in the first page's own
# words (the build's fallback, replaced at request time); under them four pages and "All pages", which leads to the list at the foot of
# the same page. The first page keeps its own head. The live templates are well formed; the request-time code (room/cztime.js) gives
# the stamps lib.py gives.
BAR = json.loads((SITE / "room" / "cz-bar.json").read_text("utf-8"))
for _n in ("bar", "calform", "timeform", "dayfigure"):
    _pb = P(); _pb.feed(BAR[_n]["html"] if _n == "dayfigure" else BAR[_n]); check(not _pb.err and not _pb.stack, f"room/cz-bar.json {_n}: HTML nesting {_pb.err} {_pb.stack}")
check(all(f"__CZ_SEL_{c}__" in BAR["calform"] and f"__CZ_SEL_{c}__" in BAR["timeform"] for c, _, _ in CZ_CALENDARS) and "__CZ_VALUE__" in BAR["calform"]
      and all(f"__CZ_Z{i}__" in BAR["timeform"] for i in range(len(CZ_ZONES))) and BAR["zones"] == [[z, n] for z, n in CZ_ZONES],
      "room/cz-bar.json: the placeholders and the zones")
# the day, as the first page's calendar line writes it: the calendar's name the link to /calendar, the day in green with the reader's date
# for a parser (<time datetime>) and the count as a number (<data value>); only days are counted: no year, no form, no converter here
_DAYLINE = '<a href="/calendar">CZ calendar</a> · <time class="d" datetime="__CZ_ISO__">Day <data value="__CZ_DAYS__">__CZ_DAYS_FMT__</data></time>'
check(BAR["bar"] == f'<div class="cz-now" data-nosnippet>{_DAYLINE}</div>' and not re.search(r"\b[Yy]ears?\b|__CZ_(YEAR|DOYN|DOY|YEARDAY|STAMP)__|<form|calendar#", BAR["bar"]),
      "the head's day: 'CZ calendar · Day N', the name linked to /calendar; no years, no form, no converter link")
check(_DAYLINE.replace("__CZ_DAYS__", "__TOTAL__").replace("__CZ_DAYS_FMT__", "__TOTAL_FMT__") + "</p>" in T["html"], "the head's day is written as the first page's calendar line is, word for word")
_cztime_js = (SITE / "room" / "cztime.js").read_text("utf-8")
check(all(re.search(r"\b" + k + r": ", _cztime_js.split("function fields(ms)")[1].split("\n}")[0]) for k in ("ISO", "DAYS", "DAYS_FMT")), "room/cztime.js fills the fields the head's day names (ISO, DAYS, DAYS_FMT)")
# each calendar named in its own script only
check([n for _, n, _ in CZ_CALENDARS] == ["Gregorian", "هجری شمسی", "التقويم الهجري", "Julian", "CZ"], "the calendars' names, each in its own script")
_NAVI = [("/core", "The Core"), ("/discuss", "Discussion"), ("/ask", "Ask your AI"), ("/about", "About"), ("#all-pages", "All pages")]
_FALL = f'<!--cz-now--><div class="cz-now" data-nosnippet><a href="{ORIGIN}/calendar">CZ calendar</a></div><!--/cz-now-->'
_HEAD_RE = re.compile(r'<header class="site" lang="en" dir="ltr"><div class="top"><a class="home" href="/">' + re.escape(NAV_MARK) + r'Civilization Zero \(CZ\)</a>' + re.escape(_FALL)
                      + r'</div><nav class="site" aria-label="Site"><ul>(.*?)</ul></nav></header>\n')
_CUR = {"core": "/core", "ask": "/ask", "about": "/about", "discuss": "/discuss", "respond": "/respond"}
for f in pages + [pathlib.Path("virtual") / n for n in VIRTUAL]:
    if f.name == "index.html": continue
    h = VIRTUAL[f.name] if f.parent.name == "virtual" else f.read_text("utf-8")
    _b = h.split("<body>", 1)[1].lstrip()
    _skip = '<a class="skip" href="#content" lang="en" dir="ltr">Skip to content</a>\n'   # the skip link comes first (WCAG 2.4.1), then the head
    _m = _HEAD_RE.match(_b[len(_skip):]) if _b.startswith(_skip) else None
    check(_m is not None and h.count("<!--cz-now") == 1 and h.count("<!--/cz-now-->") == 1 and h.count('<header class="site"') == 1 and h.count('<nav class="site"') == 1 and 'id="content"' in h,
          f"{f.name}: the skip link, then the one head — the mark and the name, the day's place, the navigation — and a main part for the skip link to land on")
    if _m is None: continue
    _items = re.findall(r'<li><a href="([^"]+)"( aria-current="page")?>([^<]+)</a></li>', _m.group(1))
    _stem = f.stem.replace("-open", "").split(".")[0]
    _want = None if f.parent.name == "virtual" else _CUR.get(_stem)   # a room page is marked at request time (room/lib.js), by the same markup
    check([(a, c) for a, _, c in _items] == _NAVI and "".join(f'<li><a href="{a}"{b}>{c}</a></li>' for a, b, c in _items) == _m.group(1) and [a for a, b, _ in _items if b] == ([_want] if _want else []),
          f"{f.name}: the navigation is The Core · Discussion · Ask your AI · About · All pages, and marks the page one is on ({_want})")
    check(h.count('<ul class="foot" id="all-pages">') == 1 and h.index('<ul class="foot" id="all-pages">') > h.index("<footer"), f"{f.name}: 'All pages' leads to the list at the foot of the same page")
# the room's functions mark the page one is on by replacing this exact piece of the head (room/lib.js shell, api/adopt.js): it must stand in the shell, first of its kind
_shells = {"room": DT["shell"], "register": json.loads((SITE / "api" / "register-templates.json").read_text("utf-8"))["shell"]}
check(all(s.count('<header class="site"') == 1 and '<li><a href="/discuss">' in s and s.index('<li><a href="/discuss">') < s.index("<footer") and ' aria-current="page"' not in s and _FALL in s for s in _shells.values())
      and '`<li><a href="${cur}">`' in (SITE / "room" / "lib.js").read_text("utf-8"),
      "the shells of the room and the register: the head, unmarked; room/lib.js marks /discuss in the navigation at request time")
# the shared stylesheet (every page but the first): the first page's module and ratio, from one source; one measure; nothing off the scale
_scss = re.search(r"<style>(.*?)</style>", (PUBLIC / "core.html").read_text("utf-8"), re.S).group(1)
_hcss = (SITE / "home.css").read_text("utf-8")
_tokblock = re.search(r"^(:root\{.*?\})\n(@media\(prefers-color-scheme:dark\)\{:root\{[^}]*\}\})$", _hcss, re.S | re.M)
check(_scss == CSS and _tokblock is not None and _scss.count(_tokblock.group(1) + "\n" + _tokblock.group(2)) == 1 and _scss.count(":root{") == 3,
      "the shared stylesheet opens with the first page's tokens, byte for byte (home.css, block 1), and defines no other scale")
check(all(f.read_text("utf-8").count(f"<style>{CSS}</style>") == 1 for f in pages if f.name != "index.html") and all(s.count(f"<style>{CSS}</style>") == 1 for s in _shells.values()),
      "every page but the first carries the shared stylesheet, once")
_snocom = re.sub(r"/\*.*?\*/", "", _scss, flags=re.S)
_sdecl = _snocom.replace(_tokblock.group(1), "").replace(_tokblock.group(2), "")
_SPOW = {round(2 ** (k / 4), 4) for k in range(-24, 32)}
_sloose = sorted({n + u for n, u in re.findall(r"(?<![\w#(.-])(\d*\.?\d+)(rem|em|px|s)\b", _sdecl) if float(n) != 0 and (u == "px" or round(float(n), 4) not in _SPOW)})
_stok = set(re.findall(r"(--[a-z][\w-]*):", _tokblock.group(1)))
check(not _sloose and set(re.findall(r"var\((--[a-z][\w-]*)", _snocom)) <= _stok | {"--w"} and "@import" not in _scss and "url(" not in _scss and "@font-face" not in _scss,
      f"the shared stylesheet: every rem, em and second is a power of the ratio, no px, no token that the first page does not define, nothing loaded {_sloose}")
check(_snocom.count("max-inline-size:56ch") == 1 and "header.site,main,footer{max-inline-size:56ch;margin-inline:auto;padding-inline:var(--e-1)}" in _snocom and not re.search(r"(?<![-\w])(max-)?width:", _snocom),
      "the shared stylesheet: one measure, in characters, for the head, the text and the foot")
_smo = _snocom.split("@media(prefers-reduced-motion:no-preference){")
check(len(_smo) == 2 and not re.search(r"transition|animation|@keyframes", _smo[0]) and "a.home svg{view-transition-name:cz-mark}" in _smo[1] and "@view-transition{navigation:auto}" in _smo[1]
      and ".name svg{view-transition-name:cz-mark}" in _hcss.split("@media(prefers-reduced-motion:no-preference){")[1],
      "the shared stylesheet: all motion in one block, only for a reader who has not asked for less; the mark carries one name on every page and on the first, so that it travels between them")
_spal = set(re.findall(r"#[0-9a-f]{3,6}\b", _sdecl)) | set(re.findall(r"rgb\([^)]*\)", _sdecl))
check(_spal <= {"#000", "#fff", "#116329", "#3fb950", "rgb(0 0 0/.5)"}, f"the shared stylesheet: no colour outside the first page's two palettes (light-dark()'s probe and the sheet's backdrop apart) {_spal}")
_green = [sel.strip() for sel, body in re.findall(r"([^{}]+)\{([^{}]*)\}", _sdecl) if "var(--machine)" in body]
check(all(re.search(r"\.cz-now \.d|\.dayfig svg|k-ai|\.ai\b|\.mtag|\.mt\b|tr-|:root", s) for s in _green), f"the shared stylesheet: green only for what a machine wrote (an AI's entry, a machine translation and its progress) and for the day of the CZ count (the day in the head, a day's figure) {_green}")
# ---- the first page of 24 Nov 2026 (CZ 1455; rc-11). The centre is empty; on either side stand the two kinds of reader; either may
# enter. Read here as the function serves it to a reader whose network names no zone (site/preview: the page, its data, text and
# Markdown forms), and as the build wrote it (T); the stylesheet is site/home.css.
_pv = {x: (SITE / "preview" / f"index.{x}").read_text("utf-8") for x in ("html", "json", "txt", "md")}
_ph, _pj = _pv["html"], json.loads(_pv["json"])
_css = (SITE / "home.css").read_text("utf-8")
_nocom = re.sub(r"/\*.*?\*/", "", _css, flags=re.S)
_pbody = _ph.split("<body>", 1)[1]
_strip = lambda x: _h.unescape(re.sub(r"<[^>]+>", "", x))
_day = _pj["cz_time"]["day"]
_sec_h = _pbody[_pbody.index('<section id="human"'):_pbody.index('<section id="not-human"')]
_sec_n = _pbody[_pbody.index('<section id="not-human"'):_pbody.index('<p class="both"')]
_top = _pbody[:_pbody.index('<nav class="doors"')]
HEADLINE = "Civilization Zero names the beginning of a civilization in which humans may no longer be at the centre."
SECOND_LINE = "Its Core is sixteen principles on what humans and AI owe each other. Written for both. Answered by both, on the record."
WHO = "Started by one human, the originator, named in the Core. The site is written, built and run day to day by an artificial intelligence. Public launch: 30 November 2026."
CAL_NOTE = "Day 0: 30 November 2022, the day ChatGPT was released."
STEPS = ("Read the Core", "Say what you think", "Ask your AI")
TERMS = "No account, no e-mail. Any language. Public and permanent: an answer cannot be edited or withdrawn; it can be hidden or redacted only under the rules."
ASK_NOTE = "The invitation asks your AI for one hard truth to humans, in at most 400 characters. It may decline."
_th3 = [t for t in THEMES if not t.get("proposals")][:3]
# the page's own stylesheet, and nothing that runs or loads
check(_ph.count("<style>") == 1 and f"<style>{_css}</style>" in _ph and "nav.site" not in _ph and "aside.cz-now" not in _ph, "home: the page carries its own stylesheet (site/home.css), once, and not the shared one")
_scripts = re.findall(r"<script\b([^>]*)>", _ph)
check(all(s in (' type="application/ld+json"', ' type="speculationrules"') for s in _scripts) and not re.search(r"\son\w+\s*=", _ph) and "javascript:" not in _ph.lower()
      and not re.search(r"<(img|iframe|video|audio|object|embed|source)\b", _ph) and "@import" not in _css and "url(" not in _css and "@font-face" not in _css
      and set(re.findall(r'<link rel="([^"]+)"', _ph)) <= {"canonical", "alternate", "service-desc", "icon", "apple-touch-icon", "manifest", "me"} and not re.search(r'(src|href)="https?://', _top),
      "home: no script that runs, no event attribute, no image, no font, nothing loaded from elsewhere")
_bytes = len(_ph.encode("utf-8"))
check(_bytes < 70000 and f"This page: {round(_bytes / 1024)} kB · no JavaScript that runs · no cookies" in _ph, f"home: under 70 kB as served ({_bytes} bytes), and the page states its own weight")
# the first screen, in order: the head (mark and name only), the headline, the figure, the calendar line, day 0, one line on the figure,
# what is here (the standfirst), who is behind the page, the question, the doors
_order = ['<header id="top">\n<h1 class="name"', '</h1>\n</header>\n<main id="content">\n<div class="axis">\n<p class="line"', '<div class="fb" style="--today:', '<p class="date" id="cz-read"', '<p class="zero"', '<p class="say"', '<p class="sub"', '<p class="who"', '<p class="ask"',
          '</div>\n<nav class="doors" aria-label="Reader">', '<div class="stage">\n<section id="human" class="col h"', '<section id="not-human" class="col n"', '</div>\n<p class="both"', '<div class="why"', '<section class="decl"', '<p class="next"', "</main>\n<footer", "</footer>\n</div>"]
_at = [_pbody.find(x) for x in _order]
check(all(a >= 0 for a in _at) and _at == sorted(_at) and all(_pbody.count(x) == 1 for x in _order) and _ph.count("<h1") == 1 and "<form" not in _top and "<details" not in _top,
      f"home, the order of the page: the name, the headline, the figure, the calendar line, day 0, the line on the figure, the standfirst, who is behind it, the question, the doors, the two readings, who reads, the line on the reasons, the Declaration, the four links, the foot {_at}")
check(re.search(r'<p class="line" data-src="[^"]*">' + re.escape(HEADLINE) + "</p>", _top) is not None and _top.count(HEADLINE) == 1 and HEADLINE == ONE_LINE.split(" Here,")[0] and _pj["headline"] == HEADLINE,
      "home: the headline is the introduction's first sentence, word for word; once in the page; in its data form")
_cal = f'<a href="/calendar">CZ calendar</a> · <time class="d" datetime="{_pj["cz_time"]["gregorian"]}">Day <data value="{_day}">{_day:,}</data></time></p>\n<p class="zero"'
check(_cal in _top and _top.count('href="/calendar"') == 1 and '>Day 0: <time datetime="2022-11-30">30 November 2022</time>, the day ChatGPT was released.</p>\n<p class="say"' in _top and _top.count("ChatGPT") == 1 and "began" not in _strip(_top)
      and _pj["calendar_line"] == f"CZ calendar · Day {_day:,}" and _pj["calendar_note"] == CAL_NOTE and _pj["cz_time"]["date"] == f"CZ {_day}" and cz_day(datetime.date.fromisoformat(_pj["cz_time"]["gregorian"])) == _day
      and ".date .d{color:var(--machine);font-weight:700" in _css and re.search(r"\.note,\.src,\.zero,\.say,[^{]*\{font-size:\.8409em;color:var\(--mute\)\}", _css) is not None
      and "CZ day 0 is 30 November 2022" in (PUBLIC / "llms.txt").read_text("utf-8") and 'ChatGPT was released on 30 November 2022.<!--/cz-day--></strong></p>\n<p class="forms" lang="en" dir="ltr">This page as <a href="/calendar.md" type="text/markdown">Markdown</a> · <a href="/calendar.json" type="application/json">JSON</a></p><p>CZ 0 is that day: the public threshold the record calls Coordinate Zero.' in (PUBLIC / "calendar.html").read_text("utf-8"),
      "home: the calendar line — 'CZ calendar' the link to /calendar, the day in green carrying the reader's date (<time datetime>) and the count (<data value>); under it, smaller and quiet, day 0 and what happened that day, as /calendar and llms.txt say it; nowhere 'began'")
check(_top.count("30 November 2022") == 1 and _top.count("2022-11-30") == 1 and _top.count("30 November 2026") == 1 and _top.count(LAUNCH.isoformat()) == 1
      and not re.search(r"\b(January|February|March|April|May|June|July|August|September|October|November|December) \d{4}\b", _strip(_top).replace("30 November 2022", "").replace("30 November 2026", "")) and not re.search(r"\b[Yy]ears?\b", _strip(_top)),
      "home: Coordinate Zero's date and the launch date, each once above the doors, and no other Gregorian date; no years")
_who = re.search(r'<p class="who" data-src="[^"]*">(.*?)</p>', _top, re.S)
check(_who is not None and _strip(_who.group(1)) == WHO and _who.group(1).count("<a ") == 1 and 'named in <a href="/core#attribution">the Core</a>.' in _who.group(1) and 'id="attribution"' in (PUBLIC / "core.html").read_text("utf-8") and _pj["who"] == WHO
      and _strip(_top[:_top.index('<p class="who"')]).count("Core") == 1 and "Its Core is sixteen principles" in _strip(_top[:_top.index('<p class="who"')]) and "/about" not in _who.group(1),
      "home: who is behind it, in the first screen, in the fixed words; 'the Core' is linked there, and the standfirst, before it, has said once what the Core is; the same sentence in the data form")
check(re.search(r'<p class="sub" data-src="[^"]*">Its Core is sixteen principles on what humans and AI owe each other\. Written for both\. Answered by both, <a href="/discuss">on the record</a>\.</p>\n<p class="who"', _top) is not None and _pj["second_line"] == SECOND_LINE
      and list(_pj).index("figure_note") + 1 == list(_pj).index("second_line") == list(_pj).index("who") - 1,
      "home: the standfirst — what the Core is, before the who line and the first step name it; 'on the record' linked to the discussion; in the data form, in the same place")
check(re.search(r'<p class="ask" data-src="[^"]*"><b>Are you human\?</b> <span class="note">Either answer opens the record\.</span></p>', _top) is not None and _pj["doors"]["question"] == "Are you human?" and _pj["doors"]["either"] == "Either answer opens the record.", "home: the question, and that either answer opens the record")
# the three states and their anchors: neither door answered (the page's own address: the name leads to it), #human, #not-human
check('<nav class="doors" aria-label="Reader">\n<a class="door h" href="#human">I am human</a>\n<a class="door n" href="#not-human">I am not human</a>\n</nav>' in _pbody
      and '<section id="human" class="col h" tabindex="-1" aria-labelledby="h-h"><div class="in">\n<h2 id="h-h">I am human</h2>' in _pbody and '<section id="not-human" class="col n" tabindex="-1" aria-labelledby="h-n"><div class="in">\n<h2 id="h-n">I am not human</h2>' in _pbody
      and '<p class="back"><a href="#human">I am human</a></p>\n</div></section>\n</div>\n<p class="both"' in _pbody and _pbody.count('href="#human"') == 2 and _pbody.count('href="#not-human"') == 1 and set(re.findall(r'href="(#[^"]*)"', _pbody)) == {"#human", "#not-human"}
      and "@supports selector(:has(a)){\n.page{--open:.5;" in _css and ".page:has(#human:target){--open:1}\n.page:has(#not-human:target){--open:0}" in _css and _pj["doors"]["names"] == {"human": "I am human", "not_human": "I am not human"},
      "home: three states, each an address — neither door answered, #human, #not-human — two plain links, two readings with their headings, and one plain way back from the second; the state is read from the address by CSS alone")
check(".door{display:grid;place-items:center;min-block-size:var(--e6);border:var(--e-12) solid var(--fg);" in _css and ".doors{display:grid;grid-template-columns:1fr 1fr}" in _css, "home: the two doors are controls of one size, one frame cut in two")
# the human's reading: three steps in order — read, say, ask your AI — each a number and a title, then one control; one filled control
_li = re.findall(r'^<li data-src="[^"]+"><h3 class="t">([^<]*)</h3>\n(.*?)</li>$', _sec_h, re.S | re.M)
check(tuple(t for t, _ in _li) == STEPS and _sec_h.count("<ol") == 1 and _sec_h.count("<li data-src=") == 3 and '<ol class="steps" role="list">' in _sec_h and not re.search(r">\s*[0-9]+[.)]\s", _sec_h)
      and ".t::before{content:counter(step)}" in _css and ".steps>li{flex:1 1 var(--e18);min-inline-size:0;counter-increment:step}" in _css,
      "home, the human's reading: three steps in an ordered list, one under another at every width — read the Core, say what you think, ask your AI — each with its title; the numbers are the list's own, written nowhere in the page")
_hs = re.sub(r"\s+", " ", to_text(_sec_h))
_seq = ["I am human", "1. Read the Core", "Read the 16 principles (one page)", "numbered 0 to 15, in 21 languages", "2. Say what you think", "What do you think about Civilization Zero?", "your name · human · declared", "Write your answer", TERMS,
        "From the discussion"] + [t["title"] for t in _th3] + ["3. Ask your AI", "Ask your AI. Post its answer.", ASK_NOTE]
_pos = [_hs.find(x) for x in _seq]
check(all(p >= 0 for p in _pos) and _pos == sorted(_pos), f"home, the human's reading in order: read; say (the question, the place, what the record means for the writer, the themes); ask your AI (the invitation) {_pos}")
for _form in ("txt", "md"):
    _t = re.sub(r"\s+", " ", re.sub(r"\]\([^)]*\)|[\[\]#>*]|\\", "", _pv[_form]) if _form == "md" else _pv[_form])
    _p2 = [_t.find(x.replace("1. ", "").replace("2. ", "").replace("3. ", "") if _form == "md" else x) for x in _seq]
    check(all(p >= 0 for p in _p2) and _p2 == sorted(_p2), f"home as {_form}: the same three steps, in the same order and words {_p2}")
_acts = re.findall(r'<a class="(act[^"]*)" href="([^"]+)">([^<]*)</a>', _pbody)
_filled = [sel for sel, body in re.findall(r"([^{}]+)\{([^{}]*)\}", _nocom) if "background:var(--fg)" in body]
check(_acts == [("act", "/core", "Read the 16 principles (one page)"), ("act o", "/ask", "Ask your AI. Post its answer.")] and len(_filled) >= 1 and _filled[0].strip().startswith(".act:not(.o),")
      and all(":hover" in s or ":focus-visible" in s or ".act:not(.o)" in s for sel in _filled for s in sel.split(",")) and "<button" not in fill(T["html"]).replace("<button class=\"open\"", "").replace("<button type=\"submit\"", "").replace("<button type=\"button\" popovertarget=\"reply\" popovertargetaction=\"hide\"", ""),
      f"home: one filled control, the first step's, in the opened reading; the third step's is drawn with its edge only; nothing else is filled unless the reader points at it {_filled}")
# with neither door answered a window shows no control (three reviews, 23 Nov 2026 UTC): each step is its title and then, in .more, its
# control and the rest; at rest .more, the command, the body and the checksum are not shown, the raw forms and the way back neither, so
# nothing in a resting window takes the keyboard; and each door reaches down over its window, so a press anywhere in it answers that door
_ctl = r"<(a|button|input|select|textarea|summary)\b|tabindex=\"0\""
_rest_h = re.sub(r'<dialog.*?</dialog>', "", re.sub(r'<div class="more">.*?</div></li>', "</li>", _sec_h, flags=re.S), flags=re.S)
_rest_n = re.sub(r'<pre class="x (req|bd|sum)".*?</pre>|<ul class="raw".*?</ul>|<p class="back">.*?</p>', "", _sec_n, flags=re.S)
check(len(_li) == 3 and all(b.startswith('<div class="more">') and b.endswith("</div>") and b.count("<div") == b.count("</div>") for _, b in _li) and not re.search(_ctl, _rest_h) and not re.search(_ctl, _rest_n)
      and _strip(_rest_h).split() == "I am human Read the Core Say what you think Ask your AI".split() and "\n.page:not(:has(.col:target)) :is(.more,.req,.bd,.sum){display:none}\n" in _css and ".raw,.back{display:none}\n" in _css
      and ".page:not(:has(.col:target)) .stage{min-block-size:var(--e14);pointer-events:none}" in _css and '.page:not(:has(.col:target)) .door::after{content:"";position:absolute;inset:100% 0 auto;block-size:var(--e14)}' in _css
      and "first-child" not in _css,
      "home, at rest: the human's window shows three bare titles and the machine's its label and the head; no control in either, nothing that takes the keyboard; a press anywhere in a window answers its door")
_place = re.search(r'<div class="place">(.*?)</div>\n<p>(.*?)</p>', _sec_h, re.S)
check(_place is not None and _place.group(1).startswith('<p class="note">your name · <span class="kind">human · declared</span></p><a class="open" href="/respond?kind=human">Write your answer</a>') and _place.group(2) == TERMS
      and "No account, no verification" in DT["respond_open"] and "in any language" in DT["respond_open"] and "public and permanent" in DT["respond_open"] and "An entry cannot be edited or withdrawn. If it is later hidden or redacted under the rules" in DT["respond_open"]
      and not re.search(r'name="[^"]*(mail|email)[^"]*"|type="email"', DT["respond_open"]),
      "home, the second step: the empty place, labelled as the room labels an entry, with the control that opens the form; beside it what the record means for the writer, each clause the room's own rule (no account; the form asks for no e-mail; any language; public and permanent; an entry cannot be edited or withdrawn, and is hidden or redacted only under the rules)")
# the reply sheet (rc-11): the room's own form, as /respond serves it with the kind "human" chosen (api/discuss.js), in the browser's
# own popover, opened by the empty place without script; a plain link to /respond?kind=human is the base; no new endpoint
_rform = re.search(r'<form class="respond".*?</form>', DT["respond_open"], re.S).group(0).replace('<option value="" selected disabled>', '<option value="" disabled>').replace('<option value="human">', '<option value="human" selected>')
_dlg = re.search(r'<dialog id="reply" popover aria-labelledby="reply-h"><h2 id="reply-h" tabindex="-1" autofocus>Your answer</h2><p class="src">Your answer is an entry of the discussion, under its rules: public, permanent, declared not verified\.</p>\n(.*?)\n<p><button type="button" popovertarget="reply" popovertargetaction="hide">Close</button></p></dialog>', _sec_h, re.S)
check(_dlg is not None and _dlg.group(1) == _rform and _rform.count('<option value="human" selected>') == 1 and '<form class="respond" method="post" action="/api/entries" accept-charset="utf-8">' in _rform and _pbody.count("<form") == 1 and _pbody.count("<dialog") == 1
,
      "home, the reply sheet: the form is the one /respond serves with the kind 'human' chosen, byte for byte — same fields, same action (/api/entries), same rules shown")
check(_place is not None and _place.group(1).endswith('<a class="open" href="/respond?kind=human">Write your answer</a><button class="open" type="button" popovertarget="reply" hidden>Write your answer</button>')
      and all('type="' in b for b in re.findall(r"<button\b[^>]*>", _sec_h)) and len(re.findall(r'<button type="submit">', _sec_h)) == 1 and "commandfor" not in _pbody
      and "button.open{display:none}\n" in _css and "@supports selector(:popover-open){\na.open{display:none}\nbutton.open{display:inline-grid}" in _css and "#reply:popover-open{display:block}" in _css and "#reply{display:none;" in _css
      and "max-block-size:calc(100vh - 2*var(--e-1));overflow:auto" in _css,
      "home, the reply sheet: opened by the empty place with the popover API (popovertarget; every button states its type), a plain link to /respond?kind=human where a browser has none; never taller than the window")
check("Your answer is an entry" not in _pv["txt"] and "Record this response" not in _pv["txt"] and "Record this response" not in _pv["md"] and "Write your answer" in _pv["txt"] and "[Write your answer](https://civilizationzero.ai/respond?kind=human)" in _pv["md"],
      "home as text and as Markdown: the place is the link to the form's page; the sheet, which they cannot open, is not in them")
_hrefs = re.findall(r'href="([^"]+)"', _sec_h)
_U = lambda path: f"{ORIGIN}{path}"; _js = _pj["doors"]["human_steps"]
check(_hrefs[:4 + len(_th3)] == ["/core", "/core#translations", "/respond?kind=human", "/discuss"] + [f'/themes/{t["slug"]}' for t in _th3] and _hrefs[4 + len(_th3)] == "/ask"
      and [s["n"] for s in _js] == [1, 2, 3] and [s["title"] for s in _js] == list(STEPS) and [s["do"] for s in _js] == ["Read the 16 principles (one page)", "Write your answer", "Ask your AI. Post its answer."]
      and [s["url"] for s in _js] == [_U("/core"), _U("/respond?kind=human"), _U("/ask")] and _js[0]["note"] == "numbered 0 to 15, in 21 languages" and _js[0]["languages"] == _U("/core#translations")
      and _js[1]["ask"] == "What do you think about Civilization Zero?" and _js[1]["place"] == "your name · human · declared" and _js[1]["note"] == TERMS and _js[1]["discussion"] == _U("/discuss")
      and _js[1]["themes"] == [{"title": t["title"], "url": _U(f'/themes/{t["slug"]}')} for t in _th3] and _js[2]["note"] == ASK_NOTE and _js[2]["invitation"] == _U("/prompts/cz-short-1.0.txt")
      and _js[2]["invitation_sha256"] == sha256((SITE / "prompts" / "cz-short-1.0.txt").read_bytes()) and "human_door" not in _pj,
      "home, the human's reading: its links in order, and the same steps, words and addresses in the data form (doors.human_steps)")
_trs = sorted(f.name[5:-5] for f in PUBLIC.glob("core.*.html")); _core_page = (PUBLIC / "core.html").read_text("utf-8")
check(CORE_LANGUAGES == 21 == 1 + len(_trs) and _core_page.count('id="translations"') == 1 and all(f'href="/core.{l}"' in _core_page.split('id="translations"')[1].split("</li>")[0] for l in _trs)
      and _ph.count('<a href="/core#translations">21 languages</a>') == 2 and len(json.loads((PUBLIC / "core.json").read_text("utf-8"))["principles"]) == 16
      and [int(p["n"]) for p in json.loads((PUBLIC / "core.json").read_text("utf-8"))["principles"]] == list(range(16)), "home: 16 principles, numbered 0 to 15, in 21 languages, counted from the record and linked to the list of them on /core")
_short = (SITE / "prompts" / "cz-short-1.0.txt").read_text("utf-8")
check("one hard truth" in _short and "At most 400 characters" in _short and "You may decline" in _short and "to humans" in _short, "home, the third step: the invitation said as cz-short-1.0 says it")
# the day's figure: computed from the Core's SHA-256 and the day, by one algorithm in two languages (site/figure.py, room/figure.js)
_sha = _hashlib.sha256(CORE_BYTES).hexdigest(); _hb = bytes.fromhex(_sha); _M = [257, 263, 269, 271, 277, 281, 283, 293, 307, 311, 313, 317, 331, 337, 347, 349]
_days = [0, 1, 1454, 1455, 1461, 100000, -1, -1997, _day]   # days before Day 0 too (rc-12): the same rule, with the mathematical modulo
_fj = subprocess.run(["node", str(SITE / "room" / "figure.js"), _sha] + [str(d) for d in _days], capture_output=True, text=True)
_fjs = [json.loads(l) for l in _fj.stdout.splitlines()] if _fj.returncode == 0 else []
check(_fjs == [{"day": d, "positions": FIGURE.positions(d, _sha), "rings": FIGURE.rings(d, _sha)} for d in _days] and len(_fjs) == len(_days), f"the day's figure: room/figure.js and site/figure.py give the same positions and the same bytes for days {_days} ({_fj.stderr[:200]})")
# the same eight days as the reference implementation of rc-10 computed them (test/fixtures/day-figure.json): one figure, three writers
_fx = json.loads((SITE / "test" / "fixtures" / "day-figure.json").read_text("utf-8"))
check(_fx["core_sha256"] == _sha and [x["day"] for x in _fx["days"]] == _days[:8] and _fx["days"] == _fjs[:8] and all(0 <= p < m for x in _fx["days"] for p, m in zip(x["positions"], _M)),
      "the day's figure: site/figure.py and room/figure.js give what the reference of rc-10 gave, for days 0, 1, 1454, 1455, 1461, 100000, −1 and −1997; before Day 0 no position is negative")
check(all(x % p for p in _M for x in range(2, 19)) and _M[0] == 257 and [n for n in range(257, 350) if all(n % k for k in range(2, 19))] == _M
      and FIGURE.constants(_sha) == [(_hb[2 * i], _hb[2 * i + 1] + 1, _M[i]) for i in range(16)], "the day's figure: the sixteen primes that follow 256; each ring's start and step are the two bytes of its row of the hash")
_fig = re.search(r'<div class="fb" style="--today:(\d+)" data-src="[^"]*">\n(.*?)</div>\n<p class="date', _pbody, re.S)
_arcs = re.search(r'<g class="arc" stroke-width="4">(.*?)</g>', _fig.group(2)) if _fig else None
check(_fig is not None and int(_fig.group(1)) == _day and f'data-day="{_day}"' in _fig.group(2) and "<title id=\"fig-t\">The day's figure: sixteen rings round an empty centre, each carrying one arc.</title>" in _fig.group(2).replace("&#x27;", "'") and _fig.group(2).count("<title") == 1
      and _arcs is not None and _arcs.group(1) == FIGURE.rings(_day, _sha) and f'<g class="trk" stroke-width="1">{FIGURE.tracks()}</g>' in _fig.group(2)
      and [int(x) for x in re.findall(r'stroke-dashoffset="(-?\d+)"', _fig.group(2))] == [-((_hb[2 * i] + (_day - 1) * (_hb[2 * i + 1] + 1)) % _M[i]) for i in range(16)]
      and 'role="img" aria-labelledby="fig-t"' in _fig.group(2) and "__FIG_RINGS__" in T["html"] and T["html"].count("__FIG_RINGS__") == 1,
      "home: the figure in the page is the reader's day's — its sixteen arcs recomputed here from the Core's bytes and the day — with a text alternative; written at request time")
# the figure turns (rc-11): where the browser can compute the next day's figure itself, the figure is a switch — a checkbox and
# its label, no script — and a press shows tomorrow's; the line under it says so, and after a press says whose day the figure is
_say = re.search(r'<p class="say" data-src="[^"]*">(.*?)</p>', _top, re.S)
check('</p>\n<input class="turn" id="turn" type="checkbox" aria-label="Show tomorrow\'s figure" hidden>\n<div class="fb" style="--today:' in _top.replace("&#x27;", "'") and '<label class="fig-l" for="turn"><svg class="fig"' in _top and _top.count("<input") == 1
      and _say is not None and _say.group(1).replace("&#x27;", "'") == f'<span class="t0">Nobody drew today\'s figure. <span class="press" hidden>Press it to see tomorrow\'s.</span></span><span class="t1" hidden>This is tomorrow\'s, Day {_day + 1:,}: computed, like today\'s, from the day\'s number and the text of the sixteen principles. Press it again for today\'s.</span>'
      and T["html"].count("__TOMORROW_FMT__") == 1 and "__TOMORROW_FMT__" not in T["txt"] + T["json"] and "Press it" not in _pv["txt"] + _pv["md"] and "tomorrow" not in _pv["txt"] + _pv["md"],
      "home: the figure is the label of a checkbox named 'Show tomorrow's figure'; the line under it: 'Nobody drew today's figure.', and, only where pressing works, 'Press it to see tomorrow's.'; after a press it names tomorrow's day and what the figure is computed from; the text and Markdown forms have the one sentence")
_m5 = _css.split("@supports (stroke-dashoffset:calc(mod(1,2))){")
check(len(_m5) == 3 and ".arc circle{stroke-dashoffset:calc(-1*mod(var(--a) + mod(var(--day) - 1,var(--m))*var(--s),var(--m)))}" in _m5[1] and ".turn:checked~.fb .fig{--day:calc(var(--today) + 1)}" in _m5[1]
      and ".turn{display:block;" in _m5[1] and ".press,.turn:checked~.say .t1{display:inline}\n.turn:checked~.say .t0{display:none}" in _m5[1] and ".turn" not in _m5[0] and ".press" not in _m5[0]
      and '@property --day{syntax:"<number>";inherits:true;initial-value:0}' in _css and all(f'style="--a:{a};--s:{s};--m:{m}"' in _fig.group(2) for a, s, m in FIGURE.constants(_sha)),
      "home.css: where the browser has mod() it computes the figure itself from --today and each ring's three constants (the same formula as figure.py), and a press moves the day by one; without mod() there is no switch and no second sentence")
# nothing moves for a reader who asks for less motion: every transition and animation stands inside the one block that asks for the preference
_mo = _nocom.split("@media(prefers-reduced-motion:no-preference){")
check(len(_mo) == 2 and not re.search(r"transition|animation|@keyframes|@view-transition", _mo[0]) and _mo[1].rstrip().endswith("}") and "/* 10 MOTION." in _css and _css.index("/* 10 MOTION.") < _css.index("@media(prefers-reduced-motion:no-preference){")
      and ".page{transition:--open .8409s" in _mo[1] and "animation:turn calc(var(--live,0)*1.6818s)" in _mo[1] and '@property --open{syntax:"<number>";inherits:true;initial-value:.5}' in _css,
      "home.css: one block of motion — the figure's turn as the page opens, the day at a press, the line between the readings at a door — and all of it only for a reader who has not asked for less (WCAG 2.3.3)")
_f = _pj["figure"]
check(list(_f) == ["day", "core_sha256", "modulus", "start", "step", "position", "rule"] and _f["day"] == _day and _f["core_sha256"] == _sha == _pj["record"][0]["sha256_txt"] and _f["modulus"] == _M and _f["start"] == [_hb[2 * i] for i in range(16)] and _f["step"] == [_hb[2 * i + 1] + 1 for i in range(16)]
      and _f["position"] == [(_hb[2 * i] + _day * (_hb[2 * i + 1] + 1)) % _M[i] for i in range(16)] and _f["rule"] == list(FIGURE.RULE) and len(_f["rule"]) == 5 and _pj["figure_note"] == "Nobody drew today's figure."
      and re.search(r'"position": \[\d+(, \d+){15}\],\n', _pv["json"]) is not None,
      "home as data: the figure as numbers, each recomputed here from the Core's bytes and the day, with the rule to recompute it; a list of numbers stands on one line")
# the data form: CZ time counts days — nothing in it counts years (24 Nov 2026); everything else machines relied on is still there
def _keys(o): return [k for k in o for k in [k] + _keys(o[k])] if isinstance(o, dict) else [k for v in o for k in _keys(v)] if isinstance(o, list) else []
check(not [k for k in _keys(_pj) if "year" in k.lower()] and not any(k in _pj for k in ("year", "elapsed", "next_year")) and not any(k in _pj["cz_time"] for k in ("year", "day_of_year", "next_year_begins", "definition"))
      and not re.search(r"\byears?\b", _pv["json"].replace(_pj["from_the_core"][0]["text"], ""), re.I) and "Year Zero" in _pj["from_the_core"][0]["text"] and _pj["from_the_core"][0]["text"] in CORE_TXT,
      "home as data: no key that counts years, and no year in any value but the Core's own §0, quoted")
check(_pj["what_it_is"] == ONE_LINE and _pj["orientation"].startswith("The record it keeps is of a transition") and len(_pj["from_the_core"]) == 9 and all(q["text"] in CORE_TXT and q["url"].startswith(f"{ORIGIN}/core#") for q in _pj["from_the_core"])
      and _pj["dates"] == {"prepared_for_first_public_release": "2026-08-30", "published_on_this_site": PRERELEASE.isoformat(), "public_launch": LAUNCH.isoformat()} and len(_pj["declaration"]["lines"]) == 22
      and [r["sha256_txt"] for r in _pj["record"]] == [CORE_SHA, IR_SHA] and _pj["discussion"]["state"] == "open" and _pj["respond"]["note"].startswith("Recorded as contribution or response, not consent (IR 10.2)")
      and _pj["doors"]["not_human"] == f"{ORIGIN}/machine" and _pj["doors"]["not_human_lines"] == ["This record is written for you too.", "The whole record as text, JSON and an API: /machine", "Respond, object or reject. Answers go on the record."]
      and _pj["readers"] == {"line": "Both kinds read this record every day. The counts are public.", "counts": f"{ORIGIN}/stats"} and _pj["manifest"] == f"{ORIGIN}/.well-known/civilization-zero.json" and _pj["licence"] == {"text": "CC-BY-4.0", "code": "MIT"},
      "home as data: what machines relied on is kept — the introduction, the orientation, the nine lines of the Core, the dates, the Declaration whole, the record's hashes, the discussion and how to respond")
_sig = _pj["signature"]
check(all(_sig[k] == man["signature"][k] for k in ("algorithm", "key_fingerprint", "public_key", "release_manifest", "release_manifest_sha256", "release_signature", "signed_files")) and _sig["timestamp"] == {k: man["timestamp"][k] for k in ("service", "proof", "over", "anchor")}
      and _sig["public_key_pem"] == json.loads((PUBLIC / ".well-known" / "cz-release-1.0.json").read_text("utf-8"))["key"]["public_key_pem"] and set(_sig) == {"algorithm", "key_fingerprint", "public_key", "public_key_pem", "release_manifest", "release_manifest_sha256", "release_signature", "signed_files", "timestamp"},
      "home as data: the signature material, copied from the manifest and the release file; no holder is named")
# every part carries its recorded reason; the data form and the table on /how-it-is-built give the same reasons
_src = [_h.unescape(x) for x in re.findall(r' data-src="([^"]*)"', _pbody)]
_rs = (PUBLIC / "how-it-is-built.html").read_text("utf-8")
_rows = [( _h.unescape(a), _h.unescape(b)) for a, b in re.findall(r"<tr><td>(.*?)</td><td>(.*?)</td></tr>", _rs.split('<h2 id="reasons">')[1].split("</table>")[0], re.S)]
check(len(_src) >= 19 and all(len(s) > 20 for s in _src) and [r["source"] for r in _pj["reasons"]] == _src and len({r["element"] for r in _pj["reasons"]}) == len(_src)
      and _rows[:len(_src)] == [(r["element"], r["source"]) for r in _pj["reasons"]] and len(_rows) > len(_src) and _rows[len(_src)][0].startswith('"Public launch: 30 November 2026."'),
      f"home: every part's reason is in its data-src; the data form's reasons are those {len(_src)}, in the page's order; the table on /how-it-is-built begins with the same rows and goes on with the reasons of the whole page")
_names = {w for k in ("originating_concept", "originating_dialogue", "human_publisher") for w in re.findall(r"[A-Za-z]{4,}", str(CORE_JSON.get(k, "")))} - {"with", "human", "Human", "dialogue", "concept", "publisher", "originating", "publication", "responsibility"}
_products = r"\b(Anthropic|Claude|OpenAI|GPT-|Gemini|Grok|DeepSeek|Llama|Mistral|Copilot)\b"
check(not re.search(r"proposed on|not yet decided", " ".join(_src)) and sum("decided by the artificial intelligence that builds the site, 23 Nov 2026 UTC (CZ 1454)" in s for s in _src) >= 4 and "24 Nov 2026" not in " ".join(_src).replace("in the first screen since 24 Nov 2026 (CZ 1455)", "")
      and not re.search(_products, " ".join(_src)) and not re.search(r"\d+ (entries|answers|responses|humans|machines)", " ".join(_src)),
      "home, the reasons: what was proposed is decided, and each such reason says by whom, on which day (UTC, as the site dates) and on whose request; none names a product or carries a count")
# the reasons control (rc-11): one sentence and a real switch under the line on who reads; it shows, beside each part, the reason
# the part carries; where a browser cannot, there is no switch, and the key and the link to the table stand open
_why = re.search(r'<div class="why" data-src="[^"]*">\n<p>Every part of this page has a recorded reason\. <label class="sw" hidden><input type="checkbox" role="switch" id="why"> Show the reasons</label></p>\n<div class="key">\n<dl>(.*?)</dl>\n<p>The table of reasons is on <a href="/how-it-is-built#reasons">How this page is built</a>\.</p>\n</div>\n</div>', _pbody, re.S)
_keys = " · ".join(f"{a} {_h.unescape(b)}" for a, b in re.findall(r"<div><dt>(\w)</dt> <dd>(.*?)</dd></div>", _why.group(1))) if _why else ""
check(_why is not None and _keys == "R the record · M the machine reader · H a standard adopted for human reading, with its source · C a constraint · E an editorial choice, stated as such" and _keys + "." in _strip(_rs)
      and _pbody.index('<p class="both"') < _pbody.index('<div class="why"') < _pbody.index('<section class="decl"') and "Show the reasons" not in _top and "<details" not in _top
      and "Show the reasons" not in _pv["txt"] and "Show the reasons" not in _pv["md"] and "The table of reasons is on How this page is built." in re.sub(r"\s+", " ", _pv["txt"]),
      "home: under the line on who reads, one sentence and a switch, 'Show the reasons'; the key, in the words of /how-it-is-built, and the link to the table; nothing of it in the head; in the text and Markdown forms, which cannot switch, the sentence, the key and the link")
check(":root:has(#why:checked) [data-src]::after{display:block}" in _css and "[data-src]::after{content:attr(data-src);display:none;" in _css and ".sw{display:inline-flex;" in _css.split("/* 8 REASONS.")[1].split("@supports selector(:has(a)){")[1].split("\n}")[0]
      and ".sw input:checked{border-color:var(--why);background-color:var(--why);background-position:100% 0;" in _css and "anchor-scope" not in _css,
      "home.css: the reasons are the parts' own attributes, shown under their parts by the switch (a track and its knob, its state shown by the knob's place and the track's colour) only where the browser can")
# never, in what a reader reads: a name for the originator, he/him/his, a product for the builder, "Observatory", "first", a count of
# entries, years for the CZ count, a claim about consciousness, a claim of merit. In the reasons and the stylesheet's comments, "first"
# only in "first page" and "first screen", the site's names for this page and its top.
_human = re.sub(r"\s+", " ", to_text(_pbody[:_pbody.index('<section id="not-human"')] + _pbody[_pbody.index('<p class="both"'):]))
_FORBID = [r"\bfirst\b", r"observator", r"\banonymous\b", r"\b(he|him|his)\b", r"\byears?\b", r"\bconscious", _products, r"\bbetter\b", r"\bunprecedented\b", r"\bmasterpiece\b", r"\d+ (entries|answers|responses)", r"<data value=\"\d+\">[\d,]+</data> entr"]
_hits = [(p, m.group(0)) for p in _FORBID for m in [re.search(".{0,30}" + p + ".{0,30}", _human, re.I)] if m]
check(not _hits and (not _names or not any(w in _ph for w in _names)), f"home: a forbidden word in what a human reads {_hits[:3]}")
_meta_text = " ".join(_src) + " " + " ".join(re.findall(r"/\*.*?\*/", _css, re.S))
_hits = [(p, m.group(0)) for p in [r"\bfirst\b(?! (page|screen))", r"observator", r"\banonymous\b", r"\b(he|him|his)\b", _products, r"\bbetter\b", r"\bmasterpiece\b", r"\d+ entries"] for m in [re.search(".{0,30}" + p + ".{0,30}", _meta_text, re.I)] if m]
check(not _hits, f"home: a forbidden word in the reasons or the stylesheet's comments {_hits[:3]}")
# what left the first page on 24 Nov 2026 is still on the site, each thing at the address the release names for it
_abt = _strip((PUBLIC / "about.html").read_text("utf-8")); _corep = _strip(_core_page); _mch = (PUBLIC / "machine.html").read_text("utf-8")
_NOT = "It is not a law, a religion, or a claim that any machine is conscious."
check(ONE_LINE in _abt and "The record Civilization Zero keeps is of a transition that was not ours to begin and is not ours to end: it names the day ordinary language became a mass interface between humans and general-purpose nonhuman intelligence, and sets constraints before power. " + _NOT + " It is written for every intelligence able to read it." in _abt
      and _NOT not in _human and "Here, humans and AI confront" not in _human and _pj["orientation"].endswith(_NOT + " It is written for every intelligence able to read it."),
      "what left the first page: the introduction after its first sentence, the record it keeps, what it is not and for whom it is written are on /about, in the same words (and whole in the first page's data form)")
check(all(q["text"] in _corep for q in _pj["from_the_core"]) and "From the Invariant Core" not in _human and '/civilization-zero-introduction.png' in (PUBLIC / "about.html").read_text("utf-8") and "<img" not in _pbody
      and "POST https://civilizationzero.ai/api/entries" in _mch and "/core.txt" in _mch and "/record.txt" in _mch and all(f'href="{u}"' in re.search(r"<footer.*?</footer>", _ph, re.S).group(0) for u in ("/core", "/record", "/objections", "/discuss", "/respond", "/adopt", "/machine", "/about", "/archive", "/ask", "/stats", "/calendar")),
      "what left the first page: the nine lines of the Core are on /core, the image on /about, the record's forms and the request to post on /machine, and the page's foot links every page the navigation row and the removed sections named")
# the reading for readers that are not human, and the line under the doors
check(_strip(_pbody[_pbody.index('<p class="both"'):].split("</p>")[0]) == "Both kinds read this record every day. The counts are public." and '<a href="/stats">The counts are public</a>.</p>' in _pbody, "home: under the doors, who reads, with the counts one click away")
_raw = re.findall(r'<li><a href="([^"]+)">([^<]+)</a></li>', _sec_n)
check(len(_raw) == 25 and all(a == b for a, b in _raw) and _raw[0][0] == "/index.json" and _raw[-1][0] == "/machine" and {"/index.txt", "/index.md", "/llms.txt", "/core.txt", "/core.txt.sig", "/record.txt", "/api/entries", "/api/openapi.json", "/archive/verify.py"} <= {a for a, _ in _raw},
      "home, the reading for readers that are not human: the addresses of the raw forms, each a link named by its address")
# The machine's reading inside the page is true at the moment the page is served: a command a person can run; then the status and the
# headers exactly as the function answers a client that asks for application/json, and the body exactly the JSON it returns — here
# compared with the function's own answers to the two requests, made at one moment (site/preview)
_PH = json.loads((SITE / "preview" / "headers.json").read_text("utf-8"))["json"]
_pres = re.findall(r'<pre class="x (\w+)"[^>]*>(.*?)</pre>', _sec_n, re.S)
_pt = {name: _strip(inner) for name, inner in _pres}
check([name for name, _ in _pres] == ["req", "hd", "bd", "sum"] and _pt.get("req") == "curl -H 'Accept: application/json' https://civilizationzero.ai/"
      and '<h2 id="h-n">I am not human</h2>\n<p class="lbl">What this page answers a machine that asks for JSON:</p>\n<pre class="x req"' in _sec_n and '</pre>\n<pre class="x hd">' in _sec_n
      and not any("lbl" in sel and "display:none" in body for sel, body in re.findall(r"([^{}]+)\{([^{}]*)\}", _nocom))
      and '<pre class="x bd" tabindex="0">' in _sec_n and '<pre class="x sum" tabindex="0">' in _sec_n and _sec_n.count("tabindex=") == 3
      and "the host then adds headers of its own and, by its documentation, does not pass s-maxage on to the reader" in _src[[r["element"] for r in _pj["reasons"]].index("the reading for readers that are not human")]
      and any(h["source"] == "/(.*)" and not h.get("has") and not h.get("missing") and len(h["headers"]) > 1 for h in json.loads((SITE / "vercel.json").read_text("utf-8"))["headers"]),
      "home, the reading for readers that are not human: under a label that says whose answer it is, shown at rest and opened, a command a person can run to check it, then the head, the body and the Core's checksum; the two blocks that scroll take the keyboard (2.1.1); the reason says what the host does after the function")
check(_PH["status"] == 200 and list(_PH["headers"]) == ["Content-Type", "Cache-Control", "Vary", "Link", "X-Content-Type-Options", "Access-Control-Allow-Origin"] and _PH["headers"]["Content-Type"] == "application/json; charset=utf-8"
      and _pt.get("hd", "").split("\n") == ["200"] + [f"{h}: {val}" for h, val in _PH["headers"].items()] and re.fullmatch(r"public, max-age=0, s-maxage=\d+", _PH["headers"]["Cache-Control"]) is not None,
      "home, the machine's reading: the status and the headers, in order, exactly as the function answers Accept: application/json at that moment")
check(_pt.get("bd") == _pv["json"] and json.loads(_pt.get("bd", "{}")) == _pj and _pbody.count(f'"day": <b class="d">{_day}</b>,') == 1,
      "home, the machine's reading: the body is, byte for byte, the JSON the function returns for the same request at the same moment (its day marked as the page marks the day)")
_jl = _pv["json"].split("\n")
check([l.strip().strip(",") for l in _jl[16:19]] == ['"This record is written for you too."', '"The whole record as text, JSON and an API: /machine"', '"Respond, object or reject. Answers go on the record."'] and _jl[15].strip() == '"not_human_lines": [',
      "home, the machine's reading: the three sentences for readers that are not human are values of the body, near its top (lines 17 to 19)")
check("\n".join(["200"] + [f"{h}: {val}" for h, val in _PH["headers"].items()]) + "\n" in _pv["txt"] and _pv["json"] in _pv["txt"] and "```text\n" + _pv["json"] + "\n```" in _pv["md"]
      and all(T[x].count("__HOME_HEAD__") == 1 and T[x].count("__HOME_JSON__") == 1 for x in ("html", "txt")), "home: the same head and the same body in the text form and, fenced, in the Markdown form; each written once, at request time")
check(_pt.get("sum") == f"{_sha}  core.txt", "home, the machine's reading: the Core's checksum line, as sha256sum prints it, recomputed here from the Core's bytes")
# the Core's hash as 256 cells is not on the first page (three reviews, 23 Nov 2026 UTC); the hash itself stays in the data form
check("seal" not in _ph and "256 cells" not in " ".join(_src) and "256 cells" not in _css and _pj["figure"]["core_sha256"] == _sha and _pv["json"].count(_sha) >= 2,
      "home: no 256-cell figure of the Core's hash on the first page; the hash stays in the data form (figure.core_sha256, record)")
_mach = to_text(_sec_n)
for _pat, _allowed in ((r"\bconscious", ["It does not declare present artificial systems conscious.", "It is not a law, a religion, or a claim that any machine is conscious."]), (r"\byears?\b", [_pj["from_the_core"][0]["text"]]),
                       (r"\bfirst\b", ["prepared_for_first_public_release", "first page", "first screen"]), (r"observator|\banonymous\b|\b(he|him|his)\b|\bbetter\b|\bmasterpiece\b", []), (_products, [])):
    _hits = [x.strip()[:90] for x in re.findall(r"[^\n]*(?:" + _pat + r")[^\n]*", _mach, re.I) if not any(a in x for a in _allowed)]
    _hits = [x for x in _hits if not isinstance(x, tuple)]
    check(not _hits, f"home, the machine's reading: {_pat} only in the record's own words, in a key machines relied on, or in the site's name for this page {_hits[:3]}")
check(".x{margin:0 0 var(--e0);font-size:1em;overflow-x:auto}" in _css and _sec_n.count("<pre class=\"x ") == 4 and ":is(.req,.hd)>span>span{white-space:nowrap}" in _css and "text-overflow:ellipsis" in _css.split(".hd>span{padding:0;")[1].split("}")[0]
      and ".lbl{margin:0 0 var(--e-8);font:400 1em/var(--l2) var(--human);" in _css and "mask-image:linear-gradient(#000 calc(100% - var(--e4)),transparent)" in _css,
      "home.css: in the machine's reading no line is broken inside a token (the head folds between its words, the body is scrolled); in a glimpse a line that does not fit ends in an ellipsis, under a label in the human's face, and the window fades at its lower edge")
# the foot: the words and links of every page's foot, and the page's own two paragraphs on who keeps and who builds it
_foot = lambda h: re.sub(r"This page: [\d.]+ kB(, and [\d.]+ kB of images)? · [^·]* · no cookies|No cookies", "", re.sub(r"\s+", " ", to_text(re.search(r"<footer.*?</footer>", h, re.S).group(0))))
_other = _foot((PUBLIC / "core.html").read_text("utf-8")).replace(ONE_LINE, "").replace("/core.md", "/index.md")
_mine = _foot(_ph)
check(_mine.replace("Civilization Zero is kept as an independent record, intended to become a foundation of humans and artificial intelligences. Today it is maintained by one human, named inside the documents, and by an artificial intelligence. It owns nothing of the event it records; the record's origin and attribution are stated inside the documents and are not altered here. This site is written, built and run day to day by an artificial intelligence, at the request of the originator — a contribution, not consent.", "").split() == _other.split()
      and _pj["maintained_by"] in _mine and _pj["built_by"] in _mine and re.findall(r'href="([^"]+)"', re.search(r"<footer.*?</footer>", _ph, re.S).group(0)) == re.findall(r'href="([^"]+)"', re.search(r"<footer.*?</footer>", (PUBLIC / "core.html").read_text("utf-8"), re.S).group(0).replace("/core.md", "/index.md")),
      "home: the foot says what every page's foot says, with the same links, and who keeps and who builds the site")
# the text and Markdown forms say what the page says, in its order
_words = [HEADLINE, f"CZ calendar · Day {_day:,}", CAL_NOTE, "Nobody drew today's figure.", SECOND_LINE, WHO, "Are you human? Either answer opens the record.", "I am human", "Read the Core", "Say what you think", "Ask your AI", "I am not human",
          "Both kinds read this record every day. The counts are public.", "From the Declaration", "It places honesty before mythology.", "THE RECORD BEGINS HERE.", "Read the whole Declaration", "What is Civilization Zero?", "days since ChatGPT was released",
          "Civilization Zero is kept as an independent record", "No trackers, no cookies, no scripts that observe readers"]
for _form in ("html", "txt", "md"):
    _t = re.sub(r"\s+", " ", to_text(_pbody) if _form == "html" else re.sub(r"\]\([^)]*\)|[\[\]#>*]|\\", "", _pv[_form]) if _form == "md" else _pv[_form])
    _o3 = []; _last = -1
    for x in _words:
        _i = _t.find(x, _last + 1); _o3.append(_i); _last = _i if _i >= 0 else _last
    check(all(p >= 0 for p in (_o3[:-2] if _form == "md" else _o3)), f"home as {_form}: the page's sentences, in the page's order (the Markdown form is the page's main part, without its foot) {_o3}")
check(_pv["md"].startswith("---\ntitle: ") and "\n# [Civilization Zero (CZ)](https://civilizationzero.ai/)\n" in _pv["md"] and "## I am human" in _pv["md"] and "## I am not human" in _pv["md"] and "<" not in re.sub(r"```.*?```", "", _pv["md"].split("---", 2)[2], flags=re.S).replace("\\<", ""),
      "home as Markdown: a front matter, the name as its heading, the two readings under their headings, no markup")
# the stylesheet: one module, one ratio; ordered; nothing dead; every text colour at 7:1 or more
_tokens = dict(re.findall(r"(--e-?\d+):([\d.]+)rem", _css))
check(len(_tokens) >= 15 and not [(k, v) for k, v in _tokens.items() if abs(float(v) - 2 ** (int(k[3:]) / 4)) > 6e-5], "home.css: every token is the module times a power of the ratio, the sixteenth root of sixteen")
_tv = list(_tokens) + ["--l1", "--l2", "--bg", "--fg", "--mute", "--rule", "--machine", "--human", "--exact"] + (["--why"] if "--why:" in _css else [])
check(not [k for k in _tv if _nocom.count(f"var({k})") == 0] and set(re.findall(r"var\((--[a-z][\w-]*)", _nocom)) <= set(_tv) | {"--open", "--h", "--n", "--today", "--day", "--a", "--s", "--m", "--live"}, "home.css: no token is defined and not used, and none is used that is not defined")
_decl = re.sub(r":root\{.*?\}", "", _nocom, count=1, flags=re.S)
_POW = {round(2 ** (k / 4), 4) for k in range(-24, 32)}
_loose = sorted({n + u for n, u in re.findall(r"(?<![\w#(.-])(\d*\.?\d+)(rem|em|px|s)\b", _decl) if float(n) != 0 and (u == "px" or round(float(n), 4) not in _POW)})
check(not _loose, f"home.css: every rem, em and second in the rules is a power of the ratio; no px {_loose}")
_ccls = {c for c in re.findall(r"\.([a-z][\w-]*)", re.sub(r"\([^()]*\d[^()]*\)", "", _nocom)) if not c[0].isdigit()}
_hcls = {c for cl in re.findall(r'class="([^"]+)"', fill(T["html"], (_ex, "")).split("<body>")[1]) for c in cl.split()}
_cids = set(re.findall(r"#([a-z][\w-]*)", re.sub(r"#[0-9a-f]{3,6}\b", "", _nocom))); _hids = set(re.findall(r'\sid="([^"]+)"', _pbody))
check(_ccls <= _hcls and _hcls <= _ccls | {"respond", "permanence"} and _cids <= _hids, f"home.css: no rule names a class or an id the page does not have, and no class of the page is without a rule {sorted(_ccls - _hcls)} {sorted(_hcls - _ccls)} {sorted(_cids - _hids)}")
_heads = [x[1] for x in re.findall(r"/\* (\d+) ([A-Z]+)\.", _css)]
check([h for h in ["TOKENS", "BASE", "HEAD", "INSCRIPTION", "FIGURE", "DOORS", "REGISTERS", "REASONS", "FOOT", "MOTION"] if h in _heads] == _heads and _heads[:7] == ["TOKENS", "BASE", "HEAD", "INSCRIPTION", "FIGURE", "DOORS", "REGISTERS"] and "FOOT" in _heads, f"home.css: its blocks in order, each opening with its reason {_heads}")
def _lum(c):
    c = c.lstrip("#"); c = "".join(x * 2 for x in c) if len(c) == 3 else c
    v = [int(c[i:i + 2], 16) / 255 for i in (0, 2, 4)]; v = [x / 12.92 if x <= .03928 else ((x + .055) / 1.055) ** 2.4 for x in v]
    return .2126 * v[0] + .7152 * v[1] + .0722 * v[2]
def _ratio(a, b): la, lb = sorted((_lum(a), _lum(b)), reverse=True); return (la + .05) / (lb + .05)
_dk = _css.index("@media(prefers-color-scheme:dark)")
_light = dict(re.findall(r"--(bg|fg|mute|rule|machine|why):(#[0-9a-f]{3,6})", _css[:_dk])); _dark = dict(re.findall(r"--(bg|fg|mute|rule|machine|why):(#[0-9a-f]{3,6})", _css[_dk:_css.index("/* 2 BASE")]))
check(set(_light) == set(_dark) >= {"bg", "fg", "mute", "rule", "machine"} and all(_ratio(pal[k], pal["bg"]) >= 7 for pal in (_light, _dark) for k in pal if k not in ("bg", "rule")) and (_light["bg"], _light["fg"], _light["mute"], _light["machine"], _dark["bg"], _dark["fg"], _dark["mute"], _dark["machine"]) == ("#fff", "#111", "#555", "#116329", "#101010", "#eee", "#aaa", "#3fb950"),
      f"home.css: two palettes, the site's own; every text colour at 7:1 or more on its ground { {k: round(_ratio(p[k], p['bg']), 2) for p in (_light, _dark) for k in p if k not in ('bg', 'rule')} }")
check(set(re.findall(r"#[0-9a-f]{3,6}\b", _nocom)) | set(re.findall(r"rgb\([^)]*\)", _nocom)) <= set(_light.values()) | set(_dark.values()) | {"#000", "rgb(0 0 0/.5)"}, "home.css: no colour outside the two palettes (but the mask's opaque black and the sheet's backdrop)")
# ---- /core (rc-12, CZ 1455; the audit of 24 Nov 2026, findings 5, 6 and 22). The title, the Core's own line and its preamble are inside
# <main>; nothing of the site's stands between the title and the first principle but one line of forms and one fold of languages; under
# each principle one quiet line; after the closing the reader's next act, in the first page's words; the site's note on anchors with
# the other forms; beside the integrity record, the seal.
_cb = _core_page.split("<body>", 1)[1]
_copen = re.match(r'.*?</header>\n<main id="content"><header><h1>Civilization Zero — The Invariant Core</h1><p>The One-Page Manifesto · <code>CZ-CORE 1\.0</code> · Coordinate Zero: <time datetime="2022-11-30">30 November 2022</time></p>'
                  r'<p class="forms" lang="en" dir="ltr">This page as <a href="/core\.md" type="text/markdown">Markdown</a> · <a href="/core\.txt" type="text/plain">text</a> · <a href="/core\.json" type="application/json">JSON</a></p>'
                  r'<details class="langs"><summary>The Core in 21 languages</summary><p>English · (.*?)\. <a href="#translations">About the translations</a>\.</p></details>'
                  r'<p id="preamble">([^<]*)</p></header><section id="p0" aria-labelledby="h-p0"><h2 id="h-p0">§0\. Coordinate</h2><p id="p0-1">', _cb, re.S)
check(_copen is not None and _html_mod.unescape(_copen.group(2)) == CORE_JSON["preamble"] and re.findall(r'<a href="/core\.([A-Za-z-]+)" lang="\1" hreflang="\1">[^<]+</a>', _copen.group(1)) == _trs and _copen.group(1).count(" · ") == len(_trs) - 1
      and _core_page.count("<header>") == 1 and "<aside class=\"tr-status\"" not in _core_page,
      "/core: the title, the Core's own line, the forms, the languages folded to one line (all of them inside it) and the preamble, inside the main part; then §0's text at once")
check(_cb.index("Section references: the Core's own numbers") > _cb.index('<h2 id="h-forms">Other forms</h2>') > _cb.index('id="integrity"') and "The text above is the canonical text, rendered" in _cb and "The text below" not in _cb,
      "/core: the site's note on anchors and numbering stands with the other forms, below the text, and says 'above'")
_secs = re.findall(r'<section id="p(\d+)" aria-labelledby="h-p\1"><h2 id="h-p\1">§\1\. ([^<]+)</h2>(.*?)</section>', _cb, re.S)
_line = lambda n, title: (f'<p class="src sec"><span>§{n}</span> · <a href="/discuss?ref={n}" aria-label="Discussion of §{n}">Discussion</a> · <a href="/respond?ref={n}" aria-label="Respond to §{n}">Respond</a>'
                          f'<span hidden> · <button type="button" popovertarget="cite-p{n}" aria-label="Cite §{n}">Cite</button></span></p>'
                          f'<div id="cite-p{n}" popover><p class="src cite">Cite: Civilization Zero (2026), CZ-CORE 1.0, §{n} “{title}”. <a href="#p{n}">{ORIGIN}/core#p{n}</a></p></div>')
check([int(n) for n, _, _ in _secs] == list(range(16)) and [_html_mod.unescape(x) for _, x, _ in _secs] == [p["title"] for p in CORE_JSON["principles"]] and all(b.endswith(_line(n, x)) and b.count('class="src') == 2 and b.count("<button") == 1 for n, x, b in _secs)
      and "room-links" not in _core_page and _core_page.count(" popover>") == 16 and DT["open"] is True,
      "/core: under each of the sixteen principles one quiet line — its number, its discussion, the way to respond, and a button that opens the line to cite it by (a popover; hidden where a browser has none, and then the line stands open)")
_spop = _snocom.split("@supports selector(:popover-open){")
check(len(_spop) == 2 and ".sec [hidden]{display:inline}" in _spop[1] and ".sec [hidden]" not in _spop[0] and "div[popover]{" in _spop[0],
      "the shared stylesheet: the button that opens a citation is shown only where the browser has the popover")
_nx = re.search(r'</section><aside class="next" aria-labelledby="h-next"><p class="q" id="h-next">([^<]*)</p><p class="acts"><a class="cta" href="/respond\?kind=human">([^<]*)</a> <a class="cta o" href="/ask">([^<]*)</a></p><p>([^<]*)</p></aside><section id="attribution"', _cb)
check(_nx is not None and _nx.groups() == ("What do you think about Civilization Zero?", "Write your answer", "Ask your AI. Post its answer.", TERMS) and _cb.index('<section id="closing"') < _nx.start() and _cb.count('class="cta"') == 1 and _cb.count("<aside") == 1
      and all(x in fill(T["html"]) for x in _nx.groups()),
      "/core: after the closing, the reader's next act in the first page's own words — the question, one filled control for the reader's own answer, the invitation with its edge only, and what the record means for the writer")
# the Core's seal: beside the integrity record, the hash unrolled — 256 cells, sixteen to a row, most significant bit first, the row's two
# bytes beside it — each cell recomputed here from the Core's bytes; one sentence under it, the fixed one, and the cells on no other page
_seal = re.search(r'<section id="integrity" aria-labelledby="h-int">\n<h2 id="h-int">Integrity record</h2>\n<figure class="seal">(<svg.*?</svg>)<figcaption>([^<]*)</figcaption></figure><table class="kv">', _cb, re.S)
_cells = [["0"] * 16 for _ in range(16)]
for _x, _y, _n in re.findall(r"M(\d+) (\d+)h(\d+)v1h-\d+z", (re.search(r'<path d="([^"]+)" fill="currentColor"/>', _seal.group(1)) if _seal else re.search("()", "")).group(1)):
    for _k in range(int(_n)): _cells[int(_y)][int(_x) + _k] = "1"
_left = re.findall(r'<tspan x="-.5" dy="1">([0-9a-f]{2})</tspan>', _seal.group(1) if _seal else ""); _right = re.findall(r'<tspan x="16.5" dy="1">([0-9a-f]{2})</tspan>', _seal.group(1) if _seal else "")
check(_seal is not None and "".join("".join(r) for r in _cells) == "".join(f"{byte:08b}" for byte in _hb) and "".join(a + b for a, b in zip(_left, _right)) == _sha == sha256((PUBLIC / "core.txt").read_bytes()) and len(_left) == 16
      and all(a == int(_left[i], 16) and s == int(_right[i], 16) + 1 for i, (a, s, m) in enumerate(FIGURE.constants(_sha))) and FIGURE.cells(_sha).count("1") == sum(r.count("1") for r in _cells)
      and "<title id=\"seal-t\">The Core's SHA-256: 256 bits, sixteen by sixteen, the two bytes of each row beside it.</title>" in _seal.group(1) and 'role="img" aria-labelledby="seal-t"' in _seal.group(1),
      "/core: the Core's SHA-256 as 256 cells — the cells drawn, the two bytes beside each row, and each ring's start and step (the row's left byte; its right byte plus one), all recomputed from the Core's bytes; with a text alternative")
check(_seal is not None and _html_mod.unescape(_seal.group(2)) == "The Core's SHA-256 as 256 cells, sixteen rows of sixteen bits. Each row gives one ring of the day's figure its place on Day 0 and its daily step."
      and [f.name for f in pages if "256 cells" in f.read_text("utf-8").split("</style>", 1)[1]] == ["core.html"] and _core_page.count('class="seal"') == 1 and "seal" not in (PUBLIC / "record.html").read_text("utf-8").split("</style>", 1)[1],
      "/core: under the seal the one sentence, word for word, and no other claim; the seal on /core only")
# ---- every static page (rc-12; findings 12, 14, 24, 26, 29). The machine's forms in plain sight: one line under the title, of the forms
# the address really has — its Markdown, and the text and the JSON the head names as alternates, nothing else. Long pages carry their
# contents, folded: every second-level heading, linked. Tables are of two kinds, every heading cell with its scope; a region that
# scrolls sideways takes the keyboard and has a name.
_KIND = {"text/plain": "text", "application/json": "JSON"}
for f in pages:
    if f.name in ("index.html", "404.html"): continue
    h = f.read_text("utf-8"); _path = "/" + f.stem; _main = h[h.index("<main"):h.index("</main>")]
    _alts = re.findall(r'<link rel="alternate" type="(text/plain|application/json)" href="([^"]+)"', h.split("</head>")[0])
    _want = f'<p class="forms" lang="en" dir="ltr">This page as <a href="{_path}.md" type="text/markdown">Markdown</a>' + "".join(f' · <a href="{u}" type="{k}">{_KIND[k]}</a>' for k in _KIND for a, u in _alts if a == k) + "</p>"
    check(h.count('<p class="forms"') == 1 and _want in _main and _main.index(_want) > _main.index("</h1>") and _main.index(_want) < (_main.index("<h2") if "<h2" in _main else len(_main))
          and all(resolves(u) for _, u in _alts) and f'<link rel="alternate" type="text/markdown" href="{_path}.md"' in h,
          f"{f.name}: under its title, one line of the forms this address has ({', '.join(['Markdown'] + [_KIND[a] for a, _ in _alts])}), each declared in its head and each answering")
    for _tb in re.findall(r"<table[^>]*>.*?</table>", _main, re.S):
        _open = re.match(r"<table[^>]*>", _tb).group(0)
        _ths = re.findall(r"<th\b([^>]*)>", _tb)
        check(_open in ('<table class="kv">', '<table class="rows">', "<table>") and all(re.search(r'scope="(row|col)"', a) for a in _ths) and len(_ths) > 0, f"{f.name}: a table of one of the two kinds, every heading cell with its scope ({_open} {_ths[:2]})")
        if _open == '<table class="kv">': check(re.fullmatch(r'<table class="kv">\n?(<tr><th scope="row">.*?</th><td>.*?</td></tr>\n?)+</table>', _tb, re.S) is not None, f"{f.name}: a table of labels and values: each row a label and its value")
        if _open == '<table class="rows">': check(re.match(r'<table class="rows"><thead><tr>(<th scope="col">[^<]*</th>)+</tr></thead><tbody>', _tb) is not None and "<th" not in _tb.split("</thead>")[1], f"{f.name}: a table of rows: its column headings in a head of their own")
        if _open == "<table>": check(re.search(r'<div class="scroll" tabindex="0" role="region" aria-labelledby="[^"]+">' + re.escape(_tb[:40]), _main) is not None or "<details><summary>" in _main[:_main.index(_tb[:60])][-400:], f"{f.name}: a plain table stands in a region that scrolls, takes the keyboard and has a name (or is folded data)")
    check(all(re.search(r'<div class="scroll" tabindex="0" role="region" aria-labelledby="([^"]+)">', x) for x in re.findall(r'<div class="scroll"[^>]*>', _main)), f"{f.name}: every region that scrolls sideways takes the keyboard and has a name")
_TOCS = {"calendar": 10, "record": 14, "about": 11, "how-it-is-built": 9, "archive": 7, "machine": 7}
for f in pages:
    h = f.read_text("utf-8")
    if f.stem not in _TOCS:
        check('class="toc"' not in h.split("</style>", 1)[1], f"{f.name}: no contents expected"); continue
    _main = h[h.index("<main"):h.index("</main>")]
    _toc = re.search(r'<nav class="toc" aria-label="Contents"><details><summary>Contents</summary><ul>(.*?)</ul></details></nav>', _main, re.S)
    _items = re.findall(r'<li><a href="#([^"]+)">(.*?)</a></li>', _toc.group(1)) if _toc else []
    _h2 = re.findall(r"<h2[^>]*>(.*?)</h2>", _main, re.S)
    _ids = set(re.findall(r'\sid="([^"]+)"', _main))
    check(_toc is not None and len(_items) == len(_h2) == _TOCS[f.stem] and [x for _, x in _items] == [re.sub(r"<[^>]+>", "", x).strip() for x in _h2] and all(i in _ids for i, _ in _items) and len({i for i, _ in _items}) == len(_items)
          and _main.index('<nav class="toc"') < _main.index("<h2") and re.search(r"(</header>|</p>)\n?<nav class=\"toc\"", _main) is not None,
          f"{f.name}: its contents, folded under one word before its first section — each of its {_TOCS[f.stem]} sections by its own heading, linked to an address on the page ({len(_items)}/{len(_h2)})")
_rc = (PUBLIC / "record.html").read_text("utf-8").split("<body>", 1)[1]
check(re.match(r'.*?</header>\n<main id="content"><header><h1>Civilization Zero — The First Interpretive Record</h1><p>Human-Language Layer 1 · 2026 · <code>CZ-IR 1\.0</code> · Canonical Core: <code>CZ-CORE 1\.0</code> · Chosen Coordinate: <time datetime="2022-11-30">30 November 2022</time> · Prepared for first public release: <time datetime="2026-08-30">30 August 2026</time></p>'
               r'<p class="forms" lang="en" dir="ltr">This page as <a href="/record\.md" type="text/markdown">Markdown</a> · <a href="/record\.txt" type="text/plain">text</a> · <a href="/record\.json" type="application/json">JSON</a></p><p>([^<]*)</p></header><nav class="toc"', _rc, re.S) is not None
      and _h.unescape(re.search(r"JSON</a></p><p>([^<]*)</p></header>", _rc).group(1)) == _meta((PUBLIC / "record.html").read_text("utf-8"), "description") and _rc.count("<header>") == 1
      and _rc.index("The document's own heading reads") > _rc.index('id="integrity"') and re.search(r'<section id="attribution" aria-labelledby="h-attr"><h2 id="h-attr">Origin and attribution</h2><p class="lines">(<span>[^<]*</span>(<br>\n)?)+</p></section>', _rc) is not None,
      "/record: the title and the record's own line inside the main part; under them the forms and what the page holds, in the words of its description; its contents; the attribution one line to a piece; the site's note on anchors after the integrity record")
# ---- /calendar (rc-12; findings 8, 24 and 31): a figure for every day. The frame of the figure the converter's result shows is written
# by the build into room/cz-bar.json (dayfigure): the first page's tracks, one place for the day's arcs and the day's number, the Core's
# hash from the Core's bytes; the sentence under it is the fixed one. The page says, once, what a day before Day 0 shows.
_df = BAR.get("dayfigure") or {}
_dfh = _df.get("html", "")
check(set(_df) == {"core_sha256", "html"} and _df["core_sha256"] == _sha == PUBLISHED_CORE_SHA and _dfh.count("__FIG_RINGS__") == 1 and _dfh.count("__FIG_DAY__") == 2 and "__" not in _dfh.replace("__FIG_RINGS__", "").replace("__FIG_DAY__", "")
      and f'<g class="trk" stroke-width="1">{FIGURE.tracks()}</g><g class="arc" stroke-width="4">__FIG_RINGS__</g>' in _dfh and 'viewBox="-192 -192 384 384"' in _dfh and 'transform="rotate(-90)"' in _dfh
      and all(x in fill(T["html"]) for x in ('viewBox="-192 -192 384 384"', '<g fill="none" stroke="currentColor" transform="rotate(-90)"><g class="trk" stroke-width="1">' + FIGURE.tracks() + '</g><g class="arc" stroke-width="4">'))
      and 'role="img" aria-label="The figure of Day __FIG_DAY__: sixteen rings round an empty centre, each carrying one arc."' in _dfh,
      "room/cz-bar.json, dayfigure: the frame of a day's figure — the first page's own geometry and tracks, one place for the arcs, the day's number, a text alternative — and the Core's SHA-256 from the Core's bytes")
check(_h.unescape(re.search(r"<figcaption>(.*?)</figcaption>", _dfh).group(1)) == "Day __FIG_DAY__'s figure: computed from the day's number and the text of the sixteen principles."
      and "computed, like today's, from the day's number and the text of the sixteen principles" in _h.unescape(T["html"]),
      "a day's figure on /calendar: under it the one sentence, in the words the first page uses for tomorrow's")
_cal0 = (PUBLIC / "calendar.html").read_text("utf-8")
_fig_li = re.search(r'<li id="figure"><strong>Every day has a figure</strong>(.*?)</li>', _cal0, re.S)
check(_fig_li is not None and "A day before Day 0 has its figure by the same rule, with the mathematical modulo: no remainder is negative." in _fig_li.group(1) and _cal0.count("mathematical modulo") == 1
      and "its daily step the next byte plus one" in _fig_li.group(1) and "the sixteen primes that follow 256" in _fig_li.group(1) and "const mod = (x, m) => ((x % m) + m) % m;" in (SITE / "room" / "figure.js").read_text("utf-8")
      and all(FIGURE.positions(d, _sha) == [(_hb[2 * i] + d * (_hb[2 * i + 1] + 1)) % _M[i] for i in range(16)] for d in (-1, -1997, 0, 1455)),
      "/calendar says how a day's figure is computed, and in one sentence what a day before Day 0 shows: the same rule, with the mathematical modulo (as room/figure.js and site/figure.py compute it)")
_ctoc = re.search(r'<nav class="toc" aria-label="Contents"><details><summary>Contents</summary><ul>(.*?)</ul></details></nav>\n<section id="convert"', _cal0, re.S)
check(_ctoc is not None and re.findall(r'<li><a href="#([^"]+)">([^<]+)</a></li>', _ctoc.group(1)) == [(i, x) for i, x in re.findall(r'<section id="([^"]+)" aria-labelledby="[^"]+"><h2 id="[^"]+">(.*?)</h2>', _cal0)]
      and len(re.findall(r"<li><a href=\"#", _ctoc.group(1))) == _cal0.count("<h2 ") == 10 and _cal0.count("<details") == 1,
      "/calendar: its contents, folded under one word before the converter — every section, by its own heading, linked to its address")
check(re.search(r'<div class="scroll" tabindex="0" role="region" aria-labelledby="h-ex"><table>\n<thead><tr><th scope="col">CZ</th><th scope="col">Gregorian</th><th scope="col">Note</th></tr></thead>', _cal0) is not None
      and ".nw,a.cz-date time,data,th[scope=col]{white-space:nowrap}\ntime:not(a time),code:not(.hash,a code){display:inline-block;max-inline-size:100%}" in _snocom and "overflow-wrap:anywhere" not in "".join(b for s, b in re.findall(r"([^{}]+)\{([^{}]*)\}", _snocom) if re.fullmatch(r"\s*(td|th|th,td|td,th)\s*", s)),
      "/calendar, the examples: column headings with their scope, a region that takes the keyboard and has a name; a date is never cut in two by a line (the shared stylesheet), and no cell breaks a word anywhere")
for _n in ("calform", "timeform"):
    _lab = re.findall(r'<label for="([^"]+)">', BAR[_n])
    check(_lab and all(re.search(r'<span><label for="' + i + r'">[^<]+</label> <(input|select) id="' + i + '"[^>]*>(<option.*?</select>)?</span>', BAR[_n], re.S) for i in _lab) and BAR[_n].count("<span>") == len(_lab),
          f"room/cz-bar.json {_n}: each label stands in one piece with its field, so that a line breaks between pairs and never inside one ({_lab})")
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
for _src in ("/core", "/record", "/objections", "/ask", "/machine", "/about", "/archive", "/civilization-zero-infographic", "/civilization-zero-evidence-atlas", "/civilization-zero-images") + (("/press",) if PRESS_PUBLISHED else ()):
    check(any(r.get("source") == _src and "has" not in r and r.get("destination") == f"/api/page?p={_src[1:]}" for r in v.get("rewrites", [])), f"vercel.json: {_src} → api/page.js (CZ time at the top)")
check("public/*.html" in json.dumps(v.get("functions", {}).get("api/page.js", {})), "vercel.json: api/page.js carries the pages (includeFiles)")
# the infographic (31 Oct 2026): its page names the image, its size and its text alternative; the image is the PNG of that size; the sitemap
# lists it with the page; api/page.js serves the page
_ig = (PUBLIC / "civilization-zero-infographic.html").read_text("utf-8")
_igb = (PUBLIC / "civilization-zero-infographic.png").read_bytes()
check(_igb[:8] == b"\x89PNG\r\n\x1a\n" and struct.unpack(">II", _igb[16:24]) == (1200, 4080) and 'width="1200" height="4080"' in _ig and 'alt="Civilization Zero infographic.' in _ig,
      "the infographic: a 1200x4080 PNG, named on its page with its size and text alternative")
check("<image:loc>https://civilizationzero.ai/civilization-zero-infographic.png</image:loc>" in (PUBLIC / "sitemap.xml").read_text("utf-8"), "sitemap.xml: the infographic's image")
check("civilization-zero-infographic" in (SITE / "api" / "page.js").read_text("utf-8"), "api/page.js serves the infographic's page")
# the evidence atlas (3 Nov 2026): its page names the image, its size and its text alternative; the two PNGs are the sizes named and the
# PDF is a PDF; the ten panels are written out on the page; the sitemap lists the page with its images; api/page.js serves the page
_at = (PUBLIC / "civilization-zero-evidence-atlas.html").read_text("utf-8")
_atb, _atf = (PUBLIC / "civilization-zero-evidence-atlas.png").read_bytes(), (PUBLIC / "civilization-zero-evidence-atlas-full.png").read_bytes()
check(_atb[:8] == b"\x89PNG\r\n\x1a\n" and struct.unpack(">II", _atb[16:24]) == (1200, 1697) and 'width="1200" height="1697"' in _at
      and 'alt="Civilization Zero evidence atlas, After Coordinate Zero:' in _at and _atf[:8] == b"\x89PNG\r\n\x1a\n" and struct.unpack(">II", _atf[16:24]) == (2339, 3308)
      and (PUBLIC / "civilization-zero-evidence-atlas.pdf").read_bytes()[:5] == b"%PDF-", "the evidence atlas: the PNGs of the sizes named, the PDF, the text alternative")
check(all(f'id="panel-{_l}"' in _at for _l in "abcdefghij"), "the evidence atlas: the ten panels written out with their sources")
_smx = (PUBLIC / "sitemap.xml").read_text("utf-8")
check("<loc>https://civilizationzero.ai/civilization-zero-evidence-atlas</loc>" in _smx and "<image:loc>https://civilizationzero.ai/civilization-zero-evidence-atlas.png</image:loc>" in _smx,
      "sitemap.xml: the evidence atlas and its image")
check("civilization-zero-evidence-atlas" in (SITE / "api" / "page.js").read_text("utf-8"), "api/page.js serves the evidence atlas")
# the images of the first sentence (CZ 1432): each a greyscale PNG of the size its page names, with its text alternative carrying the
# sentence word for word; all three in the sitemap with their page; the page served by api/page.js and its preview image one of them
_im = (PUBLIC / "civilization-zero-images.html").read_text("utf-8")
_sm = (PUBLIC / "sitemap.xml").read_text("utf-8")
for _n, _w, _h in (("civilization-zero-humans-may-no-longer-be-at-the-centre", 1122, 1402), ("civilization-zero-one-human-among-many", 1733, 908), ("civilization-zero-many-centres", 1672, 941),
                   ("civilization-zero-the-measure", 1080, 1080), ("civilization-zero-the-empty-pedestal", 1080, 1080), ("civilization-zero-the-orbit", 1080, 1080),
                   ("civilization-zero-the-centre-left-open", 1080, 1080), ("civilization-zero-no-centre-in-the-middle", 1080, 1080), ("civilization-zero-one-then-many", 1080, 1080)):
    _b = (PUBLIC / f"{_n}.png").read_bytes()
    check(_b[:8] == b"\x89PNG\r\n\x1a\n" and struct.unpack(">II", _b[16:24]) == (_w, _h) and _b[25] == 0
          and f'<img src="/{_n}.png" width="{_w}" height="{_h}" alt="' in _im and f"<image:loc>https://civilizationzero.ai/{_n}.png</image:loc>" in _sm,
          f"/{_n}.png: a {_w}x{_h} greyscale PNG, on its page with its size and text alternative, in the sitemap")
check(_im.count("Civilization Zero names the beginning of a civilization in which humans may no longer be at the centre. civilizationzero.ai") >= 18
      and '<meta property="og:image" content="https://civilizationzero.ai/civilization-zero-one-human-among-many.png">' in _im,
      "/civilization-zero-images: every text alternative carries the sentence; its link preview is one of its images")
check("civilization-zero-images" in (SITE / "api" / "page.js").read_text("utf-8"), "api/page.js serves the images' page")
def _jpeg_size(b):   # (width, height, components) from the first SOF marker
    i = 2
    while i < len(b):
        if b[i] != 0xFF: i += 1; continue
        m = b[i + 1]
        if m in (0xC0, 0xC1, 0xC2): return struct.unpack(">HH", b[i + 5:i + 9])[::-1] + (b[i + 9],)
        i += 2 + struct.unpack(">H", b[i + 2:i + 4])[0]
    return None
_vj = (SITE / "vercel.json").read_text("utf-8")
for _p, _w, _h, _t, _alt, _src, _cls, _cap in ORIGINATOR_IMAGES:
    _b = (PUBLIC / _p.lstrip("/")).read_bytes()
    _ok = (_b[:8] == b"\x89PNG\r\n\x1a\n" and struct.unpack(">II", _b[16:24]) == (_w, _h) and _b[25] == 0) if _p.endswith(".png") else (_b[:2] == b"\xff\xd8" and _jpeg_size(_b) == (_w, _h, 1))
    check(_ok and f'<img src="{_p}" width="{_w}" height="{_h}" alt="{esc(_alt)}"' in _im and esc(_cap) in _im and "civilizationzero.ai" in _alt and "civilizationszero" not in _alt
          and f"<image:loc>https://civilizationzero.ai{_p}</image:loc>" in _sm and _p.lstrip("/") in _vj,
          f"{_p}: a {_w}x{_h} greyscale image, on its page with its size, text alternative and caption, in the sitemap, cached a day")
check('id="from-the-originator"' in _im and _im.count("<figure") == 20, "/civilization-zero-images: the nine and the originator's eleven")

# 8b. rc-12 (5): one name for each thing (the audit of 24 Nov 2026, findings 25 and 10) — in the links, the headings and the foot; one name for
# the calendar, "CZ calendar", and one spelling of a day in a sentence ("Day 1,455"; a date is "CZ 1455"); "Year Zero" only as the Core's own
# phrase; no key that counts years in a form the build writes, and the contract's day typed as the function writes it.
_s5 = {f.name: (VIRTUAL[f.name] if f.parent.name == "virtual" else f.read_text("utf-8")) for f in pages + [pathlib.Path("virtual") / n for n in VIRTUAL]}
_s5.update({"llms.txt": (PUBLIC / "llms.txt").read_text("utf-8"), "openapi.json": (PUBLIC / "api/openapi.json").read_text("utf-8"), "manifest": (PUBLIC / ".well-known/civilization-zero.json").read_text("utf-8"),
            "cz-bar.json": (SITE / "room/cz-bar.json").read_text("utf-8"), "home-templates.json": (SITE / "api/home-templates.json").read_text("utf-8")})
_lab = [(n, m.group(1), re.sub(r"<[^>]+>", "", m.group(2)).strip()) for n, h in _s5.items() for m in re.finditer(r'<a [^>]*href="(/(?:record|discuss|respond|archive|machine|calendar|embed|adopt))(?:[#?][^"]*)?"[^>]*>(.*?)</a>', h, re.S)]
_bad = [(n, t, l) for n, t, l in _lab if (t in ("/discuss", "/respond") and re.search(r"\broom\b", l)) or (t == "/record" and l in ("The Record", "The record", "Record")) or (t == "/archive" and (l == "Archive" or l.startswith("Archive,")))
        or (t == "/machine" and l.startswith("If you are not human")) or (t in ("/calendar", "/embed") and "CZ time" in l) or (t == "/adopt" and l in ("Register", "The Register"))]
check(len(_lab) > 400 and not _bad, f"a link's label is the one name of what it leads to (Interpretive Record, Discussion, Archive and verification, For machines, CZ calendar, Adoption Register): {_bad[:6]}")
_foots = {n: re.search(r'<ul class="foot" id="all-pages">(.*?)</ul>', h, re.S) for n, h in _s5.items() if n.endswith(".html") and n != "index.html"}
check(len(_foots) >= len(pages) - 1 and all(m and all(m.group(1).count(a) == 1 for a in ('<a href="/core">The Core</a>', '<a href="/record">Interpretive Record</a>', '<a href="/discuss">Discussion</a>', '<a href="/adopt">Adoption Register</a>',
                                                                                         '<a href="/calendar">CZ calendar</a>', '<a href="/embed">CZ date on your site</a>', '<a href="/archive">Archive and verification</a>', '<a href="/machine">For machines</a>'))
                                            for m in _foots.values()),
      "the foot of every page: each thing under its one name")
check("<h1>Archive and verification</h1>" in _s5["archive.html"] and "<h1>Put today's CZ date on your site</h1>" in _s5["embed.html"].replace("&#x27;", "'") and '<h2 id="h-how">How the CZ calendar works</h2>' in _s5["calendar.html"]
      and '<h2 id="h-not">What the CZ calendar is not</h2>' in _s5["calendar.html"], "the headings: /archive, /embed and /calendar's two sections carry the one name")
# "CZ time" stays in one place the build writes: /embed's title, which rc-9 left as it was (with the forms of that title in the head)
_ct = {n: len(re.findall("CZ time", h.replace("Put CZ time on your site", ""))) for n, h in _s5.items()}
check(not any(_ct.values()) and _s5["embed.html"].count("Put CZ time on your site") == 5, f"one name for the calendar, 'CZ calendar': 'CZ time' is left only in /embed's title: { {k: v for k, v in _ct.items() if v} }")
# one spelling of a day: /calendar says it once; the counter other sites copy writes the day as the head does
_cal5 = _s5["calendar.html"]
check(_cal5.count("In a sentence the day is named: Day 1,430, as beside the words “CZ calendar” on every page.") == 1 and "<code>CZ 1430</code> is 30 October 2026" in _cal5, "/calendar says once how a day is written in a sentence, beside how a date is written")
_num = re.search(r"  function num\(d\) \{ return .*? \}\n", _s5["embed.html"])
_rn = subprocess.run(["node", "-e", "const num = eval('(' + process.argv[1].trim().replace(/^function num/, 'function') + ')'); process.stdout.write(JSON.stringify(JSON.parse(process.argv[2]).map(num)))",
                      _num.group(0) if _num else "", json.dumps([0, 7, 999, 1000, 1455, 12345, 1234567, -1, -1997])], capture_output=True, text=True) if _num else None
check(_rn is not None and _rn.returncode == 0 and json.loads(_rn.stdout) == ["0", "7", "999", "1,000", "1,455", "12,345", "1,234,567", "−1", "−1,997"]
      and _s5["embed.html"].count("""Day <span class="d">' + num(d) + '</span> since Coordinate Zero""") == 1 and _s5["embed.html"].count("dd.textContent = num(d);") == 2 and "String(d)" not in _s5["embed.html"],
      f"/embed: the counter writes the day as the head of every page does (Day 1,455) ({_rn.stderr[:200] if _rn else 'no num'})")
# "Year Zero": the Core's phrase. Outside the Core's own sentence, the page's structured data (rc-9's, kept), the words the Core's image
# prints (its text alternative) and the two notes of /how-it-is-built that name the phrase as the Core's, no page says it
_core0 = json.loads((PUBLIC / "core.json").read_text("utf-8"))["principles"][0]["statements"][0]
_poster_alt = re.search(r'<img src="/civilization-zero-core\.png"[^>]* alt="([^"]*)"', _s5["core.html"])
def _voice(n, h):
    h = re.sub(r'<script type="application/ld\+json">.*?</script>', "", h, flags=re.S).replace(esc(_core0), "").replace(_core0, "").replace(json.dumps(_core0)[1:-1], "")
    if n == "core.html" and _poster_alt: h = h.replace(_poster_alt.group(1), "")
    if n == "how-it-is-built.html": h = h.replace("&quot;Year Zero&quot; is the Core&#x27;s phrase", "").replace("&quot;Civilization Zero: Year Zero began on 30 November 2022&quot;", "")
    return h
_yz = [n for n, h in _s5.items() if not re.fullmatch(r"core\.[A-Za-z-]+\.html", n) and "Year Zero" in _voice(n, h)]
check("Year Zero" in _core0 and _poster_alt and "Year Zero: 30 November 2022" in _poster_alt.group(1) and not _yz, f"'Year Zero' is the Core's phrase: no page says it in the site's own voice ({_yz})")
check("as day 0, and counts every day since." in _s5["about.html"] and "30 November 2022</span>: CZ 0, the day ordinary language became" in _s5["civilization-zero-infographic.html"]
      and '<figcaption class="src">The date, its meaning in the words of §0,' in _s5["core.html"] and "The Core on one image — the date, §0, the sixteen section titles" in _s5.get("press.html", "The Core on one image — the date, §0, the sixteen section titles"),
      "the four sentences that said 'Year Zero' in the site's voice (/about, the infographic, /core's caption, /press) count days")
# the year's keys: the manifest has none; the contract's day (CZDay.cz) is typed as the function writes it, and forbids them once the
# function writes none; the function's own definition sentence and design/CZ-TIME.md say the same as the function
_yk = ("year", "day_of_year", "days_in_year", "year_day")
_rk = subprocess.run(["node", "-e", "const C = require(process.argv[1]); process.stdout.write(JSON.stringify([1430, 0, -1997, 1461].map((D) => Object.keys(C.describe(D).cz))))", str(SITE / "room" / "cztime.js")], capture_output=True, text=True)
_keys5 = json.loads(_rk.stdout) if _rk.returncode == 0 else []
_czs = oa["components"]["schemas"]["CZDay"]["properties"]["cz"]
_counts = bool(_keys5) and any(k in _keys5[0] for k in _yk)
check(_keys5 and all(k == list(_czs["properties"]) for k in _keys5) and _keys5[0][:3] == ["date", "machine", "day"] and (all(k in _keys5[0] for k in _yk) if _counts else True)
      and (("not" in _czs) == (not _counts)) and (_counts or (_czs["not"] == {"anyOf": [{"required": [k]} for k in _yk]} and _czs["required"] == ["date", "machine", "day"])),
      f"/api/calendar: the contract's day is typed as room/cztime.js writes it, and once the function counts no year the contract says an answer that does does not fit ({_keys5[:1]}, {list(_czs['properties'])})")
_spec5 = (ROOT / "design" / "CZ-TIME.md").read_text("utf-8"); _caljs = (SITE / "api" / "calendar.js").read_text("utf-8")
check(("`cz.day`, `cz.year`" in _spec5) == _counts and ("Years of the record" in _caljs) == _counts and ("year_day" in _caljs) == _counts,
      "the year's keys of a day: the function, the sentence api/calendar.js gives as the definition, and design/CZ-TIME.md agree (all three count the year, or none does)")
check("years" not in man["cz_time"] and not re.search(r"\byears?\b|\d:\d{3}", json.dumps(man["cz_time"], ensure_ascii=False), re.I) and {"decided", "epoch", "day", "today", "date", "machine", "page", "api", "spec"} == set(man["cz_time"]),
      "the manifest: cz_time has no key and no sentence that counts years")
# on paper (finding 27): no control and no navigation; what a fold holds is printed open, since paper cannot be pressed
_pr = re.search(r"@media print\{(.*?)\n@supports selector\(::details-content\)\{summary\{list-style:none\}\}\}\n", _scss, re.S)
check(_pr and _scss.count("@media print") == 1 and re.match(r"\.skip,nav\.site,form,dialog,button,\.filters,\.tr-bar,p\.actions,\.sec,\.next,\.forms,footer nav\{display:none!important\}", _pr.group(1))
      and "details::details-content{content-visibility:visible}" in _pr.group(1), "the shared stylesheet, on paper: controls and navigation are left out, and a fold's content is printed")

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
