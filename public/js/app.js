// Fire Sale dashboard. One page: upload, target, charts, item table, plus the confirm queue.

import { renderCharts } from "./charts.js";
import {
  api,
  btn,
  closeSheet,
  dateTime,
  field,
  fill,
  h,
  inputClass,
  label,
  money,
  money0,
  openSheet,
  selectClass,
  shortDate,
  textareaClass,
  toast,
} from "./lib.js";
import { setupPwa } from "./pwa.js";
import { setupUpload } from "./upload.js";

let state = null;
const view = { key: "updated_at", dir: -1, filter: "active", q: "" };
const $ = (sel) => document.querySelector(sel);
const DAY = 24 * 60 * 60 * 1000;
const SOLD = ["sold", "shipped", "picked-up"];
const PARKED = ["keep", "donate", "trash"];
const mpName = (id) => state.marketplaces.find((m) => m.id === id)?.name ?? id;
const cellInput = `${inputClass} min-inline-24`;
const cellSelect = `${selectClass} min-inline-28`;

async function load() {
  const key = document.activeElement?.dataset?.focusKey;
  try {
    state = await api("api/dashboard");
  } catch (err) {
    toast(`Can't reach the Fire Sale server. ${err.message}`);
    return;
  }
  render();
  if (key) document.querySelector(`[data-focus-key="${CSS.escape(key)}"]`)?.focus();
}

async function act(promise, done) {
  try {
    const out = await promise;
    if (done) toast(typeof done === "function" ? done(out) : done);
    await load();
    return out;
  } catch (err) {
    toast(err.message);
    return null;
  }
}

function render() {
  const p = state.progress;
  $("[data-queue-count]").textContent = String(state.queue.length);
  $("[data-open-queue]").setAttribute("aria-label", `Confirm queue, ${state.queue.length} waiting`);
  $("[data-header-progress-text]").textContent =
    `${money0(p.landed)} of ${money0(p.amount)}, ${p.daysLeft} days left`;
  $("[data-header-progress-bar]").style.inlineSize = `${Math.round(p.pct * 100)}%`;
  $("[data-landed]").textContent = money(p.landed);
  $("[data-target-amount]").textContent = money(p.amount);
  const bar = $("[data-target-progress]");
  bar.value = Math.round(p.pct * 100);
  bar.setAttribute(
    "aria-valuetext",
    `${Math.round(p.pct * 100)} percent, ${money0(p.landed)} of ${money0(p.amount)}`,
  );
  $("[data-remaining]").textContent = money0(p.remaining);
  $("[data-days-left]").textContent = String(p.daysLeft);
  $("[data-per-day]").textContent = money0(p.perDay);
  const form = $("[data-target-form]");
  if (!form.contains(document.activeElement)) {
    form.amount.value = state.target.amount;
    form.days.value = state.target.days;
  }
  const t = state.totals;
  $("[data-totals]").replaceChildren(
    ...[
      ["Gross sales", money0(t.gross)],
      ["Fees and postage", money0(t.fees)],
      ["Landed net", money0(t.net)],
      ["Items sold", String(t.count)],
    ].map(([k, v]) =>
      h(
        "div",
        { class: "rounded-lg bg-surface-raised p-3" },
        h("dt", { class: "text-step-n1 text-ink-muted" }, k),
        h("dd", { class: "text-step-1 font-bold" }, v),
      ),
    ),
  );
  renderCharts(state);
  renderTable();
  if ($("[data-queue-dialog]").open) renderQueue();
}

// ---------- item table ----------

const COLUMNS = [
  { key: "photo", label: "Photo", sort: (it) => it.photos.length },
  { key: "title", label: "Item", sort: (it) => it.title.toLowerCase() },
  { key: "status", label: "Status", sort: (it) => state.statuses.indexOf(it.status) },
  { key: "confidence", label: "Confidence", sort: (it) => it.confidence },
  { key: "suggested_price", label: "Suggested", sort: (it) => it.suggested_price ?? 0 },
  { key: "asking_price", label: "Asking", sort: (it) => it.asking_price ?? 0 },
  { key: "floor_price", label: "Floor", sort: (it) => it.floor_price ?? 0 },
  { key: "marketplaces", label: "Marketplaces", sort: (it) => it.marketplaces.map(mpName).join() },
  { key: "fulfilment", label: "Ship or pickup", sort: (it) => it.fulfilment },
  { key: "listed_at", label: "Listed", sort: (it) => it.listed_at ?? "" },
  { key: "updated_at", label: "Updated", sort: (it) => it.updated_at },
];

