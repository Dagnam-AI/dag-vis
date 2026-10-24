import { VisError } from "../../core/index.js";
import { describeValue } from "../../core/validate.js";

/** A sampler's `width` or `height`: a positive finite number, else a VisError naming it. */
export function assertPositiveSize(name: string, v: number): void {
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0)
    throw new VisError(
      `${name} must be a positive finite number, got ${describeValue(v)}`,
    );
}

/** A pixel count (`width` or `height` of a picture): a positive integer, else a VisError naming it. */
export function assertPixelCount(name: string, v: number): void {
  if (typeof v !== "number" || !Number.isInteger(v) || v <= 0)
    throw new VisError(
      `${name} must be a positive integer number of pixels, got ${describeValue(v)}`,
    );
}

/**
 * Largest `u` or `v` (divided by max(aspect, 1)) a sampler with no tighter limit of its
 * own accepts. For a Gaussian field it keeps the exponent inside float32 range.
 */
export const UV_REACH = 1e6;

/** The VisError a sampler throws for a `u` or `v` outside its range (NaN and infinities included). */
export function uvError(name: string, v: number, limit: number): never {
  throw new VisError(
    `${name} must be a finite number within ±${limit}, got ${describeValue(v)}`,
  );
}
