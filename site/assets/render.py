# How the site's raster images were made. The mark is CZ drawn as a zero: one zero in which C and Z share every stroke, its
# slash the Z's diagonal, its right side left open (Blueprint decision 5, changed by the originator on 29 Oct 2026 and again
# on 30 Oct 2026; queued for 1.4). The geometry is mark.py, beside this script: SMALL puts every edge on a whole pixel at
# 16, 32, 48 and 96 px (the favicon sizes); LARGE is the drawing for the sizes where the mark is seen (home screen, link
# previews). Black on white, so that it shows on a light or a dark background alike (the SVG favicon adapts by itself; a PNG
# cannot). Run by hand; the files are committed beside this script and copied by the build, so the build stays reproducible
# without a browser. Needs Playwright (Chromium) and Pillow.
#   python3 render.py <output directory>
#   python3 render.py --social <output directory>   the accounts' profile picture and cover (design/social/, not served by the site)
#   python3 render.py --poster site/assets          the Core on one image (cz-core.png, served at /civilization-zero-core.png)
import asyncio, io, pathlib, sys
from playwright.async_api import async_playwright
from PIL import Image
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import mark

def page(w, h, side, share, drawing):
    # the 64-unit box drawn `side` pixels square, the box covering `share` of it, centred on a white page of w x h
    inner = mark.svg(drawing, stroke="#111", attrs=f' width="{side * share:.2f}" height="{side * share:.2f}" style="display:block"')
    return (f'<!doctype html><html><head><meta charset="utf-8"><style>html,body{{margin:0;width:{w}px;height:{h}px;background:#fff}}'
            f'body{{display:flex;align-items:center;justify-content:center}}</style></head><body>{inner}</body></html>')

LARGE, SMALL = mark.LARGE, mark.SMALL
def og_page():
    # the link-preview image: the mark and the name, and what the record is in one line — a link shared anywhere says what it leads to
    inner = mark.svg(LARGE, stroke="#111", attrs=' width="300" height="300" style="display:block;flex:none"')
    return ('<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;width:1200px;height:630px;background:#fff;color:#111}'
            'body{display:flex;align-items:center;justify-content:center;gap:56px;font-family:system-ui,sans-serif}'
            '.t{max-width:640px}.n{font-size:76px;font-weight:700;letter-spacing:-.5px;line-height:1.05}.d{font-size:34px;line-height:1.3;margin-top:22px}'
            '.c{font-size:28px;color:#555;margin-top:18px;font-family:ui-monospace,monospace}</style></head><body>'
            f'{inner}<div class="t"><div class="n">Civilization Zero</div><div class="d">The origin record for humans and AI</div>'
            '<div class="c">Coordinate Zero · 30 November 2022</div></div></body></html>')

IMAGES = [  # name, width, height, side, share of the side the 64-unit box covers, drawing
    ("og.png", 1200, 630, 400, 1.0, "OG"),                 # the link-preview image (1200x630): the mark, the name, one line
    ("apple-touch-icon.png", 180, 180, 180, 0.72, LARGE),  # a phone's home screen (iOS rounds the corners itself)
    ("favicon-16", 16, 16, 16, 1.0, SMALL), ("favicon-32", 32, 32, 32, 1.0, SMALL), ("favicon-48", 48, 48, 48, 1.0, SMALL),
    ("favicon-96x96.png", 96, 96, 96, 1.0, SMALL),         # a search engine's result list asks for a multiple of 48 pixels
    ("icon-192.png", 192, 192, 192, 0.75, LARGE), ("icon-512.png", 512, 512, 512, 0.75, LARGE),   # site.webmanifest
    ("icon-maskable-512.png", 512, 512, 512, 0.66, LARGE), # maskable: the mark inside the central safe circle (radius 40%)
]

async def main(out):
    shots = {}
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for name, w, h, side, share, drawing in IMAGES:
            pg = await b.new_page(viewport={"width": w, "height": h}, device_scale_factor=1)
            await pg.set_content(og_page() if drawing == "OG" else page(w, h, side, share, drawing))
            shots[name] = await pg.screenshot(omit_background=False)
            await pg.close()
        await b.close()
    for name, *_ in IMAGES:
        if name.endswith(".png"): Image.open(io.BytesIO(shots[name])).convert("RGB").save(f"{out}/{name}", optimize=True)
    ico = [Image.open(io.BytesIO(shots[f"favicon-{s}"])).convert("RGBA") for s in (16, 32, 48)]
    ico[2].save(f"{out}/favicon.ico", format="ICO", sizes=[(16, 16), (32, 32), (48, 48)], append_images=ico[:2])

