// Fire Sale server. Run: npm start (see README). Zero npm runtime dependencies.
//
// Environment (all optional, see .env.example):
//   PORT, HOST                 where to listen (default 127.0.0.1:8080, local only)
//   FIRE_SALE_DATA             folder for the SQLite file, photos, and VAPID keys (default ./data)
//   FIRE_SALE_DB               SQLite path, or :memory: for a throwaway run
//   FIRE_SALE_PASSCODE         if set, the whole app asks for this passcode (HTTP Basic auth)
//   FIRE_SALE_SEED=demo        fill an empty database with demo items and sales
//   VAPID_SUBJECT              contact for push services, e.g. mailto:you@example.com
//   FIRE_SALE_SHIP_FROM        ship-from lines separated by "|", injected from a vault at runtime

import { mkdirSync } from "node:fs";
import { createServer } from "node:http";
import { join, resolve } from "node:path";
import { openDb, repo } from "./db.js";
import { createHandler } from "./http.js";
import { loadOrCreateVapid, sendPush } from "./push.js";
import { seedDemo } from "./seed.js";
import { createService } from "./service.js";

const root = resolve(import.meta.dirname, "..");
const env = process.env;
const dataDir = resolve(env.FIRE_SALE_DATA ?? join(root, "data"));
const photosDir = join(dataDir, "photos");
mkdirSync(photosDir, { recursive: true });

const dbFile = env.FIRE_SALE_DB ?? join(dataDir, "fire-sale.db");
const db = openDb(dbFile);
const r = repo(db);

const vapid = loadOrCreateVapid(join(dataDir, "vapid.json"));
const subject = env.VAPID_SUBJECT || "mailto:owner@example.invalid";

const push = {
  publicKey: vapid.publicKey,
  subscribe(sub) {
    if (
      !sub?.endpoint ||
      !/^https:\/\//.test(sub.endpoint) ||
      !sub.keys?.p256dh ||
      !sub.keys?.auth
    ) {
      return { ok: false, error: "Bad subscription." };
    }
    db.prepare(
      "INSERT INTO push_subscriptions (endpoint, keys, created_at) VALUES (?, ?, ?) ON CONFLICT(endpoint) DO UPDATE SET keys = excluded.keys",
    ).run(
      sub.endpoint,
      JSON.stringify({ p256dh: sub.keys.p256dh, auth: sub.keys.auth }),
      new Date().toISOString(),
    );
    return { ok: true };
  },
  unsubscribe(sub) {
    db.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").run(
      String(sub?.endpoint ?? ""),
    );
    return { ok: true };
  },
  async notifyAll(message) {
    const subs = r.all("push_subscriptions");
    const results = await Promise.all(
      subs.map(async (s) => {
        const result = await sendPush(s, message, { vapid, subject });
        if (result === "gone") r.remove("push_subscriptions", s.id);
        return result;
      }),
    );
    return { sent: results.filter((x) => x === "ok").length, devices: subs.length };
  },
};

const service = createService({
  repo: r,
  photosDir,
  notify: (message) => push.notifyAll(message).catch(() => {}),
});

if (env.FIRE_SALE_SEED === "demo") seedDemo(r);

const handler = createHandler({ service, publicDir: join(root, "public"), photosDir, push, env });
const port = Number(env.PORT ?? 8080);
const host = env.HOST ?? "127.0.0.1";

createServer(handler).listen(port, host, () => {
  console.log(`Fire Sale running at http://${host === "0.0.0.0" ? "localhost" : host}:${port}/`);
});

// The one automatic action: a single 5% cut after 7 days unsold. Later cuts are only queued.
const tick = () => {
  try {
    service.runPriceCuts();
  } catch (err) {
    console.error("price-cut check failed", err);
  }
};
tick();
setInterval(tick, 60 * 60 * 1000).unref();