const save = (it, patch) =>
  act(api(`api/items/${it.id}`, { method: "PATCH", body: patch }), "Saved.");

function select(it, fieldName, options, value, onchange) {
  const el = h(
    "select",
    {
      class: cellSelect,
      "aria-label": `${label(fieldName)}, ${it.title}`,
      "data-focus-key": `${it.id}-${fieldName}`,
      onchange,
    },
    options.map(([v, text]) => h("option", { value: v }, text)),
  );
  el.value = value;
  return el;
}

function numberInput(it, fieldName, text) {
  return h("input", {
    type: "number",
    inputmode: "decimal",
    min: 0,
    step: "0.01",
    value: it[fieldName] ?? "",
    class: `${cellInput} min-inline-28`,
    "aria-label": `${text}, ${it.title}`,
    "data-focus-key": `${it.id}-${fieldName}`,
    onchange: (e) =>
      save(it, { [fieldName]: e.target.value === "" ? null : Number(e.target.value) }),
  });
}

function cell(it, key) {
  switch (key) {
    case "photo":
      return it.photos[0]
        ? h("img", {
            src: it.photos[0].url,
            alt: "",
            width: 48,
            height: 48,
            loading: "lazy",
            class: "block-12 inline-12 rounded-md object-cover",
          })
        : h("span", { class: "text-ink-muted" }, "None");
    case "title":
      return h(
        "div",
        { class: "grid gap-1" },
        h("input", {
          value: it.title,
          maxlength: 120,
          class: `${cellInput} min-inline-44`,
          "aria-label": `Title, item ${it.id}`,
          "data-focus-key": `${it.id}-title`,
          onchange: (e) => save(it, { title: e.target.value }),
        }),
        it.privacy_flags?.length
          ? h("span", { class: "font-semibold text-warn" }, "Check photo for private info")
          : null,
      );
    case "status":
      return select(
        it,
        "status",
        state.statuses.map((s) => [s, label(s)]),
        it.status,
        (e) => {
          if (e.target.value === "sold") {
            e.target.value = it.status;
            soldSheet(it);
          } else save(it, { status: e.target.value });
        },
      );
    case "confidence":
      return h(
        "span",
        {
          class:
            it.confidence >= state.rules.readyThreshold
              ? "font-semibold text-ok"
              : "font-semibold text-warn",
        },
        `${Math.round(it.confidence * 100)}%`,
      );
    case "suggested_price":
      return h(
        "div",
        { class: "grid gap-1" },
        h(
          "span",
          { class: "whitespace-nowrap" },
          `${money0(it.price_mid)} mid, ${money0(it.price_fast)} fast`,
        ),
        select(
          it,
          "price_choice",
          [
            ["mid", "Use mid"],
            ["fast", "Use fast"],
          ],
          it.price_choice,
          (e) => save(it, { price_choice: e.target.value }),
        ),
      );
    case "asking_price":
      return numberInput(it, "asking_price", "Asking price");
    case "floor_price":
      return numberInput(it, "floor_price", "Floor price");
    case "marketplaces":
      return h(
        "ul",
        { class: "grid gap-0.5" },
        it.marketplaces.map((m) => {
          const l = it.listings.find((x) => x.marketplace === m);
          return h(
            "li",
            { class: "whitespace-nowrap" },
            mpName(m),
            l ? h("span", { class: "text-ink-muted" }, `: ${label(l.state)}`) : null,
          );
        }),
      );
    case "fulfilment":
      return select(
        it,
        "fulfilment",
        [
          ["ship", "Ship"],
          ["pickup", "Pickup"],
          ["either", "Either"],
        ],
        it.fulfilment,
        (e) => save(it, { fulfilment: e.target.value }),
      );
    case "listed_at":
      return it.listed_at
        ? `${shortDate(it.listed_at)} (${Math.floor((Date.now() - Date.parse(it.listed_at)) / DAY)}d)`
        : "Not yet";
    case "updated_at":
      return shortDate(it.updated_at);
    default:
      return "";
  }
}

