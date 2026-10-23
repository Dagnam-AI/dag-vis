import { toCss, withAlpha } from "../core/color.js";
import { VisError } from "../core/errors.js";
import { fmt } from "../core/format.js";
import { el } from "../core/svg.js";
import { bounded, describeValue, parseRgba } from "../core/validate.js";
import { assertList, svgStops } from "./stops.js";
import type { Ctx, GlowsSpec, KindOutput } from "./types.js";

/** Where a glow reaches transparent, as a fraction of its ellipse's radii. */
const FADE = 0.7;
const MAX_PERCENT = 1000;
const MIN_SIZE = 0.01;

/** `[a, b]`, each a finite number in min..max. JS callers can pass anything. */
function parsePair(
  name: string,
  v: unknown,
  min: number,
  max: number,
): readonly [number, number] {
  if (!Array.isArray(v) || v.length !== 2)
    throw new VisError(
      `${name} must be [x, y] numbers in ${min}..${max}, got ${describeValue(v)}`,
    );
  return [bounded(name, v[0], min, max), bounded(name, v[1], min, max)];
}

/**
 * Soft elliptical glows over a base colour. A glow is its colour at `at`, fading
 * linearly to transparent at 70% of its ellipse, which is `size` wide and tall (the
 * RADII, in percent of the box, so it follows the box's aspect ratio) and centred at
 * `at` (percent of the box). The first glow is the top one (like CSS layers), so the
 * CSS lists them in order and the SVG draws them in reverse. SVG and CSS agree: each
 * glow is the same ellipse and the same alpha ramp.
 */
export function renderGlows(spec: GlowsSpec, ctx: Ctx): KindOutput {
  assertList("glows needs at least one glow", spec.glows);
  const base = toCss(parseRgba("glows base", spec.base));
  const { width, height } = ctx.size;
  const id = `${ctx.id}-g`;
  const defs: string[] = [];
  const rects: string[] = [];
  const css: string[] = [];
  spec.glows.forEach((g: unknown, i) => {
    if (typeof g !== "object" || g === null)
      throw new VisError(
        `glow ${i} must be an object, got ${describeValue(g)}`,
      );
    const { size, at, color } = g as {
      size?: unknown;
      at?: unknown;
      color?: unknown;
    };
    const [w, h] = parsePair(`glow ${i} size`, size, MIN_SIZE, MAX_PERCENT);
    const [x, y] = parsePair(`glow ${i} at`, at, 0, 100);
    const rgba = parseRgba(`glow ${i} color`, color);
    const pid = `${id}-p${i}`;
    defs.push(
      el(
        "radialGradient",
        {
          id: pid,
          gradientUnits: "userSpaceOnUse",
          cx: 0,
          cy: 0,
          r: 1,
          // A unit circle at the origin, stretched to the ellipse and moved to its centre.
          gradientTransform: `translate(${fmt((x / 100) * width)} ${fmt((y / 100) * height)}) scale(${fmt((w / 100) * width)} ${fmt((h / 100) * height)})`,
        },
        svgStops([
          { color: rgba, at: 0 },
          { color: withAlpha(rgba, 0), at: FADE },
        ]),
      ),
    );
    rects.push(el("rect", { width, height, fill: `url(#${pid})` }));
    css.push(
      `radial-gradient(ellipse ${fmt(w)}% ${fmt(h)}% at ${fmt(x)}% ${fmt(y)}%, ${toCss(rgba)}, transparent ${fmt(FADE * 100)}%)`,
    );
  });
  return {
    defs:
      defs.join("") +
      el(
        "pattern",
        { id, patternUnits: "userSpaceOnUse", width, height },
        el("rect", { width, height, fill: base }),
        ...rects.reverse(),
      ),
    fill: `url(#${id})`,
    cssImages: [...css, base],
  };
}
