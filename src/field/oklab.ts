/**
 * OKLab and sRGB with the exact constants the GLSL `oklabToRgb` uses (Björn
 * Ottosson's matrices). Numeric kernels: components are plain numbers, sRGB in
 * 0..1; `rgbToOklab` does not clamp its input and `oklabToRgb` clamps linear RGB
 * before companding (a negative base would be undefined in `pow` on a GPU too).
 * Parsing and validating colour strings happens in `lut.ts`, not here.
 */

export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

/** sRGB (0..1) to [L, a, b]. Allocates the result; use it for palette set-up, not per pixel. */
export function rgbToOklab(
  r: number,
  g: number,
  b: number,
): [number, number, number] {
  const R = srgbToLinear(r);
  const G = srgbToLinear(g);
  const B = srgbToLinear(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Writes sRGB (0..1) into `out[offset..offset + 2]`, clamping out-of-gamut colours. */
export function oklabToRgb(
  L: number,
  a: number,
  b: number,
  out: Float64Array,
  offset: number,
): void {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  out[offset] = linearToSrgb(
    clamp01(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
  );
  out[offset + 1] = linearToSrgb(
    clamp01(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
  );
  out[offset + 2] = linearToSrgb(
    clamp01(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  );
}
