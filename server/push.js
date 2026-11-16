// Web Push with no dependencies: VAPID (RFC 8292) and aes128gcm payload encryption (RFC 8291).
// VAPID keys are generated on first run into the git-ignored data folder, never into the repo.

import {
  createECDH,
  createPrivateKey,
  generateKeyPairSync,
  hkdfSync,
  randomBytes,
  createCipheriv,
  sign,
} from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const b64u = (buf) => Buffer.from(buf).toString("base64url");
const fromB64u = (s) => Buffer.from(String(s), "base64url");

export function loadOrCreateVapid(file) {
  if (file && existsSync(file)) return JSON.parse(readFileSync(file, "utf8"));
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const jwk = privateKey.export({ format: "jwk" });
  const vapid = {
    publicKey: b64u(Buffer.concat([Buffer.from([4]), fromB64u(jwk.x), fromB64u(jwk.y)])),
    privateJwk: jwk,
  };
  if (file) writeFileSync(file, JSON.stringify(vapid), { mode: 0o600 });
  return vapid;
}

export function vapidAuthHeader(endpoint, vapid, subject, now = Date.now()) {
  const header = b64u(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const claims = b64u(
    JSON.stringify({
      aud: new URL(endpoint).origin,
      exp: Math.floor(now / 1000) + 12 * 3600,
      sub: subject,
    }),
  );
  const key = createPrivateKey({ key: vapid.privateJwk, format: "jwk" });
  const sig = sign("sha256", Buffer.from(`${header}.${claims}`), {
    key,
    dsaEncoding: "ieee-p1363",
  });
  return `vapid t=${header}.${claims}.${b64u(sig)}, k=${vapid.publicKey}`;
}

// Encrypts one record for a push subscription ({ endpoint, keys: { p256dh, auth } }).
export function encryptPayload(subscription, payload, { salt = randomBytes(16), ecdh } = {}) {
  const uaPublic = fromB64u(subscription.keys.p256dh);
  const authSecret = fromB64u(subscription.keys.auth);
  const server = ecdh ?? createECDH("prime256v1");
  if (!ecdh) server.generateKeys();
  const asPublic = server.getPublicKey();
  const shared = server.computeSecret(uaPublic);

  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, asPublic]);
  const ikm = Buffer.from(hkdfSync("sha256", shared, authSecret, keyInfo, 32));
  const cek = Buffer.from(
    hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16),
  );
  const nonce = Buffer.from(
    hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12),
  );

  const cipher = createCipheriv("aes-128-gcm", cek, nonce);
  const plain = Buffer.concat([Buffer.from(payload), Buffer.from([2])]);
  const body = Buffer.concat([cipher.update(plain), cipher.final(), cipher.getAuthTag()]);

  const rs = Buffer.alloc(4);
  rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, body]);
}

// Sends one notification. Returns "ok", "gone" (subscription expired), or "error".
export async function sendPush(subscription, message, { vapid, subject, fetchImpl = fetch }) {
  const body = encryptPayload(subscription, JSON.stringify(message));
  try {
    const res = await fetchImpl(subscription.endpoint, {
      method: "POST",
      headers: {
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        TTL: "86400",
        Urgency: "high",
        Authorization: vapidAuthHeader(subscription.endpoint, vapid, subject),
      },
      body,
    });
    if (res.status === 404 || res.status === 410) return "gone";
    return res.ok ? "ok" : "error";
  } catch {
    return "error";
  }
}
