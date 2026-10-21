import { BRAND } from "../brand/tokens.js";
import { VisError } from "../core/errors.js";
import { el } from "../core/svg.js";
import {
  MAX_DIMENSION,
  bounded,
  describeValue,
  fade,
  integerIn,
  parsePaint,
} from "./types.js";
import type { PatternCtx, StripesSpec, TileOutput } from "./types.js";

/** One `<rect>` per colour; this keeps the tile and the output small. */
const MAX_COLORS = 64;

/**
 * The LoadStripes bars: four colours, 16px wide, 4px gap, 44px tall. The tile
 * is one row of bars, `gap` px taller than the bars so rows are separated too.
 */
export function renderStripes(spec: StripesSpec, ctx: PatternCtx): TileOutput {
  const raw: unknown = spec.colors ?? BRAND.stripes;
  if (!Array.isArray(raw))
    throw new VisError(
      `colors must be an array of colour strings, got ${describeValue(raw)}`,
    );
  const list: readonly unknown[] = raw;
  integerIn("colors length", list.length, 1, MAX_COLORS);
  const paints = list.map((c, i) => parsePaint(`colors[${i}]`, c));
  const barWidth = bounded("barWidth", spec.barWidth ?? 16, 1, MAX_DIMENSION);
  const gap = bounded("gap", spec.gap ?? 4, 0, MAX_DIMENSION);
  const barHeight = bounded(
    "barHeight",
    spec.barHeight ?? 44,
    1,
    MAX_DIMENSION,
  );
  const width = paints.length * (barWidth + gap);
  const height = barHeight + gap;
  if (width > MAX_DIMENSION)
    throw new VisError(
      `stripes tile width (colors x (barWidth + gap)) must be at most ${MAX_DIMENSION}, got ${width}`,
    );
  if (height > MAX_DIMENSION)
    throw new VisError(
      `stripes tile height (barHeight + gap) must be at most ${MAX_DIMENSION}, got ${height}`,
    );
  const bars = paints.map((p, i) =>
    el("rect", {
      x: i * (barWidth + gap),
      y: 0,
      width: barWidth,
      height: barHeight,
      fill: p.hex,
      "fill-opacity": fade(ctx.opacity * p.alpha),
    }),
  );
  return { tile: { width, height }, body: bars.join("") };
}
