import { describe, expect, it } from "vitest";

import { VisError } from "../../src/core/errors.js";
import { gradient, gradientSvg } from "../../src/gradient/index.js";
import { expectGolden } from "../helpers/golden.js";
import { pixelAt, rasterize } from "../helpers/render.js";

/** Red channel of a black→white gradient rendered by resvg at integer pixel (x, y). */
function grey(spec: Parameters<typeof gradientSvg>[0], x: number, y: number) {
  return pixelAt(rasterize(gradientSvg(spec)), x, y)[0];
}

describe("linear gradient", () => {
  it("renders CSS and SVG for the default angle (180deg, top→bottom)", () => {
    const g = gradient({
      kind: "linear",
      stops: ["#ef4444", "#0a0a0a"],
      size: { width: 100, height: 50 },
    });
    expect(g.css).toBe(
      "background: linear-gradient(180deg, #ef4444 0%, #0a0a0a 100%);",
    );
    expect(g.fill).toBe("url(#vis1-g)");
    expect(g.defs).toContain(
      '<linearGradient id="vis1-g" gradientUnits="userSpaceOnUse" x1="50" y1="0" x2="50" y2="50">',
    );
    expect(g.svg).toBe('<rect width="100" height="50" fill="url(#vis1-g)"/>');
  });

  it("maps CSS angles onto the SVG gradient line", () => {
    const size = { width: 100, height: 50 };
    const right = gradient({
      kind: "linear",
      angle: 90,
      stops: ["#000", "#fff"],
      size,
    });
    expect(right.defs).toContain('x1="0" y1="25" x2="100" y2="25"');
    const up = gradient({
      kind: "linear",
      angle: 0,
      stops: ["#000", "#fff"],
      size,
    });
    expect(up.defs).toContain('x1="50" y1="50" x2="50" y2="0"');
  });

  it("supports repeat and reverse", () => {
    const g = gradient({
      kind: "linear",
      angle: 45,
      stops: [
        { color: "#000", at: 0 },
        { color: "#fff", at: 0.25 },
      ],
      repeat: true,
      reverse: true,
    });
    expect(g.css).toContain(
      "repeating-linear-gradient(45deg, #ffffff 75%, #000000 100%)",
    );
    expect(g.defs).toContain('spreadMethod="repeat"');
  });

  // Expected values are the CSS gradient-line maths worked by hand: the line has length
  // |w sin a| + |h cos a| through the centre, 0% and 100% on the corners.
  it.each([
    // [angle, size, x, y, expected 0..255]
    [45, { width: 100, height: 100 }, 25, 75, 64],
    [45, { width: 100, height: 100 }, 15, 84, 40],
    [135, { width: 120, height: 60 }, 10, 10, 30],
    [135, { width: 120, height: 60 }, 100, 10, 157],
    [45, { width: 120, height: 60 }, 60, 30, 128],
  ] as const)(
    "puts diagonal %i° bands where CSS does (%j at %i,%i ≈ %i)",
    (angle, size, x, y, expected) => {
      const v = grey(
        { kind: "linear", angle, stops: ["#000", "#fff"], size },
        x,
        y,
      );
      expect(Math.abs(v - expected)).toBeLessThanOrEqual(3);
    },
  );

  it("reaches 0% and 100% at the corners of the box", () => {
    const spec = {
      kind: "linear",
      angle: 135,
      stops: ["#000", "#fff"],
      size: { width: 120, height: 60 },
    } as const;
    expect(grey(spec, 0, 0)).toBeLessThanOrEqual(3); // CSS 135° = to bottom right
    expect(grey(spec, 119, 59)).toBeGreaterThanOrEqual(252);
  });

  it("repeats over the stop span, not the whole gradient vector", () => {
    // Stops cover 0..0.25 of a 100px bar: a 25px sawtooth, mid-grey at 12.5px in each tooth.
    const spec = {
      kind: "linear",
      angle: 90,
      stops: [
        { color: "#000", at: 0 },
        { color: "#fff", at: 0.25 },
      ],
      repeat: true,
      size: { width: 100, height: 20 },
    } as const;
    for (const x of [12, 37, 62, 87]) {
      expect(Math.abs(grey(spec, x, 10) - 128)).toBeLessThanOrEqual(6);
    }
    expect(grey(spec, 24, 10)).toBeGreaterThan(240);
    expect(grey(spec, 25, 10)).toBeLessThan(15);
  });

  it("repeats inward of the first stop too, like CSS", () => {
    // Stops 0.5..0.75: period 25px starting at 50px; x=0..49 is the previous periods.
    const spec = {
      kind: "linear",
      angle: 90,
      stops: [
        { color: "#000", at: 0.5 },
        { color: "#fff", at: 0.75 },
      ],
      repeat: true,
      size: { width: 100, height: 20 },
    } as const;
    for (const x of [12, 37, 62, 87]) {
      expect(Math.abs(grey(spec, x, 10) - 128)).toBeLessThanOrEqual(6);
    }
  });

  it("rejects repeating stops that span nothing", () => {
    expect(() =>
      gradient({
        kind: "linear",
        stops: [
          { color: "#000", at: 0.5 },
          { color: "#fff", at: 0.5 },
        ],
        repeat: true,
      }),
    ).toThrow(VisError);
  });

  it("rejects a non-finite angle, naming `angle`", () => {
    for (const angle of [Number.NaN, Infinity, -Infinity]) {
      expect(() =>
        gradient({ kind: "linear", stops: ["#000", "#fff"], angle }),
      ).toThrow(VisError);
      expect(() =>
        gradient({ kind: "linear", stops: ["#000", "#fff"], angle }),
      ).toThrow("linear angle");
    }
  });

  it("is deterministic and matches its golden as a standalone document", () => {
    const spec = {
      kind: "linear",
      angle: 135,
      stops: ["#ef4444", "#7f1d1d", "#0a0a0a"],
      size: { width: 120, height: 60 },
    } as const;
    expect(gradientSvg(spec)).toBe(gradientSvg(spec));
    expectGolden("gradient/linear.svg", gradientSvg(spec));
  });
});
