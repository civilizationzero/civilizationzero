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
THEMES = []
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
    total = (now - z).days
    _, _, doy = cz_parts(total)
    to_next = cz_anniversary(year + 1) - total
    return dict(year=year, days_in_year=(now - anniv).days, total=total, next_year=year + 1,
                next_iso=nxt.date().isoformat(), next_human=nxt.strftime("%-d %B %Y"),
                asof_iso=now.strftime("%Y-%m-%dT%H:%MZ"), asof_human=now.strftime("%Y-%m-%d %H:%M UTC"),
                cz_iso=now.date().isoformat(), cz_stamp=cz_stamp(total), cz_doyn=doy, cz_since=cz_since_text(year, doy),
                cz_to_next_n=to_next, cz_to_next=plural(to_next, "day"), cz_next_day=cz_anniversary(year + 1))

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

# the favicon: the small drawing, every edge on a whole pixel at 16 and 32 px; dark or light with the reader's browser
FAVICON = MARK_GEOMETRY.svg(MARK_GEOMETRY.SMALL, stroke="#111",
                            inner="<style>@media(prefers-color-scheme:dark){path{stroke:#eee}}</style>")

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
hr{border:0;border-top:1px solid var(--rule);margin:2.5rem 0}
/* E (Blueprint decision 28): two doors, before anything else; equal width — equal standing. */
nav.readers{display:flex;gap:1rem;padding:.75rem 1rem;border-bottom:1px solid var(--rule)}
nav.readers a{flex:1;text-align:center}
nav.site{padding-top:.5rem;padding-bottom:.5rem;border-bottom:1px solid var(--rule);font-size:.9em}
nav.site ul{display:flex;flex-wrap:wrap;column-gap:1.1rem;list-style:none;margin:0;padding:0}
/* H: WCAG 2.2 target size (2.5.8): each link of the site's navigation at least 24 pixels tall, also where the row wraps on a phone; the current page marked
   by a heavier underline, not by colour alone (aria-current). */
