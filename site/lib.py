"""Shared pieces of the civilizationzero.ai build: the canonical texts, their parsers, the page shell,
the stylesheet, and small text utilities. Nothing here fetches anything; the record is read from
../record and every page is generated from it (Blueprint 1.3.1 §10)."""
import datetime, hashlib, html, json, pathlib, re

ROOT = pathlib.Path(__file__).resolve().parent.parent
RECORD = ROOT / "record"
SITE = ROOT / "site"
PUBLIC = SITE / "public"
ORIGIN = "https://civilizationzero.ai"
REPO = "https://github.com/civilizationzero/civilizationzero"
CONTACT = "record@civilizationzero.ai"
COORDINATE = datetime.date(2022, 11, 30)
PRERELEASE = datetime.date(2026, 10, 28)   # first publication on this site (read-only, pre-release)
LAUNCH = datetime.date(2026, 11, 30)       # public launch; first day of Year 4; the foundation's anniversary
REVIEW = datetime.date(2027, 11, 30)       # first scheduled review of the Core: Coordinate Zero's fifth anniversary, Year 5 begins
                                           # (the originator's decision of 29 Oct 2026; it replaced 30 Nov 2031, the launch's fifth)
CHARTER_DRAFT = datetime.date(2026, 11, 30)   # the review committee's charter, in draft for public comment
CHARTER_FINAL = datetime.date(2027, 3, 31)    # ... and in final form
def time_el(d): return f'<time datetime="{d.isoformat()}">{d.day} {d.strftime("%B %Y")}</time>'   # a date as the pages print it
BLUEPRINT = "1.3.1"
PROMPT_VERSION = "cz-machine-1.0"
ROOM_OPEN = True                           # flipped on the day the room's rules (§7) were verified; the functions read it from api/discuss-templates.json
ROOM_OPENED = "2026-10-28"                 # the UTC date the room opened (set with ROOM_OPEN). Bundle 1.0 says 2026-10-29: the local date in
ROOM_OPENED_AT = "2026-10-28T18:29:12Z"    # Kuala Lumpur (UTC+8); the site keeps time in UTC, corrected from bundle 1.0.1 (CHANGES-FOR-1.4, C-12)
REGISTER_OPEN = True                       # the Adoption Register (design/ADOPT.md): opened by the originator's decision after round 3 (29 Oct 2026, 08:05 UTC)
REGISTER_OPENED = "2026-10-29"             # the UTC date it first opened (set with REGISTER_OPEN; then kept): from then on its records and chain stay served
BUNDLE_VERSION = "1.0.1"                   # the current preservation bundle; earlier bundles stay at their addresses (site/archived-bundles/)
BUNDLE_DAYS_THROUGH = "2026-10-28"                # the last UTC day of the discussion archive (archive/discussion/) the current bundle carries; None = none yet
DOI_VERSIONS = [("v1.0.1", "10.5281/zenodo.23751341", "2026-10-29"),   # Zenodo deposits, newest first: one per GitHub release (the repository at its tag)
                ("v1.0", "10.5281/zenodo.23741225", "2026-10-28"),
                ("v1.0-pre", "10.5281/zenodo.23740318", "2026-10-28")]