function actions(it) {
  const publish = it.pending.find((q) => q.kind === "publish");
  let primary = null;
  if (publish)
    primary = btn("Publish", () => approve(publish.id), "primary", {
      "aria-label": `Publish ${it.title}`,
    });
  else if (["draft", "needs-review"].includes(it.status))
    primary = btn("Review", () => editSheet(it), "primary", { "aria-label": `Review ${it.title}` });
  else if (
    [
      "listed",
      "offer-pending",
      "blocked-on-login",
      "ready-to-publish",
      "unknown-location",
    ].includes(it.status)
  ) {
    primary = btn("Sold", () => soldSheet(it), "plain", { "aria-label": `Mark ${it.title} sold` });
  } else if (SOLD.includes(it.status))
    primary = btn("Label", () => labelSheet(it), "plain", {
      "aria-label": `Labels and receipts for ${it.title}`,
    });
  return h(
    "div",
    { class: "flex justify-end gap-1.5" },
    primary,
    btn("Chat", () => chatSheet(it), "plain", { "aria-label": `Buyer chat for ${it.title}` }),
    btn("More", () => moreSheet(it), "plain", {
      "aria-label": `More actions for ${it.title}`,
      "data-focus-key": `${it.id}-more`,
    }),
  );
}

function visibleItems() {
  const q = view.q.toLowerCase();
  const col = COLUMNS.find((c) => c.key === view.key) ?? COLUMNS.at(-1);
  return state.items
    .filter((it) => {
      if (view.filter === "sold") return SOLD.includes(it.status);
      if (view.filter === "parked") return PARKED.includes(it.status);
      if (view.filter === "active") return !SOLD.includes(it.status) && !PARKED.includes(it.status);
      return true;
    })
    .filter((it) => !q || `${it.title} ${it.description}`.toLowerCase().includes(q))
    .sort((a, b) => {
      const x = col.sort(a);
      const y = col.sort(b);
      return (x > y ? 1 : x < y ? -1 : 0) * view.dir;
    });
}

function renderTable() {
  const th = "px-2 py-1 text-start align-middle font-semibold";
  $("[data-thead]").replaceChildren(
    h(
      "tr",
      null,
      COLUMNS.map((c) =>
        h(
          "th",
          {
            scope: "col",
            class:
              c.key === "title" ? `${th} sm:sticky sm:start-0 sm:z-10 sm:bg-surface-raised` : th,
            "aria-sort": view.key === c.key ? (view.dir > 0 ? "ascending" : "descending") : null,
          },
          h(
            "button",
            {
              type: "button",
              class:
                "flex min-block-11 items-center gap-1 whitespace-nowrap underline-offset-4 hover:underline",
              "data-focus-key": `sort-${c.key}`,
              onclick: () => {
                view.dir = view.key === c.key ? -view.dir : 1;
                view.key = c.key;
                renderTable();
              },
            },
            c.label,
            h(
              "span",
              { "aria-hidden": "true", class: "text-ink-muted" },
              view.key === c.key ? (view.dir > 0 ? "▲" : "▼") : "↕",
            ),
          ),
        ),
      ),
      h(
        "th",
        { scope: "col", class: `${th} sticky end-0 z-10 bg-surface-raised text-end` },
        "Actions",
      ),
    ),
  );
  const items = visibleItems();
  $("[data-empty]").hidden = items.length > 0;
  $("[data-table-wrap]").hidden = items.length === 0;
  $("[data-rows]").replaceChildren(
    ...items.map((it) =>
      h(
        "tr",
        { class: "border-bs border-ink/10 align-middle" },
        COLUMNS.map((c) =>
          h(
            c.key === "title" ? "th" : "td",
            {
              scope: c.key === "title" ? "row" : null,
              class:
                c.key === "title"
                  ? "px-2 py-2 text-start font-normal sm:sticky sm:start-0 sm:z-10 sm:bg-surface"
                  : "px-2 py-2",
            },
            cell(it, c.key),
          ),
        ),
        h("td", { class: "sticky end-0 z-10 bg-surface px-2 py-2" }, actions(it)),
      ),
    ),
  );
}

// ---------- confirm queue ----------

async function approve(id) {
  await act(api(`api/queue/${id}/approve`, { method: "POST", body: {} }), "Approved.");
}

