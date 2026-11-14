// Hand-built SVG charts. Each one has a text summary as its accessible name.

import { h, money0, shortDate, svg } from "./lib.js";

const DAY = 24 * 60 * 60 * 1000;
const W = 400;
const H = 180;
const PAD = { top: 10, right: 10, bottom: 24, left: 44 };

const axisText = (x, y, text, anchor = "start") =>
  svg("text", { x, y, "text-anchor": anchor, "font-size": 11, class: "fill-ink-muted" }, text);

function cumulative(el, { sales, target, progress }) {
  const start = Date.parse(target.started_at);
  const end = start + target.days * DAY;
  const now = Date.now();
  let running = 0;
  const points = sales
    .map((s) => ({ t: Date.parse(s.sold_at), net: s.net }))
    .filter((p) => p.t >= start - DAY)
    .sort((a, b) => a.t - b.t)
    .map((p) => ({ t: p.t, v: (running += p.net) }));
  const maxV = Math.max(target.amount, running, 1);
  const x = (t) =>
    PAD.left +
    ((Math.min(Math.max(t, start), end) - start) / (end - start || 1)) * (W - PAD.left - PAD.right);
  const y = (v) => H - PAD.bottom - (v / maxV) * (H - PAD.top - PAD.bottom);

  const line = [`M${x(start)},${y(0)}`];
  for (const p of points) line.push(`H${x(p.t)}`, `V${y(p.v)}`);
  line.push(`H${x(Math.min(now, end))}`);
  const paceNow = target.amount * Math.min(1, Math.max(0, (now - start) / (end - start || 1)));

  const summary = `Landed net ${money0(progress.landed)} of a ${money0(target.amount)} target. Pace for today is ${money0(paceNow)}. ${progress.landed >= paceNow ? "On or ahead of pace." : "Behind pace."}`;
  el.replaceChildren(
    svg(
      "svg",
      { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": summary, class: "block inline-full" },
      svg("line", { x1: PAD.left, x2: W - PAD.right, y1: y(0), y2: y(0), class: "stroke-ink/30" }),
      svg("line", {
        x1: PAD.left,
        x2: W - PAD.right,
        y1: y(target.amount),
        y2: y(target.amount),
        class: "stroke-ink/20",
        "stroke-dasharray": "2 4",
      }),
      svg("line", {
        x1: x(start),
        y1: y(0),
        x2: x(end),
        y2: y(target.amount),
        class: "stroke-ink-muted",
        "stroke-dasharray": "6 4",
        "stroke-width": 1.5,
      }),
      svg("path", {
        d: line.join(" "),
        fill: "none",
        class: "stroke-fire",
        "stroke-width": 3,
        "stroke-linejoin": "round",
      }),
      axisText(PAD.left - 6, y(target.amount) + 4, money0(target.amount), "end"),
      axisText(PAD.left - 6, y(0) + 4, "$0", "end"),
      axisText(PAD.left, H - 6, shortDate(new Date(start).toISOString())),
      axisText(W - PAD.right, H - 6, shortDate(new Date(end).toISOString()), "end"),
    ),
    h(
      "p",
      { class: "text-step-n1 text-ink-muted" },
      "Solid line: landed net. Dashed line: even pace to the target.",
    ),
  );
}

function daily(el, { sales }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Array.from({ length: 14 }, (_, i) => ({
    t: today.getTime() - (13 - i) * DAY,
    v: 0,
  }));
  for (const s of sales) {
    const d = new Date(s.sold_at);
    d.setHours(0, 0, 0, 0);
    const slot = days.find((x) => x.t === d.getTime());
    if (slot) slot.v += s.net;
  }
  const maxV = Math.max(...days.map((d) => d.v), 1);
  const bw = (W - PAD.left - PAD.right) / days.length;
  const total = days.reduce((s, d) => s + d.v, 0);
  const best = days.reduce((a, b) => (b.v > a.v ? b : a));
  const summary = total
    ? `${money0(total)} landed in the last 14 days. Best day ${shortDate(new Date(best.t).toISOString())} with ${money0(best.v)}.`
    : "No sales in the last 14 days.";
  el.replaceChildren(
    svg(
      "svg",
      { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": summary, class: "block inline-full" },
      days.map((d, i) => {
        const bh = (d.v / maxV) * (H - PAD.top - PAD.bottom);
        return svg(
          "rect",
          {
            x: PAD.left + i * bw + 2,
            y: H - PAD.bottom - bh,
            width: bw - 4,
            height: Math.max(bh, d.v ? 2 : 0),
            rx: 2,
            class: "fill-fire",
          },
          svg("title", null, `${shortDate(new Date(d.t).toISOString())}: ${money0(d.v)}`),
        );
      }),
      svg("line", {
        x1: PAD.left,
        x2: W - PAD.right,
        y1: H - PAD.bottom,
        y2: H - PAD.bottom,
        class: "stroke-ink/30",
      }),
      axisText(PAD.left - 6, PAD.top + 8, money0(maxV), "end"),
      axisText(PAD.left, H - 6, shortDate(new Date(days[0].t).toISOString())),
      axisText(W - PAD.right, H - 6, "Today", "end"),
    ),
  );
}

function byMarketplace(el, { sales, marketplaces }) {
  const totals = new Map();
  for (const s of sales) totals.set(s.marketplace, (totals.get(s.marketplace) ?? 0) + s.net);
  const max = Math.max(...totals.values(), 1);
  const rows = [...totals].sort((a, b) => b[1] - a[1]);
  if (!rows.length) {
    el.replaceChildren(h("li", { class: "text-ink-muted" }, "No sales yet."));
    return;
  }
  el.replaceChildren(
    ...rows.map(([id, v]) => {
      const bar = h("span", {
        class: "block block-full rounded-full bg-fire forced-colors:bg-[CanvasText]",
      });
      bar.style.inlineSize = `${Math.max(2, (v / max) * 100)}%`;
      return h(
        "li",
        { class: "grid gap-1" },
        h(
          "span",
          { class: "flex justify-between gap-2" },
          h("span", null, marketplaces.find((m) => m.id === id)?.name ?? id),
          h("strong", null, money0(v)),
        ),
        h("span", { class: "block block-2 rounded-full bg-ink/10", "aria-hidden": "true" }, bar),
      );
    }),
  );
}

export function renderCharts(state) {
  cumulative(document.querySelector("[data-chart-cumulative]"), state);
  daily(document.querySelector("[data-chart-daily]"), state);
  byMarketplace(document.querySelector("[data-chart-marketplace]"), state);
}
