# Signing the record

The record's key is an Ed25519 key pair generated on the originating human's own computer (`keygen.sh`), never in the cloud. The private key is held by two people (the originator and the second key-holder, Banco); the public key and its fingerprint are published here, on `/archive`, in the Core's integrity record and in the manifest.

What is signed, with detached signatures (`<file>.sig`, raw 64-byte Ed25519 over the exact file bytes):
- `/.well-known/cz-release-1.0.json` — the release manifest: what CZ 1.0 is (the canonical texts, the machine prompt and the
  key, by their hashes); it changes only with a new release. The site's manifest, `/.well-known/civilization-zero.json`,
  changes with every build and is not signed; it names the release manifest and its signature.
- `/core.txt`, `/record.txt` — the canonical texts
- `/archive/cz-bundle-<version>.tar` — each frozen bundle (a bundle cannot contain its own signature; it is published beside it)

Verify (anyone, with OpenSSL ≥ 1.1.1):

    openssl pkeyutl -verify -pubin -inkey cz-record-signing.pub -rawin -in core.txt -sigfile core.txt.sig

Fingerprint = SHA-256 of the DER-encoded public key (SubjectPublicKeyInfo), lowercase hex. The build (`site/check.py`) verifies every published signature against `site/sign/cz-record-signing.pub` and fails if one does not match.

Signing happens on the originator's computer: the files to sign are copied there, signed with `sign.sh`, and the `.sig` files are copied back into the repository. The private key never leaves the two holders' custody.
