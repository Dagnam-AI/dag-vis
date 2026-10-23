import { parseColor, toHex, withAlpha } from "./color.js";
import type { Rgba } from "./color.js";
import { VisError } from "./errors.js";
import { QUOTE_LIMIT, describeValue } from "./describe.js";
import type { Size } from "./geometry.js";

export { describeValue };

/** Largest size, spacing or tile side: keeps every number far from exponent notation. */
export const MAX_DIMENSION = 16384;

/** A parsed colour: opaque hex plus its alpha, so output never needs 8-digit hex. */
export interface Paint {
  hex: string;
  alpha: number;
}

/**
 * `v`, or `fallback` ONLY when `v` is undefined. Unlike `??` it leaves `null`
 * (from a JS caller) for the validator to reject, naming the parameter.
 */
export function orDefault<T>(v: T | undefined, fallback: T): T {
  if (v === undefined) return fallback;
  return v;
}

/** Finite number in [min, max]. JS callers can pass anything, so the type is checked too. */
export function bounded(
  name: string,
  v: unknown,
  min: number,
  max: number,
): number {
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max)
    throw new VisError(
      `${name} must be a number in ${min}..${max}, got ${describeValue(v)}`,
    );
  return v;
}

export function finite(name: string, v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v))
    throw new VisError(
      `${name} must be a finite number, got ${describeValue(v)}`,
    );
  return v;
}

/** Integer in [min, max]. */
export function integerIn(
  name: string,
  v: unknown,
  min: number,
  max: number,
): number {
  if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max)
    throw new VisError(
      `${name} must be an integer in ${min}..${max}, got ${describeValue(v)}`,
    );
  return v;
}

/** A seed: a safe integer, default 1 (only when undefined). */
export function parseSeed(v: unknown): number {
  const seed = orDefault<unknown>(v, 1);
  if (typeof seed !== "number" || !Number.isSafeInteger(seed))
    throw new VisError(
      `seed must be a safe integer, got ${describeValue(seed)}`,
    );
  return seed;
}

/** A colour string → its parsed value. Errors name the parameter. */
export function parseRgba(name: string, v: unknown): Rgba {
  if (typeof v !== "string")
    throw new VisError(
      `${name} must be a colour string, got ${describeValue(v)}`,
    );
  // No colour is this long; do not hand a megabyte string to the parser or an error.
  if (v.length > QUOTE_LIMIT)
    throw new VisError(
      `${name} must be a colour of at most ${QUOTE_LIMIT} characters, got ${describeValue(v)}`,
    );
  try {
    return parseColor(v);
  } catch (e) {
    throw new VisError(`${name}: ${(e as VisError).message}`);
  }
}

/** A colour string → opaque hex + alpha. Errors name the parameter. */
export function parsePaint(name: string, v: unknown): Paint {
  const c = parseRgba(name, v);
  return { hex: toHex(withAlpha(c, 1)), alpha: c.a };
}

/** A number above zero (no upper bound). */
export function positive(name: string, v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0)
    throw new VisError(`${name} must be positive, got ${describeValue(v)}`);
  return v;
}

/** `true`, `false`, or `false` when undefined: `null`, `1` and `"yes"` are not flags. */
export function parseFlag(name: string, v: unknown): boolean {
  const flag = orDefault<unknown>(v, false);
  if (typeof flag !== "boolean")
    throw new VisError(
      `${name} must be true or false, got ${describeValue(flag)}`,
    );
  return flag;
}

/** An options bag must be an object: JS callers can pass `null` or a number. */
export function assertOptions(v: unknown): asserts v is object {
  if (typeof v !== "object" || v === null)
    throw new VisError(`options must be an object, got ${describeValue(v)}`);
}

/** `{ width, height }`, each 1..MAX_DIMENSION: the one size rule every generator shares. */
export function parseSize(name: string, v: unknown): Size {
  if (typeof v !== "object" || v === null || Array.isArray(v))
    throw new VisError(
      `${name} must be an object { width, height }, got ${describeValue(v)}`,
    );
  const { width, height } = v as { width?: unknown; height?: unknown };
  return {
    width: bounded(`${name}.width`, width, 1, MAX_DIMENSION),
    height: bounded(`${name}.height`, height, 1, MAX_DIMENSION),
  };
}

/**
 * An id that is a valid XML name and safe inside `url(#…)`: a letter or `_`,
 * then up to `maxLength - 1` letters, digits, `_` or `-`.
 */
export function parseId(name: string, v: unknown, maxLength: number): string {
  if (
    typeof v !== "string" ||
    v.length > maxLength ||
    !/^[A-Za-z_][\w-]*$/.test(v)
  )
    throw new VisError(
      `${name} must be a valid id (a letter or "_", then up to ${maxLength - 1} letters, digits, "_" or "-"), got ${describeValue(v)}`,
    );
  return v;
}

/** Runs a nested generator; a VisError it throws gets `name: ` in front, with the original as `cause`. */
export function within<T>(name: string, run: () => T): T {
  try {
    return run();
  } catch (e) {
    if (!(e instanceof VisError)) throw e;
    const wrapped = new VisError(`${name}: ${e.message}`);
    wrapped.cause = e;
    throw wrapped;
  }
}
