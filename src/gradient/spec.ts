import { VisError } from "../core/errors.js";
import { describeValue } from "../core/validate.js";
import type { GradientSpec } from "./types.js";

/**
 * A gradient spec can come from untyped JSON: it must be an object with a string
 * `kind` before anything reads a field of it. The kind's own renderer checks the rest.
 */
export function assertSpec(spec: unknown): asserts spec is GradientSpec {
  if (typeof spec !== "object" || spec === null)
    throw new VisError(
      `a gradient spec must be an object, got ${describeValue(spec)}`,
    );
  const { kind } = spec as { kind?: unknown };
  if (typeof kind !== "string")
    throw new VisError(
      `unknown gradient kind: ${describeValue(kind)} (a spec needs a string \`kind\`)`,
    );
}
