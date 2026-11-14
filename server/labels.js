// Shipping labels and receipts as tiny hand-written PDFs, sized for two thermal printers:
//   "4x6"    standard 4 x 6 in label (288 x 432 pt)
//   "narrow" travel sticker printer, about 48 mm print width (136 pt), height grows with content
// The ship-from address is never stored here. It comes from the runtime environment (filled
// from a vault on the owner's machine) or prints as a clear placeholder.

export const SHIP_FROM_PLACEHOLDER = [
  "SHIP-FROM ADDRESS",
  "Injected at print time",
  "from the owner's vault",
];

const FORMATS = {
  "4x6": { width: 288, margin: 14, body: 11, big: 16, small: 8, charW: 0.52 },
  narrow: { width: 136, margin: 6, body: 8, big: 10, small: 6.5, charW: 0.52 },
};

const ascii = (s) =>
  String(s ?? "")
    .normalize("NFKD")
    .replace(/[^\x20-\x7e]/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");

function wrap(text, maxChars) {
  const words = String(text ?? "")
    .split(/\s+/)
    .filter(Boolean);
  const lines = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = w;
    } else line = next.slice(0, maxChars * 2);
  }
  if (line) lines.push(line);
  return lines;
}

// blocks: [{ text, size: "body" | "big" | "small", bold }, { rule: true }, { gap: n }]
function layout(blocks, fmt) {
  const ops = [];
  const usable = fmt.width - fmt.margin * 2;
  let y = 0;
  for (const b of blocks) {
    if (b.rule) {
      y += 6;
      ops.push({ rule: true, y });
      y += 6;
      continue;
    }
    if (b.gap) {
      y += b.gap;
      continue;
    }
    const size = fmt[b.size ?? "body"];
    const maxChars = Math.max(8, Math.floor(usable / (size * fmt.charW)));
    for (const line of wrap(b.text, maxChars)) {
      y += size * 1.25;
      ops.push({ text: line, size, bold: b.bold, y });
    }
  }
  return { ops, height: y + fmt.margin };
}

export function renderPdf(blocks, formatId = "4x6") {
  const fmt = FORMATS[formatId] ?? FORMATS["4x6"];
  const { ops, height: contentHeight } = layout(blocks, fmt);
  const height = formatId === "4x6" ? 432 : Math.max(120, Math.ceil(contentHeight + fmt.margin));
  const top = height - fmt.margin;
  const stream = ops
    .map((op) =>
      op.rule
        ? `0.8 w ${fmt.margin} ${(top - op.y).toFixed(1)} m ${fmt.width - fmt.margin} ${(top - op.y).toFixed(1)} l S`
        : `BT /${op.bold ? "F2" : "F1"} ${op.size} Tf ${fmt.margin} ${(top - op.y).toFixed(1)} Td (${ascii(op.text)}) Tj ET`,
    )
    .join("\n");

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${fmt.width} ${height}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
    `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

export function shipFromLines(env = process.env) {
  const raw = env.FIRE_SALE_SHIP_FROM;
  if (!raw || !raw.trim()) return SHIP_FROM_PLACEHOLDER;
  return raw
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean);
}

const money = (n) => `$${Number(n || 0).toFixed(2)}`;

export function labelBlocks({ item, sale, shipTo, shipFrom }) {
  const to = String(shipTo ?? "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  return [
    { text: "FROM", size: "small", bold: true },
    ...shipFrom.map((text) => ({ text, size: "small" })),
    { rule: true },
    { text: "SHIP TO", size: "small", bold: true },
    ...(to.length ? to : ["(enter the buyer's address)"]).map((text) => ({
      text,
      size: "big",
      bold: true,
    })),
    { rule: true },
    {
      text: `Order FS-${item.id}${sale?.marketplace ? `  |  ${sale.marketplace}` : ""}`,
      size: "small",
    },
    { text: item.title, size: "small" },
    { gap: 4 },
    {
      text: "Address label only. Postage is bought on the marketplace or carrier site.",
      size: "small",
    },
  ];
}

export function receiptBlocks({ item, sale }) {
  const date = new Date(sale?.sold_at ?? Date.now()).toISOString().slice(0, 10);
  return [
    { text: "Thank you!", size: "big", bold: true },
    { text: `Receipt for order FS-${item.id}`, size: "small" },
    { text: date, size: "small" },
    { rule: true },
    { text: item.title, bold: true },
    { text: `Price: ${money(sale?.price ?? item.asking_price)}` },
    { text: `Paid through: ${sale?.marketplace ?? "marketplace checkout"}`, size: "small" },
    { rule: true },
    { text: "Questions? Message me in the marketplace app.", size: "small" },
  ];
}
