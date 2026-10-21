import { VisError } from "./errors.js";

const MAX_MAGNITUDE = 1e15;

/**
 * Number → attribute/path text with at most 3 decimals, trailing zeros
 * trimmed and no "-0". Every number that reaches an output string goes
 * through here so output never drifts across engines.
 */
export function fmt(n: number): string {
  if (!Number.isFinite(n))
    throw new VisError(`fmt() needs a finite number, got ${String(n)}`);
  // Past this, String() switches to exponent form (1e21) or the rounding loses digits.
  if (Math.abs(n) >= MAX_MAGNITUDE)
    throw new VisError(
      `fmt() needs a number of magnitude below ${MAX_MAGNITUDE}, got ${String(n)}`,
    );
  const rounded = Math.round(n * 1000) / 1000;
  return rounded === 0 ? "0" : String(rounded);
}
