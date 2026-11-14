// Pure decision rules. No I/O here, so every rule is unit-tested in tests/unit/rules.test.js.
// None of these functions publish, sell, ship, or book anything. They only return a decision
// that the caller either logs or places in the confirm queue for a human tap.

export const DEFAULT_RULES = Object.freeze({
  readyThreshold: 0.8,
  declineBelowPct: 0.7,
  autoCutPct: 0.05,
  autoCutAfterDays: 7,
  maxAutoCuts: 1,
});

const DAY_MS = 24 * 60 * 60 * 1000;

const isFiniteNumber = (n) => typeof n === "number" && Number.isFinite(n);
export const roundCents = (n) => Math.round(n * 100) / 100;

export function normalizeRules(input = {}) {
  const rules = { ...DEFAULT_RULES };
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  if (isFiniteNumber(input.readyThreshold)) rules.readyThreshold = clamp(input.readyThreshold, 0.5, 1);
  if (isFiniteNumber(input.declineBelowPct)) rules.declineBelowPct = clamp(input.declineBelowPct, 0, 1);
  if (isFiniteNumber(input.autoCutPct)) rules.autoCutPct = clamp(input.autoCutPct, 0, 0.2);
  if (isFiniteNumber(input.autoCutAfterDays)) {
    rules.autoCutAfterDays = clamp(Math.round(input.autoCutAfterDays), 1, 90);
  }
  // The brief allows one automatic cut. More would remove the human from pricing decisions.
  rules.maxAutoCuts = 1;
  return rules;
}

// Confidence gate. Returns the status a fresh draft gets. "ready-to-publish" is only a label:
// publishing always needs a separate human tap in the confirm queue.
export function gateDraft(confidence, rules = DEFAULT_RULES) {
  if (!isFiniteNumber(confidence) || confidence < 0 || confidence > 1) return "needs-review";
  return confidence >= rules.readyThreshold ? "ready-to-publish" : "needs-review";
}

// A draft may enter the publish queue when it cleared the gate or a human edited it.
export function canQueuePublish(item, rules = DEFAULT_RULES) {
  if (!item || !isFiniteNumber(item.asking_price) || item.asking_price <= 0) return false;
  if (!item.title || !String(item.title).trim()) return false;
  if (item.human_reviewed) return true;
  return gateDraft(item.confidence, rules) === "ready-to-publish";
}

// Offer rules.
//   below declineBelowPct of the ORIGINAL asking price -> auto-decline
//   at or above the current asking price               -> queue for a one-tap human OK
//   anything in between                                -> surface for the human to decide
// Nothing here ever accepts an offer.
export function evaluateOffer(amount, item, rules = DEFAULT_RULES) {
  if (!isFiniteNumber(amount) || amount <= 0) {
    return { action: "reject-invalid", reason: "Offer amount is not a positive number." };
  }
  const original = isFiniteNumber(item?.original_asking) ? item.original_asking : item?.asking_price;
  const asking = item?.asking_price;
  if (!isFiniteNumber(original) || !isFiniteNumber(asking)) {
    return { action: "surface", reason: "No asking price set, so the owner decides." };
  }
  const floor = roundCents(original * rules.declineBelowPct);
  if (amount < floor) {
    return {
      action: "auto-decline",
      reason: `Below ${Math.round(rules.declineBelowPct * 100)}% of the original asking price ($${floor.toFixed(2)}).`,
    };
  }
  if (amount >= asking) {
    return { action: "queue-accept", reason: "At or above asking. Waiting for your one-tap OK." };
  }
  return { action: "surface", reason: "Between the decline floor and asking. Your call." };
}

// Price-cut cadence. Days are counted from listed_at (or the last cut, for later cuts).
//   - fewer than autoCutAfterDays unsold      -> none
//   - first cycle, no automatic cut used yet  -> auto (one 5% cut on the app's suggested price)
//   - each later cycle                        -> propose (queued, needs a human tap)
// The new price never drops below the floor. The decline floor for offers keeps using the
// original asking price, which this function never changes.
export function priceCutDecision(item, now = Date.now(), rules = DEFAULT_RULES) {
  const none = (reason) => ({ action: "none", reason });
  if (!item?.listed_at) return none("Not listed yet.");
  if (["sold", "shipped", "picked-up", "keep", "donate", "trash"].includes(item.status)) {
    return none("Item is no longer for sale.");
  }
  const base = isFiniteNumber(item.suggested_price) ? item.suggested_price : item.asking_price;
  if (!isFiniteNumber(base) || base <= 0) return none("No price to cut.");

  const listedAt = Date.parse(item.listed_at);
  const lastCutAt = item.last_price_cut_at ? Date.parse(item.last_price_cut_at) : listedAt;
  if (!Number.isFinite(listedAt)) return none("Bad listed date.");
  const waitMs = rules.autoCutAfterDays * DAY_MS;
  if (now - lastCutAt < waitMs) return none("Not enough days since listing or the last cut.");

  const floor = isFiniteNumber(item.floor_price) ? item.floor_price : 0;
  const newPrice = Math.max(roundCents(base * (1 - rules.autoCutPct)), floor);
  if (newPrice >= base) return none("Already at the floor.");

  const autoCutsUsed = item.auto_cuts ?? 0;
  if (autoCutsUsed < rules.maxAutoCuts) return { action: "auto", newPrice, from: base };
  return { action: "propose", newPrice, from: base };
}

// Landed net: what actually reaches the owner after marketplace fees and postage.
export function landedNet({ price, fees = 0, postage = 0 }) {
  if (!isFiniteNumber(price)) return 0;
  return roundCents(price - (fees || 0) - (postage || 0));
}

export function targetProgress(target, sales, now = Date.now()) {
  const landed = roundCents(sales.reduce((sum, s) => sum + (s.net || 0), 0));
  const amount = target?.amount > 0 ? target.amount : 0;
  const startedAt = target?.started_at ? Date.parse(target.started_at) : now;
  const deadline = startedAt + (target?.days || 0) * DAY_MS;
  const daysLeft = Math.max(0, Math.ceil((deadline - now) / DAY_MS));
  const remaining = Math.max(0, roundCents(amount - landed));
  return {
    landed,
    amount,
    pct: amount ? Math.min(1, landed / amount) : 0,
    daysLeft,
    remaining,
    perDay: daysLeft ? roundCents(remaining / daysLeft) : remaining,
  };
}
