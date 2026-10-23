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

/**
 * Deepest nesting of `layers` / fluted `source` a spec may have (the root is level 1).
 * Real specs nest 2-3 deep (a fluted over a linear; a layers of fluted); 16 leaves room for
 * any stack a person writes and stops a 5000-deep JSON document before it overflows the
 * stack of the recursive renderers.
 */
export const MAX_SPEC_DEPTH = 16;
/**
 * Most nodes (the root, every layer and every fluted source, a shared sub-spec counted
 * once per place it is used) a spec may have. The costliest spec this package documents,
 * a layers of 8 fluted-256 layers over a linear one, has 17; 64 leaves ample room while
 * keeping a stack of fluted-256 layers (about 1 s each) to a bounded render time.
 */
export const MAX_SPEC_NODES = 64;

/** The sub-specs a node renders: a `layers` array's entries, a fluted `source`. */
function childrenOf(node: object): unknown[] {
  const { kind, layers, source } = node as {
    kind?: unknown;
    layers?: unknown;
    source?: unknown;
  };
  if (kind === "layers" && Array.isArray(layers)) return layers as unknown[];
  return kind === "fluted" ? [source] : [];
}

/**
 * Walks the spec tree once, iteratively (a deep or cyclic tree must not overflow the
 * stack), before anything renders it: a VisError for a cycle, for nesting deeper than
 * MAX_SPEC_DEPTH, or for more than MAX_SPEC_NODES nodes. Entries that are not objects are
 * left for the renderer to reject by name.
 */
export function assertSpecBudget(root: object): void {
  let nodes = 1;
  const stack: { node: object; path: readonly object[] }[] = [
    { node: root, path: [root] },
  ];
  const tooMany = (): VisError =>
    new VisError(
      `a gradient spec has more than ${MAX_SPEC_NODES} nodes (the spec, every layer and every fluted source count; one used twice counts twice)`,
    );
  for (let frame = stack.pop(); frame; frame = stack.pop()) {
    const children = childrenOf(frame.node);
    // Before walking: a huge (or sparse) array must not cost a huge loop.
    if (children.length >= MAX_SPEC_NODES) throw tooMany();
    for (const child of children) {
      if (typeof child !== "object" || child === null) continue;
      if (frame.path.includes(child))
        throw new VisError(
          "a gradient spec contains a cycle: a layer or fluted source refers to the spec that holds it",
        );
      if (frame.path.length >= MAX_SPEC_DEPTH)
        throw new VisError(
          `a gradient spec nests more than ${MAX_SPEC_DEPTH} levels deep (layers and fluted sources count as a level each)`,
        );
      nodes += 1;
      if (nodes > MAX_SPEC_NODES) throw tooMany();
      stack.push({ node: child, path: [...frame.path, child] });
    }
  }
}
