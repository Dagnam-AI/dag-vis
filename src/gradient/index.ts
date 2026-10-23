import { VisError } from "../core/errors.js";
import type { Size } from "../core/geometry.js";
import { createRng } from "../core/rng.js";
import { el, svgDoc } from "../core/svg.js";
import {
  bounded,
  orDefault,
  parseId,
  parseSeed,
  parseSize,
} from "../core/validate.js";
import { renderAurora } from "./aurora.js";
import { renderBanded } from "./banded.js";
import { renderConic } from "./conic.js";
import { renderFluted } from "./fluted.js";
import { renderFreeform } from "./freeform.js";
import { renderGlows } from "./glows.js";
import { grainLayer } from "./grain.js";
import { renderLayers } from "./layers.js";
import { renderLinear } from "./linear.js";
import { renderMesh } from "./mesh.js";
import { overlayLayer, parseOverlay } from "./overlay.js";
import { renderRadial } from "./radial.js";
import { assertSpec, assertSpecBudget } from "./spec.js";
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

/** Longest `idPrefix`: room for the scene generators' own `-base`/`-bg` suffixes. */
const MAX_ID = 80;

function renderKind(spec: GradientSpec, ctx: Ctx): KindOutput {
  assertSpec(spec);
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
    case "glows":
      return renderGlows(spec, ctx);
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
  assertSpec(spec);
  assertSpecBudget(spec);
  const size = parseSize("size", orDefault<unknown>(spec.size, DEFAULT_SIZE));
  const grain =
    spec.grain === undefined ? undefined : bounded("grain", spec.grain, 0, 1);
  const overlay =
    spec.overlay === undefined ? undefined : parseOverlay(spec.overlay);
  const seed = parseSeed(spec.seed);
  const id = parseId(
    "idPrefix",
    orDefault<unknown>(spec.idPrefix, `vis${seed}`),
    MAX_ID,
  );
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
  if (grain !== undefined && grain > 0) {
    const g = grainLayer(id, grain, size, seed);
    defs += g.defs;
    svg += g.svg;
  }
  if (overlay) {
    const o = overlayLayer(overlay, size);
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
  assertSpec(spec);
  const resolved = orDefault<unknown>(
    size,
    orDefault<unknown>(spec.size, DEFAULT_SIZE),
  ) as Size; // gradient() validates it next
  const g = gradient({ ...spec, size: resolved });
  return svgDoc(resolved, el("defs", {}, g.defs), g.svg);
}
