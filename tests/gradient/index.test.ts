import { describe, expect, it } from "vitest";

import { VisError } from "../../src/core/errors.js";
import { BLENDS, gradient, gradientSvg } from "../../src/gradient/index.js";

describe("gradient()", () => {
  it("emits background-blend-mode when a kind supplies a blend (via layers)", () => {
    const g = gradient({
      kind: "layers",
      blend: "screen",
      layers: [
        { kind: "linear", stops: ["#000", "#fff"] },
        { kind: "radial", stops: ["#f00", "#00f"] },
      ],
      size: { width: 10, height: 10 },
    });
    expect(g.css).toBe(
      "background: radial-gradient(circle 5px at 50% 50%, #ff0000 0%, #0000ff 100%), linear-gradient(180deg, #000000 0%, #ffffff 100%); background-blend-mode: screen, normal;",
    );
  });

  it("hands kinds a ctx.render that renders nested specs under a sub-id (via layers)", () => {
    const g = gradient({
      kind: "layers",
      layers: [{ kind: "radial", stops: ["#000", "#fff"] }],
    });
    expect(g.fill).toBe("url(#vis1-g)");
    expect(g.defs).toContain('<radialGradient id="vis1-l0-g"');
  });

  it("namespaces ids from the seed by default and from idPrefix when given", () => {
    expect(
      gradient({ kind: "linear", stops: ["#000", "#fff"], seed: 7 }).fill,
    ).toBe("url(#vis7-g)");
    expect(
      gradient({ kind: "linear", stops: ["#000", "#fff"], idPrefix: "hero" })
        .fill,
    ).toBe("url(#hero-g)");
  });

  it("gradientSvg wraps defs + body in a document of the given size", () => {
    const svg = gradientSvg(
      { kind: "linear", stops: ["#000", "#fff"] },
      { width: 30, height: 20 },
    );
    expect(
      svg.startsWith(
        '<svg xmlns="http://www.w3.org/2000/svg" width="30" height="20" viewBox="0 0 30 20"><defs>',
      ),
    ).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
  });

  it("uses the spec size by default (1200×630 when absent)", () => {
    expect(gradientSvg({ kind: "linear", stops: ["#000", "#fff"] })).toContain(
      'width="1200" height="630"',
    );
  });

  it("rejects unknown kinds and bad sizes with VisError", () => {
    expect(() => gradient({ kind: "plaid" } as never)).toThrow(VisError);
    expect(() => gradient({ kind: "plaid" } as never)).toThrow("plaid");
    expect(() =>
      gradient({
        kind: "linear",
        stops: ["#000", "#fff"],
        size: { width: -1, height: 1 },
      }),
    ).toThrow(VisError);
  });

  it.each([Number.NaN, Infinity, 1.5, 1e21])("rejects seed %s", (seed) => {
    expect(() =>
      gradient({ kind: "linear", stops: ["#000", "#fff"], seed }),
    ).toThrow(VisError);
  });

  it("lists the blend modes", () => {
    expect(BLENDS).toEqual([
      "normal",
      "multiply",
      "screen",
      "overlay",
      "soft-light",
    ]);
  });
});
