import { describe, expect, it, vi } from "vitest";

import type * as Linear from "../../src/gradient/linear.js";
import { VisError } from "../../src/core/errors.js";
import { BLENDS, gradient, gradientSvg } from "../../src/gradient/index.js";

// Lets one test drive the nested-render hook (`ctx.render`) that the layered
// and fluted kinds use, without a kind that needs it existing yet.
vi.mock("../../src/gradient/linear.js", async (importOriginal) => {
  const original = await importOriginal<typeof Linear>();
  return {
    ...original,
    renderLinear: (
      spec: Parameters<typeof original.renderLinear>[0],
      ctx: Parameters<typeof original.renderLinear>[1],
    ) => {
      if (spec.idPrefix === "nested")
        return ctx.render({ kind: "radial", stops: spec.stops }, "sub");
      const out = original.renderLinear(spec, ctx);
      return spec.idPrefix === "blended" ? { ...out, cssBlend: "screen" } : out;
    },
  };
});

describe("gradient()", () => {
  it("emits background-blend-mode when a kind supplies a blend", () => {
    const g = gradient({
      kind: "linear",
      stops: ["#000", "#fff"],
      idPrefix: "blended",
    });
    expect(g.css).toBe(
      "background: linear-gradient(180deg, #000000 0%, #ffffff 100%); background-blend-mode: screen;",
    );
  });

  it("hands kinds a ctx.render that renders nested specs under a sub-id", () => {
    const g = gradient({
      kind: "linear",
      stops: ["#000", "#fff"],
      idPrefix: "nested",
    });
    expect(g.fill).toBe("url(#sub-g)");
    expect(g.defs).toContain('<radialGradient id="sub-g"');
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