DOI = DOI_VERSIONS[0][1]                   # the latest release's DOI; the concept DOI below always resolves to the latest version
DOI_CONCEPT = "10.5281/zenodo.23740317"
INDEXNOW_KEY = "5dbddf2e3c978c9f9cf5e54812ab90ef"   # public by design: /<key>.txt shows search engines (IndexNow) that the site chose it
# The project's own accounts elsewhere. Each verifies against this site: Bluesky by /.well-known/atproto-did, Mastodon by
# rel="me". Filled in as each account exists; until then nothing is emitted.
# Themes of the room (Phase 2 of its design for readers, the originator's decision of 30 Oct 2026, after his AI review team): questions
# the originator opens, each with an entry signed with his key; anyone answers by replying to it (parent = the entry's id), and each
# answer begins a conversation of its own; no one else opens a theme. The one marked "proposals" collects proposals for new
# questions. Each: {"slug": "…" (a-z, 0-9, hyphens), "title": "…", "entry": <the opening entry's id>, "opened": "YYYY-MM-DD"}
# (+ "proposals": True). Served at /themes/<slug>. Empty until the originator has approved the opening texts and they are posted.
THEMES = [{"slug": "test-theme", "title": "A test theme (test site only)", "entry": 23, "opened": "2026-10-29"}]
PRESS_PUBLISHED = False   # the press kit at /press, from press/PRESS-KIT.md: published once the originator approves the kit
ATPROTO_DID = "did:plc:gwscq3c3msvucpbatvrrm2f4"   # set 29 Oct 2026 (the account civilizationzero.bsky.social); "did:plc:…" from Bluesky ("I have my own domain", "No DNS panel"); the handle is then @civilizationzero.ai
SOCIAL = ["https://bsky.app/profile/civilizationzero.ai", "https://x.com/czrecord", "https://mastodon.social/@civilizationzero"]   # profile addresses: each is a rel="me" link on every page and a schema.org sameAs of the publisher
FEDIVERSE_CREATOR = "@civilizationzero@mastodon.social"   # Mastodon's author attribution (fediverse:creator): a link to this site shared on Mastodon credits this account, once the account lists civilizationzero.ai among the websites allowed to credit it; set 29 Oct 2026 (the account was made that day)
IA_RELEASE = {"/": "https://web.archive.org/web/20261028174615/https://civilizationzero.ai/"}   # the snapshot at release (28 Oct 2026)
def _ia_latest():   # the latest Internet Archive snapshot of each page, as the workflow `announce` keeps it in the repository
    f = ROOT / "archive" / "internet-archive" / "snapshots.tsv"
    if not f.exists(): return {}
    rows = [l.split("\t") for l in f.read_text("utf-8").splitlines()[1:] if "\t" in l]
    return {p: "https://" + u.split("://", 1)[1] for p, u in rows if u.startswith(("http://web.archive.org/web/", "https://web.archive.org/web/"))}
IA_SNAPSHOTS = _ia_latest() or dict(IA_RELEASE)   # Internet Archive snapshots, by path (the latest of each)
_ia_tsv = ROOT / "archive" / "internet-archive" / "snapshots.tsv"
IA_PAGES_LISTED = max(0, len(_ia_tsv.read_text("utf-8").splitlines()) - 1) if _ia_tsv.exists() else 0   # pages the last run looked for
RATE_PER_10MIN = 5                         # the room's limits, disclosed on /machine and in the rules (the database config carries the live values)
DAILY_INTAKE = 2000

esc = html.escape

def read_bytes(p): return pathlib.Path(p).read_bytes()
def sha256(b): return hashlib.sha256(b).hexdigest()

CORE_BYTES = read_bytes(RECORD / "CZ-CORE-1.0.txt")
IR_BYTES = read_bytes(RECORD / "CZ-IR-1.0.txt")
CORE_TXT = CORE_BYTES.decode("utf-8")
IR_TXT = IR_BYTES.decode("utf-8")
CORE_SHA = sha256(CORE_BYTES)
IR_SHA = sha256(IR_BYTES)
CORE_JSON = json.loads((RECORD / "CZ-CORE-1.0.json").read_text("utf-8"))

# Published constants (Blueprint 1.3.1 §5.5). The build fails if the files on disk do not match them.
PUBLISHED_CORE_SHA = "92a8d1e2a1604c25b432685673be78184bf05c3b166893c437e0895b7b2d724a"
PUBLISHED_IR_SHA = "71e1488e631e090c0820bf8b78b1fda70ffacba1da146c36d8893600320fcc8d"
assert CORE_SHA == PUBLISHED_CORE_SHA, "CZ-CORE-1.0.txt does not match its published hash"
assert IR_SHA == PUBLISHED_IR_SHA, "CZ-IR-1.0.txt does not match its published hash"
for b in (CORE_BYTES, IR_BYTES):
    assert not b.startswith(b"\xef\xbb\xbf") and b"\r" not in b, "canonical text must be UTF-8, no BOM, LF"


def verified_core(t):
    """A quotation from the Core must exist byte-for-byte in the canonical text."""
    assert t in CORE_TXT, "Quotation not found verbatim in CZ-CORE-1.0.txt: " + t[:60]
    return t


def declaration_lines():
    a = IR_TXT.index("DECLARATION\n") + len("DECLARATION\n")
    b = IR_TXT.index("\nORIGIN AND ATTRIBUTION")
    lines = [l for l in IR_TXT[a:b].strip().split("\n") if l.strip()]
    assert len(lines) == 22 and "\n".join(lines) in IR_TXT
    return lines


