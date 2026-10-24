import { deflateSync } from "node:zlib";

import { VisError } from "../core/errors.js";
import { MAX_DIMENSION, describeValue, integerIn } from "../core/validate.js";
import { crc32 } from "../export/crc32.js";

const SIGNATURE = Buffer.from("89504e470d0a1a0a", "hex");

/** Most pixels one PNG may hold: the same cap `renderField` applies to a frame. */
const MAX_PIXELS = 2 ** 25;

function chunk(type: string, body: Uint8Array): Buffer {
  const typed = Buffer.concat([Buffer.from(type, "latin1"), body]);
  const out = Buffer.alloc(typed.length + 8);
  out.writeUInt32BE(body.length, 0);
  typed.copy(out, 4);
  out.writeUInt32BE(crc32(typed), typed.length + 4);
  return out;
}

/**
 * 8-bit RGBA PNG (straight alpha), filter type 0 on every row, deflated with
 * `node:zlib`. No dependency. `width` and `height` are whole pixels in
 * 1..16384 and at most 2^25 pixels together; `rgba` must hold exactly
 * `width * height * 4` bytes. The bytes are a pure function of the arguments
 * for one Node/zlib version.
 */
export function encodePng(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
): Buffer {
  integerIn("width", width, 1, MAX_DIMENSION);
  integerIn("height", height, 1, MAX_DIMENSION);
  if (width * height > MAX_PIXELS)
    throw new VisError(
      `width x height must be at most ${MAX_PIXELS} pixels, got ${width} x ${height}`,
    );
  if (!(rgba instanceof Uint8Array) && !(rgba instanceof Uint8ClampedArray))
    throw new VisError(
      `rgba must be a Uint8Array or Uint8ClampedArray, got ${describeValue(rgba)}`,
    );
  const stride = width * 4;
  if (rgba.length !== stride * height)
    throw new VisError(
      `rgba must have ${stride * height} bytes for ${width} x ${height}, got ${rgba.length}`,
    );
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++)
    raw.set(rgba.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  return Buffer.concat([
    SIGNATURE,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
