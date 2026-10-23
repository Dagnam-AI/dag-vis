import { describe, expect, it } from "vitest";

import { VisError } from "../../src/core/errors.js";
import { gradient, gradientSvg } from "../../src/gradient/index.js";
import { expectGolden } from "../helpers/golden.js";
import { pixelAt, rasterize } from "../helpers/render.js";

/** Red channel of a black→white radial rendered by resvg, `dx` px right of the centre. */
function grey(spec: Parameters<typeof gradientSvg>[0], dx: number) {
  const img = rasterize(gradientSvg(spec));
  return pixelAt(
    img,
    Math.floor(img.width / 2) + dx,
    Math.floor(img.height / 2),
  )[0];
}

describe("radial gradient", () => {
  it("defaults to a centred circle of radius 0.5 × short side, in px for CSS", () => {
    const g = gradient({
      kind: "radial",
      stops: ["#fff", "#000"],
      size: { width: 200, height: 100 },
    });
    expect(g.css).toBe(
      "background: radial-gradient(circle 50px at 50% 50%, #ffffff 0%, #000000 100%);",
    );
    expect(g.defs).toContain(
      '<radialGradient id="vis1-g" gradientUnits="userSpaceOnUse" cx="100" cy="50" r="50">',
    );
  });

  it("renders ellipses in bounding-box units", () => {
    const g = gradient({
      kind: "radial",
      shape: "ellipse",
      at: [0.2, 0.8],
      radius: 0.7,
      stops: ["#fff", "#000"],
    });
    expect(g.css).toContain("radial-gradient(ellipse 70% 70% at 20% 80%");
    expect(g.defs).toContain(
      '<radialGradient id="vis1-g" cx="0.2" cy="0.8" r="0.7">',
    );
  });

  it("supports repeat and reverse", () => {
    const g = gradient({
      kind: "radial",
      stops: ["#000", "#fff"],
      repeat: true,
      reverse: true,
    });
    expect(g.css).toContain("repeating-radial-gradient(");
    expect(g.css).toContain("#ffffff 0%, #000000 100%");
    expect(g.defs).toContain('spreadMethod="repeat"');
  });

  it("repeats over the stop span (period 12.5px for stops 0..0.25 of a 50px radius)", () => {
    const spec = {
      kind: "radial",
      stops: [
        { color: "#000", at: 0 },
        { color: "#fff", at: 0.25 },
      ],
      repeat: true,
      size: { width: 200, height: 100 },
    } as const;
    // px offsets 6, 31, 56 are 6.5, 6.5, 6.5 into a 12.5px tooth → ≈ 133
    for (const dx of [6, 31, 56]) {
      expect(Math.abs(grey(spec, dx) - 133)).toBeLessThanOrEqual(8);
    }
  });

  it("repeats inward of the first stop too (stops 0.2..0.4, period 10px)", () => {
    const spec = {
      kind: "radial",
      stops: [
        { color: "#000", at: 0.2 },
        { color: "#fff", at: 0.4 },
      ],
      repeat: true,
      size: { width: 200, height: 100 },
    } as const;
    // radius 5px → phase 0.5 of a tooth, 15px → 0.5, 2px → 0.2 (centre pixel is 0.5px wide)
    expect(Math.abs(grey(spec, 5) - 140)).toBeLessThanOrEqual(10);
    expect(Math.abs(grey(spec, 15) - 140)).toBeLessThanOrEqual(10);
    expect(Math.abs(grey(spec, 2) - 64)).toBeLessThanOrEqual(10);
  });

  // Expected values derive from the CSS definition, not from the code: stop positions are
  // fractions of the 50px radius, the colour at radius x is the stops' colour at
  // ((x - first) mod period) / period, and the pixel dx px right of the centre sits at
  // radius dx + 0.5 (pixel centre; the 0.5px vertical offset is negligible).
  it("matches CSS when the first stop is not a whole number of periods in (stops 0.1..0.4)", () => {
    const spec = {
      kind: "radial",
      stops: [
        { color: "#000", at: 0.1 },
        { color: "#fff", at: 0.4 },
      ],
      repeat: true,
      size: { width: 200, height: 100 },
    } as const;
    // period 0.3 (15px) starting at 0.1 (5px): 1.5px → phase .7667, 7.5px → .1667, 10.5px → .3667
    expect(Math.abs(grey(spec, 1) - 196)).toBeLessThanOrEqual(4);
    expect(Math.abs(grey(spec, 7) - 42)).toBeLessThanOrEqual(4);
    expect(Math.abs(grey(spec, 10) - 93)).toBeLessThanOrEqual(4);
  });

  const hard = [
    { color: "#f00", at: 0.1 },
    { color: "#f00", at: 0.25 },
    { color: "#000", at: 0.25 },
    { color: "#000", at: 0.5 },
  ];

  it("matches CSS for a hard-edged repeating radial (red 0.1..0.25, black 0.25..0.5)", () => {
    const spec = {
      kind: "radial",
      stops: hard,
      repeat: true,
      size: { width: 200, height: 100 },
    } as const;
    // x = radius / 50, q = (x - 0.1) mod 0.4; red while q < 0.15, black after
    expect(grey(spec, 1)).toBe(0); // x .03 → q .33
    expect(grey(spec, 5)).toBe(255); // x .11 → q .01
    expect(grey(spec, 8)).toBe(255); // x .17 → q .07
    expect(grey(spec, 14)).toBe(0); // x .29 → q .19
    expect(grey(spec, 22)).toBe(0); // x .45 → q .35
    expect(grey(spec, 27)).toBe(255); // x .55 → q .05
    expect(grey(spec, 35)).toBe(0); // x .71 → q .21
  });

  it("matches CSS for the reversed hard-edged repeating radial", () => {
    const spec = {
      kind: "radial",
      stops: hard,
      repeat: true,
      reverse: true,
      size: { width: 200, height: 100 },
    } as const;
    // reversed: black 0.5..0.75, red 0.75..0.9; q = (x - 0.5) mod 0.4, black while q < 0.25
    expect(grey(spec, 1)).toBe(255); // x .03 → q .33
    expect(grey(spec, 5)).toBe(0); // x .11 → q .01
    expect(grey(spec, 15)).toBe(0); // x .31 → q .21
    expect(grey(spec, 19)).toBe(255); // x .39 → q .29
    expect(grey(spec, 27)).toBe(0); // x .55 → q .05
    expect(grey(spec, 38)).toBe(255); // x .77 → q .27
  });

  it("rejects an unknown shape and repeating stops that span nothing", () => {
    expect(() =>
      gradient({
        kind: "radial",
        shape: "square" as never,
        stops: ["#000", "#fff"],
      }),
    ).toThrow('"square"');
    expect(() =>
      gradient({
        kind: "radial",
        repeat: true,
        stops: [
          { color: "#000", at: 1 },
          { color: "#fff", at: 1 },
        ],
      }),
    ).toThrow(VisError);
  });

  it("validates at/radius", () => {
    expect(() =>
      gradient({ kind: "radial", at: [2, 0], stops: ["#000", "#fff"] }),
    ).toThrow(VisError);
    expect(() =>
      gradient({ kind: "radial", radius: 0, stops: ["#000", "#fff"] }),
    ).toThrow(VisError);
  });

  it("matches its golden", () => {
    expectGolden(
      "gradient/radial.svg",
      gradientSvg({
        kind: "radial",
        at: [0.8, 0.5],
        radius: 0.6,
        stops: [
          { color: "#ef4444", at: 0, opacity: 0.8 },
          { color: "#ef4444", at: 1, opacity: 0 },
        ],
        size: { width: 120, height: 60 },
      }),
    );
  });
});
