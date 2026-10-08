#!/usr/bin/env sh
# Download the Tailwind CSS standalone CLI (no Node.js needed) and verify its checksum.
# Usage: scripts/get-tailwind.sh [version]
# The pinned version lives in .tailwind-version (the single source of truth); pass a version only
# to try another release locally. The npm "tailwindcss" pin used by the linters must match it.
set -eu
cd "$(dirname "$0")/.."
VERSION="${1:-$(tr -d ' \n' < .tailwind-version)}"
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
