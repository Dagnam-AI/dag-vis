import { toHex, withAlpha } from "../core/color.js";
import { fmt } from "../core/format.js";
import { el } from "../core/svg.js";
import { assertUnit } from "./radial.js";
import { cssStops, normalizeStops, sampleStops } from "./stops.js";
import type { ConicSpec, Ctx, KindOutput } from "./types.js";

/** SVG has no conic gradient; 72 five-degree wedges in a pattern stand in. */
const WEDGES = 72;

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
  const wedges: string[] = [];
  for (let i = 0; i < WEDGES; i++) {
    // CSS conic: 0deg at 12 o'clock, clockwise. SVG: 0 along +x, y down.
    const a0 = ((from - 90 + (i * 360) / WEDGES) * Math.PI) / 180;
    const a1 = ((from - 90 + ((i + 1) * 360) / WEDGES) * Math.PI) / 180;
    const c = sampleStops(stops, (i + 0.5) / WEDGES, spec.repeat);
    wedges.push(
      el("path", {
        d: `M${fmt(cx)} ${fmt(cy)}L${fmt(cx + R * Math.cos(a0))} ${fmt(cy + R * Math.sin(a0))}A${fmt(R)} ${fmt(R)} 0 0 1 ${fmt(cx + R * Math.cos(a1))} ${fmt(cy + R * Math.sin(a1))}Z`,
        fill: toHex(withAlpha(c, 1)),
        "fill-opacity": c.a < 1 ? c.a : undefined,
      }),
    );
  }
  const fn = spec.repeat ? "repeating-conic-gradient" : "conic-gradient";
  return {
    defs: el(
      "pattern",
      { id, patternUnits: "userSpaceOnUse", width, height },
      ...wedges,
    ),
    fill: `url(#${id})`,
    cssImages: [
      `${fn}(from ${fmt(from)}deg at ${fmt(at[0] * 100)}% ${fmt(at[1] * 100)}%, ${cssStops(stops)})`,
    ],
  };
}
