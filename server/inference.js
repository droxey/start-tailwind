// Stubbed AI services. Each one is a single function with a fixed return shape, so a real
// vision model, comps lookup, or scoring rubric can replace it without touching callers.
// The stubs read only the owner's own hint text, interview answers, and photo file names.

const CATALOG = [
  {
    category: "phone",
    re: /\b(iphone|pixel|galaxy|android|phone)\b/i,
    marketplaces: ["swappa", "ebay"],
    fulfilment: "ship",
    base: 260,
  },
  {
    category: "laptop or tablet",
    re: /\b(macbook|laptop|ipad|tablet|chromebook|thinkpad|surface)\b/i,
    marketplaces: ["ebay", "swappa"],
    fulfilment: "ship",
    base: 320,
  },
  {
    category: "electronics",
    re: /\b(camera|lens|headphones?|airpods|speaker|console|switch|playstation|xbox|monitor|drone|watch)\b/i,
    marketplaces: ["ebay", "mercari"],
    fulfilment: "ship",
    base: 120,
  },
  {
    category: "furniture",
    re: /\b(sofa|couch|chair|table|desk|dresser|shelf|bookcase|bed|mattress|cabinet|ottoman)\b/i,
    marketplaces: ["facebook", "offerup"],
    fulfilment: "pickup",
    base: 90,
  },
  {
    category: "clothing",
    re: /\b(jacket|coat|shoes|sneakers|boots|dress|shirt|jeans|bag|purse|hoodie)\b/i,
    marketplaces: ["mercari", "ebay"],
    fulfilment: "ship",
    base: 40,
  },
  {
    category: "home and kitchen",
    re: /\b(lamp|rug|mixer|blender|vacuum|pan|pot|kitchen|decor|mirror|plant stand)\b/i,
    marketplaces: ["facebook", "ebay"],
    fulfilment: "either",
    base: 35,
  },
  {
    category: "sports and outdoors",
    re: /\b(bike|bicycle|tent|kayak|golf|skis?|snowboard|weights|dumbbells?|treadmill)\b/i,
    marketplaces: ["facebook", "ebay"],
    fulfilment: "either",
    base: 110,
  },
];

export const QUESTIONS = [
  { id: "what", label: "What is it? Brand and model help most.", type: "text", required: true },
  {
    id: "condition",
    label: "What condition is it in?",
    type: "choice",
    options: ["New", "Like new", "Good", "Fair", "For parts"],
    required: true,
  },
  {
    id: "fulfilment",
    label: "Ship it, or local pickup only?",
    type: "choice",
    options: ["Ship", "Local pickup", "Either"],
    required: true,
  },
];

const tidy = (s) =>
  String(s ?? "")
    .replace(/\.[a-z0-9]{2,5}$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\b(img|dsc|pxl|photo|image)\s?\d+\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);

const titleCase = (s) => s.replace(/\b\w/g, (c) => c.toUpperCase());

// inferItem({ hint, filenames, answers }) ->
//   { title, description, category, condition, marketplaces, fulfilment, confidence, questions }
// A low-confidence result carries interview questions. The UI asks them, then calls again.
export function inferItem({ hint = "", filenames = [], answers = null } = {}) {
  const what = tidy(answers?.what || hint);
  const source = [what, ...filenames.map(tidy)].filter(Boolean).join(" ");
  const match = CATALOG.find((c) => c.re.test(source));
  const condition = answers?.condition ?? null;
  const fulfilmentAnswer = { Ship: "ship", "Local pickup": "pickup", Either: "either" }[
    answers?.fulfilment
  ];

  let confidence = 0.3;
  if (match) confidence += 0.3;
  if (what.split(" ").length >= 2) confidence += 0.15;
  if (condition) confidence += 0.1;
  if (fulfilmentAnswer) confidence += 0.05;
  confidence = Math.min(0.95, Math.round(confidence * 100) / 100);

  const name = titleCase(what || (match ? match.category : "Unknown item"));
  const condText = condition ? `${condition} condition.` : "Condition not confirmed yet.";
  const answered = Boolean(answers);
  return {
    title: name.slice(0, 80),
    description: `${name}. ${condText} Smoke-free home. Payment through the marketplace checkout only.`,
    category: match?.category ?? "unknown",
    condition,
    marketplaces: match?.marketplaces ?? ["ebay"],
    fulfilment: fulfilmentAnswer ?? match?.fulfilment ?? "ship",
    confidence,
    questions: !answered && confidence < 0.8 ? QUESTIONS : [],
  };
}

// scorePrice(item) -> { mid, fast, comps }
//   mid:  middle of comparable sales (the default suggestion)
//   fast: a higher-confidence price, more likely to sell inside the target window
// Stub until the scoring rubric is supplied. Replace with a real comps lookup.
export function scorePrice({ category = "unknown", condition = null } = {}) {
  const base = CATALOG.find((c) => c.category === category)?.base ?? 50;
  const factor =
    { New: 1.15, "Like new": 1, Good: 0.85, Fair: 0.65, "For parts": 0.35 }[condition] ?? 0.85;
  const mid = Math.max(5, Math.round(base * factor));
  const fast = Math.max(5, Math.round(mid * 0.88));
  return { mid, fast, comps: [], stub: true };
}

// scanPhoto({ filename, clientFlags }) -> [{ id, label }]
// Privacy flags for mail, shipping labels, serial numbers, and faces. The browser adds flags
// from on-device detectors when it has them. Server-side detection is a stub for now.
const PRIVACY = [
  { id: "mail", label: "Mail or an envelope may be in frame", re: /\b(mail|envelope|letter)\b/i },
  {
    id: "label",
    label: "A shipping label or barcode may be in frame",
    re: /\b(label|barcode|usps|ups|fedex)\b/i,
  },
  { id: "serial", label: "A serial number may be visible", re: /\b(serial|imei|s\/n|sn)\b/i },
  { id: "face", label: "A face may be in frame", re: /\b(face|selfie|portrait|me)\b/i },
];
const ALLOWED_CLIENT_FLAGS = new Set(PRIVACY.map((p) => p.id));

export function scanPhoto({ filename = "", clientFlags = [] } = {}) {
  const name = tidy(filename);
  const ids = new Set(PRIVACY.filter((p) => p.re.test(name)).map((p) => p.id));
  for (const f of clientFlags) if (ALLOWED_CLIENT_FLAGS.has(f)) ids.add(f);
  return PRIVACY.filter((p) => ids.has(p.id)).map(({ id, label }) => ({ id, label }));
}