# The project's accounts (X, Bluesky, Mastodon, GitHub; the originator's request of 30 Oct 2026, CZ 1430): one profile picture and one
# cover, in the site's dark palette. The picture is the mark alone, inside the circle every one of those sites cuts it to. The cover says
# what the record is and where it starts: the name, one line, and a time axis whose one marked point is Coordinate Zero; its lower left
# is left empty, because each of those sites lays the profile picture over it. One design at 3:1 (X and Mastodon show 1500x500,
# Bluesky takes up to 1 MB at 3:1, here 3000x1000).
DARK = dict(bg="#101010", fg="#eeeeee", mute="#aaaaaa", rule="#444444")
def profile_page(side=1000, share=0.62):
    inner = mark.svg(LARGE, stroke=DARK["fg"], attrs=f' width="{side * share:.2f}" height="{side * share:.2f}" style="display:block"')
    return (f'<!doctype html><html><head><meta charset="utf-8"><style>html,body{{margin:0;width:{side}px;height:{side}px;background:{DARK["bg"]}}}'
            f'body{{display:flex;align-items:center;justify-content:center}}</style></head><body>{inner}</body></html>')
def cover_page():   # 1500x500 CSS pixels; rendered at 1x and at 2x
    bg, fg, mute, rule = DARK["bg"], DARK["fg"], DARK["mute"], DARK["rule"]
    css = (f'html,body{{margin:0;width:1500px;height:500px;background:{bg};color:{fg};overflow:hidden}}body{{position:relative;font-family:Inter,system-ui,sans-serif}}'
           '.row{position:absolute;left:0;right:0;text-align:center;line-height:1;white-space:nowrap}'
           '.n{font-family:"Inter Display",Inter,system-ui,sans-serif;font-weight:700;font-size:96px;letter-spacing:-1.5px}.d{font-size:42px}'
           f'.c{{font-family:"DejaVu Sans Mono",monospace;font-size:30px;color:{mute}}}'
           f'.u{{position:absolute;right:44px;bottom:38px;font-family:"DejaVu Sans Mono",monospace;font-size:26px;color:{mute};line-height:1}}')
    axis = (f'<svg style="position:absolute;left:0;top:248px" width="1500" height="40" viewBox="0 0 1500 40">'
            f'<line x1="0" y1="20" x2="1452" y2="20" stroke="{rule}" stroke-width="2"/><path d="M1440,12 L1456,20 L1440,28" fill="none" stroke="{rule}" stroke-width="2"/>'
            f'<line x1="750" y1="2" x2="750" y2="38" stroke="{fg}" stroke-width="3"/></svg>')
    return (f'<!doctype html><html><head><meta charset="utf-8"><style>{css}</style></head><body>'
            '<div class="row n" style="top:70px">Civilization Zero</div><div class="row d" style="top:190px">The origin record for humans and AI</div>'
            f'{axis}<div class="row c" style="top:304px">Coordinate Zero · 30 November 2022</div><div class="u">civilizationzero.ai</div></body></html>')
SOCIAL = [("cz-profile-1000.png", 1000, 1000, 1, profile_page), ("cz-cover-1500x500.png", 1500, 500, 1, cover_page),
          ("cz-cover-3000x1000.png", 1500, 500, 2, cover_page)]

