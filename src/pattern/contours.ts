import { fmt } from "../core/format.js";
import { el } from "../core/svg.js";
import { fade, integerIn, orDefault } from "./types.js";
import type { ContoursSpec, PatternCtx, TileOutput } from "./types.js";

/** 32 x 32 rings of 48 points is about 1 MB of SVG. */
const MAX_CENTRES = 32;
const MAX_RINGS = 32;
const SAMPLES = 48;

/**
 * Seeded isoline look: closed wobbly rings around seeded centres (20%..80% of
 * the tile). Ring k has radius `k * spacing * (1 + w(t))` with |w| <= 0.13 and
 * the same `w` for every ring of a centre, so at each angle ring k + 1 is
 * strictly outside ring k: rings of one centre never cross. The wobble grows
 * with the ring index. Rings run past the tile edge and are cut there. The
 * tile is `size`.
 */
export function renderContours(
  spec: ContoursSpec,
  ctx: PatternCtx,
): TileOutput {
  const centres = integerIn(
    "density",
    orDefault(spec.density, 2),
    1,
    MAX_CENTRES,
  );
  const rings = integerIn("rings", orDefault(spec.rings, 6), 1, MAX_RINGS);
  const { width, height } = ctx.size;
  const step = ctx.spacing;
  const paths: string[] = [];
  for (let c = 0; c < centres; c++) {
    const cx = ctx.rng.range(0.2, 0.8) * width;
    const cy = ctx.rng.range(0.2, 0.8) * height;
    const p1 = ctx.rng.range(0, Math.PI * 2);
    const p2 = ctx.rng.range(0, Math.PI * 2);
    for (let k = 1; k <= rings; k++) {
      const pts: string[] = [];
      for (let i = 0; i < SAMPLES; i++) {
        const t = (i / SAMPLES) * Math.PI * 2;
        const r =
          k *
          step *
          (1 + 0.08 * Math.sin(3 * t + p1) + 0.05 * Math.sin(5 * t + p2));
        pts.push(`${fmt(cx + r * Math.cos(t))} ${fmt(cy + r * Math.sin(t))}`);
      }
      paths.push(
        el("path", {
          d: `M${pts.join("L")}Z`,
          fill: "none",
          stroke: ctx.color,
          "stroke-width": ctx.strokeWidth,
          "stroke-opacity": fade(ctx.alpha),
        }),
      );
    }
  }
  return { tile: { ...ctx.size }, body: paths.join("") };
}
