import { fmt } from "../core/format.js";
import { el } from "../core/svg.js";
import { cssStops, normalizeStops, svgStops } from "./stops.js";
import type { Ctx, KindOutput, LinearSpec } from "./types.js";

export function renderLinear(spec: LinearSpec, ctx: Ctx): KindOutput {
  const angle = spec.angle ?? 180;
  const stops = normalizeStops(spec.stops, spec.reverse);
  const rad = (angle * Math.PI) / 180;
  const dx = Math.sin(rad);
  const dy = -Math.cos(rad);
  const id = `${ctx.id}-g`;
  const fn = spec.repeat ? "repeating-linear-gradient" : "linear-gradient";
  return {
    defs: el(
      "linearGradient",
      {
        id,
        x1: 0.5 - dx / 2,
        y1: 0.5 - dy / 2,
        x2: 0.5 + dx / 2,
        y2: 0.5 + dy / 2,
        spreadMethod: spec.repeat ? "repeat" : undefined,
      },
      svgStops(stops),
    ),
    fill: `url(#${id})`,
    cssImages: [`${fn}(${fmt(angle)}deg, ${cssStops(stops)})`],
  };
}