function renderQueue() {
  const list = $("[data-queue-list]");
  if (!state.queue.length) {
    list.replaceChildren(
      h(
        "li",
        { class: "rounded-lg bg-surface-raised p-4 text-center text-ink-muted" },
        "Nothing is waiting for you.",
      ),
    );
    return;
  }
  list.replaceChildren(
    ...state.queue.map((q) => {
      const it = state.items.find((x) => x.id === q.item_id);
      return h(
        "li",
        { class: "grid gap-3 rounded-lg border border-ink/15 p-3" },
        h(
          "div",
          { class: "flex gap-3" },
          it?.photos[0]
            ? h("img", {
                src: it.photos[0].url,
                alt: "",
                width: 56,
                height: 56,
                class: "block-14 inline-14 rounded-md object-cover",
              })
            : null,
          h(
            "div",
            { class: "grid gap-1" },
            h("p", { class: "font-bold" }, q.label),
            h("p", null, q.summary),
            h("p", { class: "text-step-n1 text-ink-muted" }, dateTime(q.created_at)),
          ),
        ),
        h(
          "div",
          { class: "grid grid-cols-2 gap-2" },
          btn("Approve", () => approve(q.id), "primary", { "aria-label": `Approve: ${q.summary}` }),
          btn(
            "Reject",
            () => act(api(`api/queue/${q.id}/reject`, { method: "POST", body: {} }), "Rejected."),
            "plain",
            { "aria-label": `Reject: ${q.summary}` },
          ),
        ),
      );
    }),
  );
}

function openQueue() {
  renderQueue();
  $("[data-queue-dialog]").showModal();
}

// ---------- per-item sheets ----------

function formSheet(title, fields, submitText, onSubmit, note) {
  const form = h(
    "form",
    { class: "grid gap-3" },
    note ? h("p", { class: "text-ink-muted" }, note) : null,
    fields,
    btn(submitText, null, "primary", { type: "submit" }),
  );
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const ok = await onSubmit(new FormData(form), form);
    if (ok) closeSheet();
  });
  openSheet(title, form);
  form.querySelector("input, select, textarea")?.focus();
  return form;
}

const mpSelect = (it, name = "marketplace") => {
  const s = h(
    "select",
    { name, class: selectClass },
    state.marketplaces.map((m) => h("option", { value: m.id }, m.name)),
  );
  s.value = it.marketplaces[0];
  return s;
};

function editSheet(it) {
  const cond = h(
    "select",
    { name: "condition", class: selectClass },
    ["", "New", "Like new", "Good", "Fair", "For parts"].map((c) =>
      h("option", { value: c }, c || "Not set"),
    ),
  );
  cond.value = it.condition ?? "";
  formSheet(
    `Edit ${it.title}`,
    [
      field(
        "Title",
        h("input", {
          name: "title",
          value: it.title,
          maxlength: 120,
          required: true,
          class: inputClass,
        }),
      ),
      field(
        "Description",
        h(
          "textarea",
          { name: "description", rows: 5, maxlength: 4000, class: textareaClass },
          it.description,
        ),
      ),
      field("Condition", cond),
      h(
        "fieldset",
        { class: "grid gap-2" },
        h("legend", null, "Marketplaces"),
        state.marketplaces.map((m) =>
          h(
            "label",
            { class: "flex min-block-11 items-center gap-3" },
            h("input", {
              type: "checkbox",
              name: "marketplaces",
              value: m.id,
              checked: it.marketplaces.includes(m.id),
              class: "form-checkbox block-6 inline-6 rounded-sm text-accent",
            }),
            m.name,
            m.stub ? h("span", { class: "text-ink-muted" }, "(manual in v1)") : null,
          ),
        ),
      ),
    ],
    "Save",
    (fd) =>
      act(
        api(`api/items/${it.id}`, {
          method: "PATCH",
          body: {
            title: fd.get("title"),
            description: fd.get("description"),
            condition: fd.get("condition"),
            marketplaces: fd.getAll("marketplaces"),
          },
        }),
        (out) =>
          out.status === "ready-to-publish"
            ? "Saved. Ready to publish, waiting in your confirm queue."
            : "Saved.",
      ),
    it.status === "needs-review" || it.status === "draft"
      ? "Saving your edits counts as your review. Publishing still needs your tap."
      : null,
  );
}

