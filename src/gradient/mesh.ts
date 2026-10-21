import { parseColor, toCss, withAlpha } from "../core/color.js";
import { VisError } from "../core/errors.js";
import { fmt } from "../core/format.js";
import { el } from "../core/svg.js";
import { assertUnit } from "./radial.js";
import { assertList, cssStops, svgStops } from "./stops.js";
import type { Ctx, KindOutput, MeshSpec } from "./types.js";

/**
 * Stacked soft radials over a base colour. Each point is the same thing in both
 * outputs: colour at `at`, fading linearly to transparent at `radius`; later points
 * paint over earlier ones (so they come first in CSS).
 */
export function renderMesh(spec: MeshSpec, ctx: Ctx): KindOutput {
  assertList("mesh needs at least one point", spec.points);
  const { width, height } = ctx.size;
  const minSide = Math.min(width, height);
  const base = toCss(parseColor(spec.base));
  const id = `${ctx.id}-g`;
  const defs: string[] = [];
  const rects: string[] = [];
  const css: string[] = [];
  spec.points.forEach((p, i) => {
    assertUnit("mesh point `at`", p.at);
    const radius = p.radius ?? 0.5;
    if (!Number.isFinite(radius) || radius <= 0)
      throw new VisError(
        `mesh point radius must be positive, got ${String(radius)}`,
      );
    const color = parseColor(p.color);
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
  });
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
