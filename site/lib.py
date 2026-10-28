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
BLUEPRINT = "1.3.1"
PROMPT_VERSION = "cz-machine-1.0"
ROOM_OPEN = True                           # flipped on the day the room's rules (§7) were verified; the functions read it from api/discuss-templates.json
ROOM_OPENED = "2026-10-29"                 # the ISO date the room opened (set with ROOM_OPEN)
BUNDLE_VERSION = "1.0"                     # the current preservation bundle; earlier bundles stay at their addresses (site/archived-bundles/)
DOI = "10.5281/zenodo.23741225"            # Zenodo DOI of the current release (v1.0, 29 Oct 2026); the concept DOI resolves to the latest version
DOI_CONCEPT = "10.5281/zenodo.23740317"
IA_SNAPSHOTS = {"/": "https://web.archive.org/web/20261028174615/https://civilizationzero.ai/"}   # Internet Archive snapshots, by path
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
MARK = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="40" height="40" role="img" aria-labelledby="mk">'
        '<title id="mk">C-zero: a C that is an unclosed zero; the opening is the place left open for the future</title>'
        '<path d="M204.84,168.85 A87,87 0 1 1 204.84,87.15" fill="none" stroke="currentColor" stroke-width="30.72"/></svg>')

FAVICON = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><style>path{stroke:#111}@media(prefers-color-scheme:dark){path{stroke:#eee}}</style>'
           '<path d="M51.21,42.22 A21.76,21.76 0 1 1 51.21,21.78" fill="none" stroke-width="8"/></svg>')

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
form.respond label{display:block;margin:.75rem 0}form.respond input,form.respond select,form.respond textarea{font:inherit;width:100%;box-sizing:border-box;padding:.4rem;border:1px solid var(--rule);background:var(--bg);color:var(--fg)}
form.respond textarea{min-height:12rem}button{font:inherit;padding:.4rem .9rem;border:1px solid var(--fg);background:var(--bg);color:var(--fg)}
"""

NAV = ('<nav class="site" aria-label="Site"><a href="/">CZ · Civilization Zero</a> · <a href="/core">Core</a> · '
       '<a href="/record">Record</a> · <a href="/objections">Objections</a> · <a href="/discuss">Discussion</a> · '
       '<a href="/machine">Machine</a> · <a href="/about">About</a> · <a href="/archive">Archive</a></nav>')

FOOTER = (f'<footer><hr><p class="exact">Text CC BY 4.0 · Code MIT · <a href="{REPO}">source</a> · '
          f'<a href="mailto:{CONTACT}">{CONTACT}</a> · Coordinate Zero <time datetime="2022-11-30">2022-11-30</time> · UTC</p></footer>')


def shell(title, body, path, description, alternates=(), ldjson=None, nav=True, extra_head=""):
    alt = "".join(f'<link rel="alternate" type="{t}" href="{h}" title="{esc(n)}">' for t, h, n in alternates)
    ld = "".join(f'<script type="application/ld+json">{json.dumps(o, ensure_ascii=False)}</script>' for o in (ldjson or []))
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{esc(title)}</title>
<meta name="description" content="{esc(description)}">
<link rel="canonical" href="{ORIGIN}{path}">
{alt}<link rel="service-desc" type="application/vnd.oai.openapi+json" href="/api/openapi.json">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<style>{CSS}</style>
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