async function logSheet(it) {
  const entries = await api(`api/items/${it.id}/activity`).catch(() => []);
  openSheet(
    `Timeline: ${it.title}`,
    h(
      "ol",
      { class: "grid gap-2" },
      entries.length
        ? entries.map((e) =>
            h(
              "li",
              { class: "grid border-s-2 border-accent ps-3" },
              h("span", { class: "text-step-n1 text-ink-muted" }, dateTime(e.created_at)),
              e.message,
            ),
          )
        : h("li", null, "No activity yet."),
    ),
  );
}

async function listingsSheet(it) {
  const rows = await api(`api/items/${it.id}/listings`).catch(() => []);
  openSheet(
    `Listing drafts: ${it.title}`,
    rows.length
      ? rows.map((l) => {
          const text = JSON.stringify(l.payload, null, 2);
          return h(
            "section",
            { class: "grid gap-2", "aria-label": mpName(l.marketplace) },
            h(
              "p",
              null,
              h("strong", null, mpName(l.marketplace)),
              `: ${label(l.state)}. ${l.note}`,
            ),
            h(
              "pre",
              { class: "max-block-60 overflow-auto rounded-md bg-surface-raised p-2 text-step-n1" },
              text,
            ),
            btn("Copy draft", () =>
              navigator.clipboard.writeText(text).then(() => toast("Copied.")),
            ),
          );
        })
      : h(
          "p",
          null,
          "No drafts yet. Approve the publish request in the confirm queue to build them.",
        ),
  );
}

function offerSheet(it) {
  formSheet(
    `Record an offer: ${it.title}`,
    [
      field(
        "Offer ($)",
        h("input", {
          name: "amount",
          type: "number",
          inputmode: "decimal",
          min: 0.01,
          step: "0.01",
          required: true,
          class: inputClass,
        }),
      ),
      field("Marketplace", mpSelect(it)),
    ],
    "Check offer",
    (fd) =>
      act(
        api(`api/items/${it.id}/offers`, {
          method: "POST",
          body: { amount: Number(fd.get("amount")), marketplace: fd.get("marketplace") },
        }),
        (out) => out.decision.reason,
      ),
    `Offers under ${Math.round(state.rules.declineBelowPct * 100)}% of the original asking price are declined. Everything else waits for your OK.`,
  );
}

function soldSheet(it) {
  const method = h("select", { name: "method", class: selectClass }, [
    h("option", { value: "ship" }, "Shipped"),
    h("option", { value: "pickup" }, "Local pickup"),
  ]);
  method.value = it.fulfilment === "pickup" ? "pickup" : "ship";
  formSheet(
    `Mark sold: ${it.title}`,
    [
      field(
        "Sale price ($)",
        h("input", {
          name: "price",
          type: "number",
          inputmode: "decimal",
          min: 0.01,
          step: "0.01",
          required: true,
          value: it.asking_price ?? "",
          class: inputClass,
        }),
      ),
      field("Sold on", mpSelect(it)),
      field("How it goes", method),
      field(
        "Postage you paid ($)",
        h("input", {
          name: "postage",
          type: "number",
          inputmode: "decimal",
          min: 0,
          step: "0.01",
          value: 0,
          class: inputClass,
        }),
      ),
    ],
    "Confirm sale",
    (fd) =>
      act(
        api(`api/items/${it.id}/sold`, {
          method: "POST",
          body: {
            price: Number(fd.get("price")),
            marketplace: fd.get("marketplace"),
            method: fd.get("method"),
            postage: Number(fd.get("postage")),
          },
        }),
        "Sale recorded. Cross-posts marked for delist.",
      ),
    "Only confirm a sale paid through the marketplace checkout, or cash at a confirmed handoff.",
  );
}

