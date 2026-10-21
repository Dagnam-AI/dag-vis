import { describe, expect, it } from "vitest";

import { gradient, gradientSvg } from "../../src/gradient/index.js";
import { expectGolden } from "../helpers/golden.js";

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
      '<linearGradient id="vis1-g" x1="0.5" y1="0" x2="0.5" y2="1">',
    );
    expect(g.svg).toBe('<rect width="100" height="50" fill="url(#vis1-g)"/>');
  });

  it("maps CSS angles onto the SVG gradient line", () => {
    const right = gradient({
      kind: "linear",
      angle: 90,
      stops: ["#000", "#fff"],
    });
    expect(right.defs).toContain('x1="0" y1="0.5" x2="1" y2="0.5"');
    const up = gradient({ kind: "linear", angle: 0, stops: ["#000", "#fff"] });
    expect(up.defs).toContain('x1="0.5" y1="1" x2="0.5" y2="0"');
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
