import { VisError } from "../core/errors.js";
import { fmt } from "../core/format.js";
import { el } from "../core/svg.js";
import {
  describeValue,
  orDefault,
  parseFlag,
  positive,
} from "../core/validate.js";
import {
  cssStops,
  normalizeStops,
  phaseShift,
  repeatSpan,
  svgStops,
} from "./stops.js";
import type { Ctx, KindOutput, RadialSpec } from "./types.js";

/** `[x, y]`, each in 0..1. JS callers can pass anything, so the shape is checked too. */
export function assertUnit(
  name: string,
  v: unknown,
): asserts v is readonly [number, number] {
  if (!Array.isArray(v) || v.length !== 2)
    throw new VisError(
      `${name} must be [x, y] unit coordinates in 0..1, got ${describeValue(v)}`,
    );
  for (const c of v as unknown[]) {
    if (typeof c !== "number" || !Number.isFinite(c) || c < 0 || c > 1)
      throw new VisError(
        `${name} must be unit coordinates in 0..1, got [${describeValue(v[0])}, ${describeValue(v[1])}]`,
      );
  }
}

export function renderRadial(spec: RadialSpec, ctx: Ctx): KindOutput {
  const at = orDefault<unknown>(spec.at, [0.5, 0.5]);
  assertUnit("radial `at`", at);
  const radius = positive(
    "radial radius",
    orDefault<unknown>(spec.radius, 0.5),
  );
  const shape = orDefault<unknown>(spec.shape, "circle"); // JS callers can pass anything
  if (shape !== "circle" && shape !== "ellipse")
    throw new VisError(
      `radial shape must be "circle" or "ellipse", got ${describeValue(shape)}`,
    );
  const repeat = parseFlag("repeat", spec.repeat);
  const stops = normalizeStops(spec.stops, spec.reverse);
  // Repeating: shrink the radius to one period and rotate the stops so radius 0 shows
  // what CSS shows there (CSS also repeats inward of the first stop).
  const win = repeat ? repeatSpan(stops) : undefined;
  const period = win ? win.to - win.from : 1;
  const svgList = win ? phaseShift(win.unit, -win.from / period) : stops;
  const { width, height } = ctx.size;
  const id = `${ctx.id}-g`;
  const fn = repeat ? "repeating-radial-gradient" : "radial-gradient";
  const circle = shape === "circle";
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
        r: radius * minSide * period,
      }
    : { id, cx: at[0], cy: at[1], r: radius * period };
  return {
    defs: el(
      "radialGradient",
      { ...attrs, spreadMethod: repeat ? "repeat" : undefined },
      svgStops(svgList),
    ),
    fill: `url(#${id})`,
    cssImages: [
      `${fn}(${shapeCss} at ${fmt(at[0] * 100)}% ${fmt(at[1] * 100)}%, ${cssStops(stops)})`,
    ],
  };
}
