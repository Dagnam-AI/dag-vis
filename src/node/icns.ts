import { VisError } from "../core/errors.js";
import { describeValue } from "../core/validate.js";
import { pngSize } from "./ico.js";

/**
 * The ICNS chunk types that hold a PNG of each pixel size. The codes are the ones
 * macOS's `iconutil` writes (ic07 128, ic08 256, ic09 512, ic10 1024 = 512@2x,
 * ic11 = 16@2x, ic12 = 32@2x, ic13 = 128@2x, ic14 = 256@2x) plus icp4 and icp5,
 * the 16 and 32 px PNGs (`iconutil` reads them back with `-c iconset`; it writes ARGB chunks for those two sizes itself). icp6 is NOT
 * used: macOS reads it as 48 px. A 2x chunk repeats the pixels of the size
 * whose 1x chunk it shares.
 */
export const ICNS_CHUNKS = {
  16: ["icp4"],
  32: ["icp5", "ic11"],
  64: ["ic12"],
  128: ["ic07"],
  256: ["ic08", "ic13"],
  512: ["ic09", "ic14"],
  1024: ["ic10"],
} as const;

/** Largest single PNG accepted: a 1024 x 1024 RGBA PNG is about 4 MiB even incompressible. */
export const MAX_ICNS_IMAGE_BYTES = 8_388_608;

type Side = keyof typeof ICNS_CHUNKS;
const SIDES = Object.keys(ICNS_CHUNKS).map(Number);
const isSide = (n: number): n is Side => Object.hasOwn(ICNS_CHUNKS, n);
const HEADER_BYTES = 8;

/**
 * An ICNS container (the macOS app-icon format) of PNG chunks, written by hand
 * so there is no dependency: the big-endian 'icns' header (magic, total length),
 * then one chunk per `ICNS_CHUNKS` type (4-byte type, big-endian length
 * including this 8-byte header, the PNG). Chunks are ordered by size, so the
 * bytes depend only on the inputs. Each input is a square PNG Buffer of 16, 32,
 * 64, 128, 256, 512 or 1024 px; no size twice; at least one.
 */
export function icnsFromPngs(pngs: readonly Buffer[]): Buffer {
  const list: unknown = pngs;
  if (!Array.isArray(list))
    throw new VisError(
      `pngs must be an array of PNG Buffers, got ${describeValue(list)}`,
    );
  if (list.length < 1 || list.length > SIDES.length)
    throw new VisError(
      `an ICNS needs 1..${SIDES.length} images, got ${list.length}`,
    );
  const bySide = new Map<Side, Buffer>();
  // Indexed, not forEach: a hole in a sparse array must reach the validator.
  for (let i = 0; i < list.length; i++) {
    const png: unknown = list[i];
    const name = `pngs[${i}]`;
    const side = pngSize(name, png, 1024, MAX_ICNS_IMAGE_BYTES);
    if (!isSide(side))
      throw new VisError(
        `${name} must be ${SIDES.slice(0, -1).join(", ")} or ${SIDES.at(-1)} px, got ${side}x${side}`,
      );
    if (bySide.has(side))
      throw new VisError(`${name} repeats the ${side} px size`);
    bySide.set(side, Buffer.from(png as Buffer)); // copy: the result owns its bytes
  }
  const chunks: Buffer[] = [];
  for (const [side, png] of [...bySide].sort(([a], [b]) => a - b)) {
    for (const type of ICNS_CHUNKS[side]) {
      const header = Buffer.alloc(HEADER_BYTES);
      header.write(type, 0, "latin1");
      header.writeUInt32BE(HEADER_BYTES + png.length, 4);
      chunks.push(header, png);
    }
  }
  const header = Buffer.alloc(HEADER_BYTES);
  header.write("icns", 0, "latin1");
  header.writeUInt32BE(
    HEADER_BYTES + chunks.reduce((n, c) => n + c.length, 0),
    4,
  );
  return Buffer.concat([header, ...chunks]);
}
