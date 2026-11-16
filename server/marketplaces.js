// Marketplace service interface. Every adapter has the same shape:
//
//   id, name, issuesLabels, localPickup, feeEstimate(price, method)
//   buildDraft(item)          -> listing payload in the marketplace's own format (no network)
//   publish(item, draft, env) -> { state, note }   (only ever called after a human tap)
//   delist(listing, env)      -> { state, note }
//
// v1 ships eBay listing drafts only. No adapter talks to a network or holds credentials here.
// Real eBay auth (and browser automation for the others) is wired later on the owner's machine.
// Fee numbers are rough planning estimates. Check each marketplace's current fee schedule.

const r2 = (n) => Math.round(n * 100) / 100;

const notWired = (name) => ({
  state: "blocked-on-login",
  note: `${name} is not connected in v1. The draft is saved, so you can copy it in by hand.`,
});

const stub = ({ id, name, issuesLabels, localPickup, fee }) => ({
  id,
  name,
  stub: true,
  issuesLabels,
  localPickup,
  feeEstimate: fee,
  buildDraft: (item) => ({
    marketplace: id,
    title: item.title,
    description: item.description,
    price: item.asking_price,
    condition: item.condition,
    fulfilment: item.fulfilment,
  }),
  publish: async () => notWired(name),
  delist: async () => ({ state: "delist-pending", note: `Delist on ${name} by hand.` }),
});

// eBay: builds an Inventory API style draft (inventory item + offer). Publishing needs OAuth
// that is never stored in this repo, so v1 stops at a saved draft.
const ebay = {
  id: "ebay",
  name: "eBay",
  stub: false,
  issuesLabels: true,
  localPickup: true,
  feeEstimate: (price) => r2(price * 0.1325 + 0.4),
  buildDraft(item) {
    const condition = /new/i.test(item.condition ?? "")
      ? "NEW"
      : /like new|excellent/i.test(item.condition ?? "")
        ? "USED_EXCELLENT"
        : "USED_GOOD";
    return {
      marketplace: "ebay",
      sku: `FS-${item.id}`,
      inventoryItem: {
        product: {
          title: String(item.title ?? "").slice(0, 80),
          description: item.description ?? "",
          imageUrls: [],
        },
        condition,
        conditionDescription: item.condition ?? "",
        availability: { shipToLocationAvailability: { quantity: 1 } },
      },
      offer: {
        format: "FIXED_PRICE",
        marketplaceId: "EBAY_US",
        pricingSummary: { price: { value: String(item.asking_price ?? ""), currency: "USD" } },
        listingPolicies: {
          fulfillmentPolicyId: "SET_ON_OWNER_MACHINE",
          paymentPolicyId: "SET_ON_OWNER_MACHINE",
          returnPolicyId: "SET_ON_OWNER_MACHINE",
        },
        merchantLocationKey: "SET_ON_OWNER_MACHINE",
      },
      note: "Draft only. Photos and policies attach when eBay auth is wired on the owner's machine.",
    };
  },
  // Not implemented in v1 on purpose. Wire the Sell Inventory API on the owner's machine.
  publish: async () => notWired("eBay"),
  delist: async () => ({ state: "delist-pending", note: "End the eBay listing by hand." }),
};

export const MARKETPLACES = {
  ebay,
  swappa: stub({
    id: "swappa",
    name: "Swappa",
    issuesLabels: false,
    localPickup: false,
    fee: (price) => r2(price * 0.03),
  }),
  facebook: stub({
    id: "facebook",
    name: "Facebook Marketplace",
    issuesLabels: true,
    localPickup: true,
    fee: (price, method) => (method === "pickup" ? 0 : r2(Math.max(price * 0.1, 0.8))),
  }),
  offerup: stub({
    id: "offerup",
    name: "OfferUp",
    issuesLabels: true,
    localPickup: true,
    fee: (price, method) => (method === "pickup" ? 0 : r2(Math.max(price * 0.129, 1.99))),
  }),
  mercari: stub({
    id: "mercari",
    name: "Mercari",
    issuesLabels: true,
    localPickup: false,
    fee: (price) => r2(price * 0.1 + 0.5),
  }),
};

export const marketplaceList = () =>
  Object.values(MARKETPLACES).map(({ id, name, stub: isStub, issuesLabels, localPickup }) => ({
    id,
    name,
    stub: isStub,
    issuesLabels,
    localPickup,
  }));

export function getMarketplace(id) {
  return MARKETPLACES[id] ?? null;
}

// Auto negotiation is held until one real sale clears. Same interface slot, no behavior yet.
export const autoNegotiator = {
  enabled: false,
  async respond() {
    return { state: "disabled", note: "Auto negotiation is held for a later version." };
  },
};
