// Business logic. The HTTP layer (http.js) is a thin wrapper around these methods.
//
// Hard rule: nothing here lists, sells, ships, buys, books, or reveals anything on its own.
// The app only creates drafts and confirm-queue entries. The one path that acts is approve(),
// and that is only reachable from a human tap on the Confirm queue.

import { randomBytes } from "node:crypto";
import { unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { analyzeBuyerMessage, draftReply, outboundProblems } from "./chat.js";
import { stripMetadata } from "./images.js";
import { inferItem, QUESTIONS, scanPhoto, scorePrice } from "./inference.js";
import { getMarketplace, marketplaceList, MARKETPLACES } from "./marketplaces.js";
import {
  canQueuePublish,
  evaluateOffer,
  gateDraft,
  landedNet,
  normalizeRules,
  priceCutDecision,
  roundCents,
  targetProgress,
} from "./rules.js";

export const STATUSES = [
  "draft",
  "needs-review",
  "ready-to-publish",
  "listed",
  "offer-pending",
  "sold",
  "shipped",
  "picked-up",
  "blocked-on-login",
  "keep",
  "donate",
  "trash",
  "unknown-location",
];

export const QUEUE_KINDS = {
  publish: "Publish listing",
  accept_offer: "Accept offer",
  review_offer: "Decide on offer",
  ship: "Ship",
  buy_label: "Buy a label",
  book_pickup: "Book a pickup",
  reveal_location: "Reveal handoff spot",
  price_cut: "Price cut",
};

const FULFILMENT = ["ship", "pickup", "either"];
const PRE_LISTING = ["draft", "needs-review", "ready-to-publish"];
const SOLD_STATES = ["sold", "shipped", "picked-up"];

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const bad = (msg) => new HttpError(400, msg);
const money = (n) => `$${Number(n).toFixed(2)}`;
const num = (v) => (v === "" || v === null || v === undefined ? null : Number(v));
const text = (v, max) =>
  String(v ?? "")
    .replace(/(?![\t\n\r])\p{Cc}/gu, "")
    .trim()
    .slice(0, max);

export function createService({
  repo: r,
  photosDir = null,
  now = () => Date.now(),
  notify = async () => {},
}) {
  const iso = () => new Date(now()).toISOString();
  const rules = () => normalizeRules(r.setting("rules", {}));

  const log = (itemId, kind, message) =>
    r.insert("activity", { item_id: itemId, kind, message, created_at: iso() });

  const item = (id) => {
    const it = r.get("items", Number(id));
    if (!it) throw new HttpError(404, "Item not found.");
    return it;
  };

  function enqueue(itemId, kind, summary, payload = {}) {
    const existing = r.all("queue", "item_id = ? AND kind = ? AND status = 'pending'", [
      itemId,
      kind,
    ]);
    if (existing.length) return existing[0].id;
    const id = r.insert("queue", {
      item_id: itemId,
      kind,
      summary,
      payload,
      status: "pending",
      created_at: iso(),
    });
    log(itemId, "queue", `Waiting for your OK: ${QUEUE_KINDS[kind]}.`);
    return id;
  }

  function cancelPending(itemId, kinds) {
    for (const q of r.all("queue", "item_id = ? AND status = 'pending'", [itemId])) {
      if (kinds.includes(q.kind))
        r.update("queue", q.id, { status: "cancelled", decided_at: iso() });
    }
  }

  function queuePublishIfReady(it) {
    if (it.status === "ready-to-publish" && canQueuePublish(it, rules())) {
      const names = it.marketplaces.map((m) => getMarketplace(m)?.name ?? m).join(", ");
      enqueue(it.id, "publish", `Publish "${it.title}" on ${names} at ${money(it.asking_price)}?`);
    }
  }

  // ---------- photos and drafts ----------

  function savePhoto(buffer, originalName = "", clientFlags = []) {
    if (!buffer?.length) throw bad("Empty upload.");
    if (buffer.length > 15 * 1024 * 1024) throw new HttpError(413, "Photo is over 15 MB.");
    let clean;
    try {
      clean = stripMetadata(buffer);
    } catch {
      throw bad("That file could not be read as a photo.");
    }
    if (!clean) throw new HttpError(415, "Only JPEG and PNG photos are accepted.");
    const ext = clean.type === "image/png" ? "png" : "jpg";
    const file = `${randomBytes(12).toString("hex")}.${ext}`;
    if (photosDir) writeFileSync(join(photosDir, file), clean.data);
    const name = text(originalName, 120);
    const flags = scanPhoto({ filename: name, clientFlags });
    const id = r.insert("photos", {
      file,
      mime: clean.type,
      original_name: name,
      flags,
      created_at: iso(),
    });
    return { id, flags };
  }

  function createDraft({ photoIds = [], hint = "" } = {}) {
    const ids = [...new Set(photoIds.map(Number))].filter(Number.isInteger).slice(0, 12);
    const photos = ids.map((id) => r.get("photos", id)).filter((p) => p && !p.item_id);
    if (!photos.length) throw bad("Upload at least one photo first.");
    const inf = inferItem({ hint: text(hint, 200), filenames: photos.map((p) => p.original_name) });
    const flags = [...new Map(photos.flatMap((p) => p.flags).map((f) => [f.id, f])).values()];
    return r.tx(() => {
      const id = insertItemFromInference(inf, { flags });
      for (const p of photos) r.update("photos", p.id, { item_id: id });
      log(
        id,
        "draft",
        `Draft created from ${photos.length} photo(s). Confidence ${inf.confidence.toFixed(2)}.`,
      );
      if (flags.length)
        log(id, "privacy", `Check before listing: ${flags.map((f) => f.label).join(". ")}.`);
      const it = item(id);
      queuePublishIfReady(it);
      return it;
    });
  }

  function insertItemFromInference(inf, { flags = [] } = {}) {
    const price = scorePrice(inf);
    const status = inf.questions.length ? "draft" : gateDraft(inf.confidence, rules());
    return r.insert("items", {
      title: inf.title,
      description: inf.description,
      category: inf.category,
      condition: inf.condition,
      marketplaces: inf.marketplaces,
      status,
      confidence: inf.confidence,
      price_mid: price.mid,
      price_fast: price.fast,
      price_choice: "mid",
      suggested_price: price.mid,
      asking_price: price.mid,
      floor_price: roundCents(price.mid * rules().declineBelowPct),
      fulfilment: inf.fulfilment,
      privacy_flags: flags,
      questions: inf.questions,
      created_at: iso(),
      updated_at: iso(),
    });
  }

  function answerDraft(id, answers = {}) {
    const it = item(id);
    if (!it.questions?.length) throw bad("This draft has no open questions.");
    const clean = {};
    for (const q of QUESTIONS) {
      const v = text(answers[q.id], 200);
      if (q.required && !v) throw bad(`Please answer: ${q.label}`);
      if (q.type === "choice" && !q.options.includes(v))
        throw bad(`Pick one option for: ${q.label}`);
      clean[q.id] = v;
    }
    const photos = r.all("photos", "item_id = ?", [it.id]);
    const inf = inferItem({ filenames: photos.map((p) => p.original_name), answers: clean });
    const price = scorePrice(inf);
    const status = gateDraft(inf.confidence, rules());
    r.update("items", it.id, {
      title: inf.title,
      description: inf.description,
      category: inf.category,
      condition: inf.condition,
      marketplaces: inf.marketplaces,
      fulfilment: inf.fulfilment,
      confidence: inf.confidence,
      status,
      questions: [],
      price_mid: price.mid,
      price_fast: price.fast,
      suggested_price: price.mid,
      asking_price: price.mid,
      floor_price: roundCents(price.mid * rules().declineBelowPct),
      updated_at: iso(),
    });
    log(
      it.id,
      "draft",
      `Drafted from your answers. Confidence ${inf.confidence.toFixed(2)}, ${status.replace(/-/g, " ")}.`,
    );
    const fresh = item(it.id);
    queuePublishIfReady(fresh);
    return fresh;
  }

  function createItem(data = {}) {
    const title = text(data.title, 120);
    if (!title) throw bad("Give the item a title.");
    const inf = { ...inferItem({ hint: title }), questions: [] };
    const id = insertItemFromInference({ ...inf, title });
    log(id, "draft", "Item added by hand.");
    return updateItem(id, { ...data, title });
  }

  // ---------- edits ----------

  function updateItem(id, patch = {}) {
    const it = item(id);
    const set = {};
    const notes = [];
    let contentEdit = false;

    if ("title" in patch) {
      const v = text(patch.title, 120);
      if (!v) throw bad("Title can't be empty.");
      if (v !== it.title) {
        set.title = v;
        contentEdit = true;
        notes.push("Title edited.");
      }
    }
    if ("description" in patch) {
      const v = text(patch.description, 4000);
      if (v !== it.description) {
        set.description = v;
        contentEdit = true;
        notes.push("Description edited.");
      }
    }
    if ("condition" in patch) {
      const v = text(patch.condition, 60) || null;
      if (v !== it.condition) {
        set.condition = v;
        contentEdit = true;
        notes.push(`Condition: ${v ?? "not set"}.`);
      }
    }
    if ("fulfilment" in patch) {
      if (!FULFILMENT.includes(patch.fulfilment)) throw bad("Pick ship, pickup, or either.");
      if (patch.fulfilment !== it.fulfilment) {
        set.fulfilment = patch.fulfilment;
        contentEdit = true;
        notes.push(`Fulfilment: ${patch.fulfilment}.`);
      }
    }
    if ("marketplaces" in patch) {
      const list = [...new Set([].concat(patch.marketplaces).filter((m) => MARKETPLACES[m]))];
      if (!list.length) throw bad("Pick at least one marketplace.");
      set.marketplaces = list;
      contentEdit = true;
      notes.push(`Marketplaces: ${list.map((m) => MARKETPLACES[m].name).join(", ")}.`);
    }
    if ("price_choice" in patch) {
      if (!["mid", "fast"].includes(patch.price_choice)) throw bad("Pick mid or fast.");
      if (patch.price_choice !== it.price_choice) {
        const next = patch.price_choice === "fast" ? it.price_fast : it.price_mid;
        set.price_choice = patch.price_choice;
        set.suggested_price = next;
        if (!("asking_price" in patch)) set.asking_price = next;
        contentEdit = true;
      }
    }
    if ("asking_price" in patch) {
      const v = num(patch.asking_price);
      if (!Number.isFinite(v) || v <= 0 || v > 1_000_000)
        throw bad("Asking price must be a positive number.");
      set.asking_price = roundCents(v);
      contentEdit = true;
    }
    if ("floor_price" in patch) {
      const v = num(patch.floor_price);
      if (v !== null && (!Number.isFinite(v) || v < 0)) throw bad("Floor must be zero or more.");
      set.floor_price = v === null ? null : roundCents(v);
      contentEdit = true;
      notes.push(`Floor set to ${v === null ? "none" : money(v)}.`);
    }
    if ("asking_price" in set && set.asking_price !== it.asking_price) {
      notes.push(`Price change: ${money(it.asking_price ?? 0)} to ${money(set.asking_price)}.`);
    }

    let status = it.status;
    if ("status" in patch && patch.status !== it.status) {
      const s = patch.status;
      if (!STATUSES.includes(s)) throw bad("Unknown status.");
      if (s === "sold") throw bad("Use the Sold button so the sale and fees are recorded.");
      if ((s === "shipped" || s === "picked-up") && !SOLD_STATES.includes(it.status)) {
        throw bad("Mark the item sold first.");
      }
      if (
        s === "ready-to-publish" &&
        !it.human_reviewed &&
        !contentEdit &&
        !canQueuePublish(it, rules())
      ) {
        throw bad("Edit the draft first. It is below the confidence gate.");
      }
      status = s;
      notes.push(`Status: ${it.status} to ${s}.`);
      if (s === "listed") {
        if (!it.listed_at) set.listed_at = iso();
        if (it.original_asking === null) set.original_asking = set.asking_price ?? it.asking_price;
      }
    }
    // Any human edit of a draft counts as the review the confidence gate asks for.
    if (contentEdit && PRE_LISTING.includes(it.status) && status === it.status) {
      set.human_reviewed = 1;
      set.questions = [];
      status = "ready-to-publish";
    }
    if (status !== it.status) set.status = status;
    if (!Object.keys(set).length) return it;
    set.updated_at = iso();
    r.update("items", it.id, set);
    for (const n of notes) log(it.id, n.startsWith("Price") ? "price" : "edit", n);
    if (status !== "ready-to-publish") cancelPending(it.id, ["publish"]);
    const fresh = item(it.id);
    queuePublishIfReady(fresh);
    return fresh;
  }

  function deleteItem(id) {
    const it = item(id);
    for (const p of r.all("photos", "item_id = ?", [it.id])) {
      if (photosDir) {
        try {
          unlinkSync(join(photosDir, p.file));
        } catch {
          // already gone
        }
      }
      r.remove("photos", p.id);
    }
    r.remove("items", it.id);
  }

  // ---------- offers, sales, delist ----------

  function addOffer(itemId, { amount, marketplace } = {}) {
    const it = item(itemId);
    const value = num(amount);
    const mp = MARKETPLACES[marketplace] ? marketplace : it.marketplaces[0];
    const decision = evaluateOffer(value, it, rules());
    if (decision.action === "reject-invalid") throw bad(decision.reason);
    if (SOLD_STATES.includes(it.status)) throw bad("This item is already sold.");
    const status = decision.action === "auto-decline" ? "auto-declined" : "pending";
    const offerId = r.insert("offers", {
      item_id: it.id,
      marketplace: mp,
      amount: roundCents(value),
      status,
      reason: decision.reason,
      created_at: iso(),
    });
    log(
      it.id,
      "offer",
      `Offer ${money(value)} on ${MARKETPLACES[mp].name}: ${status === "auto-declined" ? "auto-declined. " : ""}${decision.reason}`,
    );
    if (decision.action !== "auto-decline") {
      const kind = decision.action === "queue-accept" ? "accept_offer" : "review_offer";
      r.insert("queue", {
        item_id: it.id,
        kind,
        summary: `${kind === "accept_offer" ? "Accept" : "Decide on"} ${money(value)} for "${it.title}" on ${MARKETPLACES[mp].name}? ${decision.reason}`,
        payload: { offerId, amount: roundCents(value), marketplace: mp },
        status: "pending",
        created_at: iso(),
      });
      if (it.status === "listed")
        r.update("items", it.id, { status: "offer-pending", updated_at: iso() });
    }
    return { offerId, decision };
  }

  function recordSale(it, { price, marketplace, postage = 0, method }) {
    const value = num(price);
    if (!Number.isFinite(value) || value <= 0) throw bad("Sale price must be a positive number.");
    if (SOLD_STATES.includes(it.status)) throw bad("This item is already sold.");
    const mp = MARKETPLACES[marketplace] ? marketplace : it.marketplaces[0];
    const how =
      method === "pickup" || (method !== "ship" && it.fulfilment === "pickup") ? "pickup" : "ship";
    const fees = getMarketplace(mp).feeEstimate(value, how);
    const post = how === "pickup" ? 0 : Math.max(0, num(postage) || 0);
    const net = landedNet({ price: value, fees, postage: post });
    r.insert("sales", {
      item_id: it.id,
      title: it.title,
      marketplace: mp,
      method: how,
      price: roundCents(value),
      fees,
      postage: post,
      net,
      sold_at: iso(),
    });
    r.update("items", it.id, { status: "sold", sold_at: iso(), updated_at: iso() });
    log(
      it.id,
      "sold",
      `Sold on ${MARKETPLACES[mp].name} for ${money(value)}. Landed net ${money(net)}.`,
    );
    cancelPending(it.id, ["publish", "price_cut", "accept_offer", "review_offer"]);
    for (const o of r.all("offers", "item_id = ? AND status = 'pending'", [it.id])) {
      r.update("offers", o.id, { status: "closed", decided_at: iso() });
    }
    // Cross-post delist-on-sale, so the item can't sell twice.
    for (const l of r.all("listings", "item_id = ? AND marketplace != ?", [it.id, mp])) {
      if (["delisted", "delist-pending"].includes(l.state)) continue;
      r.update("listings", l.id, {
        state: "delist-pending",
        note: "Sold elsewhere. Delist now.",
        updated_at: iso(),
      });
      log(it.id, "delist", `${MARKETPLACES[l.marketplace].name} cross-post marked for delist.`);
    }
    if (how === "ship") {
      if (MARKETPLACES[mp].issuesLabels) {
        enqueue(
          it.id,
          "ship",
          `Ship "${it.title}". Print ${MARKETPLACES[mp].name}'s own label, pack it, and confirm shipped.`,
          { marketplace: mp },
        );
      } else {
        enqueue(
          it.id,
          "buy_label",
          `Buy a shipping label for "${it.title}"? ${MARKETPLACES[mp].name} does not issue one.`,
          { marketplace: mp },
        );
      }
    } else {
      enqueue(
        it.id,
        "book_pickup",
        `Book a pickup for "${it.title}"? Cash at a confirmed handoff, or paid in-app.`,
        { marketplace: mp },
      );
    }
    notify({
      title: "Sale closed",
      body: `${it.title} sold for ${money(value)}. Net ${money(net)}.`,
      tag: `sale-${it.id}`,
    });
  }

  function markSold(itemId, data = {}) {
    const it = item(itemId);
    return r.tx(() => {
      recordSale(it, data);
      return item(it.id);
    });
  }

  // ---------- confirm queue ----------

  async function approve(queueId) {
    const q = r.get("queue", Number(queueId));
    if (!q || q.status !== "pending")
      throw new HttpError(404, "That request is no longer waiting.");
    const it = q.item_id ? item(q.item_id) : null;
    const done = (note) => {
      r.update("queue", q.id, { status: "approved", decided_at: iso() });
      if (it) log(it.id, "approved", `You approved: ${QUEUE_KINDS[q.kind]}. ${note}`);
    };

    switch (q.kind) {
      case "publish": {
        if (!canQueuePublish(it, rules())) throw bad("This draft still needs review.");
        const results = [];
        for (const mp of it.marketplaces) {
          const adapter = getMarketplace(mp);
          const draft = adapter.buildDraft(it);
          const result = await adapter.publish(it, draft);
          const existing = r.all("listings", "item_id = ? AND marketplace = ?", [it.id, mp])[0];
          const row = { state: result.state, payload: draft, note: result.note, updated_at: iso() };
          if (existing) r.update("listings", existing.id, row);
          else r.insert("listings", { item_id: it.id, marketplace: mp, created_at: iso(), ...row });
          results.push(result);
        }
        const live = results.some((x) => x.state === "listed");
        r.update("items", it.id, {
          status: live ? "listed" : "blocked-on-login",
          listed_at: live ? iso() : it.listed_at,
          original_asking: it.original_asking ?? it.asking_price,
          updated_at: iso(),
        });
        done(results.map((x) => x.note).join(" "));
        break;
      }
      case "accept_offer":
      case "review_offer": {
        const offer = r.get("offers", q.payload.offerId);
        if (offer) r.update("offers", offer.id, { status: "accepted", decided_at: iso() });
        r.update("queue", q.id, { status: "approved", decided_at: iso() });
        log(it.id, "approved", `You accepted ${money(q.payload.amount)}.`);
        recordSale(it, { price: q.payload.amount, marketplace: q.payload.marketplace });
        return { ok: true };
      }
      case "ship":
        r.update("items", it.id, { status: "shipped", updated_at: iso() });
        done("Marked shipped.");
        break;
      case "buy_label":
        done("Buy postage on the carrier or marketplace site. v1 never buys postage.");
        enqueue(
          it.id,
          "ship",
          `Ship "${it.title}". Print the label, pack it, and confirm shipped.`,
        );
        break;
      case "book_pickup":
        done("Pickup booked.");
        enqueue(
          it.id,
          "reveal_location",
          `Share the handoff spot for "${it.title}" with the buyer? Use a public place.`,
        );
        break;
      case "reveal_location":
        done("You can share the handoff spot now. Mark it picked up after the handoff.");
        break;
      case "price_cut": {
        const from = it.suggested_price;
        const follows = it.asking_price === from;
        r.update("items", it.id, {
          suggested_price: q.payload.newPrice,
          asking_price: follows ? q.payload.newPrice : it.asking_price,
          last_price_cut_at: iso(),
          updated_at: iso(),
        });
        done(`Price change: ${money(from)} to ${money(q.payload.newPrice)}.`);
        break;
      }
      default:
        throw bad("Unknown request type.");
    }
    return { ok: true };
  }

  function reject(queueId) {
    const q = r.get("queue", Number(queueId));
    if (!q || q.status !== "pending")
      throw new HttpError(404, "That request is no longer waiting.");
    r.update("queue", q.id, { status: "rejected", decided_at: iso() });
    if (q.payload?.offerId)
      r.update("offers", q.payload.offerId, { status: "declined", decided_at: iso() });
    if (q.kind === "price_cut") r.update("items", q.item_id, { last_price_cut_at: iso() });
    if (q.item_id) {
      log(q.item_id, "rejected", `You said no: ${QUEUE_KINDS[q.kind]}.`);
      const it = r.get("items", q.item_id);
      const stillPending = r.all(
        "queue",
        "item_id = ? AND status = 'pending' AND kind IN ('accept_offer','review_offer')",
        [q.item_id],
      );
      if (it?.status === "offer-pending" && !stillPending.length) {
        r.update("items", it.id, { status: "listed", updated_at: iso() });
      }
    }
    return { ok: true };
  }

  // ---------- price cuts (runs on a timer) ----------

  function runPriceCuts() {
    const out = [];
    for (const it of r.all("items", "status IN ('listed', 'offer-pending', 'blocked-on-login')")) {
      if (!it.listed_at) continue;
      const d = priceCutDecision(it, now(), rules());
      if (d.action === "auto") {
        const follows = it.asking_price === it.suggested_price;
        r.update("items", it.id, {
          suggested_price: d.newPrice,
          asking_price: follows ? d.newPrice : it.asking_price,
          auto_cuts: it.auto_cuts + 1,
          last_price_cut_at: iso(),
          updated_at: iso(),
        });
        log(
          it.id,
          "price",
          `Automatic ${Math.round(rules().autoCutPct * 100)}% cut after ${rules().autoCutAfterDays} days. Price change: ${money(d.from)} to ${money(d.newPrice)}.`,
        );
        out.push({ id: it.id, action: "auto" });
      } else if (d.action === "propose") {
        enqueue(
          it.id,
          "price_cut",
          `Cut "${it.title}" from ${money(d.from)} to ${money(d.newPrice)}? It's been ${rules().autoCutAfterDays}+ days.`,
          { newPrice: d.newPrice },
        );
        out.push({ id: it.id, action: "propose" });
      }
    }
    return out;
  }

  // ---------- buyer chat ----------

  function addBuyerMessage(itemId, { text: body, marketplace } = {}) {
    const it = item(itemId);
    const analysis = analyzeBuyerMessage(body);
    if (!analysis.text.trim()) throw bad("Paste the buyer's message first.");
    r.insert("messages", {
      item_id: it.id,
      role: "buyer",
      text: analysis.text,
      flags: analysis.flags,
      created_at: iso(),
    });
    log(
      it.id,
      "message",
      `Buyer message received${analysis.flags.length ? `. Red flags: ${analysis.flags.map((f) => f.label).join(", ")}` : ""}.`,
    );
    const reply = draftReply(it, analysis, rules());
    if (!SOLD_STATES.includes(it.status) && !reply.risky) {
      if (analysis.offer !== null) addOffer(it.id, { amount: analysis.offer, marketplace });
      else if (reply.queue.includes("accept_offer") && it.asking_price) {
        addOffer(it.id, { amount: it.asking_price, marketplace });
      }
    }
    const draftId = r.insert("messages", {
      item_id: it.id,
      role: "draft",
      text: reply.draft,
      flags: [],
      status: "draft",
      created_at: iso(),
    });
    if (reply.needsOwner) {
      notify({
        title: "Buyer question needs you",
        body: `About "${it.title}". Open the chat to answer.`,
        tag: `chat-${it.id}`,
      });
    }
    return {
      analysis: { flags: analysis.flags, intents: analysis.intents, offer: analysis.offer },
      draftId,
      ...reply,
    };
  }

  function sendReply(messageId, body) {
    const m = r.get("messages", Number(messageId));
    if (!m || m.role !== "draft" || m.status !== "draft")
      throw new HttpError(404, "Draft not found.");
    const t = text(body ?? m.text, 2000);
    if (!t) throw bad("Reply is empty.");
    const problems = outboundProblems(t);
    if (problems.length) throw bad(`Not sent. ${problems.join(" ")}`);
    r.update("messages", m.id, { text: t, role: "owner", status: "sent" });
    log(m.item_id, "message", "Your reply was marked sent.");
    return { ok: true, text: t };
  }

  // ---------- target, rules, dashboard ----------

  function setTarget({ amount, days } = {}) {
    const a = num(amount);
    const d = num(days);
    if (!Number.isFinite(a) || a <= 0 || a > 10_000_000)
      throw bad("Target must be a positive dollar amount.");
    if (!Number.isInteger(d) || d < 1 || d > 365)
      throw bad("Days must be a whole number from 1 to 365.");
    const prev = r.setting("target", null);
    const started_at = prev && prev.days === d ? prev.started_at : iso();
    r.setSetting("target", { amount: roundCents(a), days: d, started_at });
    return r.setting("target");
  }

  function setRules(input = {}) {
    const clean = normalizeRules(
      Object.fromEntries(Object.entries(input).map(([k, v]) => [k, num(v)])),
    );
    r.setSetting("rules", clean);
    return clean;
  }

  function dashboard() {
    const items = r.all("items", "1=1 ORDER BY updated_at DESC");
    const photos = r.all("photos", "item_id IS NOT NULL ORDER BY id");
    const listings = r.all("listings");
    const pending = r.all("queue", "status = 'pending' ORDER BY id");
    const sales = r.all("sales", "1=1 ORDER BY sold_at");
    const target = r.setting("target", { amount: 1000, days: 30, started_at: iso() });
    const byItem = (rows) => {
      const map = new Map();
      for (const row of rows) map.set(row.item_id, [...(map.get(row.item_id) ?? []), row]);
      return map;
    };
    const photoMap = byItem(photos);
    const listingMap = byItem(listings);
    const queueMap = byItem(pending);
    const net = sales.reduce((s, x) => s + x.net, 0);
    return {
      items: items.map((it) => ({
        ...it,
        photos: (photoMap.get(it.id) ?? []).map((p) => ({ id: p.id, url: `api/photos/${p.id}` })),
        listings: (listingMap.get(it.id) ?? []).map(({ marketplace, state, note }) => ({
          marketplace,
          state,
          note,
        })),
        pending: (queueMap.get(it.id) ?? []).map(({ id, kind }) => ({ id, kind })),
      })),
      queue: pending.map((q) => ({ ...q, label: QUEUE_KINDS[q.kind] })),
      sales,
      target,
      progress: targetProgress(target, sales, now()),
      totals: {
        gross: roundCents(sales.reduce((s, x) => s + x.price, 0)),
        fees: roundCents(sales.reduce((s, x) => s + x.fees + x.postage, 0)),
        net: roundCents(net),
        count: sales.length,
      },
      rules: rules(),
      statuses: STATUSES,
      marketplaces: marketplaceList(),
      questions: QUESTIONS,
    };
  }

  const activity = (id) => r.all("activity", "item_id = ? ORDER BY id", [item(id).id]);
  const messages = (id) => r.all("messages", "item_id = ? ORDER BY id", [item(id).id]);
  const listingsFor = (id) => r.all("listings", "item_id = ?", [item(id).id]);

  return {
    savePhoto,
    createDraft,
    answerDraft,
    createItem,
    updateItem,
    deleteItem,
    addOffer,
    markSold,
    approve,
    reject,
    runPriceCuts,
    addBuyerMessage,
    sendReply,
    setTarget,
    setRules,
    dashboard,
    activity,
    messages,
    listingsFor,
    item,
    photo: (id) => r.get("photos", Number(id)),
    latestSale: (id) => r.all("sales", "item_id = ? ORDER BY id DESC", [Number(id)])[0] ?? null,
  };
}