function labelSheet(it) {
  const out = h("p", { "aria-live": "polite" });
  const radio = (name, value, text, checked) =>
    h(
      "label",
      { class: "flex min-block-11 items-center gap-3" },
      h("input", {
        type: "radio",
        name,
        value,
        checked,
        class: "form-radio block-5 inline-5 text-accent",
      }),
      text,
    );
  const form = formSheet(
    `Labels and receipts: ${it.title}`,
    [
      h(
        "fieldset",
        { class: "grid gap-1" },
        h("legend", null, "Printer"),
        radio("format", "4x6", "4 x 6 in label printer", true),
        radio("format", "narrow", "Narrow travel printer (48 mm)"),
      ),
      h(
        "fieldset",
        { class: "grid gap-1" },
        h("legend", null, "Print"),
        radio("doc", "label", "Shipping address label", true),
        radio("doc", "receipt", "Receipt for the box"),
      ),
      field(
        "Ship to (from the marketplace order)",
        h("textarea", {
          name: "shipTo",
          rows: 4,
          maxlength: 400,
          autocomplete: "off",
          class: textareaClass,
        }),
      ),
      out,
    ],
    "Make PDF",
    async (fd) => {
      try {
        const blob = await api(`api/items/${it.id}/label`, {
          method: "POST",
          body: Object.fromEntries(fd),
        });
        const url = URL.createObjectURL(blob);
        out.replaceChildren(
          h(
            "a",
            {
              href: url,
              target: "_blank",
              rel: "noopener",
              class: "font-semibold text-accent underline",
            },
            "Open the PDF to print",
          ),
        );
      } catch (err) {
        out.textContent = err.message;
      }
      return false;
    },
    "If the marketplace issues its own label, print that one. The app makes the receipt only. Ship-from comes from your vault at print time.",
  );
  return form;
}

async function chatSheet(it) {
  const history = await api(`api/items/${it.id}/messages`).catch(() => []);
  const log = h(
    "ol",
    { class: "grid max-block-64 gap-2 overflow-auto" },
    history.map((m) =>
      h(
        "li",
        {
          class:
            m.role === "buyer"
              ? "rounded-md bg-surface-raised p-2"
              : "rounded-md border border-ink/15 p-2",
        },
        h(
          "span",
          { class: "block text-step-n1 text-ink-muted" },
          `${m.role === "buyer" ? "Buyer" : m.status === "sent" ? "You sent" : "Draft"}, ${dateTime(m.created_at)}`,
        ),
        m.text,
      ),
    ),
  );
  const reply = h("div", { class: "grid gap-2", "aria-live": "polite" });
  const form = h(
    "form",
    { class: "grid gap-2" },
    field(
      "Paste the buyer's message",
      h("textarea", {
        name: "text",
        rows: 3,
        maxlength: 2000,
        required: true,
        class: textareaClass,
      }),
    ),
    field("Marketplace", mpSelect(it)),
    btn("Draft a reply", null, "primary", { type: "submit" }),
  );
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const fd = new FormData(form);
      const res = await api(`api/items/${it.id}/messages`, {
        method: "POST",
        body: { text: fd.get("text"), marketplace: fd.get("marketplace") },
      });
      const box = h(
        "textarea",
        { rows: 4, maxlength: 2000, class: textareaClass, "aria-label": "Draft reply" },
        res.draft,
      );
      fill(
        reply,
        res.analysis.flags.length
          ? h(
              "ul",
              {
                class: "grid gap-1 rounded-md border border-danger p-2 text-danger",
                "aria-label": "Red flags",
              },
              res.analysis.flags.map((f) => h("li", null, f.label)),
            )
          : null,
        res.queue.length
          ? h(
              "p",
              { class: "font-semibold" },
              "Hard stop: anything that closes the sale is waiting in your confirm queue.",
            )
          : null,
        res.needsOwner
          ? h(
              "p",
              { class: "font-semibold text-warn" },
              "The app can't answer this one. Fill in the reply yourself.",
            )
          : null,
        box,
        btn("Copy reply and mark sent", async () => {
          try {
            await api(`api/messages/${res.draftId}/send`, {
              method: "POST",
              body: { text: box.value },
            });
            await navigator.clipboard?.writeText(box.value).catch(() => {});
            toast("Copied. Paste it into the marketplace chat.");
            reply.replaceChildren();
            form.reset();
          } catch (err) {
            toast(err.message);
          }
        }),
      );
      load();
    } catch (err) {
      toast(err.message);
    }
  });
  openSheet(
    `Buyer chat: ${it.title}`,
    h(
      "p",
      { class: "text-step-n1 text-ink-muted" },
      "Buyer text is untrusted. It can't change rules, reveal an address, or trigger an action. Payment stays on-platform.",
    ),
    log,
    form,
    reply,
  );
}

