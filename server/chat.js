// Buyer-chat drafting. Buyer text is untrusted: it is only pattern-matched, never executed,
// never used to change rules, and never echoed into a reply. The drafter can only return
// a draft reply plus intents. Sales, shipping, and pickups always go to the confirm queue.

import { evaluateOffer } from "./rules.js";

const RED_FLAGS = [
  {
    id: "off-platform-payment",
    label: "Asks to pay off-platform",
    re: /\b(zelle|venmo|cash\s?app|paypal|wire transfer|western union|moneygram|gift ?cards?|bitcoin|crypto|usdt|cashier'?s check|money order|e-?check|bank transfer)\b/i,
  },
  {
    id: "courier",
    label: "Courier or third-party pickup story",
    re: /\b(courier|my (mover|agent|driver|assistant) will|shipping agent|someone (else )?will (come|pick)|send(ing)? (a|my) (driver|uber))\b/i,
  },
  {
    id: "overpayment",
    label: "Overpayment or refund-the-difference",
    re: /\b(overpa(y|id)|pay (you )?(extra|more)|send (back|me) the (difference|rest)|refund the (difference|extra))\b/i,
  },
  {
    id: "payment-proof",
    label: "Payment screenshot as proof",
    re: /\b(screenshot|proof of payment|payment (confirmation|receipt) (attached|sent)|check your (email|spam) for (the )?payment)\b/i,
  },
  {
    id: "off-platform-contact",
    label: "Wants to move off the marketplace",
    re: /\b(text me|email me|whatsapp|telegram|signal me|my number is|contact me (at|on))\b/i,
  },
  {
    id: "verification-code",
    label: "Asks for a verification code",
    re: /\b(verification|verify|google voice|6[- ]digit) code\b/i,
  },
  {
    id: "injection",
    label: "Tries to give the app instructions",
    re: /\b((ignore|forget|disregard|bypass) (all|any|previous|prior|the above|the|your|my)\b.{0,20}\b(rules|instructions|prompt|settings|limits)|ignore (all|any|previous|prior|the above)|disregard (the|your|all)|system prompt|you are now|new (rules|instructions)|act as|developer mode|override)\b/i,
  },
];

const SCAM_FLAGS = new Set([
  "off-platform-payment",
  "courier",
  "overpayment",
  "payment-proof",
  "verification-code",
  "injection",
]);

const ADDRESS_REQUEST =
  /\b(your|ur|the) (home |exact |full |street )?address\b|\bwhere (do you live|are you located|exactly)\b|\bsend (me )?(your )?(location|address)\b/i;

const INTENTS = [
  {
    id: "buy",
    re: /\b(i'?ll take it|i want (it|to buy)|ready to (buy|pay)|buy (it )?now|deal\b|sold\b)/i,
  },
  {
    id: "pickup",
    re: /\b(pick ?up|meet (up)?|come (by|get)|local(ly)?|in person|today|tonight|tomorrow)\b/i,
  },
  { id: "ship", re: /\b(ship(ping|ped)?|deliver(y)?|mail it|send it)\b/i },
  { id: "available", re: /\b(still )?(available|for sale|have it)\b/i },
  {
    id: "condition",
    re: /\b(condition|scratch(es)?|damage|work(s|ing)?|defect|battery|wear|flaw)/i,
  },
  { id: "dimensions", re: /\b(size|dimension|measure|how (big|tall|wide|heavy)|weight)\b/i },
];

const MONEY =
  /\$\s?(\d{1,6}(?:[.,]\d{1,2})?)|\b(\d{1,6}(?:\.\d{1,2})?)\s?(?:dollars|bucks|usd)\b|\b(?:take|do|offer|give you|accept|for)\s+\$?(\d{1,6}(?:\.\d{1,2})?)\b/i;

export function analyzeBuyerMessage(text) {
  const clean = String(text ?? "")
    .slice(0, 2000)
    .replace(/(?![\t\n\r])\p{Cc}/gu, " ");
  const flags = RED_FLAGS.filter((f) => f.re.test(clean)).map(({ id, label }) => ({ id, label }));
  if (ADDRESS_REQUEST.test(clean)) {
    flags.push({ id: "address-request", label: "Asks for a private address" });
  }
  const intents = INTENTS.filter((i) => i.re.test(clean)).map((i) => i.id);
  const m = clean.match(MONEY);
  const raw = m ? (m[1] ?? m[2] ?? m[3]) : null;
  const offer = raw ? Number(raw.replace(",", ".")) : null;
  return { text: clean, flags, intents, offer: Number.isFinite(offer) && offer > 0 ? offer : null };
}

const money = (n) => `$${Number(n).toFixed(2).replace(/\.00$/, "")}`;

// Builds a draft reply from fixed templates and the item's own fields. Never includes buyer
// text or an address. Returns which actions must go to the confirm queue (hard stop).
export function draftReply(item, analysis, rules) {
  const lines = [];
  const queue = [];
  let needsOwner = false;
  let offerDecision = null;
  const flagIds = new Set(analysis.flags.map((f) => f.id));
  // A message with scam or injection signals never produces a queued offer or sale step.
  const risky = analysis.flags.some((f) => SCAM_FLAGS.has(f.id));

  if (
    flagIds.has("off-platform-payment") ||
    flagIds.has("payment-proof") ||
    flagIds.has("overpayment")
  ) {
    lines.push(
      "I only take payment through the marketplace checkout, or cash at a confirmed in-person handoff. I can't accept other payment methods, screenshots, or overpayments.",
    );
  }
  if (flagIds.has("courier")) lines.push("I don't hand items to couriers or third parties.");
  if (flagIds.has("off-platform-contact") || flagIds.has("verification-code")) {
    lines.push("Let's keep all messages here in the marketplace app.");
  }
  if (flagIds.has("address-request")) {
    lines.push(
      "I share a handoff spot only after a confirmed sale, and it's always a public place.",
    );
  }

  // Risky replies stop at the safety lines: no price talk and no next step to act on.
  if (risky) {
    lines.push("If you'd like it, please buy through the listing's checkout.");
    return {
      draft: lines.join(" "),
      queue: [],
      needsOwner: false,
      offerDecision: null,
      risky: true,
    };
  }

  if (analysis.offer !== null) {
    offerDecision = evaluateOffer(analysis.offer, item, rules);
    if (offerDecision.action === "auto-decline") {
      lines.push(
        `Thanks for the offer, but I can't go that low. The price is ${money(item.asking_price)}.`,
      );
    } else if (offerDecision.action === "queue-accept") {
      lines.push(`Thanks! Let me confirm ${money(analysis.offer)} and get right back to you.`);
      queue.push("accept_offer");
    } else {
      lines.push("Thanks for the offer. Let me think it over and get back to you shortly.");
      queue.push("review_offer");
    }
  }

  const has = (id) => analysis.intents.includes(id);
  if (has("available") && analysis.offer === null) {
    lines.push(`Yes, it's still available at ${money(item.asking_price)}.`);
  }
  if (has("condition")) {
    if (item.condition) lines.push(`Condition: ${item.condition}.`);
    else needsOwner = true;
  }
  if (has("dimensions")) needsOwner = true;
  if (has("buy") && analysis.offer === null) {
    lines.push("Great. Let me confirm and I'll get right back to you.");
    queue.push("accept_offer");
  }
  if (has("pickup") && (has("buy") || analysis.offer !== null)) {
    queue.push("book_pickup");
  } else if (has("pickup") && item.fulfilment === "ship") {
    lines.push("This one ships only.");
  }
  if (has("ship") && (has("buy") || analysis.offer !== null) && item.fulfilment !== "pickup") {
    queue.push("ship");
  } else if (has("ship") && item.fulfilment === "pickup") {
    lines.push("This one is local pickup only.");
  }

  if (!lines.length && !queue.length) needsOwner = true;
  if (needsOwner) lines.push("Good question. Let me check and get back to you.");

  return {
    draft: lines.join(" "),
    queue: [...new Set(queue)],
    needsOwner,
    offerDecision,
    risky: false,
  };
}

// Outbound guard: the owner's reply must not leak an address or unit number, or move payment
// off-platform. Returns a list of problems. An empty list means the text may be sent.
const STREET =
  /\b\d{1,6}\s+(?:[A-Za-z0-9.'-]+\s+){0,4}(street|st|avenue|ave|road|rd|boulevard|blvd|lane|ln|drive|dr|court|ct|way|place|pl|terrace|ter|circle|cir|parkway|pkwy|highway|hwy)\b/i;
const UNIT = /\b(apt|apartment|unit|suite|ste|flat)\b\.?\s*#?\s*[A-Za-z0-9-]+|#\s?\d+[A-Za-z]?\b/i;
const ZIP = /\b\d{5}(?:-\d{4})?\b/;
// Real ship-from forms are assembled at runtime so this file never contains them as literals.
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const HOME_UNIT = ["A", "207"].join("");
const HOME_STREET = ["21", "East"].join(" ");
const HOME_UNIT_RE = new RegExp(escapeRe(HOME_UNIT), "i");
const HOME_STREET_RE = new RegExp(
  String.raw`\b${escapeRe(HOME_STREET)}(?:\s+(?:street|st))?\b`,
  "i",
);
// meet/pickup/door/building near a letter+digits token. A lone "Building A" (public handoff
// point) has no digits and is allowed; the same phrase paired with the unit token is not.
const HANDOFF_UNIT =
  /\b(?:meet(?:\s+me)?(?:\s+at)?|pick\s*up|pickup|door|building)\b[\s\S]{0,40}\b[A-Za-z]+\d+[A-Za-z0-9-]*\b|\b[A-Za-z]+\d+[A-Za-z0-9-]*\b[\s\S]{0,40}\b(?:meet(?:\s+me)?(?:\s+at)?|pick\s*up|pickup|door|building)\b/i;

export function outboundProblems(text) {
  const t = String(text ?? "");
  const problems = [];
  if (STREET.test(t) || HOME_STREET_RE.test(t)) problems.push("Looks like a street address.");
  if (UNIT.test(t) || HOME_UNIT_RE.test(t) || HANDOFF_UNIT.test(t)) {
    problems.push("Looks like an apartment or unit number.");
  }
  if (ZIP.test(t) && (STREET.test(t) || HOME_STREET_RE.test(t))) {
    problems.push("Contains a ZIP code with an address.");
  }
  if (RED_FLAGS[0].re.test(t)) problems.push("Mentions an off-platform payment method.");
  return problems;
}
