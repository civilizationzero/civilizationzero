# CZ 1432: the image set. Six designs (A, B, C from the banner proposals; D, E, F new) x five sizes, two colours only,
# each carrying the approved first sentence and the address under it. Rendered with Playwright from SVG + HTML.
#   banner   1500x500  and 3000x1000 (X, Mastodon, Bluesky headers; text kept right, clear of the profile picture lower left)
#   web      1200x630  (the site, link previews, LinkedIn)
#   square   1080x1080 (posts everywhere)
#   portrait 1080x1350 (Instagram, LinkedIn and X on phones)
import asyncio, math, random, sys, os
from shapely.geometry import LineString, Point
from shapely.ops import unary_union
from playwright.async_api import async_playwright
sys.path.insert(0, "/home/claude/civilizationzero/site/assets")
import mark

K, W = "#000000", "#ffffff"
SENT = "Civilization Zero names the beginning of a civilization in which humans may no longer be at the centre."
URL = "civilizationzero.ai"
# The Core, byte-exact (closing section), for the optional quote variant of D
Q1, Q2 = "Humanity is not erased.", "Humanity is no longer presumed to be the final measure of every possible mind."
CORE = open("/home/claude/civilizationzero/site/public/core.txt", encoding="utf-8").read()
assert f"{Q1}\n\n{Q2}\n" in CORE

FORMATS = {
    "banner":   dict(W=1500, H=500,  art=(0, 0, 860, 500),    text=(900, 40, 1430, 460),  body=34, url=40, mark=False),
    "web":      dict(W=1200, H=630,  art=(0, 0, 650, 630),    text=(690, 60, 1140, 570),  body=33, url=38, mark=True),
    "square":   dict(W=1080, H=1080, art=(0, 0, 1080, 690),   text=(80, 700, 1000, 1030), body=45, url=50, mark=True),
    "portrait": dict(W=1080, H=1350, art=(0, 0, 1080, 880),   text=(80, 890, 1000, 1290), body=50, url=54, mark=True),
}

# ---------- a human figure: a pictogram of our own (head, torso, arms, legs), as one outline ----------
def person(x, yf, H, pose="stand"):
    hr = 0.092 * H
    head = Point(x, yf - H + hr).buffer(hr, 64)
    sh = yf - H + 2 * hr + 0.075 * H           # shoulder line
    hip = yf - 0.46 * H
    tw = 0.105 * H                              # half-width of the torso
    lw = 0.052 * H                              # half-thickness of a limb
    torso = LineString([(x, sh + tw * 0.4), (x, hip)]).buffer(tw, 32)
    parts = [torso]
    if pose == "stand":
        for s in (-1, 1):
            parts.append(LineString([(x + s * (tw + lw * 0.2), sh + lw), (x + s * (tw + lw * 1.4), hip + 0.03 * H)]).buffer(lw, 32))
            parts.append(LineString([(x + s * 0.045 * H, hip), (x + s * 0.075 * H, yf - lw)]).buffer(lw * 1.1, 32))
    else:  # spread: arms level, span equal to height, legs apart (the old drawing's posture)
        for s in (-1, 1):
            parts.append(LineString([(x, sh + lw), (x + s * (H / 2 - lw), sh + lw)]).buffer(lw, 32))
            parts.append(LineString([(x + s * 0.045 * H, hip), (x + s * 0.13 * H, yf - lw)]).buffer(lw * 1.1, 32))
    body = unary_union(parts)
    return [head, body]

def poly_d(g):
    def ring(c): return "M" + " L".join(f"{a:.1f},{b:.1f}" for a, b in c.coords) + "Z"
    polys = getattr(g, "geoms", [g])
    return "".join(ring(p.exterior) + "".join(ring(i) for i in p.interiors) for p in polys)

def person_svg(x, yf, H, pose="stand", fill=K, dashed=False, sw=3, dash="9 7"):
    out = []
    for g in person(x, yf, H, pose):
        if dashed:
            out.append(f'<path d="{poly_d(g)}" fill="none" stroke="{fill}" stroke-width="{sw}" stroke-dasharray="{dash}" stroke-linejoin="round"/>')
        else:
            out.append(f'<path d="{poly_d(g)}" fill="{fill}" fill-rule="evenodd"/>')
    return "".join(out)

