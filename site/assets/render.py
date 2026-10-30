# How the site's raster images were made. The mark is CZ drawn as a zero: one zero in which C and Z share every stroke, its
# slash the Z's diagonal, its right side left open (Blueprint decision 5, changed by the originator on 29 Oct 2026 and again
# on 30 Oct 2026; queued for 1.4). The geometry is mark.py, beside this script: SMALL puts every edge on a whole pixel at
# 16, 32, 48 and 96 px (the favicon sizes); LARGE is the drawing for the sizes where the mark is seen (home screen, link
# previews). Black on white, so that it shows on a light or a dark background alike (the SVG favicon adapts by itself; a PNG
# cannot). Run by hand; the files are committed beside this script and copied by the build, so the build stays reproducible
# without a browser. Needs Playwright (Chromium) and Pillow.
#   python3 render.py <output directory>
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

if __name__ == "__main__":
    asyncio.run(main(sys.argv[1]))
