# Hosting a mirror of the record (Blueprint 1.3.1 §8)

A mirror holds the signed bytes where civilizationzero.ai cannot reach, under someone else's control. It does not need the
functions (the first page's clock, the discussion room): the record is the static files.

## What to mirror
Everything under `site/public/` at a tagged release (`v1.0`, and each later one): the canonical texts (`core.txt`, `record.txt`),
their JSON forms, the translations, `/.well-known/` (manifest, release manifest, public key, signatures, OpenTimestamps proof,
the RFC 3161 time-stamp tokens and, in `/.well-known/tsa/`, FreeTSA's two certificates), `/archive/cz-bundle-*.tar`, the pages. The discussion archive (`/discuss.json`, `/archive/entries/{date}.json`) is dynamic;
a mirror may keep dated copies of it.

## How (any static host; no build step)
```sh
git clone --branch v1.0 --depth 1 https://github.com/civilizationzero/civilizationzero.git
# serve civilizationzero/site/public as a static site, e.g.:
#   nginx:   root /path/to/civilizationzero/site/public;  (serve .html for extension-less paths: try_files $uri $uri.html =404;)
#   python:  cd civilizationzero/site/public && python3 -m http.server 8080
```
Copy the files; do not link them. `verify.py --site-dir` refuses a link anywhere in the copy (to a file or a directory), so
that what it checks is what lies in the directory.
Content types that matter: `core.txt`, `record.txt`, `*.pub` as `text/plain; charset=utf-8`; `*.json` as `application/json`;
`*.sig`, `*.ots` as `application/octet-stream`; `*.tsr` as `application/timestamp-reply`; `*.tar` as `application/x-tar`.

## Verify the mirror (same checks as the daily job)
One command, no installs (Python 3.8 or later). `verify.py` is in the repository (`site/verify/verify.py` on `main`), in
every bundle from 1.0.1 (`verify/verify.py`) and at https://civilizationzero.ai/archive/verify.py — take it from one of
these and compare its SHA-256 with another:
```sh
python3 verify.py --site-dir /path/to/your/copy/of/site/public     # the files, before you serve them
python3 verify.py --site https://mirror.example                     # the mirror as it is served
```
It checks the key against its trust anchor, every signature, every hash in the release manifest, the translations, the
timestamp proofs (the OpenTimestamps proof, and that each RFC 3161 token is over the release manifest), FreeTSA's certificates
against the SHA-256 that freetsa.org publishes, and the bundles. A static mirror holds the record, not the daily chains of the discussion and the register
(they are served by civilizationzero.ai and copied to this repository's `archive/`): for a mirror the verifier reports them
as PENDING, not as a failure. The same steps with OpenSSL alone:
```sh
M=https://mirror.example   # the mirror's base URL
for f in core.txt record.txt .well-known/cz-release-1.0.json; do
  curl -fsSL "$M/$f" -o "/tmp/$f"; curl -fsSL "$M/$f.sig" -o "/tmp/$f.sig"
  openssl pkeyutl -verify -pubin -inkey site/sign/cz-record-signing.pub -rawin -in "/tmp/$f" -sigfile "/tmp/$f.sig"
done
sha256sum /tmp/core.txt   # 92a8d1e2a1604c25b432685673be78184bf05c3b166893c437e0895b7b2d724a
sha256sum /tmp/record.txt # 71e1488e631e090c0820bf8b78b1fda70ffacba1da146c36d8893600320fcc8d
```
Once a mirror's holder has set it up and asked for it, its URL is added to `site/mirrors.json`: the `verify-live` workflow
then runs verify.py against it every day (the run history is public), and `/archive` and the manifest name it, with its
holder as they ask to be named.

## Who
At least two, one outside the originator's jurisdiction. The second key-holder (Banco, Germany) is the first candidate; any
person or institution may host one and tell record@civilizationzero.ai.
