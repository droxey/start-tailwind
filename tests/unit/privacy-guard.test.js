// Guards the security rules in the brief: no secrets and no apartment or unit numbers anywhere
// in the app's code, config, seed data, or docs. Scans tracked and new files outside the
// vendored agent skills.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..", "..");
const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
  cwd: root,
})
  .toString()
  .split("\n")
  .filter(Boolean)
  .filter((f) => !/^\.(agents|claude|cursor|grok)\//.test(f))
  .filter((f) => !/(package-lock\.json|skills-lock\.json|\.png)$/.test(f))
  .filter((f) => !f.startsWith("tests/") || f.startsWith("tests/unit/"));

const read = (f) => {
  try {
    return readFileSync(join(root, f), "utf8");
  } catch {
    return "";
  }
};

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

test("no apartment or unit numbers in the repo", () => {
  // Real ship-from forms are assembled at runtime so this file never contains them as literals.
  const unitToken = ["A", "207"].join("");
  const street = ["21", "East"].join(" ");
  // Same idea as server/chat.js: labeled units may have alphanumeric IDs, but the ID must
  // contain a digit so phrases like "unit test" don't trip the guard.
  const labeledUnit =
    /\b(apt|apartment|unit|suite|ste|flat)\b\.?\s*#?\s*[A-Za-z]*\d+[A-Za-z0-9-]*\b/i;
  const streetAddress = new RegExp(String.raw`\b${escapeRe(street)}(?:\s+(?:street|st))?\b`, "i");
  const hits = files.filter((f) => {
    const text = read(f);
    return (
      text.toLowerCase().includes(unitToken.toLowerCase()) ||
      labeledUnit.test(text) ||
      streetAddress.test(text)
    );
  });
  assert.deepEqual(hits, []);
});

test("no secrets, keys, cookies, or sessions in the repo", () => {
  const secret =
    /(-----BEGIN [A-Z ]*PRIVATE KEY-----|AKIA[0-9A-Z]{16}|v\^1\.1#i\^1|"d"\s*:\s*"[A-Za-z0-9_-]{40,}"|(?:token|secret|password|cookie|session)\s*[:=]\s*["'][A-Za-z0-9+/_=-]{16,}["'])/i;
  const hits = files.filter((f) => secret.test(read(f)));
  assert.deepEqual(hits, []);
});

test("no real .env or data folder is tracked", () => {
  assert.deepEqual(
    files.filter((f) => /^\.env($|\.(?!example))|^data\//.test(f)),
    [],
  );
});
