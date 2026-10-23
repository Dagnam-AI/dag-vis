import { toCss, withAlpha } from "../core/color.js";
import { VisError } from "../core/errors.js";
import { fmt } from "../core/format.js";
import { el } from "../core/svg.js";
import { orDefault, parseRgba, positive } from "../core/validate.js";
import { assertUnit } from "./radial.js";
import { assertList, cssStops, svgStops } from "./stops.js";
import type { Ctx, KindOutput, MeshPoint, MeshSpec } from "./types.js";

/** JS callers can pass anything: name the bad point instead of failing on a property read. */
function assertPoint(p: unknown, i: number): asserts p is MeshPoint {
  if (typeof p !== "object" || p === null)
    throw new VisError(
      `mesh point ${i} must be an object, got ${JSON.stringify(p)}`,
    );
  const { at, color } = p as { at?: unknown; color?: unknown };
  if (!Array.isArray(at) || at.length !== 2)
    throw new VisError(
      `mesh point ${i} needs \`at\` as [x, y], got ${JSON.stringify(at)}`,
    );
  if (typeof color !== "string")
    throw new VisError(
      `mesh point ${i} needs a \`color\` string, got ${JSON.stringify(color)}`,
    );
}

/**
 * Stacked soft radials over a base colour. Each point is the same thing in both
 * outputs: colour at `at`, fading linearly to transparent at `radius`; later points
 * paint over earlier ones (so they come first in CSS).
 */
export function renderMesh(spec: MeshSpec, ctx: Ctx): KindOutput {
  assertList("mesh needs at least one point", spec.points);
  const { width, height } = ctx.size;
  const minSide = Math.min(width, height);
  const base = toCss(parseRgba("mesh base", spec.base));
  const id = `${ctx.id}-g`;
  const defs: string[] = [];
  const rects: string[] = [];
  const css: string[] = [];
  // An index loop, not forEach: forEach skips the holes of a sparse list.
  for (let i = 0; i < spec.points.length; i++) {
    const p: unknown = spec.points[i];
    assertPoint(p, i);
    assertUnit("mesh point `at`", p.at);
    const radius = positive(
      "mesh point radius",
      orDefault<unknown>(p.radius, 0.5),
    );
    const color = parseRgba(`mesh point ${i} color`, p.color);
    const stops = [
      { color, at: 0 },
      { color: withAlpha(color, 0), at: 1 },
    ];
    const r = radius * minSide;
    const pid = `${id}-p${i}`;
    defs.push(
      el(
        "radialGradient",
        {
          id: pid,
          gradientUnits: "userSpaceOnUse",
          cx: p.at[0] * width,
          cy: p.at[1] * height,
          r,
        },
        svgStops(stops),
      ),
    );
    rects.push(el("rect", { width, height, fill: `url(#${pid})` }));
    css.push(
      `radial-gradient(circle ${fmt(r)}px at ${fmt(p.at[0] * 100)}% ${fmt(p.at[1] * 100)}%, ${cssStops(stops)})`,
    );
  }
  return {
    defs:
      defs.join("") +
      el(
        "pattern",
        { id, patternUnits: "userSpaceOnUse", width, height },
        el("rect", { width, height, fill: base }),
        ...rects,
      ),
    fill: `url(#${id})`,
    cssImages: [...css.reverse(), base],
  };
}