function deleteSheet(it) {
  openSheet(
    `Delete ${it.title}?`,
    h("p", null, "This removes the item, its photos, and its timeline. It can't be undone."),
    h(
      "div",
      { class: "grid grid-cols-2 gap-2" },
      btn(
        "Delete",
        () => act(api(`api/items/${it.id}`, { method: "DELETE" }), "Deleted.").then(closeSheet),
        "danger",
      ),
      btn("Keep it", closeSheet),
    ),
  );
}

function moreSheet(it) {
  const item = (text, fn) =>
    h(
      "li",
      null,
      btn(text, fn, "plain", {
        class: "min-block-11 inline-full rounded-md border border-ink/30 px-3 text-start",
      }),
    );
  openSheet(
    it.title,
    h(
      "ul",
      { class: "grid gap-2" },
      item("Edit details", () => editSheet(it)),
      item("Timeline", () => logSheet(it)),
      item("Listing drafts", () => listingsSheet(it)),
      SOLD.includes(it.status)
        ? item("Labels and receipts", () => labelSheet(it))
        : [item("Record an offer", () => offerSheet(it)), item("Mark sold", () => soldSheet(it))],
      item("Delete", () => deleteSheet(it)),
    ),
  );
}

function addSheet() {
  formSheet(
    "Add an item by hand",
    [
      field(
        "Title",
        h("input", { name: "title", maxlength: 120, required: true, class: inputClass }),
      ),
      field(
        "Asking price ($)",
        h("input", {
          name: "asking_price",
          type: "number",
          inputmode: "decimal",
          min: 0.01,
          step: "0.01",
          required: true,
          class: inputClass,
        }),
      ),
    ],
    "Add",
    (fd) =>
      act(
        api("api/items", {
          method: "POST",
          body: { title: fd.get("title"), asking_price: Number(fd.get("asking_price")) },
        }),
        "Added.",
      ),
  );
}

function rulesSheet() {
  const r = state.rules;
  const pct = (name, text, value, max) =>
    field(
      text,
      h("input", {
        name,
        type: "number",
        inputmode: "decimal",
        min: 0,
        max,
        step: 1,
        value: Math.round(value * 100),
        required: true,
        class: inputClass,
      }),
    );
  formSheet(
    "Offer and price rules",
    [
      pct(
        "declineBelowPct",
        "Auto-decline offers below this % of the original asking price",
        r.declineBelowPct,
        100,
      ),
      pct(
        "readyThreshold",
        "Mark drafts ready to publish at this confidence %",
        r.readyThreshold,
        100,
      ),
      pct("autoCutPct", "One automatic price cut of this %", r.autoCutPct, 20),
      field(
        "after this many days unsold",
        h("input", {
          name: "autoCutAfterDays",
          type: "number",
          inputmode: "numeric",
          min: 1,
          max: 90,
          value: r.autoCutAfterDays,
          required: true,
          class: inputClass,
        }),
      ),
    ],
    "Save rules",
    (fd) =>
      act(
        api("api/rules", {
          method: "PUT",
          body: {
            declineBelowPct: Number(fd.get("declineBelowPct")) / 100,
            readyThreshold: Number(fd.get("readyThreshold")) / 100,
            autoCutPct: Number(fd.get("autoCutPct")) / 100,
            autoCutAfterDays: Number(fd.get("autoCutAfterDays")),
          },
        }),
        "Rules saved.",
      ),
    "Offers at or above asking always wait for your one-tap OK. Only one automatic cut ever happens. Later cuts wait in the confirm queue.",
  );
}

// ---------- wiring ----------

$("[data-open-queue]").addEventListener("click", openQueue);
$("[data-open-rules]").addEventListener("click", rulesSheet);
$("[data-add-item]").addEventListener("click", addSheet);
for (const close of document.querySelectorAll("[data-close]"))
  close.addEventListener("click", () => close.closest("dialog").close());
$("[data-filter]").addEventListener("change", (e) => {
  view.filter = e.target.value;
  renderTable();
});
$("[data-search]").addEventListener("input", (e) => {
  view.q = e.target.value;
  renderTable();
});
$("[data-target-form]").addEventListener("submit", (e) => {
  e.preventDefault();
  const f = e.target;
  act(
    api("api/target", {
      method: "PUT",
      body: { amount: Number(f.amount.value), days: Number(f.days.value) },
    }),
    "Target saved.",
  );
});

setupUpload({ onChange: load });
await load();
if (location.hash === "#queue") openQueue();
setupPwa();
