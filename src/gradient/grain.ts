import type { Size } from "../core/geometry.js";
import { el } from "../core/svg.js";

export const GRAIN_BLENDS = ["overlay", "multiply", "soft-light"] as const;
export type GrainBlend = (typeof GRAIN_BLENDS)[number];

/** Film grain: monochrome fractal noise blended over the artwork. SVG only. */
export function grainLayer(
  id: string,
  grain: number,
  size: Size,
  seed = 1,
  blend: GrainBlend = "overlay",
): { defs: string; svg: string } {
  const fid = `${id}-grain`;
  return {
    defs: el(
      "filter",
      { id: fid, x: 0, y: 0, width: "100%", height: "100%" },
      el("feTurbulence", {
        type: "fractalNoise",
        baseFrequency: 0.8,
        numOctaves: 2,
        seed,
        stitchTiles: "stitch",
      }),
      el("feColorMatrix", { type: "saturate", values: 0 }),
    ),
    svg: el("rect", {
      width: size.width,
      height: size.height,
      filter: `url(#${fid})`,
      opacity: grain,
      style: `mix-blend-mode:${blend}`,
    }),
  };
}
