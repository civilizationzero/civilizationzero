#!/usr/bin/env bash
# Signs files with the record key, producing detached Ed25519 signatures (<file>.sig, raw 64 bytes).
#   bash sign.sh /path/to/CZ-keys/cz-record-signing.key file1 [file2 ...]
set -euo pipefail
KEY="${1:?private key}"; shift
for f in "$@"; do
  openssl pkeyutl -sign -inkey "$KEY" -rawin -in "$f" -out "$f.sig"
  echo "signed $f -> $f.sig ($(stat -c%s "$f.sig") bytes)"
done
