import { test } from "node:test";
import assert from "node:assert/strict";
import { createDecipheriv, createECDH, createPublicKey, hkdfSync, randomBytes, verify } from "node:crypto";
import { stripJpeg, stripPng } from "../../server/images.js";
import { renderPdf, labelBlocks, SHIP_FROM_PLACEHOLDER, shipFromLines } from "../../server/labels.js";
import { encryptPayload, loadOrCreateVapid, vapidAuthHeader } from "../../server/push.js";

test("push: aes128gcm payload decrypts on the browser side (RFC 8291)", () => {
  const ua = createECDH("prime256v1");
  ua.generateKeys();
  const auth = randomBytes(16);
  const sub = {
    endpoint: "https://push.example.com/abc",
    keys: { p256dh: ua.getPublicKey().toString("base64url"), auth: auth.toString("base64url") },
  };
  const body = encryptPayload(sub, '{"title":"Sale closed"}');

  const salt = body.subarray(0, 16);
  const idlen = body[20];
  const asPublic = body.subarray(21, 21 + idlen);
  const cipher = body.subarray(21 + idlen);
  const shared = ua.computeSecret(asPublic);
  const info = Buffer.concat([Buffer.from("WebPush: info\0"), ua.getPublicKey(), asPublic]);
  const ikm = Buffer.from(hkdfSync("sha256", shared, auth, info, 32));
  const cek = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
  const nonce = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12));
  const d = createDecipheriv("aes-128-gcm", cek, nonce);
  d.setAuthTag(cipher.subarray(-16));
  const plain = Buffer.concat([d.update(cipher.subarray(0, -16)), d.final()]);
  assert.equal(plain.at(-1), 2);
  assert.equal(plain.subarray(0, -1).toString(), '{"title":"Sale closed"}');
});

test("push: VAPID JWT is a valid ES256 signature for the endpoint origin", () => {
  const vapid = loadOrCreateVapid(null);
  const header = vapidAuthHeader("https://push.example.com/send/xyz", vapid, "mailto:owner@example.invalid");
  const [, jwt, k] = header.match(/^vapid t=([^,]+), k=(.+)$/);
  const [h, c, s] = jwt.split(".");
  assert.equal(JSON.parse(Buffer.from(c, "base64url")).aud, "https://push.example.com");
  const raw = Buffer.from(k, "base64url");
  const key = createPublicKey({
    key: { kty: "EC", crv: "P-256", x: raw.subarray(1, 33).toString("base64url"), y: raw.subarray(33).toString("base64url") },
    format: "jwk",
  });
  assert.ok(verify("sha256", Buffer.from(`${h}.${c}`), { key, dsaEncoding: "ieee-p1363" }, Buffer.from(s, "base64url")));
});

test("images: JPEG loses EXIF/GPS (APP1) and comments, keeps image data", () => {
  const exif = Buffer.concat([Buffer.from("Exif\0\0GPS-SECRET")]);
  const app1 = Buffer.concat([Buffer.from([0xff, 0xe1, 0, exif.length + 2]), exif]);
  const com = Buffer.from([0xff, 0xfe, 0, 6, 0x68, 0x69, 0x68, 0x69]);
  const sos = Buffer.from([0xff, 0xda, 0, 2, 1, 2, 3, 0xff, 0xd9]);
  const out = stripJpeg(Buffer.concat([Buffer.from([0xff, 0xd8]), app1, com, sos]));
  assert.equal(out.includes(Buffer.from("GPS-SECRET")), false);
  assert.equal(out.includes(Buffer.from([0xff, 0xfe])), false);
  assert.ok(out.subarray(-5).equals(Buffer.from([1, 2, 3, 0xff, 0xd9])));
  assert.ok(out.includes(Buffer.from([0xff, 0xda])));
});

test("images: PNG loses text and eXIf chunks", () => {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    return Buffer.concat([len, Buffer.from(type), data, Buffer.alloc(4)]);
  };
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", Buffer.alloc(13)),
    chunk("tEXt", Buffer.from("Location\0secret")),
    chunk("eXIf", Buffer.from("gps")),
    chunk("IDAT", Buffer.from([1, 2, 3])),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  const out = stripPng(png);
  assert.equal(out.includes(Buffer.from("secret")), false);
  assert.equal(out.includes(Buffer.from("eXIf")), false);
  assert.ok(out.includes(Buffer.from("IDAT")));
});

test("labels: 4x6 is 288 x 432 pt, narrow is 136 pt wide", () => {
  const blocks = labelBlocks({
    item: { id: 7, title: "Desk lamp" },
    sale: { marketplace: "swappa" },
    shipTo: "Buyer Name\nCity, ST",
    shipFrom: shipFromLines({}),
  });
  const big = renderPdf(blocks, "4x6").toString("latin1");
  const narrow = renderPdf(blocks, "narrow").toString("latin1");
  assert.match(big, /^%PDF-1\.4/);
  assert.match(big, /\/MediaBox \[0 0 288 432\]/);
  assert.match(narrow, /\/MediaBox \[0 0 136 \d+\]/);
  assert.match(big, /%%EOF\n$/);
});

test("labels: ship-from is a runtime placeholder unless injected", () => {
  assert.deepEqual(shipFromLines({}), SHIP_FROM_PLACEHOLDER);
  assert.deepEqual(shipFromLines({ FIRE_SALE_SHIP_FROM: "A | B" }), ["A", "B"]);
});
