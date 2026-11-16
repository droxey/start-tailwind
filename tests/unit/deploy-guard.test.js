import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { join } from "node:path";
import { createHandler } from "../../server/http.js";

const root = join(import.meta.dirname, "..", "..");

async function withServer(env, fn) {
  const server = createServer(
    createHandler({
      service: {},
      publicDir: join(root, "public"),
      photosDir: "/tmp",
      push: { publicKey: "test" },
      env,
      log() {},
    }),
  );
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    return await fn(server.address().port);
  } finally {
    server.close();
    await once(server, "close");
  }
}

test("the app serves with no passcode", async () => {
  await withServer({}, async (port) => {
    const home = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(home.status, 200);
    const health = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(health.status, 200);
    assert.equal(await health.text(), "ok");
  });
});

test("a passcode locks the app and leaves the health check open", async () => {
  await withServer({ FIRE_SALE_PASSCODE: "set-in-caprover" }, async (port) => {
    const health = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(health.status, 200);
    assert.equal(await health.text(), "ok");
    const locked = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(locked.status, 401);
    const token = Buffer.from("owner:set-in-caprover").toString("base64");
    const open = await fetch(`http://127.0.0.1:${port}/`, {
      headers: { authorization: `Basic ${token}` },
    });
    assert.equal(open.status, 200);
  });
});
