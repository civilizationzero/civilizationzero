# The accounts' profile picture and cover

For the project's accounts — X [@czrecord](https://x.com/czrecord), Bluesky [@civilizationzero.ai](https://bsky.app/profile/civilizationzero.ai),
Mastodon [@civilizationzero@mastodon.social](https://mastodon.social/@civilizationzero) and the GitHub organisation
[civilizationzero](https://github.com/civilizationzero). Made on 30 October 2026 (CZ 1430) at the originator's request, from the same
geometry as every other image of the record (`site/assets/mark.py`), in the site's dark palette (#101010, #eeeeee, #aaaaaa, #444444).
These files are not served by the site.

| File | Size | Where |
|---|---|---|
| `cz-profile-1000.png` | 1000 × 1000 | Profile picture on all four (each site cuts it to a circle or a rounded square; the mark stays inside 62% of the circle's radius) |
| `cz-cover-1500x500.png` | 1500 × 500 | Header on X and Mastodon (both show 1500 × 500) |
| `cz-cover-3000x1000.png` | 3000 × 1000 | Banner on Bluesky (3:1, at most 1,000,000 bytes) |

The cover: the name, "The origin record for humans and AI", a time axis whose one marked point is Coordinate Zero, "Coordinate Zero ·
30 November 2022", and the address. Its lower left is left empty: each of these sites lays the profile picture over it.

Made with `python3 site/assets/render.py --social design/social` (Playwright with Chromium, Pillow; the fonts Inter, Inter Display
and DejaVu Sans Mono).