nav.site a{display:inline-block;padding:.35rem 0}nav.site a.home{font-weight:600}nav.site a[aria-current=page]{text-decoration-thickness:3px}
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
.scroll{overflow-x:auto}
.filters{display:flex;flex-wrap:wrap;gap:.75rem;align-items:end;font-size:.9em;margin:1rem 0}
/* E: the room one click from the first screen, and its sections as topics (the originator's decision of 29 Oct 2026, after his AI review team) */
p.room-line{border-left:3px solid var(--fg);padding-left:.75rem}ul.sections{columns:2 16rem;column-gap:2rem}ul.sections li{break-inside:avoid;margin:.2rem 0}
.filters select,.filters input{font:inherit;color:var(--fg);background:var(--bg);border:1px solid var(--mute);padding:.2rem .3rem}
form.respond label{display:block;margin:.75rem 0}form.respond input,form.respond select,form.respond textarea{font:inherit;width:100%;box-sizing:border-box;padding:.4rem;border:1px solid var(--mute);background:var(--bg);color:var(--fg)}
form.respond textarea{min-height:12rem}form.respond input[type=checkbox],form.respond input[type=radio]{width:1.25rem;height:1.25rem;vertical-align:-.25rem;margin:0 .5rem 0 0}form.respond fieldset{border:1px solid var(--rule);margin:.75rem 0}button{font:inherit;padding:.4rem .9rem;border:1px solid var(--fg);background:var(--bg);color:var(--fg)}
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
"""

# The site's navigation, in English on every page (lang and dir set, so that a translated page does not read it in its own language
# or reverse it); the page it is on is marked (aria-current). Room pages mark theirs at request time (room/lib.js).
NAV_ITEMS = [("/", "CZ · Civilization Zero"), ("/core", "Core"), ("/record", "Record"), ("/objections", "Objections"), ("/discuss", "Discussion"),
             ("/adopt", "Register"), ("/machine", "Machine"), ("/about", "About"), ("/archive", "Archive")]
def nav_section(path):   # the navigation item a page belongs to
    path = str(path or "")
    if path.startswith("/core"): return "/core"
    if path.startswith(("/discuss", "/respond", "/themes")): return "/discuss"
    if path.startswith("/adopt"): return "/adopt"
    return path if any(h == path for h, _ in NAV_ITEMS) else None
def nav_html(path=None):
    cur = nav_section(path) if path is not None else None
    items = "".join(f'<li><a{" class=" + chr(34) + "home" + chr(34) if h == "/" else ""} href="{h}"{" aria-current=" + chr(34) + "page" + chr(34) if h == cur else ""}>{esc(t)}</a></li>'
                    for h, t in NAV_ITEMS)
    return f'<nav class="site" aria-label="Site" lang="en" dir="ltr"><ul>{items}</ul></nav>'
NAV = nav_html()

FOOT_LINKS = [[("/core", "The Core"), ("/core#translations", "20 languages")], [("/record", "The Record")], [("/objections", "Objections and errata")],
              [("/discuss", "Discussion"), ("/respond", "Respond")], [("/adopt", "Adoption register")], [("/calendar", "CZ time")], [("/ask", "Ask your AI")],
              [("/machine", "For machines")], [("/about", "About")], [("/archive", "Archive and verification")]]
def footer_html(extra=""):
    links = "".join("<li>" + " · ".join(f'<a href="{h}">{esc(t)}</a>' for h, t in row) + "</li>" for row in FOOT_LINKS)
    return (f'<footer lang="en" dir="ltr"><hr>{extra}<nav aria-label="Pages"><ul class="foot">{links}</ul></nav>'
            f'<p class="src">Text <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a> · code MIT · <a href="{REPO}">source</a> · '
            f'<a href="mailto:{CONTACT}">{CONTACT}</a></p>'
            f'<p class="src">No analytics, no trackers, no cookies for readers. Every date counts days from Coordinate Zero, <a class="nw" href="/calendar">CZ 0</a> = '
            f'<time datetime="2022-11-30">30 November 2022</time>; times are UTC.</p></footer>')
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
    "bar": f'<aside class="cz-now" aria-label="CZ time" lang="en" dir="ltr">{_CZ_LINE}</aside>',
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
    return f'<!--cz-now--><aside class="cz-now" aria-label="CZ time" lang="en" dir="ltr">{inner}</aside><!--/cz-now-->'


# Search and link-preview metadata (Blueprint §3.1: crawlers, indexers and archivers are readers too). Named standards only —
# Open Graph, schema.org, hreflang, sitemaps.org — and nothing that observes a reader. The preview image is the mark, the
# site's one image (§9).
GOOGLE_SITE_VERIFICATION = "Hf73qd5zTa6JZ_-O6QM0JBYPSqxOdIM-M33lsIGihhg"   # Google Search Console ("HTML tag" method), property https://civilizationzero.ai/, added by the originator on 29 Oct 2026; keep it, or the property loses its verification
OG_IMAGE = ("/og.png", 1200, 630, "Civilization Zero: the mark CZ, a zero in which C and Z share their strokes, and the name")

def shell(title, body, path, description, alternates=(), ldjson=None, nav=True, extra_head="", hreflangs=(), og_type="website", robots=None, crumbs=True, cz_bar=True, footer_extra=""):
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
          f'<meta property="og:image:alt" content="{esc(OG_IMAGE[3])}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:site" content="@czrecord">\n')
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
{'<a class="skip" href="#content" lang="en" dir="ltr">Skip to content</a>' + chr(10) if nav else ""}{cz_bar_fallback() + chr(10) if nav and cz_bar else ""}{nav_html(path) if nav else ""}
{body.replace('<main>', '<main id="content">', 1)}
{footer_html(footer_extra)}
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
