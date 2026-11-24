#!/usr/bin/env python3
"""The sixteen places of /civilization-zero-images (site/sixteen.json): their frames as files, and the page's link preview.

  render_sixteen.py frames DIR   encode the lossless frames in DIR (1080x1920 PNG, named NN-*.png, NN the place) into site/assets:
                                 cz-16-<file>.jpg (1080x1920, quality 82) and cz-16-<file>-540.jpg (540x960, quality 66), both
                                 progressive JPEG, 4:2:0
  render_sixteen.py wall         the link preview, site/assets/cz-16-wall.jpg (1200x630): the sixteen places in ring order, eight to
                                 a row, an open place an empty outline; made from the encoded frames, so it can be made again here

Adding a place: one entry in site/sixteen.json, its frame through "frames", then "wall", then the build."""
import json, pathlib, sys
from PIL import Image, ImageDraw
HERE = pathlib.Path(__file__).resolve().parent
PLACES = json.loads((HERE.parent / "sixteen.json").read_text("utf-8"))["places"]
assert len(PLACES) == 16

def save(im, path, quality):
    im.save(path, "JPEG", quality=quality, progressive=True, optimize=True, subsampling=2)

def frames(src):
    for k, p in enumerate(PLACES):
        if p is None: continue
        found = sorted(pathlib.Path(src).glob(f"{k:02d}-*.png"))
        assert len(found) == 1, f"place {k}: one lossless frame named {k:02d}-*.png"
        im = Image.open(found[0]).convert("RGB")
        assert im.size == (1080, 1920), f"place {k}: 1080x1920"
        save(im, HERE / f"cz-16-{p['file']}.jpg", 82)
        save(im.resize((540, 960), Image.LANCZOS), HERE / f"cz-16-{p['file']}-540.jpg", 66)
        print(k, p["file"], (HERE / f"cz-16-{p['file']}.jpg").stat().st_size, (HERE / f"cz-16-{p['file']}-540.jpg").stat().st_size)

def wall():
    W, H, BG, RULE = 1200, 630, (16, 16, 16), (170, 170, 170)
    w, h, gap = 132, 235, 14                      # a place: 9 by 16; eight to a row, two rows
    x0 = (W - 8 * w - 7 * gap) // 2; y0 = (H - 2 * h - gap) // 2
    im = Image.new("RGB", (W, H), BG); d = ImageDraw.Draw(im)
    for k, p in enumerate(PLACES):
        x, y = x0 + (k % 8) * (w + gap), y0 + (k // 8) * (h + gap)
        if p is None: d.rectangle([x, y, x + w - 1, y + h - 1], outline=RULE, width=1)
        else: im.paste(Image.open(HERE / f"cz-16-{p['file']}.jpg").convert("RGB").resize((w, h), Image.LANCZOS), (x, y))
    save(im, HERE / "cz-16-wall.jpg", 88)
    print("wall", (HERE / "cz-16-wall.jpg").stat().st_size)

if __name__ == "__main__":
    if sys.argv[1:2] == ["frames"] and len(sys.argv) == 3: frames(sys.argv[2])
    elif sys.argv[1:] == ["wall"]: wall()
    else: sys.exit(__doc__)
