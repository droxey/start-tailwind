#!/bin/sh
# Fails if the linters' npm "tailwindcss" pin drifts from the standalone CLI pin in .tailwind-version.
set -eu
cd "$(dirname "$0")/.."
pin=$(tr -d ' \n' < .tailwind-version)
npm=$(sed -n 's/^ *"tailwindcss": *"\([^"]*\)".*/\1/p' package.json)
case "$pin" in v[0-9]*.[0-9]*.[0-9]*) ;; *) echo "check-tailwind-version: .tailwind-version '$pin' is not vX.Y.Z" >&2; exit 1 ;; esac
if [ "v$npm" != "$pin" ]; then
  echo "check-tailwind-version: package.json tailwindcss '$npm' does not match .tailwind-version '$pin' (use an exact version)" >&2
  exit 1
fi
echo "check-tailwind-version: OK ($pin)"
