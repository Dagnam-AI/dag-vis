import { VisError } from "./errors.js";

/**
 * Number → attribute/path text with at most 3 decimals, trailing zeros
 * trimmed and no "-0". Every number that reaches an output string goes
 * through here so output never drifts across engines.
 */
export function fmt(n: number): string {
  if (!Number.isFinite(n))
    throw new VisError(`fmt() needs a finite number, got ${String(n)}`);
  const rounded = Math.round(n * 1000) / 1000;
  return rounded === 0 ? "0" : String(rounded);
}
