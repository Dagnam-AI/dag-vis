import { fmt } from "../core/format.js";
import { el } from "../core/svg.js";
import { cssStops, normalizeStops, repeatSpan, svgStops } from "./stops.js";
import type { Ctx, KindOutput, LinearSpec } from "./types.js";

export function renderLinear(spec: LinearSpec, ctx: Ctx): KindOutput {
  const angle = spec.angle ?? 180;
  const stops = normalizeStops(spec.stops, spec.reverse);
  const { width, height } = ctx.size;
  const rad = (angle * Math.PI) / 180;
  const dx = Math.sin(rad);
  const dy = -Math.cos(rad);
  // CSS gradient line: through the centre, long enough that 0% and 100% sit on the
  // corners. In user space so the SVG bands match CSS in a non-square box.
  const half = (Math.abs(width * dx) + Math.abs(height * dy)) / 2;
  const x0 = width / 2 - dx * half;
  const y0 = height / 2 - dy * half;
  const x1 = width / 2 + dx * half;
  const y1 = height / 2 + dy * half;
  // Repeating: map the vector onto the stop span so SVG's whole-vector repeat matches.
  const win = spec.repeat ? repeatSpan(stops) : undefined;
  const [f, t] = win ? [win.from, win.to] : [0, 1];
  const id = `${ctx.id}-g`;
  const fn = spec.repeat ? "repeating-linear-gradient" : "linear-gradient";
  return {
    defs: el(
      "linearGradient",
      {
        id,
        gradientUnits: "userSpaceOnUse",
        x1: x0 + (x1 - x0) * f,
        y1: y0 + (y1 - y0) * f,
        x2: x0 + (x1 - x0) * t,
        y2: y0 + (y1 - y0) * t,
        spreadMethod: spec.repeat ? "repeat" : undefined,
      },
      svgStops(win ? win.unit : stops),
    ),
    fill: `url(#${id})`,
    cssImages: [`${fn}(${fmt(angle)}deg, ${cssStops(stops)})`],
  };
}
