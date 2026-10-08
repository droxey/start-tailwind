#!/bin/sh
# Deploy-time step for 404.html only. Hosts serve 404.html for a missing URL at any depth (for
# example /start-tailwind/a/b/c), where its relative asset and home links would resolve under the
# wrong folder. This rewrites every relative href/src in 404.html to a root-absolute path under the
# deploy base path. Source files stay relative; run this on the deploy copy only.
#
#   sh scripts/rewrite-404.sh <base-path> [in] [out]
#     base-path  "/" for a domain root, "/start-tailwind/" for a GitHub Pages project site
#     in         default public/404.html
#     out        default: rewrite "in" in place; "-" writes to stdout
#
# Leaves absolute URLs (https:, mailto:, //host, /path) and fragments (#main) alone. POSIX sh + sed.
set -eu

BASE=${1:?usage: rewrite-404.sh <base-path> [in] [out]}
IN=${2:-public/404.html}
OUT=${3:-$IN}
case "$BASE" in /*) ;; *) BASE="/$BASE" ;; esac
case "$BASE" in */) ;; *) BASE="$BASE/" ;; esac
printf '%s' "$BASE" | grep -Eq '^/([A-Za-z0-9._~-]+/)*$' || {
  echo "rewrite-404: unsupported base path '$BASE'" >&2
  exit 1
}

# (href|src)="[./]relative" -> (href|src)="<base>relative"; "./" becomes "<base>".
rewritten=$(sed -E "s#(href|src)=\"(\\./)?([^\"\#/:][^\":]*)?\"#\\1=\"${BASE}\\3\"#g" "$IN")
if printf '%s\n' "$rewritten" | grep -Eq '(href|src)="(\./|[^"#/:][^":]*")'; then
  echo "rewrite-404: relative URLs left in $IN" >&2
  exit 1
fi
if [ "$OUT" = "-" ]; then
  printf '%s\n' "$rewritten"
else
  printf '%s\n' "$rewritten" > "$OUT.tmp" && mv "$OUT.tmp" "$OUT"
  echo "rewrite-404: $OUT uses base path $BASE"
fi