def shape(kind, x, y, s, col, solid, sw=3, rot=0):
    f = f'fill="{col}"' if solid else f'fill="none" stroke="{col}" stroke-width="{sw}"'
    if kind == "c": return f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{s:.1f}" {f}/>'
    if kind == "s": return f'<rect x="{x-s:.1f}" y="{y-s:.1f}" width="{2*s:.1f}" height="{2*s:.1f}" transform="rotate({rot:.0f} {x:.1f} {y:.1f})" {f}/>'
    if kind == "t": return '<polygon points="' + " ".join(f"{x+s*math.cos(rot+i*2.0944):.1f},{y+s*math.sin(rot+i*2.0944):.1f}" for i in range(3)) + f'" {f}/>'
    if kind == "h": return '<polygon points="' + " ".join(f"{x+s*math.cos(i*1.0472):.1f},{y+s*math.sin(i*1.0472):.1f}" for i in range(6)) + f'" {f}/>'
    if kind == "d": return f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{s:.1f}" fill="none" stroke="{col}" stroke-width="{sw}" stroke-dasharray="5 5"/>'

def standing(kind, x, yg, h, col, solid, sw=4):
    """a form standing on the ground line yg, about h tall"""
    f = f'fill="{col}"' if solid else f'fill="none" stroke="{col}" stroke-width="{sw}"'
    i = sw / 2 if not solid else 0
    if kind == "c": r = h / 2; return f'<circle cx="{x:.1f}" cy="{yg-r:.1f}" r="{r-i:.1f}" {f}/>'
    if kind == "s": a = h * 0.86; return f'<rect x="{x-a/2+i:.1f}" y="{yg-a+i:.1f}" width="{a-2*i:.1f}" height="{a-2*i:.1f}" {f}/>'
    if kind == "t": return f'<polygon points="{x-h*0.5+i:.1f},{yg-i:.1f} {x+h*0.5-i:.1f},{yg-i:.1f} {x:.1f},{yg-h+i*2:.1f}" {f}/>'
    if kind == "h": r = h / 2; return shape("h", x, yg - r * 0.866, r - i, col, solid, sw)
    if kind == "r": a, b = h * 0.42, h * 1.0; return f'<rect x="{x-a/2+i:.1f}" y="{yg-b+i:.1f}" width="{a-2*i:.1f}" height="{b-2*i:.1f}" rx="{a*0.3:.1f}" {f}/>'
    if kind == "d": r = h / 2; return f'<circle cx="{x:.1f}" cy="{yg-r:.1f}" r="{r-2:.1f}" fill="none" stroke="{col}" stroke-width="{sw}" stroke-dasharray="7 6"/>'

# ---------- the six designs; each draws into the art box (x0, y0, w, h) of a format ----------
def A(box, fmt):   # many centres, none in the middle (black)
    x0, y0, w, h = box
    wide = w / h > 1.3
    rel = [(0.20, 0.26), (0.50, 0.70), (0.78, 0.22), (0.98, 0.78)] if wide else [(0.18, 0.24), (0.62, 0.70), (0.86, 0.18), (0.22, 0.92)]
    if fmt == "banner": rel = [(0.24, 0.24), (0.55, 0.70), (0.80, 0.20), (1.0, 0.75)]
    out = [f'<clipPath id="ca"><rect x="{x0}" y="{y0}" width="{w}" height="{h}"/></clipPath><g clip-path="url(#ca)">']
    for rx, ry in rel:
        x, y = x0 + rx * w, y0 + ry * h
        for r in range(30, 1400, 38):
            out.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r}" fill="none" stroke="{W}" stroke-width="2.3"/>')
        out.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="9" fill="{W}"/>')
    out.append("</g>")
    return K, "".join(out)

