#!/bin/sh
# Verifies the vendored agent skills against skills-lock.json.
#
#   sh scripts/check-skills.sh           check (exit 1 on any problem)
#   sh scripts/check-skills.sh --print   print "<skill> <treeHash>" for every vendored folder,
#                                        to refresh skills-lock.json after a deliberate update
#
# Checks:
#   - every lockfile entry is pinned to a full 40-character commit SHA and names a license
#   - every vendored entry exists under .agents/skills/<name>/ with a SKILL.md, its license file
#     exists, and its contents match the recorded treeHash
#   - entries that are not vendored carry an installCommand instead
#   - no folder under .agents/skills/ is missing from the lockfile (no unvetted skills)
#   - .claude/skills and .cursor/skills resolve to .agents/skills (one copy, no duplicates)
#
# treeHash: in the skill folder, list every regular file as "<sha256>  ./<path>", sort the lines
# by path (C locale), and take the sha256 of that listing. POSIX sh plus sha256sum or shasum.
set -eu

cd "$(dirname "$0")/.."
LOCK=skills-lock.json
SKILLS=.agents/skills

if command -v sha256sum >/dev/null 2>&1; then
  SHA="sha256sum"
elif command -v shasum >/dev/null 2>&1; then
  SHA="shasum -a 256"
else
  echo "check-skills: need sha256sum or shasum" >&2
  exit 2
fi

tree_hash() {
  (
    cd "$1"
    # shellcheck disable=SC2086 # $SHA is a command plus its flags
    find . -type f -exec $SHA {} +
  ) | awk '{ print substr($0, 67) "\t" substr($0, 1, 64) }' |
    LC_ALL=C sort |
    awk -F '\t' '{ print $2 "  " $1 }' |
    $SHA | awk '{ print $1 }'
}

if [ "${1:-}" = "--print" ]; then
  for d in "$SKILLS"/*/; do
    d=${d%/}
    printf '%s %s\n' "${d##*/}" "$(tree_hash "$d")"
  done
  exit 0
fi

[ -f "$LOCK" ] || { echo "check-skills: $LOCK not found" >&2; exit 1; }

# Flatten each entry in "skills" to one tab-separated line:
# name ref vendored vendorPath treeHash licenseFile license installCommand
entries=$(awk '
  function val(line) { sub(/^[^:]*:[ \t]*/, "", line); sub(/,[ \t]*$/, "", line); gsub(/^"|"$/, "", line); return line }
  /^[ \t]*"skills"[ \t]*:[ \t]*\{/ { inskills = 1; next }
  inskills && !inentry && /^[ \t]*"[^"]+"[ \t]*:[ \t]*\{/ {
    name = $0; sub(/^[ \t]*"/, "", name); sub(/".*/, "", name)
    inentry = 1; ref = ""; ven = ""; vp = ""; th = ""; lf = ""; li = ""; ic = ""; next
  }
  inentry && /^[ \t]*"ref"[ \t]*:/ { ref = val($0) }
  inentry && /^[ \t]*"vendored"[ \t]*:/ { ven = val($0) }
  inentry && /^[ \t]*"vendorPath"[ \t]*:/ { vp = val($0) }
  inentry && /^[ \t]*"treeHash"[ \t]*:/ { th = val($0) }
  inentry && /^[ \t]*"licenseFile"[ \t]*:/ { lf = val($0) }
  inentry && /^[ \t]*"license"[ \t]*:/ { li = val($0) }
  inentry && /^[ \t]*"installCommand"[ \t]*:/ { ic = val($0) }
  inentry && /^[ \t]*\},?[ \t]*$/ {
    printf "%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n", name, ref, ven, vp, th, lf, (li == "" ? "-" : li), (ic == "" ? "-" : ic)
    inentry = 0; next
  }
  inskills && !inentry && /^[ \t]*\},?[ \t]*$/ { inskills = 0 }
' "$LOCK")

[ -n "$entries" ] || { echo "check-skills: no skills found in $LOCK" >&2; exit 1; }

fail=0
err() { echo "check-skills: $*" >&2; fail=1; }
total=0
vendored=0
tab=$(printf '\t')

while IFS="$tab" read -r name ref ven vp th lf li ic; do
  total=$((total + 1))
  case "$ref" in
    [0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]*)
      [ ${#ref} -eq 40 ] || err "$name: ref '$ref' is not a full 40-character commit SHA" ;;
    *) err "$name: ref '$ref' is not pinned to a commit SHA" ;;
  esac
  [ "$li" != "-" ] || err "$name: no license recorded"
  if [ "$ven" = "true" ]; then
    vendored=$((vendored + 1))
    [ "$vp" = "$SKILLS/$name" ] || err "$name: vendorPath '$vp' should be $SKILLS/$name"
    if [ ! -f "$SKILLS/$name/SKILL.md" ]; then
      err "$name: missing $SKILLS/$name/SKILL.md"
      continue
    fi
    [ -n "$lf" ] && [ -f "$lf" ] || err "$name: license file '$lf' missing"
    actual=$(tree_hash "$SKILLS/$name")
    [ "$actual" = "$th" ] || err "$name: contents changed (treeHash $actual, lockfile $th)"
  else
    [ "$ic" != "-" ] || err "$name: not vendored and no installCommand recorded"
  fi
done <<LIST
$entries
LIST

names=$(printf '%s\n' "$entries" | cut -f1)
for d in "$SKILLS"/*/; do
  [ -d "$d" ] || continue
  d=${d%/}
  n=${d##*/}
  printf '%s\n' "$names" | grep -Fqx "$n" || err "$n: folder in $SKILLS is not in $LOCK (unvetted skill)"
done

canon=$(cd "$SKILLS" && pwd -P)
for link in .claude/skills .cursor/skills; do
  if [ ! -d "$link" ]; then
    err "$link is missing (should be a symlink to ../$SKILLS)"
  elif [ "$(cd "$link" && pwd -P)" != "$canon" ]; then
    err "$link does not resolve to $SKILLS"
  fi
done

if [ "$fail" -ne 0 ]; then
  echo "check-skills: FAILED. Restore with 'npx skills experimental_install' or the installCommand in $LOCK." >&2
  exit 1
fi
echo "check-skills: OK ($total skills in $LOCK, $vendored vendored and verified)"
