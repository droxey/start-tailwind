// HTTP layer: static files from public/ plus a small JSON API under api/.
// Logs never include request bodies, so buyer addresses and chat text stay out of logs.

import { timingSafeEqual } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { labelBlocks, receiptBlocks, renderPdf, shipFromLines } from "./labels.js";
import { getMarketplace } from "./marketplaces.js";
import { HttpError } from "./service.js";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
};

const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; font-src 'self'; connect-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";

const SECURITY_HEADERS = {
  "Content-Security-Policy": CSP,
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
  "Cross-Origin-Opener-Policy": "same-origin",
  "X-Robots-Tag": "noindex, nofollow",
};

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) {
        reject(new HttpError(413, "Upload too large."));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function readJson(req) {
  if (!String(req.headers["content-type"] ?? "").startsWith("application/json")) {
    throw new HttpError(415, "Send JSON.");
  }
  const buf = await readBody(req, 1024 * 1024);
  try {
    return buf.length ? JSON.parse(buf.toString("utf8")) : {};
  } catch {
    throw new HttpError(400, "Bad JSON.");
  }
}

const send = (res, status, body, headers = {}) => {
  res.writeHead(status, { ...SECURITY_HEADERS, "Cache-Control": "no-store", ...headers });
  res.end(body);
};
const json = (res, status, data) => send(res, status, JSON.stringify(data), { "Content-Type": TYPES[".json"] });

function passcodeOk(req, passcode) {
  if (!passcode) return true;
  const header = String(req.headers.authorization ?? "");
  if (!header.startsWith("Basic ")) return false;
  const given = Buffer.from(Buffer.from(header.slice(6), "base64").toString("utf8").split(":").slice(1).join(":"));
  const want = Buffer.from(passcode);
  return given.length === want.length && timingSafeEqual(given, want);
}

// Writes must come from this same page. Blocks cross-site form posts and fetches.
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return req.headers["sec-fetch-site"] !== "cross-site";
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

export function createHandler({ service, publicDir, photosDir, push, env = process.env, log = console.log }) {
  const routes = [];
  const route = (method, pattern, fn) =>
    routes.push({ method, re: new RegExp(`^/api/${pattern}$`), fn });

  route("GET", "dashboard", () => service.dashboard());

  route("POST", "photos", async (req) => {
    const type = String(req.headers["content-type"] ?? "");
    if (!/^image\/(jpeg|png)$/.test(type)) throw new HttpError(415, "Only JPEG and PNG photos are accepted.");
    const body = await readBody(req, 15 * 1024 * 1024);
    let name = "";
    try {
      name = decodeURIComponent(String(req.headers["x-filename"] ?? ""));
    } catch {
      name = "";
    }
    const flags = String(req.headers["x-photo-flags"] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    const saved = service.savePhoto(body, name, flags);
    return { ...saved, url: `api/photos/${saved.id}` };
  });

  route("GET", "photos/(\\d+)", async (req, res, [id]) => {
    const p = service.photo(id);
    if (!p || !photosDir) throw new HttpError(404, "Photo not found.");
    const data = await readFile(join(photosDir, p.file));
    send(res, 200, data, { "Content-Type": p.mime, "Cache-Control": "private, max-age=86400" });
  });

  route("POST", "drafts", async (req) => service.createDraft(await readJson(req)));
  route("POST", "items", async (req) => service.createItem(await readJson(req)));
  route("PATCH", "items/(\\d+)", async (req, res, [id]) => service.updateItem(id, await readJson(req)));
  route("DELETE", "items/(\\d+)", (req, res, [id]) => {
    service.deleteItem(id);
    return { ok: true };
  });
  route("POST", "items/(\\d+)/answers", async (req, res, [id]) => service.answerDraft(id, (await readJson(req)).answers));
  route("GET", "items/(\\d+)/activity", (req, res, [id]) => service.activity(id));
  route("GET", "items/(\\d+)/listings", (req, res, [id]) => service.listingsFor(id));
  route("GET", "items/(\\d+)/messages", (req, res, [id]) => service.messages(id));
  route("POST", "items/(\\d+)/messages", async (req, res, [id]) => service.addBuyerMessage(id, await readJson(req)));
  route("POST", "messages/(\\d+)/send", async (req, res, [id]) => service.sendReply(id, (await readJson(req)).text));
  route("POST", "items/(\\d+)/offers", async (req, res, [id]) => service.addOffer(id, await readJson(req)));
  route("POST", "items/(\\d+)/sold", async (req, res, [id]) => service.markSold(id, await readJson(req)));

  route("POST", "items/(\\d+)/label", async (req, res, [id]) => {
    const { format, doc, shipTo } = await readJson(req);
    const item = service.item(id);
    const sale = service.latestSale(item.id);
    const fmt = format === "narrow" ? "narrow" : "4x6";
    let blocks;
    if (doc === "receipt") blocks = receiptBlocks({ item, sale });
    else {
      if (sale?.method === "pickup") throw new HttpError(409, "Local pickup needs no shipping label.");
      if (sale && getMarketplace(sale.marketplace)?.issuesLabels) {
        throw new HttpError(409, `${getMarketplace(sale.marketplace).name} issues its own label. Print that one.`);
      }
      blocks = labelBlocks({ item, sale, shipTo: String(shipTo ?? "").slice(0, 400), shipFrom: shipFromLines(env) });
    }
    send(res, 200, renderPdf(blocks, fmt), {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="fs-${item.id}-${doc === "receipt" ? "receipt" : "label"}-${fmt}.pdf"`,
    });
  });

  route("POST", "queue/(\\d+)/approve", (req, res, [id]) => service.approve(id));
  route("POST", "queue/(\\d+)/reject", (req, res, [id]) => service.reject(id));
  route("PUT", "target", async (req) => service.setTarget(await readJson(req)));
  route("PUT", "rules", async (req) => service.setRules(await readJson(req)));

  route("GET", "push/key", () => ({ publicKey: push?.publicKey ?? null }));
  route("POST", "push/subscribe", async (req) => push.subscribe(await readJson(req)));
  route("POST", "push/unsubscribe", async (req) => push.unsubscribe(await readJson(req)));
  route("POST", "push/test", () => push.notifyAll({ title: "Fire Sale", body: "Notifications are on.", tag: "test" }));

  async function serveStatic(pathname, res) {
    let rel;
    try {
      rel = normalize(decodeURIComponent(pathname)).replace(/^[/\\]+/, "");
    } catch {
      return false;
    }
    if (rel.startsWith("..")) return false;
    let file = join(publicDir, rel);
    if (!file.startsWith(publicDir + sep) && file !== publicDir) return false;
    try {
      if ((await stat(file)).isDirectory()) file = join(file, "index.html");
      const data = await readFile(file);
      const ext = extname(file);
      const cache =
        rel === "sw.js" || ext === ".html" || ext === ".webmanifest" ? "no-cache" : "public, max-age=3600";
      send(res, 200, data, { "Content-Type": TYPES[ext] ?? "application/octet-stream", "Cache-Control": cache });
      return true;
    } catch {
      return false;
    }
  }

  return async function handle(req, res) {
    const started = Date.now();
    const { pathname } = new URL(req.url ?? "/", "http://localhost");
    res.on("finish", () => log(`${req.method} ${pathname} ${res.statusCode} ${Date.now() - started}ms`));
    try {
      if (!passcodeOk(req, env.FIRE_SALE_PASSCODE)) {
        send(res, 401, "Passcode required.", { "WWW-Authenticate": 'Basic realm="Fire Sale"' });
        return;
      }
      if (pathname.startsWith("/api/")) {
        if (req.method !== "GET" && !sameOrigin(req)) throw new HttpError(403, "Cross-site request blocked.");
        for (const r of routes) {
          const m = r.method === req.method && pathname.match(r.re);
          if (!m) continue;
          const out = await r.fn(req, res, m.slice(1));
          if (!res.headersSent) json(res, 200, out ?? { ok: true });
          return;
        }
        throw new HttpError(404, "Not found.");
      }
      if (req.method !== "GET" && req.method !== "HEAD") throw new HttpError(405, "Method not allowed.");
      if (await serveStatic(pathname, res)) return;
      const notFound = await readFile(join(publicDir, "404.html")).catch(() => "Not found");
      send(res, 404, notFound, { "Content-Type": TYPES[".html"] });
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      if (status === 500) console.error(err);
      if (!res.headersSent) json(res, status, { error: status === 500 ? "Something went wrong." : err.message });
    }
  };
}
