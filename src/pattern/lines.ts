import { fmt } from "../core/format.js";
import { el } from "../core/svg.js";
import { fade, finite } from "./types.js";
import type { LinesSpec, PatternCtx, TileOutput } from "./types.js";

/**
 * Parallel lines `spacing` apart, rotated by `angle` degrees about the
 * origin of the sample. Lines run the full tile, so the lattice is seamless
 * inside the sample; at an angle that is not a multiple of 90 degrees the
 * rotated lattice does not line up with a repeated copy of the sample, so
 * `cssBackground` shows a seam where it repeats.
 */
export function renderLines(spec: LinesSpec, ctx: PatternCtx): TileOutput {
  const s = ctx.spacing;
  // A turn is a turn: keeps `rotate()` small however large the input.
  const angle = finite("angle", spec.angle ?? 0) % 360;
  const out: TileOutput = {
    tile: { width: s, height: s },
    body: el("line", {
      x1: 0,
      y1: s / 2,
      x2: s,
      y2: s / 2,
      stroke: ctx.color,
      "stroke-width": ctx.strokeWidth,
      "stroke-opacity": fade(ctx.alpha),
    }),
  };
  if (angle !== 0) out.patternTransform = `rotate(${fmt(angle)})`;
  return out;
}