def B(box, fmt):   # one form before the mark on the line of time; many after it (white)
    x0, y0, w, h = box
    rnd = random.Random(1432)
    k = min(1.25, max(0.8, h / 500))
    ya, xt = y0 + 0.80 * h, x0 + 0.36 * w
    out = [f'<line x1="{x0}" y1="{ya}" x2="{x0+w-30}" y2="{ya}" stroke="{K}" stroke-width="3"/>',
           f'<path d="M{x0+w-44},{ya-10} L{x0+w-26},{ya} L{x0+w-44},{ya+10}" fill="none" stroke="{K}" stroke-width="3"/>',
           f'<line x1="{xt}" y1="{ya-26}" x2="{xt}" y2="{ya+26}" stroke="{K}" stroke-width="5"/>',
           f'<circle cx="{x0+0.19*w:.1f}" cy="{y0+0.45*h:.1f}" r="{62*k:.1f}" fill="{K}"/>']
    if fmt == "banner": out[-1] = f'<circle cx="{x0+0.22*w:.1f}" cy="{y0+0.38*h:.1f}" r="{58*k:.1f}" fill="{K}"/>'
    placed = []
    lo, hi = xt + 50, x0 + w - 30
    def ok(x, y, s): return all((x - a) ** 2 + (y - b) ** 2 > (s + t + 10 * k) ** 2 for a, b, t in placed)
    tries = 0
    target = int(70 * (hi - lo) * (0.62 * h) / (800 * 260))
    while len(placed) < target and tries < 40000:
        tries += 1
        x = rnd.uniform(lo, hi); y = rnd.uniform(y0 + 0.08 * h, y0 + 0.66 * h)
        s = rnd.uniform(9, 30) * k
        if rnd.random() > (x - lo) / (hi - lo) * 0.9 + 0.2: continue
        if not ok(x, y, s): continue
        placed.append((x, y, s))
        kind = rnd.choice("cstd h".replace(" ", ""))
        out.append(shape(kind, x, y, s, K, rnd.random() < 0.55, 3, rnd.uniform(0, 6.283) if kind == "t" else rnd.uniform(0, 90)))
    return W, "".join(out)

def C(box, fmt):   # everything turns about a centre left empty, its outline broken (white)
    x0, y0, w, h = box
    cx, cy = x0 + 0.5 * w, y0 + 0.5 * h
    if fmt == "banner": cx, cy = x0 + 0.55 * w, y0 + 0.44 * h
    out, k = [], 0
    for r in range(64, 1500, 30):
        k += 1
        n = max(8, round(2 * math.pi * r / 24)); d = 1.8 + 0.5 * k ** 0.85; off = (k % 2) * math.pi / n
        for i in range(n):
            a = off + 2 * math.pi * i / n
            x, y = cx + r * math.cos(a), cy + r * math.sin(a)
            if x0 + d + 4 < x < x0 + w - d - 4 and y0 + d + 4 < y < y0 + h - d - 4:
                out.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{d:.2f}" fill="{K}"/>')
    out.append(f'<circle cx="{cx}" cy="{cy}" r="26" fill="none" stroke="{K}" stroke-width="3.5" stroke-dasharray="7 7"/>')
    return W, "".join(out)

def D(box, fmt):   # the measure: the old circle and square that put the human body at the centre of things, emptied;
                   # the figure's place drawn broken; the human stands outside it (white)
    x0, y0, w, h = box
    R = 0.40 * h if fmt != "portrait" else 0.37 * h
    cx = x0 + (0.42 * w if w / h < 1.3 else 0.58 * w)
    if fmt == "banner": cx = x0 + 0.58 * w; R = 0.39 * h
    cy = y0 + 0.07 * h + R
    S = 1.66 * R
    yb = cy + R
    out = [f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{R:.1f}" fill="none" stroke="{K}" stroke-width="4"/>',
           f'<rect x="{cx-S/2:.1f}" y="{yb-S:.1f}" width="{S:.1f}" height="{S:.1f}" fill="none" stroke="{K}" stroke-width="4"/>',
           person_svg(cx, yb - 4, S * 0.97, "spread", K, dashed=True, sw=3.2, dash="10 8"),
           f'<line x1="{x0+0.04*w:.1f}" y1="{yb:.1f}" x2="{x0+0.97*w:.1f}" y2="{yb:.1f}" stroke="{K}" stroke-width="3"/>']
    ph = S * 0.55
    px = min(cx + R + 0.24 * ph + 0.12 * R, x0 + w - 0.2 * ph - 10)
    out.append(person_svg(px, yb - 1.5, ph, "stand", K))
    return W, "".join(out)

