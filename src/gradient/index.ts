import { VisError } from "../core/errors.js";
import { assertSize } from "../core/geometry.js";
import type { Size } from "../core/geometry.js";
import { createRng } from "../core/rng.js";
import { el, svgDoc } from "../core/svg.js";
import { renderAurora } from "./aurora.js";
import { renderBanded } from "./banded.js";
import { renderConic } from "./conic.js";
import { renderFluted } from "./fluted.js";
import { renderFreeform } from "./freeform.js";
import { grainLayer } from "./grain.js";
import { renderLayers } from "./layers.js";
import { renderLinear } from "./linear.js";
import { renderMesh } from "./mesh.js";
import { overlayLayer } from "./overlay.js";
import { renderRadial } from "./radial.js";
import { assertBlend } from "./stops.js";
import type { Ctx, GradientResult, GradientSpec, KindOutput } from "./types.js";

export * from "./types.js";
export {
  BLENDS,
  assertBlend,
  normalizeStops,
  sampleStops,
  cssStops,
  svgStops,
} from "./stops.js";
export type { NormalizedStop } from "./stops.js";
export { animatedGradientCss } from "./animated.js";
export type { AnimatedOptions } from "./animated.js";
export {
  FREEFORM_PALETTES,
  freeformPalette,
  freeformRandom,
} from "./freeform.js";

const DEFAULT_SIZE: Size = { width: 1200, height: 630 };

function assertUnitRange(name: string, v: number | undefined): void {
  if (v !== undefined && (!Number.isFinite(v) || v < 0 || v > 1))
    throw new VisError(`${name} must be in 0..1, got ${String(v)}`);
}

function renderKind(spec: GradientSpec, ctx: Ctx): KindOutput {
  switch (spec.kind) {
    case "linear":
      return renderLinear(spec, ctx);
    case "radial":
      return renderRadial(spec, ctx);
    case "conic":
      return renderConic(spec, ctx);
    case "mesh":
      return renderMesh(spec, ctx);
    case "aurora":
      return renderAurora(spec, ctx);
    case "banded":
      return renderBanded(spec, ctx);
    case "layers":
      return renderLayers(spec, ctx);
    case "freeform":
      return renderFreeform(spec, ctx);
    case "fluted":
      return renderFluted(spec, ctx);
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
  // A kind returns the whole comma list: one mode per CSS image, top first.
  let blends =
    out.cssBlend === undefined ? undefined : out.cssBlend.split(", ");
  if (spec.grain !== undefined && spec.grain > 0) {
    const g = grainLayer(id, spec.grain, size, seed);
    defs += g.defs;
    svg += g.svg;
  }
  if (spec.overlay) {
    const o = overlayLayer(spec.overlay, size);
    svg += o.svg;
    blends = [o.cssBlend, ...(blends ?? images.map(() => "normal"))];
    images.unshift(o.cssImage);
  }
  let css = `background: ${images.join(", ")};`;
  if (blends !== undefined)
    css += ` background-blend-mode: ${blends.join(", ")};`;
  return { css, svg, defs, fill: out.fill };
}

/** A standalone `<svg>` document. `size` overrides `spec.size`. */
export function gradientSvg(spec: GradientSpec, size?: Size): string {
  const resolved = size ?? spec.size ?? DEFAULT_SIZE;
  const g = gradient({ ...spec, size: resolved });
  return svgDoc(resolved, el("defs", {}, g.defs), g.svg);
}
