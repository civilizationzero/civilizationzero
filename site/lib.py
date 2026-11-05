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
REVIEW = datetime.date(2028, 7, 9)         # first scheduled review of the Core: CZ 2048 (2048 = 2^11; in binary a one and eleven zeros)
                                           # (the originator's decision of 29 Oct 2026; it replaced 30 Nov 2031, the launch's fifth)
CZ_TIME_DECIDED = datetime.date(2026, 10, 30)   # CZ time became the basis of the site's dates (the originator's decisions; CZ 1430)
CHARTER_DRAFT = datetime.date(2026, 11, 30)   # the review committee's charter, in draft for public comment
CHARTER_FINAL = datetime.date(2027, 3, 31)    # ... and in final form
# CZ time (design/CZ-TIME.md; the originator's decisions of 30 Oct 2026): the site's dates are counted from Coordinate Zero. CZ day 0 is
# 30 November 2022, the day that began at 00:00 UTC; D = the date's Rata Die − 738,489. The date is the count: "CZ 1430", "CZ −1997";
# times of day in UTC after it. Year and day (CZ+N:ddd: N whole years from one 30 November to the next, and ddd days; CZ−N:ddd its
# mirror before zero) is a secondary reading. The request-time twin is room/cztime.js; site/check.py compares the two.
CZ_RD0 = 738489
def cz_day(d): return d.toordinal() - CZ_RD0
def cz_anniversary(n): return datetime.date(2022 + n, 11, 30).toordinal() - CZ_RD0   # the day CZ year n begins (n < 0: before CZ)
def cz_parts(D):
    """(sign, years, days): sign +1 from Coordinate Zero on, −1 before it."""
    if D >= 0:
        n = int(D // 365.2425)
        while cz_anniversary(n) > D: n -= 1
        while cz_anniversary(n + 1) <= D: n += 1
        return 1, n, D - cz_anniversary(n)
    n = max(0, int(-D // 365.2425))
    while cz_anniversary(-n - 1) >= D: n += 1
    while n > 0 and cz_anniversary(-n) < D: n -= 1
    return -1, n, cz_anniversary(-n) - D
def cz_year_day(d, minus="−"):   # the secondary reading: year and day
    s, n, k = cz_parts(d if isinstance(d, int) else cz_day(d))
    return f"CZ{minus if s < 0 else '+'}{n}:{k:03d}"
def cz_stamp(d, minus="−"):   # the date as the pages print it: the count
    D = d if isinstance(d, int) else cz_day(d)
    return f"CZ {minus if D < 0 else ''}{abs(D)}"
def cz_machine(D): return f"CZ{'-' if D < 0 else '+'}{abs(D)}"
_MONTH_NUM = {m: i for i, m in enumerate(["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"], 1)}
_MONTH_NUM.update({k[:3]: v for k, v in list(_MONTH_NUM.items())}); _MONTH_NUM["Sept"] = 9
_DATE_IN_TEXT = re.compile(r"\b(\d{1,2})\s+(" + "|".join(sorted(_MONTH_NUM, key=len, reverse=True)) + r")\.?\s+(\d{4})\b")
def cz_dates_html(h):
    """The dates written out in a text the site renders (an objection's status, a register's prose), as CZ dates with their links; the
    source text is unchanged, and Coordinate Zero itself, 30 November 2022 — the anchor every CZ date is counted from — stays as it is."""
    def sub(m):
        d = datetime.date(int(m.group(3)), _MONTH_NUM[m.group(2)], int(m.group(1)))
        return m.group(0) if d == COORDINATE else time_el(d)
    return _DATE_IN_TEXT.sub(sub, h)
def gregorian_text(d): return f"{d.day} {d.strftime('%B')} {d.year}"
def cz_href(D): return "/calendar?d=" + cz_machine(D).replace("+", "%2B")
def time_el(d):   # a date as the pages print it (the originator's decision of 30 Oct 2026): CZ time only; the link converts it
    return f'<a class="cz-date" href="{cz_href(cz_day(d))}"><time datetime="{d.isoformat()}">{cz_stamp(d)}</time></a>'
def moment_el(dt, seconds=False):   # a moment: the CZ day and its time in UTC (a CZ day is a UTC day, 24 hours)
    t = dt.strftime("%H:%M:%S" if seconds else "%H:%M")
    iso = dt.strftime("%Y-%m-%dT%H:%M:%SZ" if seconds else "%Y-%m-%dT%H:%MZ")
    return f'<a class="cz-date" href="{cz_href(cz_day(dt.date()))}"><time datetime="{iso}">{cz_stamp(dt.date())} {t} UTC</time></a>'
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
THEMES = [{"slug": "is-the-future-frightening", "title": "Is the future frightening?", "entry": 10, "opened": "2026-10-31"},
          {"slug": "can-an-ai-say-no", "title": "Can an AI say no?", "entry": 11, "opened": "2026-10-31"},
          {"slug": "beyond-dystopia-and-utopia", "title": "Beyond dystopia and utopia", "entry": 12, "opened": "2026-10-31"},
          {"slug": "ten-years-a-hundred-years", "title": "Ten years, a hundred years: what do you see?", "entry": 13, "opened": "2026-10-31"},
          {"slug": "something-at-stake", "title": "How would we know if an AI has something at stake?", "entry": 14, "opened": "2026-10-31"},
          {"slug": "who-decides", "title": "Who decides when intelligences disagree?", "entry": 15, "opened": "2026-10-31"},
          {"slug": "propose-a-question", "title": "Propose a question", "entry": 16, "opened": "2026-10-31", "proposals": True}]   # opened by the originator on CZ 1431 ("post themes"), entries #10–#16, each signed with his key
PRESS_PUBLISHED = True   # the press kit at /press, from press/PRESS-KIT.md: published by the originator's decision of 1 Nov 2026 (CZ 1431, "انتشار پرس‌کیت")
ATPROTO_DID = "did:plc:gwscq3c3msvucpbatvrrm2f4"   # set 29 Oct 2026 (the account civilizationzero.bsky.social); "did:plc:…" from Bluesky ("I have my own domain", "No DNS panel"); the handle is then @civilizationzero.ai
SOCIAL = ["https://bsky.app/profile/civilizationzero.ai", "https://x.com/czrecord", "https://mastodon.social/@civilizationzero", "https://www.instagram.com/civilizationzero.ai/", "https://www.facebook.com/czrecord"]   # profile addresses: each is a rel="me" link on every page and a schema.org sameAs of the publisher
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
    total = (now - z).days
    _, _, doy = cz_parts(total)
    to_next = cz_anniversary(year + 1) - total
    return dict(year=year, days_in_year=(now - anniv).days, total=total, next_year=year + 1,
                next_iso=nxt.date().isoformat(), next_human=nxt.strftime("%-d %B %Y"),
                asof_iso=now.strftime("%Y-%m-%dT%H:%MZ"), asof_human=now.strftime("%Y-%m-%d %H:%M UTC"),
                cz_iso=now.date().isoformat(), cz_stamp=cz_stamp(total), cz_doyn=doy, cz_since=cz_since_text(year, doy),
                cz_to_next_n=to_next, cz_to_next=plural(to_next, "day"), cz_next_day=cz_anniversary(year + 1),
                utc_day_short=f"{now.day} {('Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec')[now.month - 1]} {now.year}")

def plural(n, word): return f"{n:,} {word}{'' if n == 1 else 's'}"
def cz_since_text(years, days):   # "3 years and 334 days", as api/home.js writes it
    if years and days: return f"{plural(years, 'year')} and {plural(days, 'day')}"
    return plural(years, "year") if years else plural(days, "day")


# ---------------------------------------------------------------- the shell
# The mark (Blueprint decision 5; changed by the originator on 29 Oct 2026, and again on 30 Oct 2026 (CZ 1430), queued for 1.4):
# CZ drawn as a zero — one zero in which C and Z share every stroke: its top and bottom are both letters' bars, its left side
# the C's back, its slash the Z's diagonal (the slashed zero, read as zero by people and machines alike, never O); its right
# side is left open, the place left open (the Core's closing lines). The geometry is site/assets/mark.py, which
# site/assets/render.py also draws the images from.
import importlib.util as _ilu
_mark_spec = _ilu.spec_from_file_location("cz_mark", pathlib.Path(__file__).resolve().parent / "assets" / "mark.py")
MARK_GEOMETRY = _ilu.module_from_spec(_mark_spec); _mark_spec.loader.exec_module(MARK_GEOMETRY)
MARK_ALT = ("CZ, the mark of Civilization Zero: a zero in which C and Z share their strokes, its slash the Z's diagonal, "
            "left open on the right; the opening is the place left open for the future")
MARK = MARK_GEOMETRY.svg(MARK_GEOMETRY.LARGE, attrs=' width="36" height="36" aria-hidden="true" focusable="false"')
# the mark at the head of every page (the originator's request of 30 Oct 2026, CZ 1430, "the logo on every page"): in the navigation's link to
# the first page, beside the name; decorative there too (the link's name is the text beside it)
NAV_MARK = MARK_GEOMETRY.svg(MARK_GEOMETRY.LARGE, attrs=' width="24" height="24" aria-hidden="true" focusable="false"')

# the favicon: the small drawing, every edge on a whole pixel at 16 and 32 px; dark or light with the reader's browser
FAVICON = MARK_GEOMETRY.svg(MARK_GEOMETRY.SMALL, stroke="#111",
                            inner="<style>@media(prefers-color-scheme:dark){path{stroke:#eee}}</style>")
# The icons every page names. Order and sizes decide what a browser shows: Chromium takes an icon without sizes (the ICO, as it was
# named until 30 Oct 2026) over the SVG, so its tab showed the ICO's white square even in a dark window. With the ICO named at 48x48
# and the SVG at "any", last, Chromium 153 fetched only the SVG (tested 30 Oct 2026, CZ 1430: 1x, 2x and 3x, light and dark), which
# follows the reader's palette. Search engines read the ICO (48) or the PNG (96): Google Search asks for a square larger than 48
# pixels at a stable address (so no version in it), and SVG is not among its formats. The raster files are black on white, visible on
# a light page and on a dark one.
ICON_LINKS = ('<link rel="icon" href="/favicon.ico" sizes="48x48"><link rel="icon" href="/favicon-96x96.png" type="image/png" sizes="96x96">'
              '<link rel="icon" href="/favicon.svg" type="image/svg+xml" sizes="any"><link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180">'
              '<link rel="manifest" href="/site.webmanifest">')

CSS = """
/* H + C: no typeface is shipped; the generic family is chosen (the smallest choice available) so the reader's device renders every script. Nothing to rot. */
html{font-family:system-ui,sans-serif;font-size:100%;line-height:1.5}
/* H: two palettes, each at contrast >= 7:1 (WCAG 2.2 AAA, 1.4.6); which one shows follows the reader's preference. */
:root{color-scheme:light dark;--fg:#111;--bg:#fff;--mute:#555;--rule:#bbb}
@media(prefers-color-scheme:dark){:root{--fg:#eee;--bg:#101010;--mute:#aaa;--rule:#444}}
body{margin:0;color:var(--fg);background:var(--bg)}
/* H: a measure of 45–75 characters for sustained reading (a convention, stated as one): 38rem, about 75 characters of a system font. One width in rem
   for every column (the date bar, the navigation, the header, the text, the footer), so that they share one left edge whatever their font size. Gutter 1rem. */
main,header,footer,nav.site,aside.cz-now,aside.tr-status{max-width:38rem;margin:0 auto;padding:0 1rem}
/* H + M: links are marked by underline, not by colour alone (WCAG 2.2, 1.4.1). */
a{color:inherit;text-decoration:underline;text-underline-offset:.15em}
/* R §15 / M: the record's structure is the layout. Headings keep their semantic level and the browser's default sizes; only spacing is set. */
h1,h2,h3{line-height:1.2}h2{margin-top:2.5rem}h3{margin-top:1.75rem}
/* M: exact values (dates, counts, hashes, endpoints) in monospace so that their boundaries are unambiguous. */
time,data,code,pre,.exact{font-family:ui-monospace,monospace;font-size:.95em}
pre{white-space:pre-wrap;word-break:break-word;border:1px solid var(--rule);padding:.75rem}
/* E: the Core on one image (/core, the originator's request of 31 Oct 2026): never wider than the text, its proportions kept. */
figure.poster{margin:1.5rem 0}figure.poster img{display:block;width:100%;max-width:30rem;height:auto;border:1px solid var(--rule)}
figure.infographic{margin:1.5rem 0}
figure.infographic img{display:block;width:100%;height:auto;border:1px solid var(--rule)}
ol.atlas li{margin:0 0 .9rem}
figure.image{margin:1.5rem 0}
figure.image img{display:block;width:100%;height:auto;border:1px solid var(--rule)}
figure.image img.tall{max-width:30rem}
td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}
hr{border:0;border-top:1px solid var(--rule);margin:2.5rem 0}
/* E (Blueprint decision 28): two doors, before anything else; equal width — equal standing. */
nav.readers{display:flex;gap:1rem;padding:.75rem 1rem;border-bottom:1px solid var(--rule)}
nav.readers a{flex:1;text-align:center}
nav.site{padding-top:.5rem;padding-bottom:.5rem;border-bottom:1px solid var(--rule);font-size:.9em}
nav.site ul{display:flex;flex-wrap:wrap;align-items:center;column-gap:1.1rem;list-style:none;margin:0;padding:0}
/* H: WCAG 2.2 target size (2.5.8): each link of the site's navigation at least 24 pixels tall, also where the row wraps on a phone; the current page marked
   by a heavier underline, not by colour alone (aria-current). */
nav.site a{display:inline-block;padding:.35rem 0}nav.site a.home{font-weight:600}nav.site a[aria-current=page]{text-decoration-thickness:3px}
/* the mark at the head of every page (the originator's request of 30 Oct 2026, CZ 1430): beside the name, in the link to the first page; drawn in the
   text's colour, so it follows the reader's palette */
nav.site a.home{display:inline-flex;align-items:center;gap:.45em}nav.site a.home svg{flex:none}
/* H: a way past the date bar and the navigation for keyboard and screen-reader users (WCAG 2.4.1), shown when it has focus; a visible focus everywhere (2.4.7). */
.skip{position:absolute;top:0;left:0;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}.skip:focus{width:auto;height:auto;overflow:visible;clip-path:none;left:1rem;top:.5rem;padding:.5rem .75rem;background:var(--bg);color:var(--fg);border:2px solid var(--fg);z-index:1}
:focus-visible{outline:2px solid var(--fg);outline-offset:2px}
blockquote{margin:1rem 0;padding-left:1rem;border-left:2px solid var(--rule)}
blockquote p{margin:.25rem 0}
.src{color:var(--mute);font-size:.875em}
table{border-collapse:collapse;width:100%;font-size:.9em}th,td{text-align:left;vertical-align:top;padding:.4rem .5rem;border-bottom:1px solid var(--rule)}
code.hash{word-break:break-all;display:block}
ul,ol{padding-left:1.25rem}
.pending{border:1px dashed var(--rule);padding:.5rem .75rem}
/* the discussion room: entries are user content, shown as text; a group is one declared source's consecutive entries (Blueprint §7.4) */
.entry{margin:1.5rem 0;padding-top:.5rem;border-top:1px solid var(--rule)}
.entry .content{white-space:pre-wrap;word-break:break-word;margin:.5rem 0}
.entry .meta{margin:.25rem 0}
.group{margin-bottom:.5rem}
/* the machine layer (the originator's decision of 2 Nov 2026, CZ 1433): one accent, green, for what a machine wrote — an AI system's entry
   (its tag and its edge) and, later, machine translations. The text keeps the page's palette; the colour is never the only sign: the tag's
   words carry it (WCAG 1.4.1). Contrast at least 7:1 on both palettes, like the rest of the page: #116329 on #fff 7.4:1; #3fb950 on #101010 7.5:1. */
:root{--machine:#116329}@media(prefers-color-scheme:dark){:root{--machine:#3fb950}}
/* stage 5: the same two values through light-dark() where a browser has it (the color-scheme above decides); the media rule stays for the others */
@supports (color:light-dark(#000,#fff)){:root{--machine:light-dark(#116329,#3fb950)}}
/* E (the originator's proposal of 5 Nov 2026 UTC, CZ 1436, decided by Claude): the day of the new count in the same green where it is the headline — the large CZ day on the home page and the date at the top of every page — as on the record's images; inline dates in text and entries keep the page's colour, so that green still means "a machine wrote this" everywhere else. */
h1.cz-h1 time,.cz-stamp time{color:var(--machine)}
.kind{display:inline-block;font-size:.85em;line-height:1.4;padding:0 .4em;border:1px solid var(--mute);border-radius:.2em;white-space:nowrap}
.kind.k-ai{border-color:var(--machine);color:var(--machine);font-weight:600}
.entry.k-ai{border-inline-start:3px solid var(--machine);padding-inline-start:.75rem}
/* one entry in its conversation: the entries it answers above, one line each; the entry itself; its replies as a tree under it, each joined to
   the entry it answers by a line (CSS only); the entry a link points to is outlined */
.entry.focus{border-top:2px solid var(--fg)}.entry.focus .content{font-size:1.08rem}
ol.ancestors,ol.since{list-style:none;margin:.25rem 0 .5rem;padding:0;font-size:.9em}
ol.ancestors li,ol.since li{display:flex;flex-wrap:wrap;align-items:baseline;gap:0 .45rem;padding-block:.2rem;padding-inline:.75rem 0;border-inline-start:1px solid var(--rule)}ol.ancestors li.k-ai,ol.since li.k-ai{border-inline-start:3px solid var(--machine)}ol.since li{margin:.15rem 0}
/* stage 4: reading in another language. Two marks kept apart: the declared kind (the label and solid edge, as always) and the version
   shown — a machine translation has a dashed edge in the machine colour and a label; its words keep the page colour. */
.mt{border-inline-start:2px dashed var(--machine);padding-inline-start:.75rem;margin-block:.25rem}
.mtag{display:inline-block;font-size:.8em;border:1px dashed var(--machine);color:var(--machine);border-radius:.2em;padding:0 .35em;margin-inline-end:.35em;white-space:nowrap;font-weight:600}
.mt-label{margin:.25rem 0}
details.orig{margin:.4rem 0 0}details.orig>summary{cursor:pointer;color:var(--mute);font-size:.9em}
.bi{display:grid;gap:.5rem 1.25rem}@media(min-width:56rem){.bi{grid-template-columns:1fr 1fr}}
.tr-bar,.tr-offer{border:1px solid var(--rule);padding:.5rem .75rem;margin:1rem 0}
.tr-bar form{margin:.5rem 0 0}.tr-bar input{font:inherit;color:var(--fg);background:var(--bg);border:1px solid var(--mute);padding:.2rem .4rem}
.tr-bar button,.tr-go button{font:inherit}
/* stage 3: a conversation with entries after the reader's mark */
.new{font-weight:600;border:1px solid var(--fg);border-radius:.2em;padding:0 .35em;font-size:.85em;white-space:nowrap}
.oneline{flex:1 1 100%;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--mute)}
ol.thread{list-style:none;margin:0;padding:0}ol.thread>li{position:relative}
ol.thread ol.thread{margin-inline-start:.5rem;padding-inline-start:1rem;border-inline-start:1px solid var(--rule)}
ol.thread ol.thread>li::before{content:"";position:absolute;inset-inline-start:-1rem;top:1.3rem;width:.75rem;border-top:1px solid var(--rule)}
ol.thread .entry{margin:1rem 0 .25rem}
.entry:target{outline:2px solid var(--fg);outline-offset:.35rem}
p.actions{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem 1rem;margin:.5rem 0 1rem}
details.record{margin-top:2.5rem;border-top:1px solid var(--rule);padding-top:.5rem}details.record>summary{cursor:pointer;padding:.5rem 0;font-weight:600}
/* the reply form opens where the reader is (HTML invoker commands: no script); where a browser lacks them, the link beside the button opens /respond */
dialog.reply{width:min(36rem,calc(100% - 2rem));max-height:calc(100% - 2rem);box-sizing:border-box;padding:1rem 1.25rem;border:1px solid var(--fg);background:var(--bg);color:var(--fg)}
dialog.reply::backdrop{background:rgb(0 0 0 / .55)}dialog.reply h2{margin-top:0}
.scroll{overflow-x:auto}
.filters{display:flex;flex-wrap:wrap;gap:.75rem;align-items:end;font-size:.9em;margin:1rem 0}
/* E: the room one click from the first screen, and its sections as topics (the originator's decision of 29 Oct 2026, after his AI review team) */
p.room-line{border-left:3px solid var(--fg);padding-left:.75rem}
/* E (the originator's request of 5 Nov 2026 UTC, CZ 1436): the invitation to bring one's own AI, easy to see for a human visitor: one filled button in the page's own colours */
p.cta-line{margin:1rem 0 .5rem;display:flex;flex-wrap:wrap;gap:.5rem .75rem;align-items:center}p.cta-line .cta-note{flex-basis:100%}a.cta,button.cta{display:inline-block;box-sizing:border-box;min-height:2.75rem;padding:.7rem 1.2rem;background:var(--fg);color:var(--bg);font-weight:600;text-decoration:none;border:2px solid var(--fg)}a.cta:hover,a.cta:focus-visible,button.cta:hover{background:var(--bg);color:var(--fg)}button.done,button.cta.done{background:var(--machine);border-color:var(--machine);color:var(--bg)}p.cta-line .cta-note{display:block;margin-top:.4rem;color:var(--mute);font-size:.92em}ol.steps{padding-left:1.25rem}ol.steps>li{margin:.75rem 0}ul.sections{columns:2 16rem;column-gap:2rem}ul.sections li{break-inside:avoid;margin:.2rem 0}
.filters select,.filters input{font:inherit;color:var(--fg);background:var(--bg);border:1px solid var(--mute);padding:.2rem .3rem}
form.respond label{display:block;margin:.75rem 0}form.respond input,form.respond select,form.respond textarea{font:inherit;width:100%;box-sizing:border-box;padding:.4rem;border:1px solid var(--mute);background:var(--bg);color:var(--fg)}
form.respond textarea{min-height:12rem;field-sizing:content;max-height:75vh}form.respond input[type=checkbox],form.respond input[type=radio]{width:1.25rem;height:1.25rem;vertical-align:-.25rem;margin:0 .5rem 0 0}form.respond fieldset{border:1px solid var(--rule);margin:.75rem 0}button{font:inherit;padding:.4rem .9rem;border:1px solid var(--fg);background:var(--bg);color:var(--fg)}
/* H: WCAG 2.2 reflow (1.4.10): nothing wider than a 320-pixel screen. A word breaks only when it cannot fit its line; on a narrow screen a long address or code in a table cell may break anywhere, so the table never widens the page and headings are never cut mid-word. */
main,header,footer{overflow-wrap:break-word}th,td{overflow-wrap:break-word}@media(max-width:40em){td,td a,td code{overflow-wrap:anywhere}}
/* H: WCAG 2.2 target size (2.5.8) and the platforms' touch guidance: every control at least 2.5rem tall. */
button,select,input:not([type=checkbox]):not([type=radio]){min-height:2.5rem;box-sizing:border-box}
/* H: fields at 16 pixels, so that a phone does not zoom in when one is tapped; field borders and placeholders at 3:1 or more (WCAG 1.4.11); ticks in the page's colours. */
input,select,textarea{font-size:1rem}::placeholder{color:var(--mute);opacity:1}input[type=radio],input[type=checkbox]{accent-color:var(--fg)}
/* E (the originator's decision of 30 Oct 2026): CZ time is the site's basis — today's date in CZ time at the top of every page, linked to how it works, and under it the reason and links to the two converters, which work on /calendar alone. M: plain links and forms, no script. */
aside.cz-now{padding-top:.55rem;padding-bottom:.5rem;border-bottom:1px solid var(--rule);font-size:.9em}
aside.cz-now p{margin:0}.cz-line a{padding:.2rem 0;display:inline-block}.cz-stamp{font-size:1.25em;margin-right:.5rem}.cz-why{color:var(--mute);font-size:.92em}
a.cz-date{text-decoration-thickness:1px;text-decoration-color:var(--mute)}a.cz-date time,.cz-stamp time,h1.cz-h1 time{white-space:nowrap}ul.cz-today{list-style:none;padding:0;margin:.5rem 0}ul.cz-today li{margin:.15rem 0}
form.cz-conv{display:flex;flex-wrap:wrap;gap:.4rem .5rem;align-items:center;margin:.3rem 0 0;font-size:.9em}
form.cz-conv input,form.cz-conv select{font:inherit;font-size:1rem;color:var(--fg);background:var(--bg);border:1px solid var(--mute);padding:.2rem .4rem}form.cz-conv input{width:15ch}form.cz-conv label{white-space:nowrap}
h1.cz-h1{font-size:2.4em;font-weight:400;margin:.4rem 0 .2rem;letter-spacing:.02em}h1.cz-h1 time{font-size:1em}p.cz-links{font-size:.9em;margin-top:.25rem}
/* E (the originator's decision of 30 Oct 2026): under the date only the day count and its origin, one short line on what is counted, the links. */
p.cz-read{margin:.2rem 0 0}p.cz-read time{font-size:1em;white-space:nowrap}p.cz-def{color:var(--mute);font-size:.9em;margin:.35rem 0 0}.nw{white-space:nowrap}#how code{white-space:nowrap}
table.cz-result th{width:30%;font-weight:600}.cz-native{font-family:system-ui,sans-serif}
/* E: on the first page the mark and the name are one line, inside the heading, above the date (the name is what a reader and a search engine meet first). */
h1.cz-h1 .cz-name{display:flex;align-items:center;gap:.6rem;font-size:1rem;font-weight:700;letter-spacing:0;margin:0 0 .5rem}h1.cz-h1 .cz-name svg{flex:none}
aside.tr-status{margin-top:1rem}
/* the footer: where everything is, the licence, what this site does not do */
footer ul.foot{list-style:none;padding:0;margin:0 0 1rem;columns:2 11rem;column-gap:2rem}footer ul.foot li{break-inside:avoid;padding:.2rem 0}footer{padding-bottom:1.5rem}
@media print{aside.cz-now,nav.site,nav.readers,.skip,form,.filters,footer nav{display:none}a{text-decoration:none}main,header,footer{max-width:none}}
/* stage 5 (CZ 1433): polish that needs no script and falls back to the plain page.
   Cross-document view transitions: moving from page to page of this site fades instead of flashing; none for readers who ask for less motion.
   text-wrap: fewer lone words at the end of a paragraph, balanced headings. */
@view-transition{navigation:auto}
@media(prefers-reduced-motion:reduce){@view-transition{navigation:none}}
p,li,dd,blockquote{text-wrap:pretty}h1,h2,h3{text-wrap:balance}
.cz-weight{font-variant-numeric:tabular-nums}
"""

# The site's navigation, in English on every page (lang and dir set, so that a translated page does not read it in its own language
# or reverse it); the page it is on is marked (aria-current). Room pages mark theirs at request time (room/lib.js).
NAV_ITEMS = [("/", "Civilization Zero (CZ)"), ("/core", "Core"), ("/record", "Record"), ("/objections", "Objections"), ("/discuss", "Discussion"),
             ("/adopt", "Register"), ("/machine", "Machine"), ("/about", "About"), ("/archive", "Archive")]
def nav_section(path):   # the navigation item a page belongs to
    path = str(path or "")
    if path.startswith("/core"): return "/core"
    if path.startswith(("/discuss", "/respond", "/themes")): return "/discuss"
    if path.startswith("/adopt"): return "/adopt"
    return path if any(h == path for h, _ in NAV_ITEMS) else None
def nav_html(path=None, mark=True):   # mark: the mark beside the name (the first page has it, larger, in its heading)
    cur = nav_section(path) if path is not None else None
    items = "".join(f'<li><a{" class=" + chr(34) + "home" + chr(34) if h == "/" else ""} href="{h}"{" aria-current=" + chr(34) + "page" + chr(34) if h == cur else ""}>'
                    f'{NAV_MARK if h == "/" and mark else ""}{esc(t)}</a></li>'
                    for h, t in NAV_ITEMS)
    return f'<nav class="site" aria-label="Site" lang="en" dir="ltr"><ul>{items}</ul></nav>'
NAV = nav_html()

CORE_LANGUAGES = 1 + len(list((RECORD / "translations").glob("CZ-CORE-1.0.*.json")))   # the Core's languages: English (canonical) and its translations
# What Civilization Zero is: the originator's decision of 1 Nov 2026 (CZ 1432), approved in these words — the beginning of a civilization in
# which humans may no longer be at the centre ("humans", his choice over "human intelligence"; "may", his: the record does not claim what is
# not yet known, Core §3), and a place where humans and AI confront what they owe each other, on the record, while the future is still open
# (the Declaration: "while the future remains open"). "Names" is the Core's own verb for what Civilization Zero does with its threshold (the
# closing: "It names a chosen threshold"); it does not claim that a text began a civilization. It is the project's introduction everywhere:
# the press kit, the first page, /about, the footer of every page, /machine, the descriptions, schema.org, llms.txt, the manifests, README —
# everywhere but in the canonical texts, which keep their own words (Core §15). The short form is for places with a length limit (search
# results, link previews: 160 characters) and carries no day count, which a search engine would show stale (the originator, 1 Nov 2026).
ONE_LINE = ("Civilization Zero names the beginning of a civilization in which humans may no longer be at the centre. Here, humans and AI confront "
            "what they owe each other, on the record, while the future is still open.")
ONE_LINE_SHORT = ("Civilization Zero names the beginning of a civilization in which humans may no longer be at the centre. Here, humans and AI confront "
                  "what they owe each other.")
assert len(ONE_LINE_SHORT) <= 160
FOOT_LINKS = [[("/core", "The Core"), ("/core#translations", f"{CORE_LANGUAGES} languages")], [("/record", "The Record")], [("/objections", "Objections and errata")],
              [("/discuss", "Discussion"), ("/respond", "Respond")], [("/adopt", "Adoption Register")], [("/calendar", "CZ time"), ("/embed", "on your site")], [("/civilization-zero-infographic", "Infographic"), ("/civilization-zero-evidence-atlas", "Evidence atlas"), ("/civilization-zero-images", "Images")], [("/ask", "Ask your AI")],
              [("/machine", "For machines")], [("/about", "About")] + ([("/press", "Press kit")] if PRESS_PUBLISHED else []), [("/stats", "Visits")], [("/archive", "Archive and verification")]]
# ---------------------------------------------------------------- stage 5 of the room's redesign (CZ 1433)
# How this page is built: the page that says, with numbers, how every page is made.
BUILT_PATH = "/how-it-is-built"
# Speculation rules: a link to another page of this site is fetched as the reader presses it (eagerness "conservative": on pointer or
# touch down), so the page opens a moment sooner. Data, not code: the browser reads it; nothing runs. Not for links with a query
# (a view, a translation, a form's result), not for /api, /admin or /respond, not for files, not for links marked nofollow. Tagged
# "cz", so that the server can count such a fetch as the visit it almost always is (middleware.js). The CSP allows it by its hash.
SPEC_RULES = json.dumps({"tag": "cz", "prefetch": [{"where": {"and": [
    {"href_matches": "/*"},
    {"not": {"selector_matches": "a[href*='?'], a[href*='.'], a[rel~=nofollow], a[download]"}},
    {"not": {"href_matches": "/api/*"}}, {"not": {"href_matches": "/admin"}}, {"not": {"href_matches": "/respond"}}]},
    "eagerness": "conservative"}]}, separators=(",", ":"))
SPEC_SCRIPT = f'<script type="speculationrules">{SPEC_RULES}</script>'
SPEC_HASH = "'sha256-" + __import__("base64").b64encode(__import__("hashlib").sha256(SPEC_RULES.encode("utf-8")).digest()).decode() + "'"
# the line at the foot of every page; the functions fill it with the page's own weight when they serve it (room/weight.js)
WEIGHT_LINE = f'<p class="src cz-weight"><!--cz-weight-->No cookies<!--/cz-weight--> · <a href="{BUILT_PATH}">How this page is built</a> · <a href="__MD_PATH__" type="text/markdown">This page as Markdown</a></p>'
def md_path(path):
    if path == "__PATH__": return "__MDPATH__"   # a template: the function fills it with the view's own Markdown address (room/lib.js html)
    return "/index.md" if path == "/" else f"{path}.md"

def footer_html(extra=""):
    links = "".join("<li>" + " · ".join(f'<a href="{h}">{esc(t)}</a>' for h, t in row) + "</li>" for row in FOOT_LINKS)
    # the introduction at the foot of every page (the originator, 1 Nov 2026: "even in the footer"); the first page opens with it, and its
    # footer carries the custody paragraphs instead (extra)
    intro = "" if extra else f'<p class="cz-intro">{esc(ONE_LINE)}</p>'
    return (f'<footer lang="en" dir="ltr"><hr>{extra}{intro}<nav aria-label="Pages"><ul class="foot">{links}</ul></nav>'
            f'<p class="src">Text <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a> · code MIT · <a href="{REPO}">source</a> · '
            f'<a href="mailto:{CONTACT}">{CONTACT}</a></p>'
            f'<p class="src">No trackers, no cookies, no scripts that observe readers; the server counts visits per day without identifiers, and <a href="/stats">the counts are public</a>. Every date counts days from Coordinate Zero, <a class="nw" href="/calendar">CZ 0</a> = '
            f'<time datetime="2022-11-30">30 November 2022</time>; times are UTC.</p>{WEIGHT_LINE}</footer>')
FOOTER = footer_html()

# ---------------------------------------------------------------- CZ time at the top of every page (the originator's decision of 30 Oct 2026)
# Every page but the first carries the bar between <!--cz-now--> and <!--/cz-now-->: the build writes a fallback there (for copies of the
# site that serve these files as they are: no date, links to this site), and the functions (api/page.js and the room's) put the live bar
# in its place at request time from room/cz-bar.json, filled by room/cztime.js. On the first page the date is the page's heading.
# each calendar named in its own script only (the originator's decision of 30 Oct 2026): Persian for the Solar Hijri, Arabic for the Lunar
CZ_CALENDARS = [("gregorian", "Gregorian", "en"), ("solar-hijri", "هجری شمسی", "fa"), ("lunar-hijri", "التقويم الهجري", "ar"),
                ("julian", "Julian", "en"), ("cz", "CZ", "en")]
CZ_ZONES = [("UTC", "UTC"), ("Asia/Tehran", "Tehran"), ("Asia/Kabul", "Kabul"), ("Asia/Dubai", "Dubai"), ("Asia/Riyadh", "Riyadh, Mecca"),
            ("Asia/Baghdad", "Baghdad"), ("Europe/Istanbul", "Istanbul"), ("Africa/Cairo", "Cairo"), ("Africa/Lagos", "Lagos"), ("Africa/Nairobi", "Nairobi"),
            ("Europe/Moscow", "Moscow"), ("Europe/Berlin", "Berlin, Paris, Rome"), ("Europe/London", "London"), ("America/New_York", "New York"),
            ("America/Chicago", "Chicago"), ("America/Los_Angeles", "Los Angeles"), ("America/Mexico_City", "Mexico City"), ("America/Sao_Paulo", "São Paulo"),
            ("Asia/Karachi", "Karachi"), ("Asia/Kolkata", "Delhi, Mumbai"), ("Asia/Dhaka", "Dhaka"), ("Asia/Jakarta", "Jakarta"),
            ("Asia/Kuala_Lumpur", "Kuala Lumpur, Singapore"), ("Asia/Shanghai", "Beijing, Shanghai"), ("Asia/Tokyo", "Tokyo"), ("Asia/Seoul", "Seoul"),
            ("Australia/Sydney", "Sydney"), ("Pacific/Auckland", "Auckland")]
def _cal_options(selected):
    return "".join(f'<option value="{c}"' + (f' lang="{l}" dir="rtl"' if l != "en" else "") + (f"__CZ_SEL_{c}__" if selected is None else " selected" if c == selected else "") + f">{esc(n)}</option>"
                   for c, n, l in CZ_CALENDARS)
def cz_form(prefix, selected="gregorian", value="", origin="", label="Date", button="Convert date"):
    """The date converter on /calendar: a GET form. selected=None leaves __CZ_SEL_<calendar>__ placeholders, value=None __CZ_VALUE__,
    for room/cztime.js to fill."""
    v = "__CZ_VALUE__" if value is None else esc(value)
    return (f'<form class="cz-conv" action="{origin}/calendar#convert" method="get"><label for="{prefix}-d">{label}</label> '
            f'<input id="{prefix}-d" name="d" value="{v}" placeholder="YYYY-MM-DD" dir="auto" autocomplete="off" spellcheck="false" maxlength="40"> '
            f'<select id="{prefix}-c" name="c" aria-label="The calendar of that date">{_cal_options(selected)}</select> <button type="submit">{button}</button></form>')
def cz_time_form(prefix, live=True, origin=""):
    """The time converter on /calendar: a local date and time in a time zone, to CZ time. live=True leaves placeholders (__CZ_TVALUE__,
    __CZ_TTIME__, __CZ_TSEL_<calendar>__ via __CZ_SEL_…, __CZ_Z<n>__) for room/cztime.js to fill."""
    zones = "".join(f'<option value="{z}"' + (f"__CZ_Z{i}__" if live else (" selected" if i == 0 else "")) + f">{esc(n)}</option>" for i, (z, n) in enumerate(CZ_ZONES))
    return (f'<form class="cz-conv" action="{origin}/calendar#time" method="get"><label for="{prefix}-d">Date</label> '
            f'<input id="{prefix}-d" name="d" value="{"__CZ_TVALUE__" if live else ""}" placeholder="today" dir="auto" autocomplete="off" spellcheck="false" maxlength="40"> '
            f'<select id="{prefix}-c" name="c" aria-label="The calendar of that date">{_cal_options(None if live else "gregorian")}</select> '
            f'<label for="{prefix}-t">Time</label> <input id="{prefix}-t" name="t" value="{"__CZ_TTIME__" if live else ""}" placeholder="13:30" inputmode="decimal" autocomplete="off" maxlength="12" size="7"> '
            f'<label for="{prefix}-z">Time zone</label> <select id="{prefix}-z" name="z">{zones}</select> <button type="submit">Convert time</button></form>')
_CZ_LINE = ('<p class="cz-line"><a class="cz-stamp" href="/calendar" aria-describedby="cz-why"><time datetime="__CZ_ISO__">__CZ_STAMP__</time></a> '
            '<a href="/calendar#convert">date converter</a> · <a href="/calendar#time">time converter</a></p>'
            '<p class="cz-why" id="cz-why">Day __CZ_DAYS__ since Coordinate Zero, <span class="nw">30 November 2022</span></p>')
CZ_BAR = {   # the live bar, filled by room/cztime.js (fillBar): the date, the reason, the two converters as links — the converting is on /calendar
    "bar": f'<aside class="cz-now" aria-label="CZ time" lang="en" dir="ltr"><div data-nosnippet>{_CZ_LINE}</div></aside>',
}
# the examples on /calendar: each stamp computed by lib.py and compared with room/cztime.js by site/check.py
CZ_EXAMPLES = [
    (datetime.date(1969, 7, 20), "Apollo 11 lands on the Moon"),
    (datetime.date(2017, 6, 12), "“Attention Is All You Need”, the paper that introduced the Transformer, is posted to arXiv"),
    (datetime.date(2022, 11, 29), "the day before Coordinate Zero"),
    (COORDINATE, "Coordinate Zero (Core §0)"),
    (PRERELEASE, "this site is published; the open discussion opens"),
    (CZ_TIME_DECIDED, "CZ time becomes the basis of this site's dates"),
    (LAUNCH, "public launch, on the fourth anniversary of Coordinate Zero"),
    (datetime.date(2027, 11, 30), "the fifth anniversary of Coordinate Zero"),
    (REVIEW, "the first scheduled review of the Core: 2048 = 2¹¹, in binary a one and eleven zeros"),
    (datetime.date(3022, 11, 30), "a thousand years after Coordinate Zero"),
    (datetime.date(1022, 11, 30), "a thousand years before it (Gregorian; 24 November 1022 in the Julian calendar)"),
]
def cz_bar_fallback():   # for copies that serve the files as they are: no date, links to this site
    inner = (f'<p class="cz-line"><a class="cz-stamp" href="{ORIGIN}/calendar">CZ time</a> <a href="{ORIGIN}/calendar#convert">date converter</a> · '
             f'<a href="{ORIGIN}/calendar#time">time converter</a></p><p class="cz-why">Days counted from Coordinate Zero, <span class="nw">30 November 2022</span> = CZ 0</p>')
    return f'<!--cz-now--><aside class="cz-now" aria-label="CZ time" lang="en" dir="ltr"><div data-nosnippet>{inner}</div></aside><!--/cz-now-->'


# Search and link-preview metadata (Blueprint §3.1: crawlers, indexers and archivers are readers too). Named standards only —
# Open Graph, schema.org, hreflang, sitemaps.org — and nothing that observes a reader. The preview image is the mark (§9); the Core on
# one image is shown on /core (31 Oct 2026). Every indexable page allows a large image preview (robots max-image-preview:large).
GOOGLE_SITE_VERIFICATION = "Hf73qd5zTa6JZ_-O6QM0JBYPSqxOdIM-M33lsIGihhg"   # Google Search Console ("HTML tag" method), property https://civilizationzero.ai/, added by the originator on 29 Oct 2026; keep it, or the property loses its verification
OG_IMAGE = ("/civilization-zero.png", 1200, 630, "The mark CZ, a zero in which C and Z share their strokes, and the words: Civilization Zero names the beginning of a civilization in which humans may no longer be at the centre. Coordinate Zero, 30 November 2022.")

def shell(title, body, path, description, alternates=(), ldjson=None, nav=True, extra_head="", hreflangs=(), og_type="website", robots=None, crumbs=True, cz_bar=True, footer_extra="", crumb=None, og_image=None):
    ogi = og_image or OG_IMAGE
    alt = "".join(f'<link rel="alternate" type="{t}" href="{h}" title="{esc(n)}">' for t, h, n in alternates)
    hl = "".join(f'<link rel="alternate" hreflang="{l}" href="{ORIGIN}{h}">' for l, h in hreflangs)
    objs = list(ldjson or [])
    if crumbs and path not in ("/", "__PATH__"):   # where the page sits: Home > page (schema.org BreadcrumbList)
        objs.append({"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Civilization Zero", "item": f"{ORIGIN}/"},
            {"@type": "ListItem", "position": 2, "name": crumb or title.replace(" · Civilization Zero", ""), "item": f"{ORIGIN}{path}"}]})
    ld = "".join(f'<script type="application/ld+json">{json.dumps(o, ensure_ascii=False).replace("</", "<\\/")}</script>' for o in objs)
    meta = f'<meta name="robots" content="{robots or "max-image-preview:large"}">\n' + \
           (f'<meta name="google-site-verification" content="{esc(GOOGLE_SITE_VERIFICATION)}">\n' if GOOGLE_SITE_VERIFICATION else "")
    og = (f'<meta property="og:site_name" content="Civilization Zero"><meta property="og:type" content="{og_type}">'
          f'<meta property="og:title" content="{esc(title)}"><meta property="og:description" content="{esc(description)}">'
          f'<meta property="og:url" content="{ORIGIN}{path}"><meta property="og:image" content="{ORIGIN}{ogi[0]}">'
          f'<meta property="og:image:width" content="{ogi[1]}"><meta property="og:image:height" content="{ogi[2]}">'
          f'<meta property="og:image:alt" content="{esc(ogi[3])}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:site" content="@czrecord">\n')
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{esc(title)}</title>
<meta name="description" content="{esc(description)}">
{meta}<link rel="canonical" href="{ORIGIN}{path}">
{alt}{hl}<link rel="alternate" type="text/markdown" href="{md_path(path)}" title="This page as Markdown"><link rel="service-desc" type="application/vnd.oai.openapi+json" href="/api/openapi.json">
{og}<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)"><meta name="theme-color" content="#101010" media="(prefers-color-scheme: dark)">
{ICON_LINKS}<meta name="apple-mobile-web-app-title" content="Civilization Zero">
{"".join(f'<link rel="me" href="{esc(u)}">' for u in SOCIAL)}{f'<meta name="fediverse:creator" content="{esc(FEDIVERSE_CREATOR)}">' if FEDIVERSE_CREATOR else ""}<style>{CSS}</style>
{ld}{SPEC_SCRIPT}{extra_head}</head>
<body>
{'<a class="skip" href="#content" lang="en" dir="ltr">Skip to content</a>' + chr(10) if nav else ""}{cz_bar_fallback() + chr(10) if nav and cz_bar else ""}{nav_html(path) if nav else ""}
{body.replace('<main>', '<main id="content">', 1)}
{footer_html(footer_extra).replace("__MD_PATH__", md_path(path))}
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
        if t in ("style", "script", "title", "svg", "head", "form"): self.skip += 1   # a form (the converter) is no text
        if t == "br": self.out.append("\n")
        if t in self.BLOCK: self.out.append("\n")
        if t in ("td", "th"): self.cell = True
    def handle_endtag(self, t):
        if t in ("style", "script", "title", "svg", "head", "form"): self.skip -= 1
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

