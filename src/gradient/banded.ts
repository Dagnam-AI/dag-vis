import { toHex } from "../core/color.js";
import { VisError } from "../core/errors.js";
import { finite, orDefault } from "../core/validate.js";
import { renderLinear } from "./linear.js";
import { normalizeStops, sampleStops } from "./stops.js";
import type { BandedSpec, Ctx, KindOutput, Stop } from "./types.js";

/** Each band is two stops of CSS and SVG; this keeps the output to tens of KB. */
const MAX_BANDS = 256;

/** Posterised linear gradient: `bands` flat steps with hard edges. */
export function renderBanded(spec: BandedSpec, ctx: Ctx): KindOutput {
  if (!Number.isInteger(spec.bands) || spec.bands < 2 || spec.bands > MAX_BANDS)
    throw new VisError(
      `banded needs an integer bands in 2..${MAX_BANDS}, got ${String(spec.bands)}`,
    );
  const angle = finite("banded angle", orDefault<unknown>(spec.angle, 180));
  const stops = normalizeStops(spec.stops);
  const hard: Stop[] = [];
  for (let i = 0; i < spec.bands; i++) {
    const color = toHex(sampleStops(stops, i / (spec.bands - 1)));
    hard.push(
      { color, at: i / spec.bands },
      { color, at: (i + 1) / spec.bands },
    );
  }
  return renderLinear({ kind: "linear", angle, stops: hard }, ctx);
}
