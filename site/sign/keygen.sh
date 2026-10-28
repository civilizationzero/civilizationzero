#!/usr/bin/env bash
# Generates the Civilization Zero record signing key (Ed25519) ON THE ORIGINATOR'S OWN COMPUTER.
# Run once, in the folder that will hold the key (e.g. Documents/CZ-keys). Never run this in the cloud.
#   bash keygen.sh /path/to/CZ-keys
# Produces: cz-record-signing.key (PRIVATE — keep offline, back up, give an encrypted copy to the second key-holder),
#           cz-record-signing.pub (public key, PEM — published), FINGERPRINT.txt (SHA-256 of the DER public key).
set -euo pipefail
DIR="${1:?folder}"; cd "$DIR"
if [ -e cz-record-signing.key ]; then echo "key already exists; refusing to overwrite"; exit 1; fi
umask 077
openssl genpkey -algorithm ed25519 -out cz-record-signing.key
openssl pkey -in cz-record-signing.key -pubout -out cz-record-signing.pub
# fingerprint: sha256 over the DER SubjectPublicKeyInfo, lowercase hex
openssl pkey -pubin -in cz-record-signing.pub -outform DER | sha256sum | cut -d' ' -f1 > FINGERPRINT.txt
echo "public key:"; cat cz-record-signing.pub
echo "fingerprint (sha256 of DER public key): $(cat FINGERPRINT.txt)"
echo "created $(date -u +%Y-%m-%dT%H:%M:%SZ)" > CREATED.txt
ls -la
