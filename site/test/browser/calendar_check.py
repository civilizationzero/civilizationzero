# Browser check of the rendered /calendar (audit CZ01, round 2). Run: node site/test/browser/serve_calendar.js & then python3 site/test/browser/calendar_check.py
# Uses Playwright Chromium; serves only /calendar through api/page.js, the handler production runs. Screenshots go to $OUT.
import re, sys
from playwright.sync_api import sync_playwright
import os
OUT = os.environ.get("OUT", "/tmp/cz-browser"); os.makedirs(OUT, exist_ok=True)
B = "http://127.0.0.1:8811/calendar"
cases = [("gap", "d=2026-03-08&c=gregorian&t=02%3A30&z=America%2FNew_York"),
         ("fold", "d=2026-11-01&c=gregorian&t=01%3A30&z=America%2FNew_York"),
         ("normal", "d=2026-10-30&c=gregorian&t=13%3A30&z=Asia%2FTehran")]
res, fails = [], 0
with sync_playwright() as p:
    b = p.chromium.launch()
    for w, h, tag in ((1280, 900, "desktop"), (375, 812, "mobile")):
        pg = b.new_page(viewport={"width": w, "height": h})
        for name, q in cases:
            pg.goto(f"{B}?{q}#time"); pg.wait_for_load_state()
            el = pg.locator("#time-result")
            txt = el.inner_text()
            form = {k: pg.locator(sel).input_value() for k, sel in (("date", "#tim-d"), ("time", "#tim-t"), ("zone", "#tim-z"))}
            role = el.get_attribute("role")
            box = el.bounding_box(); sw = pg.evaluate("document.documentElement.scrollWidth")
            el.scroll_into_view_if_needed(); pg.screenshot(path=f"{OUT}/{tag}-{name}.png")
            el.screenshot(path=f"{OUT}/{tag}-{name}-result.png")
            pg.locator("form.cz-conv").last.screenshot(path=f"{OUT}/{tag}-{name}-form.png")
            checks = {
                "gap": lambda: role == "alert" and "did not happen" in txt and "UTC−05:00 to UTC−04:00" in txt and " = CZ" not in txt and "UTC" in txt,
                "fold": lambda: "01:30 in New York = CZ 1432 05:30:00 UTC" in txt and "came twice" in txt and "(UTC−04:00)" in txt and "UTC−05:00" in txt and "CZ 1432 06:30:00 UTC" in txt,
                "normal": lambda: "13:30 in Tehran = CZ 1430 10:00:00 UTC" in txt and "came twice" not in txt and role is None,
            }
            okf = checks[name]() and form["time"] in ("02:30", "01:30", "13:30") and form["zone"] in ("America/New_York", "Asia/Tehran") and form["date"] != "" and sw <= w and box["x"] + box["width"] <= w + 0.5
            fails += not okf
            res.append(f"{tag:7} {w}px {name:6} {'PASS' if okf else 'FAIL'}  form kept: date={form['date']} time={form['time']} zone={form['zone']}  no horizontal scroll: {sw <= w} ({sw}px)\n         shown: {' | '.join(l.strip() for l in txt.splitlines() if l.strip())[:400]}")
    b.close()
print("\n".join(res)); print(f"browser checks: {len(res) - fails} pass, {fails} fail"); sys.exit(1 if fails else 0)