# ---------------------------------------------------------------- the Core, reconstructed from its JSON form
def core_reconstruct():
    """Rebuild the canonical text from CZ-CORE-1.0.json. If the result equals the canonical bytes, the JSON
    form is a faithful equivalent and every statement it carries is verbatim."""
    d = CORE_JSON
    out = ["CIVILIZATION ZERO", "THE INVARIANT CORE", d["subtitle"],
           f'{d["identifier"]} · Coordinate Zero: 30 November 2022', "", d["preamble"], ""]
    for p in d["principles"]:
        out += [f'{p["n"]}. {p["title"].upper()}', ""]
        for s in p["statements"]:
            out += [s, ""]
        if "ordered" in p:
            out += [f"{i+1}. {s}" for i, s in enumerate(p["ordered"])] + [""]
            for s in p.get("closing", []):
                out += [s, ""]
    out += ["CIVILIZATION ZERO", ""]
    for s in d["closing"]["statements"]:
        out += [s, ""]
    out += ["—", f'Originating concept: {d["originating_concept"]}', f'Originating dialogue: {d["originating_dialogue"]}',
            f'Human publisher and publication responsibility: {d["human_publisher"]}',
            "Prepared for first public release: 30 August 2026", ""]
    return "\n".join(out)


# ---------------------------------------------------------------- the Interpretive Record, parsed from its text
SEC_RE = re.compile(r"^(\d+)\. ([A-Z][A-Z ,’'\-]+)$")
SUB_RE = re.compile(r"^(\d+)\.(\d+) (.+)$")
NUM_RE = re.compile(r"^(\d+)\. ([a-z].*)$")


def ir_parse():
    """Returns (header_lines, sections, declaration_lines, attribution_lines).
    sections: list of {n, title, subs:[{n, m, title, blocks}]}; blocks: ('p', text) | ('ul', [items]) | ('ol', [items]).
    Every line of the file is placed somewhere; ir_reconstruct() proves it."""
    lines = IR_TXT.split("\n")
    i = 0
    header = []
    while not SEC_RE.match(lines[i]):
        header.append(lines[i]); i += 1
    sections, decl, attr = [], [], []
    mode = "sections"
    cur_sec = cur_sub = None
    while i < len(lines):
        l = lines[i]
        if l == "DECLARATION":
            mode = "decl"; i += 1; continue
        if l == "ORIGIN AND ATTRIBUTION":
            mode = "attr"; i += 1; continue
        if mode == "decl":
            if l.strip(): decl.append(l)
            i += 1; continue
        if mode == "attr":
            if l.strip(): attr.append(l)
            i += 1; continue
        if not l.strip():
            i += 1; continue
        m = SEC_RE.match(l)
        if m:
            cur_sec = {"n": int(m.group(1)), "title": m.group(2), "subs": []}; sections.append(cur_sec); cur_sub = None; i += 1; continue
        m = SUB_RE.match(l)
        if m and cur_sec and int(m.group(1)) == cur_sec["n"]:
            cur_sub = {"n": int(m.group(1)), "m": int(m.group(2)), "title": m.group(3), "blocks": []}; cur_sec["subs"].append(cur_sub); i += 1; continue
        # numbered list (8.2)
        if NUM_RE.match(l):
            items = []
            while i < len(lines) and NUM_RE.match(lines[i]):
                items.append(NUM_RE.match(lines[i]).group(2)); i += 1
            cur_sub["blocks"].append(("ol", items)); continue
        # bulleted list: a run of lines ending in ';' plus the one line that closes it
        if l.endswith(";"):
            items = []
            while i < len(lines) and lines[i].endswith(";"):
                items.append(lines[i]); i += 1
            items.append(lines[i]); i += 1          # the closing item ("and …." / "or ….")
            cur_sub["blocks"].append(("ul", items)); continue
        cur_sub["blocks"].append(("p", l)); i += 1
    return header, sections, decl, attr


def ir_reconstruct():
    header, sections, decl, attr = ir_parse()
    out = list(header)
    for s in sections:
        out.append(f'{s["n"]}. {s["title"]}')
        for sub in s["subs"]:
            out.append(f'{sub["n"]}.{sub["m"]} {sub["title"]}')
            for kind, body in sub["blocks"]:
                if kind == "p": out.append(body)
                elif kind == "ul": out += body
                else: out += [f"{k+1}. {x}" for k, x in enumerate(body)]
    out += ["", "DECLARATION"] + decl + ["", "ORIGIN AND ATTRIBUTION"] + attr + [""]
    return "\n".join(out)


