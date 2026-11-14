import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_RULES,
  canQueuePublish,
  evaluateOffer,
  gateDraft,
  landedNet,
  normalizeRules,
  priceCutDecision,
  targetProgress,
} from "../../server/rules.js";

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.parse("2026-11-01T12:00:00Z");

test("confidence gate: 0.80 and up is ready to publish", () => {
  assert.equal(gateDraft(0.8), "ready-to-publish");
  assert.equal(gateDraft(0.95), "ready-to-publish");
  assert.equal(gateDraft(1), "ready-to-publish");
});

test("confidence gate: below 0.80 needs review", () => {
  assert.equal(gateDraft(0.79), "needs-review");
  assert.equal(gateDraft(0.799999), "needs-review");
  assert.equal(gateDraft(0), "needs-review");
});

test("confidence gate: junk scores fail closed", () => {
  for (const bad of [NaN, -0.1, 1.2, "0.9", null, undefined]) assert.equal(gateDraft(bad), "needs-review");
});

test("confidence gate: only a label, never a publish", () => {
  // gateDraft returns a status string. There is no code path from it to a marketplace.
  assert.equal(typeof gateDraft(0.99), "string");
  assert.notEqual(gateDraft(0.99), "listed");
});

test("publish queue: a reviewed low-confidence draft may queue, an unreviewed one may not", () => {
  const draft = { title: "Lamp", asking_price: 20, confidence: 0.5, human_reviewed: 0 };
  assert.equal(canQueuePublish(draft), false);
  assert.equal(canQueuePublish({ ...draft, human_reviewed: 1 }), true);
  assert.equal(canQueuePublish({ ...draft, confidence: 0.8 }), true);
  assert.equal(canQueuePublish({ ...draft, confidence: 0.9, asking_price: null }), false);
  assert.equal(canQueuePublish({ ...draft, confidence: 0.9, title: " " }), false);
});

const listed = { asking_price: 100, original_asking: 100, floor_price: 60 };

test("offers: below 70% of original asking auto-declines", () => {
  assert.equal(evaluateOffer(69.99, listed).action, "auto-decline");
  assert.equal(evaluateOffer(10, listed).action, "auto-decline");
});

test("offers: exactly 70% of original asking is not auto-declined", () => {
  assert.equal(evaluateOffer(70, listed).action, "surface");
});

test("offers: at or above asking queue for a tap, never auto-accept", () => {
  assert.equal(evaluateOffer(100, listed).action, "queue-accept");
  assert.equal(evaluateOffer(150, listed).action, "queue-accept");
  for (const amount of [100, 150, 1e6]) assert.notEqual(evaluateOffer(amount, listed).action, "accept");
});

test("offers: between the floor and asking surface for the human", () => {
  assert.equal(evaluateOffer(85, listed).action, "surface");
  assert.equal(evaluateOffer(99.99, listed).action, "surface");
});

test("offers: the decline floor stays on the ORIGINAL asking price after a cut", () => {
  const cut = { asking_price: 95, original_asking: 100 };
  // 68 is 71.6% of the current 95, but under 70% of the original 100, so it is declined.
  assert.equal(evaluateOffer(68, cut).action, "auto-decline");
  assert.equal(evaluateOffer(70, cut).action, "surface");
  assert.equal(evaluateOffer(95, cut).action, "queue-accept");
});

test("offers: rules are configurable", () => {
  const rules = normalizeRules({ declineBelowPct: 0.5 });
  assert.equal(evaluateOffer(55, listed, rules).action, "surface");
  assert.equal(evaluateOffer(49, listed, rules).action, "auto-decline");
});

test("offers: bad amounts are rejected", () => {
  for (const bad of [0, -5, NaN, "50"]) assert.equal(evaluateOffer(bad, listed).action, "reject-invalid");
});

const forSale = {
  status: "listed",
  listed_at: new Date(T0).toISOString(),
  suggested_price: 100,
  asking_price: 100,
  floor_price: 50,
  auto_cuts: 0,
  last_price_cut_at: null,
};

