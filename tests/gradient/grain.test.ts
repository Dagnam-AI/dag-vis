import { describe, expect, it } from "vitest";

import { VisError } from "../../src/core/errors.js";
import { grainLayer } from "../../src/gradient/grain.js";
import { gradient, gradientSvg } from "../../src/gradient/index.js";
import { expectGolden } from "../helpers/golden.js";

describe("grain", () => {
  it("emits a turbulence filter and an overlay rect scaled by the amount", () => {
    const { defs, svg } = grainLayer("x", 0.4, { width: 10, height: 20 });
    expect(defs).toContain('<filter id="x-grain"');
    expect(defs).toContain("<feTurbulence");
    expect(svg).toBe(
      '<rect width="10" height="20" filter="url(#x-grain)" opacity="0.4" style="mix-blend-mode:overlay"/>',
    );
  });

  it("is appended after the gradient rect by gradient() and absent at 0", () => {
    const g = gradient({
      kind: "linear",
      stops: ["#000", "#fff"],
      grain: 0.3,
      size: { width: 10, height: 10 },
    });
    expect(g.svg).toMatch(
      /^<rect width="10" height="10" fill="url\(#vis1-g\)"\/><rect .*filter="url\(#vis1-grain\)"/,
    );
    expect(
      gradient({ kind: "linear", stops: ["#000", "#fff"], grain: 0 }).svg,
    ).not.toContain("grain");
  });

  it("seeds the noise so different seeds give different SVG", () => {
    const spec = {
      kind: "linear",
      stops: ["#000", "#fff"],
      grain: 0.5,
    } as const;
    const a = gradient({ ...spec, seed: 1 });
    const b = gradient({ ...spec, seed: 2 });
    expect(a.defs).toContain('seed="1"');
    expect(b.defs).toContain('seed="2"');
    expect(a.defs).not.toBe(b.defs);
    expect(grainLayer("x", 0.4, { width: 1, height: 1 }).defs).toContain(
      'seed="1"',
    );
  });

  it("blends with overlay by default and writes multiply or soft-light when asked", () => {
    const rect = (blend?: "overlay" | "multiply" | "soft-light"): string =>
      grainLayer("x", 0.4, { width: 10, height: 20 }, 1, blend).svg;
    expect(rect()).toContain("mix-blend-mode:overlay");
    expect(rect("multiply")).toContain("mix-blend-mode:multiply");
    expect(rect("soft-light")).toContain("mix-blend-mode:soft-light");
    const spec = {
      kind: "linear",
      stops: ["#fff", "#eee"],
      grain: 0.1,
      size: { width: 10, height: 10 },
    } as const;
    expect(gradient(spec).svg).toContain("mix-blend-mode:overlay");
    expect(gradient({ ...spec, grainBlend: "multiply" }).svg).toContain(
      "mix-blend-mode:multiply",
    );
    expectGolden(
      "gradient/grain-multiply.svg",
      gradientSvg({ ...spec, grainBlend: "multiply", grain: 0.2 }),
    );
  });

  it("rejects an unknown grainBlend", () => {
    for (const grainBlend of ["screen", 1, null, ""]) {
      expect(() =>
        gradient({
          kind: "linear",
          stops: ["#000", "#fff"],
          grain: 0.1,
          grainBlend,
        } as never),
      ).toThrow(/grainBlend must be one of overlay, multiply, soft-light/);
    }
  });

  it("rejects grain outside 0..1", () => {
    expect(() =>
      gradient({ kind: "linear", stops: ["#000", "#fff"], grain: 1.5 }),
    ).toThrow(VisError);
  });
});
