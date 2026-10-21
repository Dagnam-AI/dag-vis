import { toHex, withAlpha } from "../core/color.js";
import type { Rgba } from "../core/color.js";
import { fmt } from "../core/format.js";
import { el } from "../core/svg.js";
import { assertUnit } from "./radial.js";
import { cssStops, normalizeStops, sampleStops } from "./stops.js";
import type { ConicSpec, Ctx, KindOutput } from "./types.js";

/** SVG has no conic gradient; 360 one-degree wedges in a pattern stand in. */
const WEDGES = 360;
const STEP = 360 / WEDGES;
/**
 * Opaque wedges reach this many degrees under the wedges painted after them (89 keeps
 * the first wedge, which also reaches back, under 180 so its arc stays a small arc).
 * Two anti-aliased edges that merely abut leave the backdrop showing; a wide overlap
 * means every edge lies over an opaque wedge. Later wedges repaint the overlap.
 */
const REACH = 89;
/**
 * Wedge edges are rotated by this sliver of a degree (0.02px at 1356px). A pixel centre
 * lying exactly on an edge that two crisp (translucent) wedges share is claimed by both
 * and drawn with doubled alpha; off-lattice edges make that tie practically impossible.
 */
const PHASE = 0.001;

export function renderConic(spec: ConicSpec, ctx: Ctx): KindOutput {
  const from = spec.from ?? 0;
  const at = spec.at ?? [0.5, 0.5];
  assertUnit("conic `at`", at);
  const stops = normalizeStops(spec.stops, spec.reverse);
  const { width, height } = ctx.size;
  const cx = at[0] * width;
  const cy = at[1] * height;
  const R = Math.hypot(width, height);
  const id = `${ctx.id}-g`;
  // Overlap would double a translucent wedge's alpha, so translucent conics draw
  // butt-jointed wedges without anti-aliasing instead.
  const opaque = stops.every((s) => s.color.a === 1);
  const reach = opaque ? REACH : 0;
  // CSS conic: 0deg at 12 o'clock, clockwise. SVG: 0 along +x, y down.
  const point = (deg: number): string => {
    const a = ((from - 90 + PHASE + deg) * Math.PI) / 180;
    return `${fmt(cx + R * Math.cos(a))} ${fmt(cy + R * Math.sin(a))}`;
  };
  const colorAt = (i: number): Rgba =>
    sampleStops(stops, (i + 0.5) / WEDGES, spec.repeat);
  const wedges: string[] = [];
  for (let i = 0; i < WEDGES; i++) {
    // Painted in order, so each wedge's overlap is repainted by the next ones. The first
    // wedge also reaches back, under the last ones, so the 0deg seam is closed too.
    const a0 = i * STEP - (i === 0 ? reach : 0);
    const a1 = (i + 1) * STEP + Math.min(reach, (WEDGES - 1 - i) * STEP);
    const c = colorAt(i);
    wedges.push(
      el("path", {
        d: `M${fmt(cx)} ${fmt(cy)}L${point(a0)}A${fmt(R)} ${fmt(R)} 0 0 1 ${point(a1)}Z`,
        fill: toHex(withAlpha(c, 1)),
        "fill-opacity": c.a < 1 ? c.a : undefined,
      }),
    );
  }
  // The apex sits inside one pixel, where no wedge covers a whole pixel: back it.
  const apex = opaque
    ? [el("circle", { cx, cy, r: 2, fill: toHex(withAlpha(colorAt(0), 1)) })]
    : [];
  const fn = spec.repeat ? "repeating-conic-gradient" : "conic-gradient";
  return {
    defs: el(
      "pattern",
      {
        id,
        patternUnits: "userSpaceOnUse",
        width,
        height,
        "shape-rendering": opaque ? undefined : "crispEdges",
      },
      ...apex,
      ...wedges,
    ),
    fill: `url(#${id})`,
    cssImages: [
      `${fn}(from ${fmt(from)}deg at ${fmt(at[0] * 100)}% ${fmt(at[1] * 100)}%, ${cssStops(stops)})`,
    ],
  };
}
