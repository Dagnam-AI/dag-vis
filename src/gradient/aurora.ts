import { toCss, toHex, withAlpha } from "../core/color.js";
import { fmt } from "../core/format.js";
import { el } from "../core/svg.js";
import { integerIn, orDefault, parseRgba } from "../core/validate.js";
import { assertList, cssStops } from "./stops.js";
import type { AuroraSpec, Ctx, KindOutput } from "./types.js";

/** Peak opacity of a blob. */
const OPACITY = 0.85;
/**
 * Blur of a blob as a fraction of its own radii. Each blob is a unit circle blurred by
 * this much and then scaled to (rx, ry), so it is an ellipse with a feather proportional
 * to its size: its CSS twin is one scaled-ellipse radial-gradient, with no rotation.
 */
const SOFTNESS = 0.25;
/**
 * Opacity of a unit disc blurred by SOFTNESS, at (radius in disc radii, opacity): the
 * profile (numerically integrated; the 1-D normal-CDF edge reads ~0.05 high on a disc)
 * sampled where it bends, cut to zero at 1.5 (2 blurs past the edge).
 */
const EDGE: readonly (readonly [number, number])[] = [
  [0.5, 0.966],
  [0.75, 0.804],
  [1, 0.45],
  [1.25, 0.133],
  [1.5, 0],
];
/**
 * Seeded blurred blobs over a base. SVG blurs real ellipses; CSS stacks one soft
 * ellipse radial-gradient per blob (same centre, radii and edge profile). Not exactly
 * equal: a blurred ellipse is a slightly lower, rounder bump than its piecewise-linear
 * twin (see the resvg-vs-CSS test for the measured worst case).
 */
export function renderAurora(spec: AuroraSpec, ctx: Ctx): KindOutput {
  assertList("aurora needs a non-empty palette", spec.palette);
  const blobs = integerIn(
    "aurora blobs",
    orDefault<unknown>(spec.blobs, 5),
    1,
    64,
  );
  const { width, height } = ctx.size;
  const minSide = Math.min(width, height);
  const base = parseRgba(
    "aurora base",
    orDefault<unknown>(spec.base, "#0a0a0a"),
  );
  const colors = spec.palette.map((c, i) =>
    parseRgba(`aurora palette[${i}]`, c),
  );
  const id = `${ctx.id}-g`;
  const blurId = `${ctx.id}-blur`;
  const reach = 1 + 2 * SOFTNESS; // the CSS ellipse ends where the feather does
  const ellipses: string[] = [];
  const css: string[] = [];
  for (let i = 0; i < blobs; i++) {
    const cx = ctx.rng.range(0.1, 0.9) * width;
    const cy = ctx.rng.range(0.1, 0.9) * height;
    const rx = ctx.rng.range(0.2, 0.45) * minSide;
    const ry = ctx.rng.range(0.15, 0.4) * minSide;
    const color = ctx.rng.pick(colors);
    ellipses.push(
      el(
        "g",
        {
          transform: `translate(${fmt(cx)} ${fmt(cy)}) scale(${fmt(rx)} ${fmt(ry)})`,
        },
        el("ellipse", {
          rx: 1,
          ry: 1,
          fill: toHex(withAlpha(color, 1)),
          "fill-opacity": OPACITY * color.a,
          filter: `url(#${blurId})`,
        }),
      ),
    );
    const stops = [
      { color: withAlpha(color, OPACITY * color.a), at: 0 },
      ...EDGE.map(([r, a]) => ({
        color: withAlpha(color, OPACITY * color.a * a),
        at: r / reach,
      })),
    ];
    css.push(
      `radial-gradient(ellipse ${fmt(((rx * reach) / width) * 100)}% ${fmt(((ry * reach) / height) * 100)}% at ${fmt((cx / width) * 100)}% ${fmt((cy / height) * 100)}%, ${cssStops(stops)})`,
    );
  }
  const fill = toCss(base);
  return {
    defs:
      el(
        "filter",
        { id: blurId, x: "-50%", y: "-50%", width: "200%", height: "200%" },
        el("feGaussianBlur", { stdDeviation: SOFTNESS }),
      ) +
      el(
        "pattern",
        { id, patternUnits: "userSpaceOnUse", width, height },
        el("rect", { width, height, fill }),
        ...ellipses,
      ),
    fill: `url(#${id})`,
    cssImages: [...css.reverse(), fill],
  };
}
