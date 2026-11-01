# The originator's "many centres" image (2 Nov 2026), redrawn as vectors with its own layout, so the rings are clean where they
# cross. Positions measured from the image he sent (1672x941): five centres, thirteen rings each from r=28 every 18.6 px,
# the mark (visual box 315..500 x 158..412), the words at x=71 with his three line breaks, the address under them.
import asyncio, sys
sys.path.insert(0, "/home/claude/civilizationzero/site/assets")
import mark
from playwright.async_api import async_playwright
W_, H_ = 1672, 941
CENTRES = [(1323.5, 211.8), (1022.5, 347.2), (1578.6, 448.4), (1140.3, 650.1), (1430.0, 743.0)]
SENT = "Civilization Zero names the beginning of a civilization in which humans may no longer be at the centre."

def html(fs, ufs):
    rings = "".join(f'<circle cx="{x}" cy="{y}" r="{28 + 18.6 * k:.1f}" fill="none" stroke="#000" stroke-width="1.7"/>'
                    for x, y in CENTRES for k in range(13))
    dots = "".join(f'<circle cx="{x}" cy="{y}" r="6.5" fill="#000"/>' for x, y in CENTRES)
    box = 60.5 and 254 * 64 / 60.5
    m = mark.svg(mark.LARGE, stroke="#000", attrs=f' width="{box:.2f}" height="{box:.2f}" style="position:absolute;left:{407.5-box/2:.2f}px;top:{285-box/2:.2f}px"')
    return (f'<!doctype html><html><head><meta charset="utf-8"><style>html,body{{margin:0;width:{W_}px;height:{H_}px;overflow:hidden;background:#fff}}'
            f'body{{position:relative;color:#000}}svg.r{{position:absolute;left:0;top:0}}'
            f'.l{{position:absolute;left:70px;font-family:Inter,sans-serif;font-size:{fs}px;line-height:1;white-space:nowrap}}'
            f'.l b{{font-family:"Inter Display",Inter,sans-serif;font-weight:700}}'
            f'.u{{position:absolute;left:70px;font-family:"Inter Display",Inter,sans-serif;font-weight:700;font-size:{ufs}px;line-height:1;letter-spacing:-.4px}}</style></head><body>'
            f'<svg class="r" width="{W_}" height="{H_}" viewBox="0 0 {W_} {H_}">{rings}{dots}</svg>{m}'
            f'<div class="l" id="l1"><b>Civilization Zero</b> names the beginning</div>'
            f'<div class="l" id="l2">of a civilization in which humans</div>'
            f'<div class="l" id="l3">may no longer be at the centre.</div>'
            f'<div class="u" id="u">civilizationzero.ai</div></body></html>')

async def main(out):
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={"width": W_, "height": H_})
        # calibrate the sizes to his widths: line 1 is 687 px wide, the address 357 px
        await pg.set_content(html(40, 40)); await pg.wait_for_timeout(100)
        w1 = await pg.evaluate("(() => { const r = document.createRange(); r.selectNodeContents(document.getElementById('l1')); return r.getBoundingClientRect().width })()")
        wu = await pg.evaluate("(() => { const r = document.createRange(); r.selectNodeContents(document.getElementById('u')); return r.getBoundingClientRect().width })()")
        fs, ufs = round(40 * 687 / w1, 1), round(40 * 357 / wu, 1)
        await pg.set_content(html(fs, ufs)); await pg.wait_for_timeout(100)
        # place each line so its baseline sits where his does (524, 574.5, 625; the address 735)
        for i, base in (("l1", 524.5), ("l2", 574.5), ("l3", 625), ("u", 735)):
            await pg.evaluate(f"""(() => {{ const e = document.getElementById('{i}'); const s = document.createElement('span'); s.style.cssText='display:inline-block;width:0;height:0;vertical-align:baseline';
                e.appendChild(s); e.style.top = '0px'; const y = s.getBoundingClientRect().top; s.remove(); e.style.top = ({base} - y) + 'px'; }})()""")
        txt = " ".join((await pg.inner_text("body")).split())
        assert txt == SENT + " civilizationzero.ai", txt
        print("font sizes", fs, ufs)
        await pg.screenshot(path=out)
        await b.close()
asyncio.run(main(sys.argv[1]))