# ---------------------------------------------------------------- the clock
def clock(now):
    year = 0
    while datetime.datetime(2022 + year + 1, 11, 30, tzinfo=datetime.timezone.utc) <= now: year += 1
    anniv = datetime.datetime(2022 + year, 11, 30, tzinfo=datetime.timezone.utc)
    z = datetime.datetime(2022, 11, 30, tzinfo=datetime.timezone.utc)
    nxt = datetime.datetime(2022 + year + 1, 11, 30, tzinfo=datetime.timezone.utc)
    return dict(year=year, days_in_year=(now - anniv).days, total=(now - z).days, next_year=year + 1,
                next_iso=nxt.date().isoformat(), next_human=nxt.strftime("%-d %B %Y"),
                asof_iso=now.strftime("%Y-%m-%dT%H:%MZ"), asof_human=now.strftime("%Y-%m-%d %H:%M UTC"))


# ---------------------------------------------------------------- the shell
# The mark (Blueprint decision 5; changed by the originator on 29 Oct 2026, queued for 1.4): CZ — a Z inside a ring left
# open on the right. The open ring is the place left open (the Core's closing line); the Z makes it the record's own
# abbreviation and legible at 16 pixels. site/assets/render.py draws the same two shapes as images.
MARK = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="40" height="40" role="img" aria-labelledby="mk">'
        '<title id="mk">CZ, the mark of Civilization Zero: a Z inside a ring left open; the opening is the place left open for the future</title>'
        '<path d="M56.57,41.93 A26.5,26.5 0 1 1 56.57,22.07" fill="none" stroke="currentColor" stroke-width="7"/><path d="M20,19.5 H44 V24.5 L27.4,39.5 H44 V44.5 H20 V39.5 L36.6,24.5 H20 Z" fill="currentColor"/></svg>')

# the favicon: the Z's bars on whole pixels at 16 and 32 px; dark or light with the reader's browser
FAVICON = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><style>path{fill:none;stroke:#111}path.z{fill:#111;stroke:none}'
           '@media(prefers-color-scheme:dark){path{stroke:#eee}path.z{fill:#eee}}</style>'
           '<path d="M56.57,41.93 A26.5,26.5 0 1 1 56.57,22.07" stroke-width="7"/><path class="z" d="M20,20 H44 V24 L26,40 H44 V44 H20 V40 L38,24 H20 Z"/></svg>')

