import { el } from "../core/svg.js";
import {
  MAX_DIMENSION,
  MIN_RESOLUTION,
  bounded,
  fade,
  orDefault,
} from "./types.js";
import type { DotsSpec, PatternCtx, TileOutput } from "./types.js";

/** One dot per square tile. CSS form: `cssBackground` (the same SVG as a data URI). */
export function renderDots(spec: DotsSpec, ctx: PatternCtx): TileOutput {
  const s = ctx.spacing;
  const r = bounded(
    "radius",
    orDefault(spec.radius, s * 0.12),
    MIN_RESOLUTION,
    MAX_DIMENSION,
  );
  return {
    tile: { width: s, height: s },
    body: el("circle", {
      cx: s / 2,
      cy: s / 2,
      r,
      fill: ctx.color,
      "fill-opacity": fade(ctx.alpha),
    }),
  };
}
