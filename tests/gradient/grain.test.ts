import { describe, expect, it } from "vitest";

import { VisError } from "../../src/core/errors.js";
import { grainLayer } from "../../src/gradient/grain.js";
import { gradient } from "../../src/gradient/index.js";

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

  it("rejects grain outside 0..1", () => {
    expect(() =>
      gradient({ kind: "linear", stops: ["#000", "#fff"], grain: 1.5 }),
    ).toThrow(VisError);
  });
});
