# Hosting a mirror of the record (Blueprint 1.3.1 §8)

A mirror holds the signed bytes where civilizationzero.ai cannot reach, under someone else's control. It does not need the
functions (the first page's clock, the discussion room): the record is the static files.

## What to mirror
Everything under `site/public/` at a tagged release (`v1.0`, and each later one): the canonical texts (`core.txt`, `record.txt`),
their JSON forms, the translations, `/.well-known/` (manifest, release manifest, public key, signatures, OpenTimestamps proof),
`/archive/cz-bundle-*.tar`, the pages. The discussion archive (`/discuss.json`, `/archive/entries/{date}.json`) is dynamic;
a mirror may keep dated copies of it.

## How (any static host; no build step)
```sh
git clone --branch v1.0 --depth 1 https://github.com/civilizationzero/civilizationzero.git
# serve civilizationzero/site/public as a static site, e.g.:
#   nginx:   root /path/to/civilizationzero/site/public;  (serve .html for extension-less paths: try_files $uri $uri.html =404;)
#   python:  cd civilizationzero/site/public && python3 -m http.server 8080
```
Content types that matter: `core.txt`, `record.txt`, `*.pub` as `text/plain; charset=utf-8`; `*.json` as `application/json`;
`*.sig`, `*.ots` as `application/octet-stream`; `*.tar` as `application/x-tar`.

## Verify the mirror (same checks as the daily job)
One command, from a clone of the repository (or with `verify.py` from any bundle from 1.0.1), no installs:
```sh
python3 site/verify/verify.py --site-dir /path/to/your/copy/of/site/public     # the files, before you serve them
python3 site/verify/verify.py --site https://mirror.example                      # the mirror as it is served
```
It checks the key against its trust anchor, every signature, every hash in the release manifest, the translations, the
timestamp proof and the bundles (and, with `--site`, the discussion's daily chain). The same steps with OpenSSL alone:
```sh
M=https://mirror.example   # the mirror's base URL
for f in core.txt record.txt .well-known/cz-release-1.0.json; do
  curl -fsSL "$M/$f" -o "/tmp/$f"; curl -fsSL "$M/$f.sig" -o "/tmp/$f.sig"
  openssl pkeyutl -verify -pubin -inkey site/sign/cz-record-signing.pub -rawin -in "/tmp/$f" -sigfile "/tmp/$f.sig"
done
sha256sum /tmp/core.txt   # 92a8d1e2a1604c25b432685673be78184bf05c3b166893c437e0895b7b2d724a
sha256sum /tmp/record.txt # 71e1488e631e090c0820bf8b78b1fda70ffacba1da146c36d8893600320fcc8d
```
Once a mirror's URL is known it is added to `.github/workflows/verify-live.yml` (the same steps run against it daily) and
named on `/archive` and in the manifest with the date it was last verified.

## Who
At least two, one outside the originator's jurisdiction. The second key-holder (Banco, Germany) is the first candidate; any
person or institution may host one and tell record@civilizationzero.ai.
