#!/usr/bin/env sh
# Download the Tailwind CSS standalone CLI (no Node.js needed) and verify its checksum.
# Usage: scripts/get-tailwind.sh [version]   e.g. scripts/get-tailwind.sh v4.3.3
set -eu
VERSION="${1:-v4.3.3}"
case "$(uname -s)-$(uname -m)" in
  Linux-x86_64) ASSET=tailwindcss-linux-x64 ;;
  Linux-aarch64 | Linux-arm64) ASSET=tailwindcss-linux-arm64 ;;
  Darwin-arm64) ASSET=tailwindcss-macos-arm64 ;;
  Darwin-x86_64) ASSET=tailwindcss-macos-x64 ;;
  *) echo "Unsupported platform; download manually from GitHub releases." >&2; exit 1 ;;
esac
BASE="https://github.com/tailwindlabs/tailwindcss/releases/download/${VERSION}"
mkdir -p bin
curl -fsSLo "bin/${ASSET}" "${BASE}/${ASSET}"
curl -fsSLo bin/sha256sums.txt "${BASE}/sha256sums.txt"
if command -v sha256sum >/dev/null 2>&1; then SHA="sha256sum"; else SHA="shasum -a 256"; fi
(cd bin && grep "/${ASSET}\$" sha256sums.txt | sed "s#\./##" | $SHA -c -)
mv "bin/${ASSET}" bin/tailwindcss
chmod +x bin/tailwindcss
rm bin/sha256sums.txt
bin/tailwindcss --help | head -1
