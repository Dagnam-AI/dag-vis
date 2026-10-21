import { describe, expect, it } from "vitest";

import { VisError } from "../../src/core/errors.js";
import { gradient, gradientSvg } from "../../src/gradient/index.js";
import { expectGolden } from "../helpers/golden.js";
import { pixelAt, rasterize } from "./render.js";

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
