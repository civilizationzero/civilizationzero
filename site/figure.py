#!/usr/bin/env python3
"""The day's figure and the Core's hash unrolled: the reference implementation (the request-time twin is room/figure.js).

The figure of a day is computed from two things only: the SHA-256 of the Core's canonical text (record/CZ-CORE-1.0.txt, served as
/core.txt) and the day number of the CZ calendar. Nothing is drawn, nothing is random.

  h      = SHA-256(core.txt), 32 bytes h[0..31]
  ring i = 0..15 (0 innermost; sixteen rings)
  m[i]   = the sixteen primes that follow 256: 257 263 269 271 277 281 283 293 307 311 313 317 331 337 347 349
           (the smallest primes for which every byte value is a valid position; pairwise coprime)
  a[i]   = h[2i]          where ring i stood on Day 0
  s[i]   = h[2i+1] + 1    how many positions ring i advances every day (1..256, never 0)
  pos(i, day) = (a[i] + day * s[i]) mod m[i]      in m[i]-ths of a turn, clockwise from the top

Geometry, from one unit: the figure is a square of 48 units (viewBox 384, one unit = 8). The centre, a third of the radius (8 units),
is left empty; the other two thirds hold the sixteen rings, one unit each. Ring i is drawn as its track (a hairline circle of radius
68 + 8 i, the middle of its unit) and, on it, one arc half a unit wide: from pos(i, day - 1) to pos(i, day), clockwise, the way that
ring went since the day before. Its length, s[i] / m[i] of the ring, never changes while the Core's text does not; where it lies
changes every day. Every number written into the SVG is an integer, so this file and room/figure.js give the same bytes.

The hash is never typed here: the build passes the one it computes from the Core's bytes (lib.CORE_SHA, which lib.py compares with
the published hash and fails on a difference).
usage: figure.py <sha256 of core.txt> [day ...]   prints, for each day, one line of JSON: {"day", "positions", "rings"}
"""
import json, re, sys

M = (257, 263, 269, 271, 277, 281, 283, 293, 307, 311, 313, 317, 331, 337, 347, 349)
RULE = ("position[i] = (start[i] + day × step[i]) mod modulus[i]",
        "ring i carries the arc from position[i] of the day before to position[i] of the day",
        "positions are modulus[i]-ths of a turn, clockwise from the top",
        "start[i] is byte 2i of core_sha256; step[i] is byte 2i + 1, plus one",
        "modulus is the sixteen primes that follow 256")

def constants(core_sha256):
    h = bytes.fromhex(core_sha256)
    assert len(h) == 32
    return [(h[2 * i], h[2 * i + 1] + 1, M[i]) for i in range(16)]            # (a, s, m) for ring i

def positions(day, core_sha256):
    return [(a + day * s) % m for a, s, m in constants(core_sha256)]

def radius(i):                      # 68, 76, ... 188: the middle of ring i's unit
    return 68 + 8 * i

def rings(day, core_sha256):
    """The sixteen arcs. Each carries its three constants as custom properties, from which a browser with CSS mod() computes the
    same arc for any day (home.css, block 5)."""
    out = []
    for i, (a, s, m) in enumerate(constants(core_sha256)):
        tail = (a + (day - 1) * s) % m
        out.append(f'<circle r="{radius(i)}" pathLength="{m}" stroke-dasharray="{s} {m - s}" stroke-dashoffset="{-tail}" style="--a:{a};--s:{s};--m:{m}"/>')
    return "".join(out)

def tracks():
    return "".join(f'<circle r="{radius(i)}"/>' for i in range(16))

# The hash unrolled. No page shows it in rc-11: it left the first page after the reviews of 23 Nov 2026 UTC and is kept here for /core.
def cells(core_sha256):
    """The hash unrolled: its 256 bits, most significant first, sixteen to a row. Row i is the two bytes of ring i."""
    return "".join(f"{x:08b}" for x in bytes.fromhex(core_sha256))

def seal(core_sha256):
    """The 256 cells as an SVG: one filled run for each run of set bits; beside row i its two bytes (bytes 2i and 2i + 1: the start
    and the daily step, less one, of ring i of the figure). One cell is one unit."""
    h, bits = bytes.fromhex(core_sha256), cells(core_sha256)
    runs = "".join(f"M{m.start()} {y}h{len(m.group())}v1h-{len(m.group())}z" for y in range(16) for m in re.finditer("1+", bits[16 * y:16 * y + 16]))
    cuts = "".join(f"M{i} 0v16M0 {i}h16" for i in range(1, 16))
    pairs = "".join(f'<tspan x="-.5" y="{i}.8" text-anchor="end">{h[2 * i]:02x}</tspan><tspan x="16.5" y="{i}.8" text-anchor="start">{h[2 * i + 1]:02x}</tspan>' for i in range(16))
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 0 20 16" width="320" height="256" role="img" aria-labelledby="seal-t">'
            "<title id=\"seal-t\">The Core's SHA-256: 256 bits, sixteen by sixteen, the two bytes of each row beside it.</title>"
            f'<path class="un" d="M0 0h16v16h-16z" fill="#bbb"/><path d="{runs}" fill="currentColor"/>'
            f'<path class="cut" d="{cuts}" fill="none" stroke="#fff" stroke-width=".0625"/>'
            f'<g font-family="monospace" font-size=".8409" fill="currentColor"><text>{pairs}</text></g></svg>')

if __name__ == "__main__":
    sha = sys.argv[1]
    for d in [int(x) for x in sys.argv[2:]]:
        print(json.dumps({"day": d, "positions": positions(d, sha), "rings": rings(d, sha)}))
