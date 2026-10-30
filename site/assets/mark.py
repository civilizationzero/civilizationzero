# The mark of Civilization Zero, as geometry (Blueprint decision 5; the originator's choice of 30 October 2026, CZ 1430, from
# Claude's proposal B; queued for 1.4). One zero in which C and Z share every stroke: a tall rounded rectangle, the zero of a
# digit; its top and bottom are the bars of both letters, its left side the C's back, and its slash the Z's diagonal — the
# slashed zero, which people and machines both read as zero, never O. Its right side is left open in the middle: the place
# left open ("A place is left open for it.", the Core's closing lines). Drawn with one stroke weight, black or white.
#
# Two drawings of one design, in a 64-unit box: LARGE for the sizes where the mark is seen (the first page, the link-preview
# image, home-screen icons); SMALL for the favicons, every edge on a whole pixel at 16, 32, 48 and 96 px (64 units = 16 px:
# 4 units a pixel; the stroke, 8 units, is 2 pixels). site/lib.py writes the page's mark and the SVG favicon from here, and
# site/assets/render.py the images. No dependencies.

LARGE = dict(W=37.0, H=54.0, r=12.0, gap=11.0, s=6.5)
SMALL = dict(W=32.0, H=48.0, r=10.0, gap=16.0, s=8.0)

def _f(v):
    return f"{v:.2f}".rstrip("0").rstrip(".")

def outline(W, H, r, gap, s=None, cx=32.0, cy=32.0):
    """The zero: a rounded rectangle W x H (centre lines), corner radius r, open on the right between cy - gap/2 and cy + gap/2."""
    L, R, T, B = cx - W / 2, cx + W / 2, cy - H / 2, cy + H / 2
    return (f"M{_f(R)},{_f(cy - gap / 2)} V{_f(T + r)} A{_f(r)},{_f(r)} 0 0 0 {_f(R - r)},{_f(T)} H{_f(L + r)} "
            f"A{_f(r)},{_f(r)} 0 0 0 {_f(L)},{_f(T + r)} V{_f(B - r)} A{_f(r)},{_f(r)} 0 0 0 {_f(L + r)},{_f(B)} H{_f(R - r)} "
            f"A{_f(r)},{_f(r)} 0 0 0 {_f(R)},{_f(B - r)} V{_f(cy + gap / 2)}")

def slash(W, H, r, gap=None, s=None, cx=32.0, cy=32.0):
    """The Z's diagonal: from where the top bar ends on the right to where the bottom bar begins on the left."""
    L, R, T, B = cx - W / 2, cx + W / 2, cy - H / 2, cy + H / 2
    return f"M{_f(R - r)},{_f(T)} L{_f(L + r)},{_f(B)}"

def paths(d):
    return outline(**d), slash(**d), d["s"]

def svg(d, stroke="currentColor", attrs="", inner=""):
    """The mark as an SVG element: two stroked paths, square ends, mitred joins."""
    o, z, s = paths(d)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"{attrs}>{inner}'
            f'<path d="{o}" fill="none" stroke="{stroke}" stroke-width="{_f(s)}"/>'
            f'<path d="{z}" fill="none" stroke="{stroke}" stroke-width="{_f(s)}"/></svg>')
