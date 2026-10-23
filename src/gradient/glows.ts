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
/** Most glows in one spec, as freeform caps its points: bounds the CSS and the SVG. */
const MAX_GLOWS = 64;
/**
 * Smallest ellipse radius, in px. The SVG scale is rounded to 3 decimals, so a glow
 * thinner than that would collapse to a singular transform while CSS still drew it;
 * both outputs clamp to this instead (a half-pixel glow is invisible anyway).
 */
const MIN_RADIUS_PX = 0.5;

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
 * `at` (percent of the box). Later glows paint over earlier ones, as in `mesh` and
 * `layers` (so the CSS lists them last first). SVG and CSS agree: each glow is the same
 * ellipse and the same alpha ramp, with a radius of at least half a pixel in both (in the
 * CSS, exactly so only when the box it is applied to has the spec's `size`).
 */
export function renderGlows(spec: GlowsSpec, ctx: Ctx): KindOutput {
  assertList("glows needs at least one glow", spec.glows);
  if (spec.glows.length > MAX_GLOWS)
    throw new VisError(
      `glows takes at most ${MAX_GLOWS} glows, got ${spec.glows.length}`,
    );
  const base = toCss(parseRgba("glows base", spec.base));
  const { width, height } = ctx.size;
  const id = `${ctx.id}-g`;
  const defs: string[] = [];
  const rects: string[] = [];
  const css: string[] = [];
  // An index loop, not forEach: forEach skips the holes of a sparse list.
  for (let i = 0; i < spec.glows.length; i++) {
    const g: unknown = spec.glows[i];
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
    const rx = Math.max(MIN_RADIUS_PX, (w / 100) * width);
    const ry = Math.max(MIN_RADIUS_PX, (h / 100) * height);
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
          gradientTransform: `translate(${fmt((x / 100) * width)} ${fmt((y / 100) * height)}) scale(${fmt(rx)} ${fmt(ry)})`,
        },
        svgStops([
          { color: rgba, at: 0 },
          { color: withAlpha(rgba, 0), at: FADE },
        ]),
      ),
    );
    rects.push(el("rect", { width, height, fill: `url(#${pid})` }));
    css.push(
      `radial-gradient(ellipse ${fmt((rx / width) * 100)}% ${fmt((ry / height) * 100)}% at ${fmt(x)}% ${fmt(y)}%, ${toCss(rgba)}, transparent ${fmt(FADE * 100)}%)`,
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
