// Serves public/ under /start-tailwind/, like the GitHub Pages project site, so tests catch
// root-absolute URLs that only work at /. Missing pages at any depth get 404.html with a 404
// status, after the same deploy-time rewrite pages.yml applies (scripts/rewrite-404.sh).
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";

const PREFIX = "/start-tailwind/";
const ROOT = join(import.meta.dirname, "..", "public");
const PORT = Number(process.env.SUBPATH_PORT ?? 8081);
const NOT_FOUND = execFileSync("sh", [
  join(import.meta.dirname, "..", "scripts", "rewrite-404.sh"),
  PREFIX,
  join(ROOT, "404.html"),
  "-",
]);
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".xml": "application/xml",
  ".txt": "text/plain; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

async function resolveFile(pathname) {
  const rel = normalize(decodeURIComponent(pathname.slice(PREFIX.length)));
  if (rel.startsWith("..")) return null;
  const file = join(ROOT, rel);
  if (!file.startsWith(ROOT + sep) && file !== ROOT) return null;
  for (const candidate of [file, join(file, "index.html"), `${file}.html`]) {
    try {
      if ((await stat(candidate)).isFile()) return candidate;
    } catch {
      // try the next candidate
    }
  }
  return null;
}

createServer(async (req, res) => {
  const { pathname } = new URL(req.url ?? "/", "http://localhost");
  if (pathname === "/start-tailwind") {
    res.writeHead(301, { Location: PREFIX }).end();
    return;
  }
  const file = pathname.startsWith(PREFIX) ? await resolveFile(pathname) : null;
  if (file) {
    res.writeHead(200, { "Content-Type": TYPES[extname(file)] ?? "application/octet-stream" });
    res.end(await readFile(file));
    return;
  }
  if (pathname.startsWith(PREFIX)) {
    res.writeHead(404, { "Content-Type": TYPES[".html"] });
    res.end(NOT_FOUND);
    return;
  }
  res.writeHead(404, { "Content-Type": TYPES[".txt"] }).end("Not found");
}).listen(PORT);