CSS = """
/* H + C: no typeface is shipped; the generic family is chosen (the smallest choice available) so the reader's device renders every script. Nothing to rot. */
html{font-family:system-ui,sans-serif;font-size:100%;line-height:1.5}
/* H: two palettes, each at contrast >= 7:1 (WCAG 2.2 AAA, 1.4.6); which one shows follows the reader's preference. */
:root{color-scheme:light dark;--fg:#111;--bg:#fff;--mute:#555;--rule:#bbb}
@media(prefers-color-scheme:dark){:root{--fg:#eee;--bg:#101010;--mute:#aaa;--rule:#444}}
body{margin:0;color:var(--fg);background:var(--bg)}
/* H: a measure of 45–75 characters for sustained reading (a convention, stated as one); 70ch. Gutter 1rem on narrow screens. */
main,header,footer,nav.site{max-width:70ch;margin:0 auto;padding:0 1rem}
/* H + M: links are marked by underline, not by colour alone (WCAG 2.2, 1.4.1). */
a{color:inherit;text-decoration:underline;text-underline-offset:.15em}
/* R §15 / M: the record's structure is the layout. Headings keep their semantic level and the browser's default sizes; only spacing is set. */
h1,h2,h3{line-height:1.2}h2{margin-top:2.5rem}h3{margin-top:1.75rem}
/* M: exact values (dates, counts, hashes, endpoints) in monospace so that their boundaries are unambiguous. */
time,data,code,pre,.exact{font-family:ui-monospace,monospace;font-size:.95em}
pre{white-space:pre-wrap;word-break:break-word;border:1px solid var(--rule);padding:.75rem}
hr{border:0;border-top:1px solid var(--rule);margin:2.5rem 0}
/* E (Blueprint decision 28): two doors, before anything else; equal width — equal standing. */
nav.readers{display:flex;gap:1rem;padding:1rem;border-bottom:1px solid var(--rule)}
nav.readers a{flex:1;text-align:center}
nav.site{padding-top:1rem;padding-bottom:1rem;border-bottom:1px solid var(--rule);font-size:.9em}
/* H: WCAG 2.2 target size (2.5.8): each link of the site's navigation at least 24 pixels tall, also where the row wraps on a phone. */
nav.site a{display:inline-block;padding:.3rem 0}
blockquote{margin:1rem 0;padding-left:1rem;border-left:2px solid var(--rule)}
blockquote p{margin:.25rem 0}
.src{color:var(--mute);font-size:.8em}
table{border-collapse:collapse;width:100%;font-size:.9em}th,td{text-align:left;vertical-align:top;padding:.4rem .5rem;border-bottom:1px solid var(--rule)}
code.hash{word-break:break-all;display:block}
ul,ol{padding-left:1.25rem}
.pending{border:1px dashed var(--rule);padding:.5rem .75rem}
/* the discussion room: entries are user content, shown as text; a group is one declared source's consecutive entries (Blueprint §7.4) */
.entry{margin:1.5rem 0;padding-top:.5rem;border-top:1px solid var(--rule)}
.entry .content{white-space:pre-wrap;word-break:break-word;margin:.5rem 0}
.entry .meta{margin:.25rem 0}
.group{margin-bottom:.5rem}
.scroll{overflow-x:auto}
.filters{display:flex;flex-wrap:wrap;gap:.75rem;align-items:end;font-size:.9em;margin:1rem 0}
/* E: the room one click from the first screen, and its sections as topics (the originator's decision of 29 Oct 2026, after his AI review team) */
p.room-line{border-left:3px solid var(--fg);padding-left:.75rem}ul.sections{columns:2 16rem;column-gap:2rem}ul.sections li{break-inside:avoid;margin:.2rem 0}
.filters select,.filters input{font:inherit;color:var(--fg);background:var(--bg);border:1px solid var(--rule);padding:.2rem .3rem}
form.respond label{display:block;margin:.75rem 0}form.respond input,form.respond select,form.respond textarea{font:inherit;width:100%;box-sizing:border-box;padding:.4rem;border:1px solid var(--rule);background:var(--bg);color:var(--fg)}
form.respond textarea{min-height:12rem}form.respond input[type=checkbox],form.respond input[type=radio]{width:1.25rem;height:1.25rem;vertical-align:-.25rem;margin:0 .5rem 0 0}form.respond fieldset{border:1px solid var(--rule);margin:.75rem 0}button{font:inherit;padding:.4rem .9rem;border:1px solid var(--fg);background:var(--bg);color:var(--fg)}
/* H: WCAG 2.2 reflow (1.4.10): nothing wider than a 320-pixel screen. A word breaks only when it cannot fit its line; on a narrow screen a long address or code in a table cell may break anywhere, so the table never widens the page and headings are never cut mid-word. */
main,header,footer{overflow-wrap:break-word}th,td{overflow-wrap:break-word}@media(max-width:40em){td a,td code{overflow-wrap:anywhere}}
/* H: WCAG 2.2 target size (2.5.8) and the platforms' touch guidance: every control at least 2.5rem tall. */
button,select,input:not([type=checkbox]):not([type=radio]){min-height:2.5rem;box-sizing:border-box}
"""

NAV = ('<nav class="site" aria-label="Site"><a href="/">CZ · Civilization Zero</a> · <a href="/core">Core</a> · '
       '<a href="/record">Record</a> · <a href="/objections">Objections</a> · <a href="/discuss">Discussion</a> · '
       '<a href="/machine">Machine</a> · <a href="/about">About</a> · <a href="/archive">Archive</a></nav>')

FOOTER = (f'<footer><hr><p class="exact">Text CC BY 4.0 · Code MIT · <a href="{REPO}">source</a> · '
          f'<a href="mailto:{CONTACT}">{CONTACT}</a> · Coordinate Zero <time datetime="2022-11-30">2022-11-30</time> · UTC</p></footer>')


# Search and link-preview metadata (Blueprint §3.1: crawlers, indexers and archivers are readers too). Named standards only —
# Open Graph, schema.org, hreflang, sitemaps.org — and nothing that observes a reader. The preview image is the mark, the
# site's one image (§9).
GOOGLE_SITE_VERIFICATION = "Hf73qd5zTa6JZ_-O6QM0JBYPSqxOdIM-M33lsIGihhg"   # Google Search Console ("HTML tag" method), property https://civilizationzero.ai/, added by the originator on 29 Oct 2026; keep it, or the property loses its verification
OG_IMAGE = ("/og.png", 1200, 630, "CZ, the mark of Civilization Zero: a Z inside a ring left open")