def E(box, fmt):   # the pedestal: the human's place on it left open; the human on the ground among other forms (black)
    x0, y0, w, h = box
    yg = y0 + 0.86 * h
    fh = min(0.34 * h, 0.20 * w)        # a figure's height
    cx = x0 + 0.5 * w
    pw, ph = fh * 0.90, fh * 1.15
    pt = yg - ph
    out = [f'<line x1="{x0+0.03*w:.1f}" y1="{yg:.1f}" x2="{x0+0.97*w:.1f}" y2="{yg:.1f}" stroke="{W}" stroke-width="3"/>',
           f'<rect x="{cx-pw*0.62:.1f}" y="{yg-ph*0.10:.1f}" width="{pw*1.24:.1f}" height="{ph*0.10:.1f}" fill="{W}"/>',
           f'<rect x="{cx-pw/2:.1f}" y="{pt+ph*0.12:.1f}" width="{pw:.1f}" height="{ph*0.80:.1f}" fill="{W}"/>',
           f'<rect x="{cx-pw*0.62:.1f}" y="{pt:.1f}" width="{pw*1.24:.1f}" height="{ph*0.10:.1f}" fill="{W}"/>',
           person_svg(cx, pt - 6, fh, "stand", W, dashed=True, sw=3, dash="9 7")]
    # the ground, both sides: forms of about one height, the human among them
    # each form's height and width as a share of a figure's height; the human first on the right, next to the empty pedestal
    HT = {"c": 0.62, "s": 0.62, "h": 0.62, "d": 0.62, "t": 0.75, "r": 0.75, "H": 1.0}
    WD = {"c": 0.62, "s": 0.54, "h": 0.62, "d": 0.62, "t": 0.75, "r": 0.32, "H": 0.48}
    SOLID = {"c": True, "r": True, "s": False, "h": True, "t": False, "d": False}
    def row(kinds, a, b, from_left):
        gmin = 0.12 * fh
        while len(kinds) > 1 and sum(WD[k] * fh for k in kinds) + gmin * (len(kinds) + 1) > (b - a):
            kinds = kinds[:-1]                        # drop the form farthest from the pedestal until all fit (the human stays)
        tot = sum(WD[k] * fh for k in kinds); gap = min(0.30 * fh, ((b - a) - tot) / (len(kinds) + 1))
        x = a + gap if from_left else b - gap
        for kd in kinds:
            wd = WD[kd] * fh
            xc = x + wd / 2 if from_left else x - wd / 2
            if kd == "H": out.append(person_svg(xc, yg - 1.5, fh, "stand", W))
            else: out.append(standing(kd, xc, yg - 1.5, fh * HT[kd], W, SOLID[kd]))
            x = x + wd + gap if from_left else x - wd - gap
    edge = pw * 0.62
    row(["H", "h", "d", "t", "s"], cx + edge, x0 + 0.97 * w, True)
    row(["c", "r", "t", "s", "h"], x0 + 0.03 * w, cx - edge, False)
    return K, "".join(out)

def F(box, fmt):   # the orbit: the centre left open; humans one body among others going round it (black)
    x0, y0, w, h = box
    cx, cy = x0 + 0.5 * w, y0 + 0.47 * h
    rxm = 0.47 * w
    kk = min(0.50, 0.42 * h / rxm)
    out = []
    radii = [0.30, 0.52, 0.76, 1.0]
    for f in radii:
        rx = rxm * f; out.append(f'<ellipse cx="{cx:.1f}" cy="{cy:.1f}" rx="{rx:.1f}" ry="{rx*kk:.1f}" fill="none" stroke="{W}" stroke-width="2.2"/>')
    r0 = 0.11 * min(w, h)
    out.append(f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r0:.1f}" fill="{K}" stroke="{W}" stroke-width="3.5" stroke-dasharray="9 8"/>')
    s = 0.045 * min(w, h) + 6
    bodies = [(0, 200, "c", True), (1, 300, "s", False), (1, 150, "h", True), (2, 235, "d", False), (3, 340, "t", False), (3, 160, "s", True), (2, 15, "c", False)]
    for i, deg, kd, solid in bodies:
        a = math.radians(deg); rx = rxm * radii[i]
        x, y = cx + rx * math.cos(a), cy + rx * kk * math.sin(a)
        out.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{s*1.35:.1f}" fill="{K}"/>' + shape(kd, x, y, s, W, solid, 3, 0.3))
    # the human, on the third orbit, at the front: one body among the others, away from the centre
    a = math.radians(78); rx = rxm * radii[2]
    x, y = cx + rx * math.cos(a), cy + rx * kk * math.sin(a)
    hh = 0.20 * min(w, h) + 20
    out.append(f'<ellipse cx="{x:.1f}" cy="{y-hh*0.5:.1f}" rx="{hh*0.32:.1f}" ry="{hh*0.62:.1f}" fill="{K}"/>' + person_svg(x, y + hh * 0.08, hh, "stand", W))
    return K, "".join(out)

DESIGNS = [("A-many-centres", A), ("B-one-then-many", B), ("C-empty-centre", C), ("D-the-measure", D), ("E-the-pedestal", E), ("F-the-orbit", F)]

