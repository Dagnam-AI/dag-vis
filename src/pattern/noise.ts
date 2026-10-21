import { el } from "../core/svg.js";
import { bounded, integerIn, orDefault } from "../core/validate.js";
import { fade } from "./types.js";
import type { NoiseSpec, PatternCtx, TileOutput } from "./types.js";

const MAX_OCTAVES = 10;

/**
 * Monochrome fractal noise. `color` does not apply; `opacity` sets its
 * strength. The tile is `size`; a single tile has no seam. `stitchTiles` is
 * written so browsers can make repeats continuous, but resvg ignores it, so
 * repeated tiles can show a seam at low frequencies (at the default 0.9
 * neither engine shows one), and the grain itself differs between engines at
 * low frequencies. Its CSS form is `cssBackground` (an SVG filter inside an
 * image: supported by browsers, not by every SVG-in-CSS consumer). Render
 * cost is bounded only by the 16384 px size cap: 10 octaves at 2048x2048
 * takes about 1.2 s in resvg.
 */
export function renderNoise(spec: NoiseSpec, ctx: PatternCtx): TileOutput {
  const frequency = bounded(
    "frequency",
    orDefault(spec.frequency, 0.9),
    0.001,
    10,
  );
  const octaves = integerIn(
    "octaves",
    orDefault(spec.octaves, 3),
    1,
    MAX_OCTAVES,
  );
  const fid = `${ctx.id}-noise`;
  const { width, height } = ctx.size;
  return {
    tile: { ...ctx.size },
    body:
      el(
        "filter",
        { id: fid, x: 0, y: 0, width: "100%", height: "100%" },
        el("feTurbulence", {
          type: "fractalNoise",
          baseFrequency: frequency,
          numOctaves: octaves,
          seed: ctx.rng.int(0, 65535),
          stitchTiles: "stitch",
        }),
        el("feColorMatrix", { type: "saturate", values: 0 }),
      ) +
      el("rect", {
        width,
        height,
        filter: `url(#${fid})`,
        opacity: fade(ctx.opacity),
      }),
  };
}
