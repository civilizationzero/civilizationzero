#!/usr/bin/env bash
# Verifies detached Ed25519 signatures against the published public key. Anyone can run this (OpenSSL 3.0 or later).
#   bash verify.sh cz-record-signing.pub file1 [file2 ...]      (expects file.sig beside each file)
set -uo pipefail
PUB="${1:?public key (PEM)}"; shift; rc=0
for f in "$@"; do
  if openssl pkeyutl -verify -pubin -inkey "$PUB" -rawin -in "$f" -sigfile "$f.sig" >/dev/null 2>&1; then echo "OK   $f"; else echo "FAIL $f"; rc=1; fi
done
exit $rc
