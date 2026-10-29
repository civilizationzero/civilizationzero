# How the site's raster images were made: the mark (a C that is an unclosed zero; the geometry of /favicon.svg) drawn
# by Chromium and saved as PNG, black on white so that it shows on a light or a dark background alike (the SVG adapts by
# itself; a PNG cannot). Run once by hand; the files are committed beside this script and copied by the build, so the
# build stays reproducible without a browser. Needs Playwright (Chromium) and Pillow.
#   python3 render.py <output directory>
import asyncio, io, sys
from playwright.async_api import async_playwright
from PIL import Image

ARC = "M51.21,42.22 A21.76,21.76 0 1 1 51.21,21.78"   # centre (32,32), radius 21.76, open to the right; stroke 8 of 64

def page(w, h, side, share):
    # the 64-unit box drawn `side` pixels square, the box covering `share` of it, centred on a white page of w x h
    vb = 64 / share; o = (vb - 64) / 2
    return (f'<!doctype html><html><head><meta charset="utf-8"><style>html,body{{margin:0;width:{w}px;height:{h}px;background:#fff}}'
            f'body{{display:flex;align-items:center;justify-content:center}}</style></head><body>'
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{-o} {-o} {vb} {vb}" width="{side}" height="{side}" style="display:block">'
            f'<path d="{ARC}" fill="none" stroke="#111" stroke-width="8"/></svg></body></html>')

IMAGES = [  # name, width, height, side of the drawn square, share of that square the mark's box covers
    ("og.png", 1200, 630, 420, 1.0),                # the link-preview image (1200x630)
    ("apple-touch-icon.png", 180, 180, 150, 1.0),   # a phone's home screen (iOS rounds the corners itself)
    ("favicon-16", 16, 16, 16, 1.0), ("favicon-32", 32, 32, 32, 1.0), ("favicon-48", 48, 48, 48, 1.0),   # -> favicon.ico
    ("favicon-96x96.png", 96, 96, 96, 0.92),        # a search engine's result list asks for a multiple of 48 pixels
    ("icon-192.png", 192, 192, 192, 0.86), ("icon-512.png", 512, 512, 512, 0.86),                     # site.webmanifest
    ("icon-maskable-512.png", 512, 512, 512, 0.66), # maskable: the mark inside the central safe circle (radius 40%)
]

async def main(out):
    shots = {}
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for name, w, h, side, share in IMAGES:
            pg = await b.new_page(viewport={"width": w, "height": h}, device_scale_factor=1)
            await pg.set_content(page(w, h, side, share))
            shots[name] = await pg.screenshot(omit_background=False)
            await pg.close()
        await b.close()
    for name, *_ in IMAGES:
        if name.endswith(".png"): Image.open(io.BytesIO(shots[name])).convert("RGB").save(f"{out}/{name}", optimize=True)
    ico = [Image.open(io.BytesIO(shots[f"favicon-{s}"])).convert("RGBA") for s in (16, 32, 48)]
    ico[2].save(f"{out}/favicon.ico", format="ICO", sizes=[(16, 16), (32, 32), (48, 48)], append_images=ico[:2])

asyncio.run(main(sys.argv[1]))
