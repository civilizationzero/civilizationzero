# Three proposals for the introduction image (CZ 1432): only the sentence, 1200x1200, monochrome, the record's own forms.
import asyncio, sys
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
import mark
M = lambda stroke, size, style='': mark.svg(mark.LARGE, stroke=stroke, attrs=f' width="{size}" height="{size}" style="display:block;{style}"')
from playwright.async_api import async_playwright
SENT = "Civilization Zero names the beginning of a civilization in which humans may no longer be at the centre."
assert SENT == "Civilization Zero names the beginning of a civilization in which humans may no longer be at the centre."
REST = ["names the beginning", "of a civilization", "in which humans", "may no longer be", "at the centre."]
assert "Civilization Zero " + " ".join(REST) == SENT
DARK = dict(bg="#101010", fg="#eeeeee", mute="#8a8a8a", rule="#444444")
BASE = ('html,body{margin:0;width:1200px;height:1200px;overflow:hidden}body{position:relative;font-family:Inter,system-ui,sans-serif}'
        '.u{font-family:"Inter Display",Inter,sans-serif;font-weight:700;letter-spacing:-.5px;line-height:1}')
URL = lambda color, size, mt: f'<div class="u" style="color:{color};font-size:{size}px;margin-top:{mt}px">civilizationzero.ai</div>'

def a_statement():   # A: the sentence alone, as a statement; dark
    lines = "".join(f"<div>{l}</div>" for l in REST)
    return (f'<!doctype html><html><head><meta charset="utf-8"><style>{BASE}body{{background:{DARK["bg"]};color:{DARK["fg"]}}}'
            '.w{position:absolute;left:120px;right:110px;top:50%;transform:translateY(-50%)}'
            '.n{font-family:"Inter Display",Inter,sans-serif;font-weight:700;font-size:104px;letter-spacing:-2px;line-height:1.05;margin-bottom:34px}'
            '.r{font-family:"Inter Display",Inter,sans-serif;font-weight:400;font-size:82px;letter-spacing:-1px;line-height:1.14}</style></head><body>'
            f'<div class="w">{M(DARK["fg"], 150, "margin:0 0 54px -6px")}<div class="n">Civilization Zero</div><div class="r">{lines}</div>{URL(DARK["fg"], 64, 52)}</div></body></html>')

def b_centre():      # B: the mark at the top, the sentence under it; light
    fg = "#111111"
    ring = f'<div style="position:absolute;left:0;right:0;top:120px;display:flex;justify-content:center">{M(fg, 420)}</div>'
    return (f'<!doctype html><html><head><meta charset="utf-8"><style>{BASE}body{{background:#ffffff;color:{fg}}}'
            '.t{position:absolute;left:100px;right:100px;top:680px;text-align:center;font-size:50px;line-height:1.3;text-wrap:balance}'
            '.t b{font-family:"Inter Display",Inter,sans-serif;font-weight:700}</style></head><body>'
            f'{ring}<div class="t"><b>Civilization Zero</b> names the beginning of a civilization in which humans may no longer be at the centre.{URL(fg, 56, 40)}</div></body></html>')

def c_axis():        # C: the line of time and its one marked point, Coordinate Zero, as on the cover; the sentence above it; dark
    bg, fg, rule = DARK["bg"], DARK["fg"], DARK["rule"]
    y = 950
    axis = (f'<svg style="position:absolute;left:0;top:{y-24}px" width="1200" height="48" viewBox="0 0 1200 48">'
            f'<line x1="0" y1="24" x2="1150" y2="24" stroke="{rule}" stroke-width="3"/><path d="M1134,13 L1156,24 L1134,35" fill="none" stroke="{rule}" stroke-width="3"/>'
            f'<line x1="600" y1="0" x2="600" y2="48" stroke="{fg}" stroke-width="5"/></svg>')
    return (f'<!doctype html><html><head><meta charset="utf-8"><style>{BASE}body{{background:{bg};color:{fg}}}'
            '.t{position:absolute;left:110px;right:110px;bottom:330px;text-align:center}'
            '.n{font-family:"Inter Display",Inter,sans-serif;font-weight:700;font-size:92px;letter-spacing:-1.5px;line-height:1.05;margin-bottom:30px}'
            '.r{font-size:56px;line-height:1.28;color:#d8d8d8;text-wrap:balance}</style></head><body>'
            f'<div class="t"><div style="display:flex;justify-content:center;margin-bottom:46px">{M(fg, 140)}</div><div class="n">Civilization Zero</div><div class="r">names the beginning of a civilization in which humans may no longer be at the centre.</div>{URL(fg, 56, 40)}</div>{axis}</body></html>')

async def main(out):
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for name, f in [("cz-intro-A-statement.png", a_statement), ("cz-intro-B-centre.png", b_centre), ("cz-intro-C-axis.png", c_axis)]:
            pg = await b.new_page(viewport={"width": 1200, "height": 1200}, device_scale_factor=1)
            await pg.set_content(f()); await pg.wait_for_timeout(200)
            txt = (await pg.inner_text("body")).replace("\n", " ")
            assert " ".join(txt.split()) == SENT + " civilizationzero.ai", txt
            await pg.screenshot(path=f"{out}/{name}"); await pg.close()
        await b.close()
asyncio.run(main(sys.argv[1]))