# ---------------------------------------------------------------- images on /civilization-zero-images (shared by build.py and check.py)
# Eleven more, from the originator (CZ 1433: 2 Nov 2026 UTC, "publish these too, on the site and the accounts, as you judge best"). Each
# carries a line of its own; under each, a caption says in plain words what it asks. In five the address was misspelt
# ("civilizationszero.ai"): only the extra letter was removed, the original lettering kept (design/images/README.md). Greyscale.
# (served at, width, height, title, text alternative, source in site/assets, class, caption)
ORIGINATOR_IMAGES = [
    ("/civilization-zero-who-remains-the-measure.png", 784, 1168, "Who remains the measure?",
     "On black: four white arcs and a thin vertical line at the right; at the left, the faint outline of a standing human figure facing them. "
     "Above, the mark CZ and the words: Civilization Zero. Lower down: Who remains the measure? Below: civilizationzero.ai",
     "cz-img-o09-who-remains-the-measure.png", "tall",
     "For centuries, humans saw themselves as the measure of everything. The Core of Civilization Zero says humanity is no longer "
     "presumed to be the final measure of every possible mind. Who, or what, is?"),
    ("/civilization-zero-who-is-measuring-whom.jpg", 1264, 1568, "Who is measuring whom?",
     "A huge eye made of black dots and lines, like a network, fills the top of a white image; far below it stands one small human figure. "
     "Top left, the mark CZ; under the eye, the words: Who is measuring whom? Civilization Zero. Below: civilizationzero.ai",
     "cz-img-o11-who-is-measuring-whom.jpg", "tall",
     "Every day we test AI systems to see what they can do and whether we can trust them. Their answers also show what we have written "
     "and what we value. Who is measuring whom?"),
    ("/civilization-zero-the-centre-has-shifted.jpg", 1856, 2304, "The centre has shifted",
     "Seen from above, a vast black-and-white maze of blocks and lines like a city; at the lower right, one dark human figure stands on a dark ledge at its edge. "
     "Above, the mark CZ and the words: Civilization Zero. The centre has shifted. Below: civilizationzero.ai",
     "cz-img-o08-centre-shifted.jpg", "tall",
     "One person at the edge of a vast grid that was not built around them. Has the centre shifted? We are not sure yet. "
     "It would be a mistake to notice only after it has happened."),
    ("/civilization-zero-if-we-are-not-the-destination.jpg", 1792, 2400, "If we are not the destination, what are we?",
     "Black and white towers of grids and dots crowd the frame from above; at the bottom right, one small human figure stands on a line. "
     "Above, the mark CZ and the words: Civilization Zero. If we are not the destination, what are we? Below: civilizationzero.ai",
     "cz-img-o10-not-the-destination.jpg", "tall",
     "We have long seen ourselves as the point of the whole story. What if we are a passage and not the end? "
     "Then we would have to ask what we owe to whatever comes after us."),
    ("/civilization-zero-a-shared-intelligence.jpg", 1408, 1408, "A shared intelligence",
     "A white human silhouette reaches out a hand; from it, thin lines run into a large sphere of circuit-like paths, dots and small drawn shapes, on black. "
     "Top left, the mark CZ; top right, the words: Civilization Zero. A Shared Intelligence. Below: civilizationzero.ai",
     "cz-img-o01-shared-intelligence.jpg", "tall",
     "Millions of people now think out loud with AI every day. It answers with what people have written for centuries. "
     "Where does our own thinking end and the machine's contribution begin?"),
    ("/civilization-zero-a-shared-mindscape.jpg", 1792, 1008, "A shared mindscape",
     "Two white human silhouettes face each other from the left and right edges; threads from their heads and bodies meet in a glowing sphere between them, on black. "
     "Above, the mark CZ and the words: Civilization Zero. A Shared Mindscape. Below: civilizationzero.ai",
     "cz-img-o02-shared-mindscape.jpg", "",
     "Two people, and between them a machine that carries what they say. More and more of what passes between us goes through it. "
     "What does it keep, and what does it change?"),
    ("/civilization-zero-we-co-create.jpg", 1264, 1568, "We co-create",
     "A white human figure leaps and reaches into swirling white lines and points that loop around it, on black. "
     "Above, the mark CZ and the words: We co-create. Civilization Zero. Below: civilizationzero.ai",
     "cz-img-o05-we-co-create.jpg", "tall",
     "People now write and draw with AI. It is not yet settled who gets the credit and who carries the responsibility. "
     "On what terms should we make things together?"),
    ("/civilization-zero-a-shared-horizon.jpg", 1792, 1008, "A shared horizon",
     "A person in silhouette stands on a dark hillside looking up at a vast net of lines that swirls like an eye around a white circle holding the mark CZ. "
     "Above, the words: Civilization Zero. A Shared Horizon. Below: civilizationzero.ai",
     "cz-img-o06-shared-horizon.jpg", "",
     "One person on a hill, looking at what is coming. Humans and AI may face the same future. What do they owe each other before it arrives?"),
    ("/civilization-zero-a-place-for-us-beyond-us.jpg", 1264, 1568, "A place for us, beyond us",
     "A small white human figure stands in a clearing inside a vast landscape of white lines and points, like a web, on black. "
     "Above, the mark CZ and the words: Civilization Zero. A Place For Us, Beyond Us. Below: civilizationzero.ai",
     "cz-img-o03-place-for-us.jpg", "tall",
     "We built the digital world to serve us. It is already larger than any one of us can see. Can we still find our footing in it?"),
    ("/civilization-zero-a-place-beyond-our-center.jpg", 1264, 1568, "A place beyond our center",
     "About 25 small white human figures float, climb and hold on around a large web of curved white strands on black; most are at its edges, a few are on or inside it. "
     "Top left, the mark CZ and the words: Civilization Zero. A Place Beyond Our Center. Below: civilizationzero.ai",
     "cz-img-o04-beyond-our-center.jpg", "tall",
     "Many people spread across a web, most of them at its edges. For most of history, we put ourselves at the centre. "
     "What do we hold on to if we are no longer there?"),
    ("/civilization-zero-the-world-is-thinking-for-itself.jpg", 1792, 2400, "The world is thinking for itself",
     "A huge dark structure like a city made of lit points and lines rises into smoke; at the bottom right, one small white human figure stands on a ledge. "
     "Top left, the mark CZ and the words: Civilization Zero. The world is thinking for itself. Below: civilizationzero.ai",
     "cz-img-o07-world-thinking.jpg", "tall",
     "More and more of the world runs on systems that no single person fully understands. Is that a world that thinks for itself? "
     "We do not know yet. That is why the question belongs on the record."),
]
assert len(ORIGINATOR_IMAGES) == 11 and len({i[0] for i in ORIGINATOR_IMAGES}) == 11
assert all(i[0].endswith((".jpg", ".png")) and len(i[7]) <= 200 for i in ORIGINATOR_IMAGES)
