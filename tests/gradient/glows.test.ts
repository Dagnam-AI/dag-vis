import { describe, expect, it } from "vitest";

import { VisError } from "../../src/core/errors.js";
import { gradient, gradientSvg } from "../../src/gradient/index.js";
import type { GlowsSpec } from "../../src/gradient/index.js";
import { cssLayers } from "../helpers/css.js";
import { expectGolden } from "../helpers/golden.js";
import { pixelAt, rasterize } from "../helpers/render.js";

const spec: GlowsSpec = {
  kind: "glows",
  base: "#0a0a0a",
  glows: [
    { size: [60, 120], at: [20, 30], color: "#ef4444" },
    { size: [30, 70], at: [80, 70], color: "rgba(16, 171, 186, 0.5)" },
  ],
  size: { width: 100, height: 50 },
};

type Rgb = readonly [number, number, number];

/**
 * What a browser paints for the CSS this kind emits: each glow is
 * `radial-gradient(ellipse W% H% at X% Y%, c, transparent 70%)`, i.e. the colour's alpha
 * falls linearly from the centre to 0 at 70% of the ellipse's radii (RGB constant),
 * listed top first (the LAST glow is the top one) over the base. Evaluated at pixel
 * (x, y), whose centre is (x + 0.5, y + 0.5), by compositing bottom to top.
 */
function cssGlows(
  base: Rgb,
  glows: readonly {
    size: readonly [number, number];
    at: readonly [number, number];
    color: Rgb;
    alpha?: number;
  }[],
  box: { width: number; height: number },
  x: number,
  y: number,
): Rgb {
  let out: Rgb = base;
  for (const g of glows) {
    const d = Math.hypot(
      (x + 0.5 - (g.at[0] / 100) * box.width) / ((g.size[0] / 100) * box.width),
      (y + 0.5 - (g.at[1] / 100) * box.height) /
        ((g.size[1] / 100) * box.height),
    );
    const a = (g.alpha ?? 1) * Math.max(0, 1 - d / 0.7);
    out = [
      out[0] * (1 - a) + g.color[0] * a,
      out[1] * (1 - a) + g.color[1] * a,
      out[2] * (1 - a) + g.color[2] * a,
    ];
  }
  return out;
}

