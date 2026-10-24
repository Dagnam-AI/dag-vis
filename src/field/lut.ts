import { VisError, ramp } from "../core/index.js";
import { describeValue, parseRgba } from "../core/validate.js";

export const LUT_SIZE = 256;

/**
 * 256 OKLab-interpolated RGB entries as float32 (alpha is dropped). The SAME array
 * is uploaded as the GPU texture, so CPU and GPU read identical colours.
 * `palette` is 2 or more colour strings; a bad one throws a VisError naming `palette[i]`.
 */
export function paletteLut(palette: readonly string[]): Float32Array {
  if (!Array.isArray(palette))
    throw new VisError(
      `palette must be an array of colours, got ${describeValue(palette)}`,
    );
  if (palette.length < 2)
    throw new VisError(
      `palette needs at least 2 colours, got ${palette.length}`,
    );
  // By index, so a hole in a sparse array is an error rather than skipped.
  for (let i = 0; i < palette.length; i++)
    parseRgba(`palette[${i}]`, palette[i]);
  const stops = ramp(palette, LUT_SIZE);
  const lut = new Float32Array(LUT_SIZE * 3);
  stops.forEach((c, i) => {
    lut[i * 3] = c.r;
    lut[i * 3 + 1] = c.g;
    lut[i * 3 + 2] = c.b;
  });
  return lut;
}

/**
 * Linear interpolation between two LUT entries into `out[0..2]`; mirrors the GLSL
 * `lutColor`. `v` is clamped to [0, 1] (the shader clamps too); NaN throws.
 * `lut` must come from `paletteLut`; `out` needs room for 3 values.
 */
export function sampleLut(
  lut: Float32Array,
  v: number,
  out: Float64Array,
): void {
  if (lut.length !== LUT_SIZE * 3)
    throw new VisError(
      `lut must have ${LUT_SIZE * 3} values (from paletteLut), got ${lut.length}`,
    );
  if (Number.isNaN(v)) throw new VisError("v must be a number, got NaN");
  const f = (v < 0 ? 0 : v > 1 ? 1 : v) * (LUT_SIZE - 1);
  const i = Math.min(LUT_SIZE - 2, Math.floor(f));
  const fr = f - i;
  for (let c = 0; c < 3; c++) {
    // Number(): a typed-array read is `number | undefined` under noUncheckedIndexedAccess,
    // and the length was checked above, so no read is ever out of range.
    const a = Number(lut[i * 3 + c]);
    const b = Number(lut[(i + 1) * 3 + c]);
    out[c] = a * (1 - fr) + b * fr;
  }
}
