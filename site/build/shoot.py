import asyncio, pathlib, sys
from playwright.async_api import async_playwright
ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "build" / "shots"
OUT.mkdir(exist_ok=True)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        # OG image
        pg = await b.new_page(viewport={"width": 1200, "height": 630})
        await pg.goto((ROOT / "build" / "og.html").as_uri()); await pg.wait_for_timeout(1500)
        await pg.screenshot(path=str(ROOT / "build" / "og-raw.png"))
        for name, w in [("index", 1280), ("core", 1280), ("record", 1280), ("discuss", 1280), ("api", 1280), ("index", 390)]:
            pg = await b.new_page(viewport={"width": w, "height": 900})
            errs = []
            pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
            await pg.goto(f"http://localhost:8765/{name}.html"); await pg.wait_for_timeout(1500)
            await pg.screenshot(path=str(OUT / f"{name}-{w}.png"), full_page=(name != "record"))
            print(name, w, "console errors:", [e for e in errs if "api/entries" not in e and "404" not in e])
        await b.close()
asyncio.run(main())