describe("glows gradient", () => {
  it("emits one elliptical percent-sized radial per glow, last on top, over the base", () => {
    const g = gradient(spec);
    expect(g.css).toBe(
      "background: radial-gradient(ellipse 30% 70% at 80% 70%, rgba(16, 171, 186, 0.5), transparent 70%), radial-gradient(ellipse 60% 120% at 20% 30%, #ef4444, transparent 70%), #0a0a0a;",
    );
    expect(() => cssLayers(g.css)).not.toThrow();
    expect(g.fill).toBe("url(#vis1-g)");
    expect(g.defs).toContain(
      '<pattern id="vis1-g" patternUnits="userSpaceOnUse" width="100" height="50">',
    );
    expect(g.defs).toContain('<rect width="100" height="50" fill="#0a0a0a"/>');
    expect((g.defs.match(/<radialGradient /g) ?? []).length).toBe(2);
    // SVG draws in order, so the last glow is painted last: on top
    expect(g.defs.indexOf('fill="url(#vis1-g-p0)"')).toBeLessThan(
      g.defs.indexOf('fill="url(#vis1-g-p1)"'),
    );
    expect(g.defs).toContain(
      'gradientTransform="translate(20 15) scale(60 60)"',
    );
  });

  it("rasterises to what the emitted CSS paints (resvg vs CSS maths)", () => {
    const base: Rgb = [10, 10, 10];
    const glows = [
      { size: [60, 120], at: [20, 30], color: [239, 68, 68] },
      { size: [30, 70], at: [80, 70], color: [16, 171, 186], alpha: 0.5 },
    ] as const;
    const raster = rasterize(gradientSvg(spec));
    // both centres, half-way out, the faded edge (70%), outside, and the overlap of nothing
    const points = [
      [20, 15],
      [10, 15],
      [35, 15],
      [62, 15],
      [80, 35],
      [75, 30],
      [90, 40],
      [99, 0],
      [50, 49],
    ] as const;
    for (const [x, y] of points) {
      const want = cssGlows(base, glows, spec.size as never, x, y);
      const px = pixelAt(raster, x, y);
      for (let c = 0; c < 3; c++)
        expect(Math.abs(Number(px[c]) - Number(want[c]))).toBeLessThanOrEqual(
          3,
        );
      expect(px[3]).toBe(255);
    }
  });

  it("keeps a bare base colour valid when stacked under another layer", () => {
    const stacked = gradient({
      kind: "layers",
      layers: [{ kind: "linear", stops: ["#000000", "#ffffff"] }, spec],
    });
    expect(() => cssLayers(stacked.css)).not.toThrow();
    expect(stacked.css).toContain("linear-gradient(#0a0a0a, #0a0a0a)");
  });

  it("paints the same top glow in CSS and SVG: two overlapping glows, last wins", () => {
    const overlap: GlowsSpec = {
      kind: "glows",
      base: "#000000",
      glows: [
        { size: [50, 50], at: [50, 50], color: "#ff0000" },
        { size: [50, 50], at: [50, 50], color: "#0000ff" },
      ],
      size: { width: 40, height: 40 },
    };
    // CSS: the first layer is the top one, and it is the last glow
    expect(gradient(overlap).css).toMatch(
      /^background: radial-gradient\(ellipse 50% 50% at 50% 50%, #0000ff, /,
    );
    // SVG: the centre pixel is the last glow's colour
    const [r, , b] = pixelAt(rasterize(gradientSvg(overlap)), 20, 20);
    expect(r).toBeLessThan(30);
    expect(b).toBeGreaterThan(200);
  });

  it("clamps a tiny glow to half a pixel in CSS and SVG alike", () => {
    const tiny: GlowsSpec = {
      ...spec,
      glows: [{ size: [0.01, 0.01], at: [50, 50], color: "#ff0000" }],
    };
    const g = gradient(tiny);
    // 0.5 px on a 100 x 50 box is 0.5% wide and 1% tall
    expect(g.css).toContain("ellipse 0.5% 1% at 50% 50%");
    expect(g.defs).toContain("translate(50 25) scale(0.5 0.5)");
    // and a size that is already large enough is left alone
    expect(gradient(spec).defs).toContain("scale(60 60)");
  });

  it("takes at most 64 glows", () => {
    const glow = { size: [10, 10], at: [50, 50], color: "#fff" } as const;
    expect(() =>
      gradient({ ...spec, glows: Array.from({ length: 64 }, () => glow) }),
    ).not.toThrow();
    expect(() =>
      gradient({ ...spec, glows: Array.from({ length: 65 }, () => glow) }),
    ).toThrow("glows takes at most 64 glows, got 65");
  });

  it("counts as a pattern source in the fluted cost budget: 64 reeds pass, 65 do not", () => {
    const fluted = (reeds: number) =>
      gradient({ kind: "fluted", source: spec, reeds });
    expect(() => fluted(64)).not.toThrow();
    expect(() => fluted(65)).toThrow(VisError);
  });

  it("rejects a sparse glow list instead of skipping the holes", () => {
    const sparse = [spec.glows[0]];
    sparse[2] = spec.glows[1]; // index 1 is a hole
    expect(() => gradient({ ...spec, glows: sparse as never })).toThrow(
      "glow 1 must be an object",
    );
  });

  it("converts an oklch glow colour through the colour pipeline", () => {
    const g = gradient({
      ...spec,
      glows: [
        { size: [50, 50], at: [50, 50], color: "oklch(0.6 0.22 25 / 0.6)" },
      ],
    });
    expect(g.css).toMatch(
      /^background: radial-gradient\(ellipse 50% 50% at 50% 50%, rgba\(\d+, \d+, \d+, 0\.6\), transparent 70%\), #0a0a0a;$/,
    );
  });

  it("rejects an empty glow list, bad sizes, centres and colours", () => {
    const bad = (glows: unknown) =>
      gradient({ ...spec, glows: glows as never });
    expect(() => bad([])).toThrow("glows needs at least one glow");
    expect(() => bad("x")).toThrow(VisError);
    const glow = { size: [50, 50], at: [50, 50], color: "#fff" };
    for (const [field, value, name] of [
      ["size", [0, 50], "glow 0 size"],
      ["size", [50, 1001], "glow 0 size"],
      ["size", [50], "glow 0 size"],
      ["size", "x", "glow 0 size"],
      ["size", [Number.NaN, 50], "glow 0 size"],
      ["at", [-1, 50], "glow 0 at"],
      ["at", [50, 101], "glow 0 at"],
      ["at", null, "glow 0 at"],
      ["color", "nope", "glow 0 color"],
      ["color", 5, "glow 0 color"],
    ] as const)
      expect(() => bad([{ ...glow, [field]: value }])).toThrow(name);
    expect(() => gradient({ ...spec, base: "nope" })).toThrow("glows base");
    expect(() => gradient({ ...spec, base: undefined as never })).toThrow(
      "glows base",
    );
  });

  it("rejects malformed glows with a VisError that names the problem", () => {
    const bad = (glow: unknown) =>
      gradient({ ...spec, glows: [spec.glows[0]!, glow as never] });
    expect(() => bad(null)).toThrow("glow 1 must be an object");
    expect(() => bad("x")).toThrow("glow 1 must be an object");
    expect(() => bad(null)).toThrow(VisError);
  });

  it("matches its golden", () => {
    expectGolden("gradient/glows.svg", gradientSvg(spec));
  });
});
