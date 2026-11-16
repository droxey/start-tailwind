// Photo upload to draft. Photos are re-encoded on the device (drops EXIF and GPS), checked with
// on-device detectors where the browser has them, uploaded in parallel, and drafted.

import { api, btn, field, h, inputClass } from "./lib.js";

const MAX_EDGE = 2048;

async function decode(file) {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

// Drawing to a canvas and exporting keeps only pixels, so EXIF, GPS, and maker notes are gone.
async function clean(file) {
  const img = await decode(file);
  const w = img.width;
  const hgt = img.height;
  const scale = Math.min(1, MAX_EDGE / Math.max(w, hgt));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(hgt * scale);
  canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  return { blob, canvas };
}

async function detectPrivacy(canvas) {
  const flags = [];
  try {
    if ("FaceDetector" in window && (await new window.FaceDetector().detect(canvas)).length)
      flags.push("face");
  } catch {
    // detector not usable here
  }
  try {
    if ("BarcodeDetector" in window && (await new window.BarcodeDetector().detect(canvas)).length) {
      flags.push("label", "serial");
    }
  } catch {
    // detector not usable here
  }
  return flags;
}

async function uploadPhoto(file) {
  const { blob, canvas } = await clean(file);
  const flags = await detectPrivacy(canvas);
  const saved = await api("api/photos", {
    method: "POST",
    raw: blob,
    headers: {
      "Content-Type": "image/jpeg",
      "X-Filename": encodeURIComponent(file.name.slice(0, 120)),
      "X-Photo-Flags": flags.join(","),
    },
  });
  return { ...saved, preview: URL.createObjectURL(blob) };
}

function statusLine(card, text, tone = "muted") {
  const tones = {
    muted: "text-ink-muted",
    ok: "text-ok",
    warn: "text-warn",
    danger: "text-danger",
  };
  card.querySelector("[data-line]").replaceChildren(h("span", { class: tones[tone] }, text));
}

function flagsList(flags) {
  if (!flags?.length) return null;
  return h(
    "ul",
    {
      class: "grid gap-1 rounded-md border border-warn p-2 text-warn",
      "aria-label": "Privacy check",
    },
    flags.map((f) => h("li", null, `${f.label}. Retake or crop before listing.`)),
  );
}

function interview(item, card, onDone) {
  const form = h("form", { class: "grid gap-3" });
  form.append(
    h("p", { class: "font-semibold" }, "This photo is ambiguous. A few quick questions:"),
  );
  for (const q of item.questions) {
    if (q.type === "text") {
      form.append(
        field(
          q.label,
          h("input", { name: q.id, required: true, maxlength: 200, class: inputClass }),
        ),
      );
    } else {
      form.append(
        h(
          "fieldset",
          { class: "grid gap-2" },
          h("legend", { class: "mbe-1" }, q.label),
          h(
            "div",
            { class: "flex flex-wrap gap-2" },
            q.options.map((o) =>
              h(
                "label",
                {
                  class:
                    "flex min-block-11 items-center gap-2 rounded-md border border-ink/30 px-3 has-checked:border-fire has-checked:bg-fire/10",
                },
                h("input", {
                  type: "radio",
                  name: q.id,
                  value: o,
                  required: true,
                  class: "form-radio block-5 inline-5 text-fire",
                }),
                o,
              ),
            ),
          ),
        ),
      );
    }
  }
  form.append(btn("Draft it", null, "primary", { type: "submit" }));
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const answers = Object.fromEntries(new FormData(form));
    try {
      const updated = await api(`api/items/${item.id}/answers`, {
        method: "POST",
        body: { answers },
      });
      form.remove();
      result(updated, card);
      onDone();
    } catch (err) {
      statusLine(card, err.message, "danger");
    }
  });
  card.append(form);
  form.querySelector("input")?.focus();
}

function result(item, card) {
  card.querySelector("[data-title]").textContent = item.title;
  if (item.status === "ready-to-publish") {
    statusLine(
      card,
      `Ready to publish (confidence ${item.confidence.toFixed(2)}). Waiting in your confirm queue.`,
      "ok",
    );
  } else {
    statusLine(
      card,
      `Needs review (confidence ${item.confidence.toFixed(2)}). Edit it in the table below to approve.`,
      "warn",
    );
  }
}

export function setupUpload({ onChange }) {
  const form = document.querySelector("[data-upload-form]");
  const input = form.querySelector("[data-photo-input]");
  const list = document.querySelector("[data-drafts]");
  const zone = form.querySelector("[data-dropzone]");

  async function processGroup(files, hint) {
    const thumbs = h("div", { class: "flex flex-wrap gap-2" });
    const card = h(
      "li",
      { class: "grid gap-2 rounded-lg border border-ink/15 p-3" },
      h(
        "p",
        { class: "font-semibold", "data-title": "" },
        files.length > 1 ? `${files.length} photos, one item` : files[0].name,
      ),
      thumbs,
      h("p", { "data-line": "" }),
    );
    list.prepend(card);
    statusLine(card, "Cleaning and uploading");
    try {
      const photos = await Promise.all(files.map(uploadPhoto));
      for (const p of photos) {
        thumbs.append(
          h("img", {
            src: p.preview,
            alt: "",
            width: 64,
            height: 64,
            class: "block-16 inline-16 rounded-md object-cover",
          }),
        );
      }
      statusLine(card, "Drafting");
      const item = await api("api/drafts", {
        method: "POST",
        body: { photoIds: photos.map((p) => p.id), hint },
      });
      const flags = flagsList(item.privacy_flags);
      if (flags) card.insertBefore(flags, card.querySelector("[data-line]"));
      if (item.questions?.length) {
        statusLine(card, "Needs your answers", "warn");
        interview(item, card, onChange);
      } else result(item, card);
      onChange();
    } catch (err) {
      statusLine(card, `${err.message} Try another photo.`, "danger");
    }
  }

  function start(fileList) {
    const files = [...fileList].filter(
      (f) => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name),
    );
    if (!files.length) return;
    const hintInput = form.querySelector("[data-upload-hint]");
    const hint = hintInput.value.trim();
    const groups = form.querySelector("[data-group-photos]").checked
      ? [files]
      : files.map((f) => [f]);
    groups.forEach((g) => processGroup(g, hint));
    input.value = "";
    hintInput.value = "";
  }

  input.addEventListener("change", () => start(input.files));
  zone.addEventListener("dragover", (e) => e.preventDefault());
  zone.addEventListener("drop", (e) => {
    e.preventDefault();
    start(e.dataTransfer.files);
  });
}
