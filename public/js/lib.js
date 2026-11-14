// Small helpers shared by the dashboard modules. DOM is built with createElement only.

const SVG_NS = "http://www.w3.org/2000/svg";

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : String(c));
  }
  return el;
}

function setProps(el, props) {
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else if (k === "class") el.setAttribute("class", v);
    else if (k in el && typeof v !== "string" && !(el instanceof SVGElement)) el[k] = v;
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  return el;
}

export const h = (tag, props, ...children) =>
  append(setProps(document.createElement(tag), props), children);
export const svg = (tag, props, ...children) =>
  append(setProps(document.createElementNS(SVG_NS, tag), props), children);

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const usd0 = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
export const money = (n) =>
  Number.isFinite(Number(n)) && n !== null ? usd.format(Number(n)) : "Not set";
export const money0 = (n) => usd0.format(Number(n) || 0);
export const shortDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
export const dateTime = (iso) =>
  new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
export const label = (s) => String(s ?? "").replace(/[-_]/g, " ");

export async function api(path, { method = "GET", body, raw, headers = {} } = {}) {
  const init = { method, headers: { ...headers }, credentials: "same-origin" };
  if (raw) init.body = raw;
  else if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers["Content-Type"] = "application/json";
  }
  const res = await fetch(path, init);
  const type = res.headers.get("content-type") ?? "";
  if (!res.ok) {
    const data = type.includes("json") ? await res.json().catch(() => ({})) : {};
    throw new Error(data.error ?? `Request failed (${res.status}).`);
  }
  return type.includes("json") ? res.json() : res.blob();
}

let toastTimer;
export function toast(message) {
  const el = document.querySelector("[data-toast]");
  if (!el) return;
  el.textContent = message;
  el.classList.remove("opacity-0");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add("opacity-0"), 4000);
}

export const btn = (text, onclick, kind = "plain", extra = {}) =>
  h(
    "button",
    {
      type: "button",
      onclick,
      class:
        kind === "primary"
          ? "min-block-11 min-inline-11 rounded-md bg-accent px-4 font-semibold text-accent-ink disabled:opacity-50"
          : kind === "danger"
            ? "min-block-11 min-inline-11 rounded-md border border-danger px-4 font-semibold text-danger"
            : "min-block-11 min-inline-11 rounded-md border border-ink/30 px-3 disabled:opacity-50",
      ...extra,
    },
    text,
  );

export const field = (labelText, input) =>
  h("label", { class: "grid gap-1" }, h("span", null, labelText), input);

const fieldBase = "min-block-11 min-inline-0 inline-full rounded-md border-ink/30 bg-surface";
export const inputClass = `form-input ${fieldBase}`;
export const selectClass = `form-select ${fieldBase}`;
export const textareaClass = `form-textarea ${fieldBase}`;

const sheet = () => document.querySelector("[data-sheet]");

// replaceChildren() would print "null" for skipped optional children, so drop them first.
export const fill = (el, ...kids) =>
  el.replaceChildren(
    ...kids.flat(Infinity).filter((k) => k !== null && k !== undefined && k !== false),
  );

export function openSheet(title, ...body) {
  const d = sheet();
  d.querySelector("[data-sheet-title]").textContent = title;
  fill(d.querySelector("[data-sheet-body]"), body);
  if (!d.open) d.showModal();
  return d;
}

export const closeSheet = () => sheet()?.close();
