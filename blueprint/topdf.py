#!/usr/bin/env python3
"""Blueprint Markdown -> PDF. pandoc (GitHub-flavoured Markdown -> HTML5 with pdf.css inlined), then
Chromium prints it to A4. Usage: python3 blueprint/topdf.py blueprint/CZ-BLUEPRINT-1.3.1.md"""
import sys, subprocess, pathlib, asyncio
from playwright.async_api import async_playwright
md = pathlib.Path(sys.argv[1]).resolve(); here = pathlib.Path(__file__).resolve().parent
html = md.with_suffix(".html"); pdf = md.with_suffix(".pdf")
subprocess.run(["pandoc", str(md), "-f", "gfm", "-t", "html5", "-s", "--embed-resources",
                "--css", str(here / "pdf.css"), "--metadata", "pagetitle=" + md.stem, "-o", str(html)], check=True)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page()
        await pg.goto(html.as_uri()); await pg.emulate_media(media="print")
        await pg.pdf(path=str(pdf), format="A4", print_background=True, prefer_css_page_size=True)
        await b.close()
asyncio.run(main()); html.unlink()
import pypdf; print(pdf.name, len(pypdf.PdfReader(str(pdf)).pages), "pages")
