import { el } from "../core/svg.js";
import { bounded, integerIn } from "./types.js";
import type { NoiseSpec, PatternCtx, TileOutput } from "./types.js";

const MAX_OCTAVES = 10;

/**
 * Monochrome fractal noise, seamless across tiles (`stitchTiles`). `color`
 * does not apply; `opacity` sets its strength. The tile is `size`. Its CSS
 * form is `cssBackground` (an SVG filter inside an image: supported by
 * browsers, but not by every SVG-in-CSS consumer).
 */
export function renderNoise(spec: NoiseSpec, ctx: PatternCtx): TileOutput {
  const frequency = bounded("frequency", spec.frequency ?? 0.9, 0.001, 10);
  const octaves = integerIn("octaves", spec.octaves ?? 3, 1, MAX_OCTAVES);
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
        opacity: ctx.opacity,
      }),
  };
}
