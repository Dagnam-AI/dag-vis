import { VisError } from "../core/errors.js";
import { fmt } from "../core/format.js";
import { el } from "../core/svg.js";
import { cssStops, normalizeStops, svgStops } from "./stops.js";
import type { Ctx, KindOutput, RadialSpec } from "./types.js";

export function assertUnit(name: string, v: readonly [number, number]): void {
  for (const c of v) {
    if (!Number.isFinite(c) || c < 0 || c > 1)
      throw new VisError(
        `${name} must be unit coordinates in 0..1, got [${String(v[0])}, ${String(v[1])}]`,
      );
  }
}

export function renderRadial(spec: RadialSpec, ctx: Ctx): KindOutput {
  const at = spec.at ?? [0.5, 0.5];
  assertUnit("radial `at`", at);
  const radius = spec.radius ?? 0.5;
  if (!Number.isFinite(radius) || radius <= 0)
    throw new VisError(`radial radius must be positive, got ${String(radius)}`);
  const stops = normalizeStops(spec.stops, spec.reverse);
  const { width, height } = ctx.size;
  const id = `${ctx.id}-g`;
  const fn = spec.repeat ? "repeating-radial-gradient" : "radial-gradient";
  const circle = (spec.shape ?? "circle") === "circle";
  const minSide = Math.min(width, height);
  const shapeCss = circle
    ? `circle ${fmt(radius * minSide)}px`
    : `ellipse ${fmt(radius * 100)}% ${fmt(radius * 100)}%`;
  const attrs = circle
    ? {
        id,
        gradientUnits: "userSpaceOnUse",
        cx: at[0] * width,
        cy: at[1] * height,
        r: radius * minSide,
      }
    : { id, cx: at[0], cy: at[1], r: radius };
  return {
    defs: el(
      "radialGradient",
      { ...attrs, spreadMethod: spec.repeat ? "repeat" : undefined },
      svgStops(stops),
    ),
    fill: `url(#${id})`,
    cssImages: [
      `${fn}(${shapeCss} at ${fmt(at[0] * 100)}% ${fmt(at[1] * 100)}%, ${cssStops(stops)})`,
    ],
  };
}