# ---------- the words ----------
def words(fmt, fg, quote=False):
    F_ = FORMATS[fmt]
    x1, y1, x2, y2 = F_["text"]
    centre = fmt in ("square", "portrait")
    m = (mark.svg(mark.LARGE, stroke=fg, attrs=f' width="{int(F_["url"]*1.25)}" height="{int(F_["url"]*1.25)}" style="display:block;margin:{-int(F_["url"]*0.12)}px 0"')
         if F_["mark"] else "")
    u = f'<div class="u">{m}<span>{URL}</span></div>'
    if quote:
        s = f'<div class="s q">{Q1}<br>{Q2}</div><div class="src">The Invariant Core of Civilization Zero</div>'
    else:
        s = f'<div class="s"><b>Civilization Zero</b> names the beginning of a civilization in which humans may no longer be at the centre.</div>'
    css = (f'.t{{position:absolute;left:{x1}px;top:{y1}px;width:{x2-x1}px;height:{y2-y1}px;display:flex;flex-direction:column;justify-content:center;'
           f'align-items:{"center" if centre else "flex-start"};text-align:{"center" if centre else "left"};color:{fg}}}'
           f'.s{{font-family:Inter,sans-serif;font-size:{F_["body"]}px;line-height:1.28;text-wrap:balance;max-width:100%}}'
           f'.s b{{font-family:"Inter Display",Inter,sans-serif;font-weight:700}}'
           f'.q{{font-family:"Inter Display",Inter,sans-serif;font-weight:700;font-size:{F_["body"]*0.94:.0f}px;line-height:1.2}}'
           f'.src{{font-family:Inter,sans-serif;font-size:{F_["body"]*0.62:.0f}px;margin-top:{F_["body"]*0.55:.0f}px;letter-spacing:.2px}}'
           f'.u{{display:flex;align-items:center;gap:{F_["url"]*0.32:.0f}px;font-family:"Inter Display",Inter,sans-serif;font-weight:700;'
           f'font-size:{F_["url"]}px;letter-spacing:-.5px;line-height:1;margin-top:{F_["body"]*0.8:.0f}px}}')
    return css, f'<div class="t">{s}{u}</div>'

def page(design, fmt, quote=False):
    F_ = FORMATS[fmt]
    bg, art = design(F_["art"], fmt)
    fg = W if bg == K else K
    css, txt = words(fmt, fg, quote)
    return (f'<!doctype html><html><head><meta charset="utf-8"><style>html,body{{margin:0;width:{F_["W"]}px;height:{F_["H"]}px;overflow:hidden;background:{bg}}}'
            f'body{{position:relative}}svg.a{{position:absolute;left:0;top:0}}{css}</style></head><body>'
            f'<svg class="a" width="{F_["W"]}" height="{F_["H"]}" viewBox="0 0 {F_["W"]} {F_["H"]}" xmlns="http://www.w3.org/2000/svg">{art}</svg>{txt}</body></html>')

async def main(out, only=None):
    os.makedirs(out, exist_ok=True)
    async with async_playwright() as p:
        b = await p.chromium.launch()
        jobs = [(n, d, f, False) for n, d in DESIGNS for f in FORMATS] + [("D-the-measure-core-quote", D, f, True) for f in FORMATS]
        for name, d, fmt, quote in jobs:
            if only and not any(o in name for o in only): continue
            F_ = FORMATS[fmt]
            html = page(d, fmt, quote)
            scales = [(1, f"{F_['W']}x{F_['H']}")] + ([(2, "3000x1000")] if fmt == "banner" else [])
            for sc, suf in scales:
                pg = await b.new_page(viewport={"width": F_["W"], "height": F_["H"]}, device_scale_factor=sc)
                await pg.set_content(html); await pg.wait_for_timeout(150)
                txt = " ".join((await pg.inner_text("body")).split())
                want = (f"{Q1} {Q2} The Invariant Core of Civilization Zero {URL}" if quote else f"{SENT} {URL}")
                assert txt == want, (name, fmt, txt)
                # the words must stay inside their box and the page
                bb = await pg.evaluate("(() => { const r = document.querySelector('.t').getBoundingClientRect(); const s = document.querySelector('.s').getBoundingClientRect(); const u = document.querySelector('.u').getBoundingClientRect(); return [r.top, r.bottom, s.top, u.bottom, s.width, document.querySelector('.t').scrollHeight, r.height]; })()")
                assert bb[2] >= bb[0] - 0.5 and bb[3] <= bb[1] + 0.5 and bb[5] <= bb[6] + 0.5, (name, fmt, bb)
                await pg.screenshot(path=f"{out}/cz-{name}-{fmt}-{suf}.png"); await pg.close()
        await b.close()

if __name__ == "__main__":
    asyncio.run(main(sys.argv[1], sys.argv[2:] or None))