test("price cuts: nothing before 7 days unsold", () => {
  assert.equal(priceCutDecision(forSale, T0 + 6 * DAY).action, "none");
  assert.equal(priceCutDecision(forSale, T0 + 7 * DAY - 1).action, "none");
});

test("price cuts: one automatic 5% cut at day 7", () => {
  const d = priceCutDecision(forSale, T0 + 7 * DAY);
  assert.equal(d.action, "auto");
  assert.equal(d.newPrice, 95);
});

test("price cuts: the cut is on the app's suggested price", () => {
  const d = priceCutDecision({ ...forSale, suggested_price: 80, asking_price: 100 }, T0 + 7 * DAY);
  assert.equal(d.newPrice, 76);
});

test("price cuts: after the automatic cut, the next one waits 7 more days", () => {
  const afterAuto = {
    ...forSale,
    suggested_price: 95,
    asking_price: 95,
    auto_cuts: 1,
    last_price_cut_at: new Date(T0 + 7 * DAY).toISOString(),
  };
  assert.equal(priceCutDecision(afterAuto, T0 + 8 * DAY).action, "none");
  assert.equal(priceCutDecision(afterAuto, T0 + 13 * DAY).action, "none");
});

test("price cuts: every later cut is only proposed, never automatic", () => {
  const afterAuto = {
    ...forSale,
    suggested_price: 95,
    asking_price: 95,
    auto_cuts: 1,
    last_price_cut_at: new Date(T0 + 7 * DAY).toISOString(),
  };
  const d = priceCutDecision(afterAuto, T0 + 14 * DAY);
  assert.equal(d.action, "propose");
  assert.equal(d.newPrice, 90.25);
  // Even far in the future, a second automatic cut never happens.
  assert.equal(priceCutDecision(afterAuto, T0 + 300 * DAY).action, "propose");
});

test("price cuts: only one automatic cut even if the rules ask for more", () => {
  assert.equal(normalizeRules({ maxAutoCuts: 5 }).maxAutoCuts, 1);
});

test("price cuts: never below the floor", () => {
  const nearFloor = { ...forSale, suggested_price: 52, asking_price: 52, floor_price: 50 };
  assert.equal(priceCutDecision(nearFloor, T0 + 7 * DAY).newPrice, 50);
  const atFloor = { ...forSale, suggested_price: 50, asking_price: 50, floor_price: 50 };
  assert.equal(priceCutDecision(atFloor, T0 + 7 * DAY).action, "none");
});

test("price cuts: not for unlisted or sold items", () => {
  assert.equal(priceCutDecision({ ...forSale, listed_at: null }, T0 + 30 * DAY).action, "none");
  for (const status of ["sold", "shipped", "picked-up", "keep", "donate", "trash"]) {
    assert.equal(priceCutDecision({ ...forSale, status }, T0 + 30 * DAY).action, "none");
  }
});

test("price cuts: the cadence is configurable", () => {
  const rules = normalizeRules({ autoCutAfterDays: 3, autoCutPct: 0.1 });
  const d = priceCutDecision(forSale, T0 + 3 * DAY, rules);
  assert.deepEqual([d.action, d.newPrice], ["auto", 90]);
});

test("landed net subtracts fees and postage", () => {
  assert.equal(landedNet({ price: 100, fees: 13.65, postage: 9.5 }), 76.85);
  assert.equal(landedNet({ price: 40 }), 40);
});

test("target progress counts landed net, not asking prices", () => {
  const p = targetProgress({ amount: 1000, days: 10, started_at: new Date(T0).toISOString() }, [{ net: 250 }, { net: 150 }], T0 + 4 * DAY);
  assert.equal(p.landed, 400);
  assert.equal(p.pct, 0.4);
  assert.equal(p.daysLeft, 6);
  assert.equal(p.perDay, 100);
});

test("defaults match the brief", () => {
  assert.deepEqual(
    { ...DEFAULT_RULES },
    { readyThreshold: 0.8, declineBelowPct: 0.7, autoCutPct: 0.05, autoCutAfterDays: 7, maxAutoCuts: 1 },
  );
});
