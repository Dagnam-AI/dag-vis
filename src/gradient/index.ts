import { VisError } from "../core/errors.js";
import { assertSize } from "../core/geometry.js";
import type { Size } from "../core/geometry.js";
import { createRng } from "../core/rng.js";
import { el, svgDoc } from "../core/svg.js";
import { renderConic } from "./conic.js";
import { grainLayer } from "./grain.js";
import { renderLinear } from "./linear.js";
import { overlayLayer } from "./overlay.js";
import { renderRadial } from "./radial.js";
import type {
  Blend,
  Ctx,
  GradientResult,
  GradientSpec,
  KindOutput,
} from "./types.js";

export * from "./types.js";
export { normalizeStops, sampleStops, cssStops, svgStops } from "./stops.js";
export type { NormalizedStop } from "./stops.js";

export const BLENDS: readonly Blend[] = [
  "normal",
  "multiply",
  "screen",
  "overlay",
  "soft-light",
];
const DEFAULT_SIZE: Size = { width: 1200, height: 630 };

function assertUnitRange(name: string, v: number | undefined): void {
  if (v !== undefined && (!Number.isFinite(v) || v < 0 || v > 1))
    throw new VisError(`${name} must be in 0..1, got ${String(v)}`);
}

export function assertBlend(blend: string | undefined): void {
  if (blend !== undefined && !BLENDS.includes(blend as Blend)) {
    throw new VisError(
      `unknown blend mode: ${blend} (known: ${BLENDS.join(", ")})`,
    );
  }
}

function renderKind(spec: GradientSpec, ctx: Ctx): KindOutput {
  switch (spec.kind) {
    case "linear":
      return renderLinear(spec, ctx);
    case "radial":
      return renderRadial(spec, ctx);
    case "conic":
      return renderConic(spec, ctx);
    default:
      throw new VisError(
        `unknown gradient kind: ${String((spec as { kind?: unknown }).kind)}`,
      );
  }
}

/** CSS + SVG for one spec. `svg` is body markup; pair it with `defs`. */
export function gradient(spec: GradientSpec): GradientResult {
  const size = spec.size ?? DEFAULT_SIZE;
  assertSize(size);
  assertUnitRange("grain", spec.grain);
  assertUnitRange("overlay.opacity", spec.overlay?.opacity);
  assertBlend(spec.overlay?.blend);
  const seed = spec.seed ?? 1;
  if (!Number.isSafeInteger(seed))
    throw new VisError(`seed must be a safe integer, got ${String(seed)}`);
  const id = spec.idPrefix ?? `vis${seed}`;
  const ctx: Ctx = {
    id,
    size,
    rng: createRng(seed),
    render: (sub, subId) => renderKind(sub, { ...ctx, id: subId }),
  };
  const out = renderKind(spec, ctx);
  let defs = out.defs;
  let svg = el("rect", {
    width: size.width,
    height: size.height,
    fill: out.fill,
  });
  const images = [...out.cssImages];
  const blends = out.cssBlend === undefined ? [] : [out.cssBlend];
  if (spec.grain !== undefined && spec.grain > 0) {
    const g = grainLayer(id, spec.grain, size, seed);
    defs += g.defs;
    svg += g.svg;
  }
  if (spec.overlay) {
    const o = overlayLayer(spec.overlay, size);
    svg += o.svg;
    images.unshift(o.cssImage);
    blends.unshift(o.cssBlend);
  }
  let css = `background: ${images.join(", ")};`;
  if (blends.length > 0) {
    const all = images.map((_, i) => blends[i] ?? "normal");
    css += ` background-blend-mode: ${all.join(", ")};`;
  }
  return { css, svg, defs, fill: out.fill };
}

/** A standalone `<svg>` document. `size` overrides `spec.size`. */
export function gradientSvg(spec: GradientSpec, size?: Size): string {
  const resolved = size ?? spec.size ?? DEFAULT_SIZE;
  const g = gradient({ ...spec, size: resolved });
  return svgDoc(resolved, el("defs", {}, g.defs), g.svg);
}
