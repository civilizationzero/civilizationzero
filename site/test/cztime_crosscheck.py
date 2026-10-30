#!/usr/bin/env python3
"""CZ time: the converter (site/room/cztime.js) compared with independent implementations (design/CZ-TIME.md §4).
Needs node, and: pip install convertdate==2.5.1 hijridate==2.6.0 jdatetime. Takes about a minute.
  python3 site/test/cztime_crosscheck.py"""
import datetime, json, pathlib, subprocess, sys
from convertdate import islamic, julian, persian
from hijridate import Gregorian as HG, Hijri as HH

LIB = str(pathlib.Path(__file__).resolve().parent.parent / "room" / "cztime.js")
RD0 = 738489
DUMP = r"""const C = require(process.argv[1]); const [a, b] = process.argv.slice(2).map(Number); const out = [];
for (let D = a; D <= b; D++) { const s = C.toSolarHijri(D), l = D >= C.tabularFrom(1, 1, 1) ? C.toLunarHijri(D) : null;
  out.push([D, C.toGregorian(D).join("-"), C.toJulian(D).join("-"), s ? s.join("-") : "", l ? l.slice(0, 3).join("-") + "/" + l[3] : "", C.isoWeekday(D)].join("\t")); }
process.stdout.write(out.join("\n"));"""
def dump(a, b):
    out = subprocess.run(["node", "-e", DUMP, LIB, str(a), str(b)], capture_output=True, text=True, check=True).stdout
    for line in out.splitlines():
        D, g, j, s, l, w = line.split("\t"); yield int(D), g, j, s, l, int(w)
ymd = lambda *t: "-".join(str(x) for x in t)
fails = []
def note(kind, *a):
    fails.append((kind,) + a)
    if len(fails) < 20: print("MISMATCH", kind, *a)

# 1. Gregorian, Julian and weekday: every day of the years 1 to 9999
lo, hi = datetime.date(1, 1, 1).toordinal() - RD0, datetime.date(9999, 12, 31).toordinal() - RD0
n = 0
for D, g, j, s, l, w in dump(lo, hi):
    d = datetime.date.fromordinal(D + RD0); n += 1
    if g != ymd(d.year, d.month, d.day) or w != d.isoweekday(): note("gregorian", D, g, d)
    if j != ymd(*julian.from_jd(d.toordinal() + 1721424.5)): note("julian", D, j)
print(f"gregorian, julian, weekday: {n:,} days")
# 2. Lunar Hijri: every day of the Umm al-Qura table, every month's start and length; the tabular calendar outside it
ua, ub = datetime.date(1924, 8, 1).toordinal() - RD0, datetime.date(2077, 11, 16).toordinal() - RD0
n = 0
for D, g, j, s, l, w in dump(ua, ub):
    d = datetime.date.fromordinal(D + RD0); h = HG(d.year, d.month, d.day).to_hijri(); n += 1
    if l != ymd(h.year, h.month, h.day) + "/umm-al-qura": note("umm-al-qura", D, l)
print(f"umm al-qura: {n:,} days")
JS = r"""const C = require(process.argv[1]); const out = [];
for (let y = 1343; y <= 1500; y++) for (let m = 1; m <= 12; m++) out.push([y, m, C.lunarHijriMonthDays(y, m), C.fromLunarHijri(y, m, 1)].join(","));
process.stdout.write(out.join("\n"));"""
rows = subprocess.run(["node", "-e", JS, LIB], capture_output=True, text=True, check=True).stdout.split()
for r in rows:
    y, m, ml, D1 = map(int, r.split(",")); hh = HH(y, m, 1); g = hh.to_gregorian()
    if datetime.date(g.year, g.month, g.day).toordinal() - RD0 != D1 or hh.month_length() != ml: note("umm-al-qura month", y, m)
print(f"umm al-qura: {len(rows)} months")
n = 0
for a, b in ((datetime.date(622, 7, 19).toordinal() - RD0, ua - 1), (ub + 1, hi)):
    for D, g, j, s, l, w in dump(a, b):
        n += 1
        if l != ymd(*islamic.from_jd(D + RD0 + 1721424.5)) + "/tabular": note("tabular", D, l)
print(f"tabular: {n:,} days")
# 3. Solar Hijri: every day of 1–3177 SH there and back, in sequence; each year's first day against the astronomical rule
JS = r"""const C = require(process.argv[1]); let bad = 0, prev = null, n = 0; const ny = [];
const a = C.fromSolarHijri(1, 1, 1), b = C.fromSolarHijri(3177, 12, C.solarHijriMonthDays(3177, 12));
for (let D = a; D <= b; D++) { const s = C.toSolarHijri(D); n++;
  if (!s || C.fromSolarHijri(...s) !== D || s[2] < 1 || s[2] > C.solarHijriMonthDays(s[0], s[1])) bad++;
  else if (prev) { const [y, m, d] = prev, len = C.solarHijriMonthDays(y, m); const e = d < len ? [y, m, d + 1] : m < 12 ? [y, m + 1, 1] : [y + 1, 1, 1]; if (e.join() !== s.join()) bad++; }
  prev = s; }
for (let y = 1; y <= 2000; y++) ny.push(C.fromSolarHijri(y, 1, 1));
process.stdout.write(JSON.stringify({ n, bad, ny }));"""
o = json.loads(subprocess.run(["node", "-e", JS, LIB], capture_output=True, text=True, check=True).stdout)
if o["bad"]: note("solar hijri round trip", o["bad"])
print(f"solar hijri: {o['n']:,} days there and back")
differ = [y for y, D in enumerate(o["ny"], 1) if int(persian.to_jd(y, 1, 1) + 0.5) - 2459914 != D]
print(f"solar hijri, first day of each year 1-2000 SH vs the astronomical rule: differs in {differ}")
if any(1277 <= y <= 1502 for y in differ): note("solar hijri vs astronomical in 1277-1502", differ)
print("FAILED" if fails else "all agree"); sys.exit(1 if fails else 0)
