import { describe, expect, it } from "vitest";

import { VisError } from "../../src/core/errors.js";
import { gradient, gradientSvg } from "../../src/gradient/index.js";
import type { GradientSpec } from "../../src/gradient/index.js";
import { expectGolden } from "../helpers/golden.js";
import { pixelAt, rasterize } from "../helpers/render.js";

const spec = {
  kind: "mesh",
  base: "#0a0a0a",
  points: [
    { at: [0.2, 0.3], color: "#ef4444", radius: 0.6 },
    { at: [0.8, 0.7], color: "#10abba" },
  ],
  size: { width: 100, height: 50 },
} as const;

type Rgb = readonly [number, number, number];

/**
 * What a browser paints for the CSS this kind emits: each point is
 * `radial-gradient(circle R at X Y, c 0%, c-with-alpha-0 100%)` (alpha falls linearly
 * with distance, RGB constant), listed top first over the base colour. Evaluated here
 * at pixel (x, y), whose centre is (x + 0.5, y + 0.5), by compositing bottom to top.
 */
function cssMesh(
  base: Rgb,
  points: readonly {
    at: readonly [number, number];
    color: Rgb;
    alpha?: number;
    radius: number;
  }[],
  size: { width: number; height: number },
  x: number,
  y: number,
): Rgb {
  let out: Rgb = base;
  for (const p of points) {
    const d = Math.hypot(
      x + 0.5 - p.at[0] * size.width,
      y + 0.5 - p.at[1] * size.height,
    );
    const a = (p.alpha ?? 1) * Math.max(0, 1 - d / p.radius);
    out = [
      out[0] * (1 - a) + p.color[0] * a,
      out[1] * (1 - a) + p.color[1] * a,
      out[2] * (1 - a) + p.color[2] * a,
    ];
  }
  return out;
}

function expectPixels(
  s: GradientSpec,
  expected: readonly (readonly [number, number, Rgb])[],
): void {
  const raster = rasterize(gradientSvg(s));
  for (const [x, y, rgb] of expected) {
    const px = pixelAt(raster, x, y);
    for (let c = 0; c < 3; c++) {
      expect(Math.abs(Number(px[c]) - Number(rgb[c]))).toBeLessThanOrEqual(3);
    }
    expect(px[3]).toBe(255);
  }
}

describe("mesh gradient", () => {
  it("stacks one soft radial per point over the base in CSS (top first) and SVG", () => {
    const g = gradient(spec);
    expect(g.css).toBe(
      "background: radial-gradient(circle 25px at 80% 70%, #10abba 0%, rgba(16, 171, 186, 0) 100%), radial-gradient(circle 30px at 20% 30%, #ef4444 0%, rgba(239, 68, 68, 0) 100%), #0a0a0a;",
    );
    expect(g.defs).toContain(
      '<pattern id="vis1-g" patternUnits="userSpaceOnUse" width="100" height="50">',
    );
    expect(g.defs).toContain('<rect width="100" height="50" fill="#0a0a0a"/>');
    expect((g.defs.match(/<radialGradient /g) ?? []).length).toBe(2);
    expect(g.defs).toContain('fill="url(#vis1-g-p0)"');
  });

  it("rasterises to what the emitted CSS paints (resvg vs CSS maths)", () => {
    const base: Rgb = [10, 10, 10];
    const points = [
      { at: [0.2, 0.3], color: [239, 68, 68], radius: 30 },
      { at: [0.8, 0.7], color: [16, 171, 186], radius: 25 },
    ] as const;
    const size = spec.size;
    const at = (x: number, y: number): readonly [number, number, Rgb] => [
      x,
      y,
      cssMesh(base, points, size, x, y),
    ];
    // centre of the first point, one radius' half-way, mid-way to the second, far corner
    expectPixels(spec, [
      at(20, 15),
      at(35, 15),
      at(60, 35),
      at(80, 35),
      at(99, 0),
    ]);
  });

  it("paints later points over earlier ones, translucent colours included", () => {
    const stacked = {
      kind: "mesh",
      base: "#000000",
      points: [
        { at: [0.5, 0.5], color: "#ff0000" },
        { at: [0.5, 0.5], color: "rgba(0, 0, 255, 0.5)" },
      ],
      size: { width: 40, height: 40 },
    } as const;
    const base: Rgb = [0, 0, 0];
    const points = [
      { at: [0.5, 0.5], color: [255, 0, 0], radius: 20 },
      { at: [0.5, 0.5], color: [0, 0, 255], alpha: 0.5, radius: 20 },
    ] as const;
    expect(gradient(stacked).css).toBe(
      "background: radial-gradient(circle 20px at 50% 50%, rgba(0, 0, 255, 0.5) 0%, rgba(0, 0, 255, 0) 100%), radial-gradient(circle 20px at 50% 50%, #ff0000 0%, rgba(255, 0, 0, 0) 100%), #000000;",
    );
    expectPixels(
      stacked,
      [
        [20, 20],
        [26, 20],
        [12, 28],
      ].map(([x, y]) => [
        Number(x),
        Number(y),
        cssMesh(base, points, stacked.size, Number(x), Number(y)),
      ]),
    );
  });

  it("rejects an empty point list, bad coordinates, radii and colours", () => {
    expect(() => gradient({ ...spec, points: [] })).toThrow(VisError);
    expect(() => gradient({ ...spec, points: "x" as never })).toThrow(VisError);
    expect(() =>
      gradient({ ...spec, points: [{ at: [1.5, 0], color: "#fff" }] }),
    ).toThrow(VisError);
    expect(() =>
      gradient({
        ...spec,
        points: [{ at: [0.5, 0.5], color: "#fff", radius: 0 }],
      }),
    ).toThrow(VisError);
    expect(() =>
      gradient({
        ...spec,
        points: [{ at: [0.5, 0.5], color: "#fff", radius: Number.NaN }],
      }),
    ).toThrow(VisError);
    expect(() =>
      gradient({ ...spec, points: [{ at: [0.5, 0.5], color: "nope" }] }),
    ).toThrow(VisError);
    expect(() => gradient({ ...spec, base: "nope" })).toThrow(VisError);
  });

  it("matches its golden", () => {
    expectGolden("gradient/mesh.svg", gradientSvg(spec));
  });
});
