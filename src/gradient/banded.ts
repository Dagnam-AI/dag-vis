import { toHex } from "../core/color.js";
import { VisError } from "../core/errors.js";
import { renderLinear } from "./linear.js";
import { normalizeStops, sampleStops } from "./stops.js";
import type { BandedSpec, Ctx, KindOutput, Stop } from "./types.js";

/** Posterised linear gradient: `bands` flat steps with hard edges. */
export function renderBanded(spec: BandedSpec, ctx: Ctx): KindOutput {
  if (!Number.isInteger(spec.bands) || spec.bands < 2)
    throw new VisError(
      `banded needs an integer bands >= 2, got ${String(spec.bands)}`,
    );
  const stops = normalizeStops(spec.stops);
  const hard: Stop[] = [];
  for (let i = 0; i < spec.bands; i++) {
    const color = toHex(sampleStops(stops, i / (spec.bands - 1)));
    hard.push(
      { color, at: i / spec.bands },
      { color, at: (i + 1) / spec.bands },
    );
  }
  return renderLinear(
    { kind: "linear", angle: spec.angle ?? 180, stops: hard },
    ctx,
  );
}
