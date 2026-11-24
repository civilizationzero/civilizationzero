#!/usr/bin/env python3
"""The sixteen places of /civilization-zero-images (site/sixteen.json): their frames as files, and the page's link preview.

To put a sentence into a place (the one command; after it only site/build.py runs):

  python3 site/assets/render_sixteen.py place K FRAME.png --sentence "The sentence." --cz-day N --art "flow field" \\
      --watch instagram=https://… x=https://… bluesky=https://… mastodon=https://…

  K          the place, 0 to 15 (the ring it is bound to, 0 the innermost)
  FRAME.png  the film's last frame, lossless, 1080x1920
  --cz-day   the CZ day the frame itself shows in its top line
  --art      the name of the computed image under the sentence
  --watch    where the film is: one or more of instagram, x, bluesky, mastodon, each a plain https address (no parameters)

  It names the files by the sentence's first words (the shortest beginning, three words or more, that no other place has), writes
  the three renditions into site/assets, writes the entry into site/sixteen.json (a place that was held is replaced, and its old
  files are removed) and makes the link preview again. To open a place again: python3 site/assets/render_sixteen.py open K

Other entries:
  render_sixteen.py frames DIR   encode again the frames of every held place from DIR (NN-*.png, NN the place)
  render_sixteen.py wall         the link preview alone, site/assets/cz-16-wall.jpg (1200x630): the sixteen places in ring order,
                                 eight to a row, an open place an empty outline

The renditions, all progressive JPEG, 4:2:0: cz-16-<file>.jpg 1080x1920 at quality 82 (the full size a frame links to),
cz-16-<file>-720.jpg at quality 64 and cz-16-<file>-540.jpg at quality 66 (the two the page shows)."""
import argparse, json, pathlib, re, sys
from PIL import Image, ImageDraw
HERE = pathlib.Path(__file__).resolve().parent
DATA = HERE.parent / "sixteen.json"
RENDITIONS = (("", (1080, 1920), 82), ("-720", (720, 1280), 64), ("-540", (540, 960), 66))
slug = lambda t: re.sub(r"[^a-z0-9]+", "-", t.lower()).strip("-")

def load(): 
    places = json.loads(DATA.read_text("utf-8"))["places"]; assert len(places) == 16; return places
def store(places): DATA.write_text(json.dumps({"places": places}, ensure_ascii=False, indent=1) + "\n", "utf-8")
def save(im, path, quality): im.save(path, "JPEG", quality=quality, progressive=True, optimize=True, subsampling=2)

def encode(png, name):
    im = Image.open(png).convert("RGB")
    assert im.size == (1080, 1920), f"{png}: a frame is 1080x1920"
    for suffix, size, quality in RENDITIONS:
        save(im if size == im.size else im.resize(size, Image.LANCZOS), HERE / f"cz-16-{name}{suffix}.jpg", quality)
    return [(HERE / f"cz-16-{name}{s}.jpg").stat().st_size for s, _, _ in RENDITIONS]

def remove(name):
    for suffix, _, _ in RENDITIONS: (HERE / f"cz-16-{name}{suffix}.jpg").unlink(missing_ok=True)

def frames(src):
    for k, p in enumerate(load()):
        if p is None: continue
        found = sorted(pathlib.Path(src).glob(f"{k:02d}-*.png"))
        assert len(found) == 1, f"place {k}: one lossless frame named {k:02d}-*.png"
        print(k, p["file"], *encode(found[0], p["file"]))

def wall():
    W, H, BG, RULE = 1200, 630, (16, 16, 16), (170, 170, 170)
    w, h, gap = 132, 235, 14                      # a place: 9 by 16; eight to a row, two rows
    x0 = (W - 8 * w - 7 * gap) // 2; y0 = (H - 2 * h - gap) // 2
    im = Image.new("RGB", (W, H), BG); d = ImageDraw.Draw(im)
    for k, p in enumerate(load()):
        x, y = x0 + (k % 8) * (w + gap), y0 + (k // 8) * (h + gap)
        if p is None: d.rectangle([x, y, x + w - 1, y + h - 1], outline=RULE, width=1)
        else: im.paste(Image.open(HERE / f"cz-16-{p['file']}.jpg").convert("RGB").resize((w, h), Image.LANCZOS), (x, y))
    save(im, HERE / "cz-16-wall.jpg", 88)
    print("wall", (HERE / "cz-16-wall.jpg").stat().st_size)

def place(a):
    places = load(); k = a.k
    assert 0 <= k <= 15, "a place is 0 to 15"
    watch = dict(w.split("=", 1) for w in a.watch)
    assert watch and set(watch) <= {"instagram", "x", "bluesky", "mastodon"} and all(u.startswith("https://") and not re.search(r"[?&#]", u) for u in watch.values()), "--watch: instagram, x, bluesky, mastodon; plain https addresses"
    others = [p for i, p in enumerate(places) if p is not None and i != k]
    assert a.sentence not in [p["sentence"] for p in others], "another place holds this sentence"
    words = slug(a.sentence).split("-"); taken = {p["file"] for p in others}
    free = lambda x: x not in taken and not any(t.startswith(x + "-") or x.startswith(t + "-") for t in taken) and not re.search(r"-(540|720)$", x)   # no name inside another, none that reads as a rendition
    name = next(x for x in ("-".join(words[:n]) for n in range(min(3, len(words)), len(words) + 1)) if free(x))
    if places[k] is not None and places[k]["file"] != name: remove(places[k]["file"])
    sizes = encode(a.frame, name)
    places[k] = {"sentence": a.sentence, "day": a.cz_day, "art": a.art, "file": name, "watch": {n: watch[n] for n in ("instagram", "x", "bluesky", "mastodon") if n in watch}}
    store(places); print("place", k, name, *sizes); wall()

def open_place(k):
    places = load()
    if places[k] is not None: remove(places[k]["file"]); places[k] = None; store(places)
    wall()

if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter); sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("place"); p.add_argument("k", type=int); p.add_argument("frame"); p.add_argument("--sentence", required=True); p.add_argument("--cz-day", type=int, required=True)
    p.add_argument("--art", required=True); p.add_argument("--watch", nargs="+", required=True, metavar="NAME=URL")
    o = sub.add_parser("open"); o.add_argument("k", type=int)
    f = sub.add_parser("frames"); f.add_argument("dir")
    sub.add_parser("wall")
    a = ap.parse_args()
    {"place": lambda: place(a), "open": lambda: open_place(a.k), "frames": lambda: frames(a.dir), "wall": wall}[a.cmd]()
