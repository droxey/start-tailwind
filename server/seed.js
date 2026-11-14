// Demo data for trying the dashboard. Generic items only: no names, addresses, or photos.

const DAY = 24 * 60 * 60 * 1000;

export function seedDemo(r, now = Date.now()) {
  if (r.all("items").length) return false;
  const at = (daysAgo) => new Date(now - daysAgo * DAY).toISOString();
  r.setSetting("target", { amount: 2500, days: 30, started_at: at(12) });

  const add = (data, daysAgo) =>
    r.insert("items", {
      description: `${data.title}. ${data.condition} condition. Payment through the marketplace checkout only.`,
      price_choice: "mid",
      created_at: at(daysAgo),
      updated_at: at(daysAgo),
      ...data,
    });

  const sold = [
    { title: "Road bike, 54 cm frame", mp: "facebook", price: 340, method: "pickup", days: 11, category: "sports and outdoors" },
    { title: "Noise-cancelling headphones", mp: "ebay", price: 145, method: "ship", days: 9, category: "electronics" },
    { title: "Standing desk frame", mp: "offerup", price: 180, method: "pickup", days: 6, category: "furniture" },
    { title: "Unlocked phone, 128 GB", mp: "swappa", price: 310, method: "ship", days: 4, category: "phone" },
    { title: "Wool winter coat", mp: "mercari", price: 85, method: "ship", days: 2, category: "clothing" },
  ];
  const fees = { ebay: 0.1325, swappa: 0.03, mercari: 0.1, facebook: 0, offerup: 0 };
  for (const s of sold) {
    const id = add(
      {
        title: s.title,
        category: s.category,
        condition: "Good",
        marketplaces: [s.mp],
        status: s.method === "ship" ? "shipped" : "picked-up",
        confidence: 0.9,
        human_reviewed: 1,
        price_mid: s.price,
        price_fast: Math.round(s.price * 0.88),
        suggested_price: s.price,
        asking_price: s.price,
        original_asking: s.price,
        floor_price: Math.round(s.price * 0.7),
        fulfilment: s.method,
        listed_at: at(s.days + 3),
        sold_at: at(s.days),
      },
      s.days + 4,
    );
    const fee = Math.round(s.price * fees[s.mp] * 100) / 100;
    const postage = s.method === "ship" ? 9.5 : 0;
    r.insert("sales", {
      item_id: id,
      title: s.title,
      marketplace: s.mp,
      method: s.method,
      price: s.price,
      fees: fee,
      postage,
      net: Math.round((s.price - fee - postage) * 100) / 100,
      sold_at: at(s.days),
    });
    r.insert("activity", { item_id: id, kind: "sold", message: `Sold for $${s.price}.`, created_at: at(s.days) });
  }

  const listed = add(
    {
      title: "Espresso machine",
      category: "home and kitchen",
      condition: "Like new",
      marketplaces: ["ebay", "facebook"],
      status: "offer-pending",
      confidence: 0.86,
      human_reviewed: 1,
      price_mid: 220,
      price_fast: 195,
      suggested_price: 220,
      asking_price: 220,
      original_asking: 220,
      floor_price: 154,
      fulfilment: "either",
      listed_at: at(5),
    },
    6,
  );
  const offerId = r.insert("offers", {
    item_id: listed,
    marketplace: "ebay",
    amount: 180,
    status: "pending",
    reason: "Between the decline floor and asking. Your call.",
    created_at: at(1),
  });
  r.insert("queue", {
    item_id: listed,
    kind: "review_offer",
    summary: 'Decide on $180.00 for "Espresso machine" on eBay? Between the decline floor and asking. Your call.',
    payload: { offerId, amount: 180, marketplace: "ebay" },
    status: "pending",
    created_at: at(1),
  });

  const ready = add(
    {
      title: "Mirrorless camera body",
      category: "electronics",
      condition: "Like new",
      marketplaces: ["ebay"],
      status: "ready-to-publish",
      confidence: 0.88,
      price_mid: 520,
      price_fast: 460,
      suggested_price: 520,
      asking_price: 520,
      floor_price: 364,
      fulfilment: "ship",
    },
    1,
  );
  r.insert("queue", {
    item_id: ready,
    kind: "publish",
    summary: 'Publish "Mirrorless camera body" on eBay at $520.00?',
    payload: {},
    status: "pending",
    created_at: at(1),
  });

  add(
    {
      title: "Bookcase",
      category: "furniture",
      condition: null,
      marketplaces: ["facebook", "offerup"],
      status: "needs-review",
      confidence: 0.62,
      price_mid: 60,
      price_fast: 53,
      suggested_price: 60,
      asking_price: 60,
      floor_price: 42,
      fulfilment: "pickup",
    },
    0,
  );
  return true;
}
