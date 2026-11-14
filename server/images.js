// Strips metadata (EXIF, GPS, XMP, comments, text chunks) from uploaded photos.
// The browser already re-encodes photos through a canvas, which drops all metadata. This is the
// server-side second layer, so a photo that skipped the browser step still lands clean.

export function sniffType(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return "image/png";
  }
  return null;
}

export function stripJpeg(buf) {
  const out = [buf.subarray(0, 2)];
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) throw new Error("Malformed JPEG");
    const marker = buf[i + 1];
    if (marker === 0xff) {
      i += 1;
      continue;
    }
    // Standalone markers have no length field.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      out.push(buf.subarray(i, i + 2));
      i += 2;
      continue;
    }
    if (marker === 0xd9) {
      out.push(buf.subarray(i, i + 2));
      break;
    }
    const len = buf.readUInt16BE(i + 2);
    const end = i + 2 + len;
    if (end > buf.length) throw new Error("Malformed JPEG");
    const isAppOrComment = (marker >= 0xe1 && marker <= 0xef) || marker === 0xfe;
    if (!isAppOrComment) out.push(buf.subarray(i, end));
    if (marker === 0xda) {
      out.push(buf.subarray(end));
      break;
    }
    i = end;
  }
  return Buffer.concat(out);
}

const PNG_KEEP = new Set(["IHDR", "PLTE", "IDAT", "IEND", "tRNS", "gAMA", "sRGB", "cHRM", "sBIT"]);

export function stripPng(buf) {
  const out = [buf.subarray(0, 8)];
  let i = 8;
  while (i + 8 <= buf.length) {
    const len = buf.readUInt32BE(i);
    const type = buf.toString("latin1", i + 4, i + 8);
    const end = i + 12 + len;
    if (end > buf.length) throw new Error("Malformed PNG");
    if (PNG_KEEP.has(type)) out.push(buf.subarray(i, end));
    i = end;
    if (type === "IEND") break;
  }
  return Buffer.concat(out);
}

export function stripMetadata(buf) {
  const type = sniffType(buf);
  if (type === "image/jpeg") return { type, data: stripJpeg(buf) };
  if (type === "image/png") return { type, data: stripPng(buf) };
  return null;
}
