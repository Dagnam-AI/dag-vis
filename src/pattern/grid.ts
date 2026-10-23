import { fmt } from "../core/format.js";
import { el } from "../core/svg.js";
import { fade } from "./types.js";
import type { GridSpec, PatternCtx, TileOutput } from "./types.js";

/**
 * A square grid: the top and left line of each tile. Each line is drawn
 * INSIDE the tile (its centre half a stroke in), because a stroke centred on
 * the tile edge is clipped to half its width. One path, so where the two
 * lines cross they are one stroke and do not darken under opacity.
 */
export function renderGrid(_spec: GridSpec, ctx: PatternCtx): TileOutput {
  const s = fmt(ctx.spacing);
  const o = fmt(ctx.strokeWidth / 2);
  return {
    tile: { width: ctx.spacing, height: ctx.spacing },
    body: el("path", {
      d: `M0 ${o}H${s}M${o} 0V${s}`,
      fill: "none",
      stroke: ctx.color,
      "stroke-width": ctx.strokeWidth,
      "stroke-opacity": fade(ctx.alpha),
    }),
  };
}
