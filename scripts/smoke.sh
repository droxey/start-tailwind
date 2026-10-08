#!/bin/sh
# Post-deploy smoke test: the page, every same-site stylesheet, script, and icon it links to
# return HTTP 200 at the deployed URL (works at / or under a subpath such as /start-tailwind/).
#
#   sh scripts/smoke.sh https://example.com/sub/ [tries]
#   EXPECT_STATUS=404 sh scripts/smoke.sh https://example.com/sub/a/b/c   # styled 404 page
#
# Retries while the host's CDN picks up the new deploy. POSIX sh, curl, grep, and sed only.
set -eu

URL=${1:?usage: smoke.sh <url> [tries]}
TRIES=${2:-10}
EXPECT_STATUS=${EXPECT_STATUS:-200}
case "$URL" in */) ;; *) URL="$URL/" ;; esac
ORIGIN=$(printf '%s' "$URL" | sed -E 's#^(https?://[^/]+).*#\1#')
UA="start-tailwind-smoke/1 (+https://github.com/droxey/start-tailwind)"

status() { curl -sS -o /dev/null -w '%{http_code}' -A "$UA" -L --max-time 20 "$1" || true; }

resolve() {
  case "$1" in
    http://* | https://*) printf '%s\n' "$1" ;;
    //*) printf '%s\n' "${URL%%//*}$1" ;;
    /*) printf '%s\n' "$ORIGIN$1" ;;
    *) printf '%s\n' "$URL${1#./}" ;;
  esac
}

attempt() {
  html=$(curl -sS -A "$UA" -L --max-time 20 "$URL") || { echo "page: fetch failed"; return 1; }
  refs=$(printf '%s' "$html" | tr '\n' ' ' |
    grep -oE '<(link|script)[^>]+(href|src)="[^"]+"' |
    grep -E 'rel="(stylesheet|icon)"|<script' |
    sed -E 's/.*(href|src)="([^"]+)".*/\2/' | sort -u)
  [ -n "$refs" ] || { echo "page: no stylesheet or script found"; return 1; }
  ok=0
  for ref in $refs; do
    abs=$(resolve "$ref")
    case "$abs" in "$ORIGIN"/*) ;; *) continue ;; esac
    code=$(status "$abs")
    echo "$code $abs"
    [ "$code" = 200 ] || ok=1
  done
  return $ok
}

i=1
while :; do
  code=$(status "$URL")
  echo "$code $URL"
  if [ "$code" = "$EXPECT_STATUS" ] && attempt; then
    echo "smoke: OK"
    exit 0
  fi
  [ "$i" -lt "$TRIES" ] || break
  i=$((i + 1))
  sleep 15
done
echo "smoke: FAILED after $TRIES tries" >&2
exit 1
