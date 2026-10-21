import { describe, expect, it } from "vitest";

import { VisError } from "../../src/core/errors.js";
import { gradient, gradientSvg } from "../../src/gradient/index.js";
import { expectGolden } from "../helpers/golden.js";

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
