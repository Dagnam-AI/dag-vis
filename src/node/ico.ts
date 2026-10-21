import { VisError } from "../core/errors.js";
import { describeValue } from "../core/validate.js";

/** Most images one ICO may hold (a favicon set has 3; Windows tools top out near 10). */
export const MAX_ICO_IMAGES = 16;
/** Largest single PNG accepted: a 256 x 256 RGBA PNG is about 256 KiB even incompressible. */
export const MAX_ICO_IMAGE_BYTES = 1_048_576;

const PNG_SIGNATURE = Buffer.from("89504e470d0a1a0a", "hex");
// The 8 bytes after the signature of a valid first chunk: length 13, type "IHDR".
const IHDR_HEADER = Buffer.from("0000000d49484452", "hex");
// A PNG ends with the empty IEND chunk (length 0, type, CRC), always the same 12 bytes.
const IEND_CHUNK = Buffer.from("0000000049454e44ae426082", "hex");

const HEADER_BYTES = 6;
const ENTRY_BYTES = 16;

/** Pixel size of a PNG that passes every structural check, or a VisError naming `name`. */
function pngSize(name: string, png: unknown): number {
  if (
    !Buffer.isBuffer(png) ||
    png.length < 8 + 25 + IEND_CHUNK.length ||
    !png.subarray(0, 8).equals(PNG_SIGNATURE) ||
    !png.subarray(8, 16).equals(IHDR_HEADER) ||
    !png.subarray(png.length - IEND_CHUNK.length).equals(IEND_CHUNK)
  )
    throw new VisError(
      `${name} must be a PNG file in a Buffer (signature, IHDR first, IEND last), got ${Buffer.isBuffer(png) ? `${png.length} bytes` : describeValue(png)}`,
    );
  if (png.length > MAX_ICO_IMAGE_BYTES)
    throw new VisError(
      `${name} must be at most ${MAX_ICO_IMAGE_BYTES} bytes, got ${png.length}`,
    );
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  if (width !== height || width < 1 || width > 256)
    throw new VisError(
      `${name} must be a square PNG of 1..256 px, got ${width}x${height}`,
    );
  return width;
}

/**
 * An ICO container embedding PNG images (what every modern browser reads),
 * written by hand so there is no dependency. The bytes depend only on the
 * inputs (no timestamps). Each input must be a PNG Buffer, square, 1..256 px;
 * between 1 and MAX_ICO_IMAGES images.
 */
export function icoFromPngs(pngs: readonly Buffer[]): Buffer {
  const list: unknown = pngs;
  if (!Array.isArray(list))
    throw new VisError(
      `pngs must be an array of PNG Buffers, got ${describeValue(list)}`,
    );
  if (list.length < 1 || list.length > MAX_ICO_IMAGES)
    throw new VisError(
      `an ICO needs 1..${MAX_ICO_IMAGES} images, got ${list.length}`,
    );
  const header = Buffer.alloc(HEADER_BYTES);
  header.writeUInt16LE(1, 2); // type: icon (bytes 0-1 reserved, left 0)
  header.writeUInt16LE(list.length, 4);
  const entries: Buffer[] = [];
  const images: Buffer[] = [];
  let offset = HEADER_BYTES + ENTRY_BYTES * list.length;
  list.forEach((png: unknown, i) => {
    const side = pngSize(`pngs[${i}]`, png);
    const image = Buffer.from(png as Buffer); // copy: the result owns its bytes
    const entry = Buffer.alloc(ENTRY_BYTES);
    // Width and height are one byte each; 256 is stored as 0. Bytes 2-3
    // (palette size, reserved) stay 0.
    entry.writeUInt8(side === 256 ? 0 : side, 0);
    entry.writeUInt8(side === 256 ? 0 : side, 1);
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(image.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    images.push(image);
    offset += image.length;
  });
  return Buffer.concat([header, ...entries, ...images]);
}