def shell(title, body, path, description, alternates=(), ldjson=None, nav=True, extra_head="", hreflangs=(), og_type="website", robots=None, crumbs=True):
    alt = "".join(f'<link rel="alternate" type="{t}" href="{h}" title="{esc(n)}">' for t, h, n in alternates)
    hl = "".join(f'<link rel="alternate" hreflang="{l}" href="{ORIGIN}{h}">' for l, h in hreflangs)
    objs = list(ldjson or [])
    if crumbs and path not in ("/", "__PATH__"):   # where the page sits: Home > page (schema.org BreadcrumbList)
        objs.append({"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Civilization Zero", "item": f"{ORIGIN}/"},
            {"@type": "ListItem", "position": 2, "name": title.replace(" · Civilization Zero", ""), "item": f"{ORIGIN}{path}"}]})
    ld = "".join(f'<script type="application/ld+json">{json.dumps(o, ensure_ascii=False).replace("</", "<\\/")}</script>' for o in objs)
    meta = (f'<meta name="robots" content="{robots}">\n' if robots else "") + \
           (f'<meta name="google-site-verification" content="{esc(GOOGLE_SITE_VERIFICATION)}">\n' if GOOGLE_SITE_VERIFICATION else "")
    og = (f'<meta property="og:site_name" content="Civilization Zero"><meta property="og:type" content="{og_type}">'
          f'<meta property="og:title" content="{esc(title)}"><meta property="og:description" content="{esc(description)}">'
          f'<meta property="og:url" content="{ORIGIN}{path}"><meta property="og:image" content="{ORIGIN}{OG_IMAGE[0]}">'
          f'<meta property="og:image:width" content="{OG_IMAGE[1]}"><meta property="og:image:height" content="{OG_IMAGE[2]}">'
          f'<meta property="og:image:alt" content="{esc(OG_IMAGE[3])}"><meta name="twitter:card" content="summary_large_image">\n')
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{esc(title)}</title>
<meta name="description" content="{esc(description)}">
{meta}<link rel="canonical" href="{ORIGIN}{path}">
{alt}{hl}<link rel="service-desc" type="application/vnd.oai.openapi+json" href="/api/openapi.json">
{og}<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)"><meta name="theme-color" content="#101010" media="(prefers-color-scheme: dark)">
<link rel="icon" href="/favicon-96x96.png" type="image/png" sizes="96x96"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="shortcut icon" href="/favicon.ico"><link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180"><link rel="manifest" href="/site.webmanifest"><meta name="apple-mobile-web-app-title" content="Civilization Zero">
{"".join(f'<link rel="me" href="{esc(u)}">' for u in SOCIAL)}{f'<meta name="fediverse:creator" content="{esc(FEDIVERSE_CREATOR)}">' if FEDIVERSE_CREATOR else ""}<style>{CSS}</style>
{ld}{extra_head}</head>
<body>
{NAV if nav else ""}
{body}
{FOOTER}
</body>
</html>
"""


# ---------------------------------------------------------------- HTML -> plain text (for the whole-page text equivalents)
from html.parser import HTMLParser

class _Text(HTMLParser):
    BLOCK = {"p", "h1", "h2", "h3", "li", "tr", "blockquote", "section", "header", "footer", "nav", "pre", "div", "details", "summary", "table"}
    def __init__(self):
        super().__init__(); self.out = []; self.skip = 0; self.cell = False
    def handle_starttag(self, t, a):
        if t in ("style", "script", "title", "svg", "head"): self.skip += 1
        if t == "br": self.out.append("\n")
        if t in self.BLOCK: self.out.append("\n")
        if t in ("td", "th"): self.cell = True
    def handle_endtag(self, t):
        if t in ("style", "script", "title", "svg", "head"): self.skip -= 1
        if t in self.BLOCK: self.out.append("\n")
        if t in ("td", "th"): self.out.append("  ")
    def handle_data(self, d):
        if not self.skip: self.out.append(d)

def to_text(h):
    p = _Text(); p.feed(h)
    t = "".join(p.out)
    t = re.sub(r"[ \t]+\n", "\n", t)
    t = re.sub(r"\n{3,}", "\n\n", t)
    return t.strip() + "\n"