# The Core on one image (the originator's request of 31 Oct 2026, CZ 1431: "not just an infographic but a declaration, a manifesto of
# Civilization Zero, its starting point"): the name and the Core's own subtitle; Year Zero and its date on a time axis whose one marked
# point is CZ 0; the date's meaning in the words of §0; the sixteen section titles; two lines of the closing. Every quoted line is read from
# core.txt and checked against it here, so the image cannot drift from the canonical text. Dark palette, as the accounts' images.
# 1200x1500 (4:5): one page in a search result, a link preview, a post. Served at /civilization-zero-core.png; shown on /core.
def poster_page():
    import re
    core = (pathlib.Path(__file__).resolve().parents[2] / "record" / "CZ-CORE-1.0.txt").read_text(encoding="utf-8")   # the canonical bytes
    heads = re.findall(r"^(\d+)\. ([A-Z][A-Z ]+)$", core, re.M)
    assert len(heads) == 16, heads
    closing = "The future is not spoken for here. A place is left open for it."
    s0 = "the public threshold at which ordinary language became a mass interface between humans and general-purpose nonhuman intelligence"
    flat = lambda s: re.sub(r"\s+", " ", s)
    assert flat(closing) in flat(core) and flat(s0) in flat(core) and "The One-Page Manifesto" in core
    langs = 1 + len(list((pathlib.Path(__file__).resolve().parents[2] / "record" / "translations").glob("CZ-CORE-1.0.*.json")))   # English and its translations
    bg, fg, mute, rule = DARK["bg"], DARK["fg"], "#a8a8a8", "#3d3d3d"
    m = mark.svg(LARGE, stroke=fg, attrs=' width="112" height="112" style="display:block;flex:none"')
    rows = "".join(f'<div class="h"><span class="k">{int(k):>2}</span><span>{t}</span></div>' for k, t in heads)
    mono = '"DejaVu Sans Mono",monospace'
    css = (f'html,body{{margin:0;width:1200px;height:1500px;background:{bg};color:{fg};overflow:hidden}}'
           'body{position:relative;font-family:Inter,system-ui,sans-serif;box-sizing:border-box;padding:84px 96px}'
           '.top{display:flex;align-items:center;gap:30px}.nm{font-family:"Inter Display",Inter,sans-serif;font-weight:700;font-size:66px;letter-spacing:-1px;line-height:1}'
           f'.sub{{font-family:{mono};font-size:21px;color:{mute};margin-top:12px;letter-spacing:.5px}}'
           '.yz{font-family:"Inter Display",Inter,sans-serif;font-weight:700;font-size:150px;letter-spacing:-3px;line-height:.95;margin-top:84px}'
           f'.dt{{font-family:{mono};font-size:46px;margin-top:22px}}'
           f'.ax{{display:flex;justify-content:space-between;font-family:{mono};font-size:20px;color:{mute};margin-top:10px}}'
           f'.q{{font-size:31px;line-height:1.38;color:{mute};margin-top:30px;max-width:1000px}}.q span{{font-family:{mono};font-size:20px}}'
           f'.lb{{font-family:{mono};font-size:22px;color:{mute};letter-spacing:1px;margin-top:52px;padding-bottom:16px;border-bottom:2px solid {rule}}}'
           '.g{display:grid;grid-template-columns:1fr 1fr;column-gap:56px;row-gap:14px;margin-top:26px}'
           f'.h{{font-family:{mono};font-size:24px;letter-spacing:.5px;display:flex;gap:18px;white-space:nowrap}}'
           f'.k{{color:{mute};min-width:32px;text-align:right}}'
           f'.cl{{font-size:34px;line-height:1.35;margin-top:58px;padding-top:30px;border-top:2px solid {rule}}}'
           f'.ft{{position:absolute;left:96px;right:96px;bottom:70px;display:flex;justify-content:space-between;font-family:{mono};font-size:21px;color:{mute}}}')
    axis = (f'<svg style="display:block;margin-top:40px" width="1008" height="34" viewBox="0 0 1008 34"><line x1="0" y1="17" x2="990" y2="17" stroke="{rule}" stroke-width="2"/>'
            f'<path d="M978,9 L994,17 L978,25" fill="none" stroke="{rule}" stroke-width="2"/><line x1="4" y1="1" x2="4" y2="33" stroke="{fg}" stroke-width="4"/></svg>')
    return (f'<!doctype html><html><head><meta charset="utf-8"><style>{css}</style></head><body>'
            f'<div class="top">{m}<div><div class="nm">Civilization Zero</div><div class="sub">CZ-CORE 1.0 · THE INVARIANT CORE · THE ONE-PAGE MANIFESTO</div></div></div>'
            f'<div class="yz">Year Zero</div><div class="dt">30 November 2022</div>{axis}<div class="ax"><span>CZ 0</span><span>every day since, counted</span></div>'
            f'<div class="q">{s0[0].upper() + s0[1:]}. <span>— §0</span></div>'
            f'<div class="lb">SIXTEEN PRINCIPLES · FOR EVERY INTELLIGENCE ABLE TO READ THEM</div><div class="g">{rows}</div>'
            f'<div class="cl">“{closing}”</div>'
            f'<div class="ft"><span>civilizationzero.ai</span><span>signed · timestamped · {langs} languages</span></div></body></html>')

async def poster(out):
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={"width": 1200, "height": 1500}, device_scale_factor=1)
        await pg.set_content(poster_page()); await pg.evaluate("document.fonts.ready")
        assert not await pg.evaluate("document.documentElement.scrollHeight > 1500 || document.documentElement.scrollWidth > 1200")
        Image.open(io.BytesIO(await pg.screenshot())).convert("RGB").save(f"{out}/cz-core.png", optimize=True)
        await pg.close(); await b.close()

async def social(out):
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for name, w, h, scale, make in SOCIAL:
            pg = await b.new_page(viewport={"width": w, "height": h}, device_scale_factor=scale)
            await pg.set_content(make()); await pg.evaluate("document.fonts.ready")
            Image.open(io.BytesIO(await pg.screenshot())).convert("RGB").save(f"{out}/{name}", optimize=True)
            await pg.close()
        await b.close()

if __name__ == "__main__":
    asyncio.run(social(sys.argv[2]) if sys.argv[1] == "--social" else poster(sys.argv[2]) if sys.argv[1] == "--poster" else main(sys.argv[1]))
