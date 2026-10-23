import { describe, expect, it } from "vitest";

import { VisError } from "../../src/core/errors.js";
import {
  BLENDS,
  animatedGradientCss,
  gradient,
  gradientSvg,
} from "../../src/gradient/index.js";
import type { GradientSpec } from "../../src/gradient/index.js";

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

describe("gradient() spec tree budget", () => {
  const leaf: GradientSpec = { kind: "linear", stops: ["#000000", "#ffffff"] };
  const fluted = (reeds: number, source: GradientSpec): GradientSpec => ({
    kind: "fluted",
    reeds,
    source,
    size: { width: 60, height: 40 },
  });

  it("throws a VisError for a cyclic spec instead of overflowing the stack", () => {
    const cyclic = { kind: "layers", layers: [leaf] } as {
      kind: "layers";
      layers: GradientSpec[];
    };
    cyclic.layers.push(cyclic);
    expect(() => gradient(cyclic)).toThrow(VisError);
    expect(() => gradient(cyclic)).toThrow("cycle");
    expect(() => gradientSvg(cyclic)).toThrow("cycle");
    expect(() => animatedGradientCss(cyclic, { kind: "shift" })).toThrow(
      "cycle",
    );
  });

  it("throws a VisError for a 5000-deep layers or fluted nesting", () => {
    let layers: GradientSpec = leaf;
    let reeded: GradientSpec = leaf;
    for (let i = 0; i < 5000; i++) {
      layers = { kind: "layers", layers: [layers] };
      reeded = { kind: "fluted", reeds: 2, source: reeded };
    }
    for (const deep of [layers, reeded]) {
      expect(() => gradient(deep)).toThrow(VisError);
      expect(() => gradient(deep)).toThrow("16 levels deep");
    }
  });

  it("throws at once for a shared-reference tree that would take 2^40 visits", () => {
    let shared: GradientSpec = leaf;
    for (let i = 0; i < 40; i++)
      shared = { kind: "layers", layers: [shared, shared] };
    expect(() => gradient(shared)).toThrow(VisError);
  });

  it("caps the node count of a layers stack, naming the limit", () => {
    const stack = (n: number): GradientSpec => ({
      kind: "layers",
      layers: Array.from({ length: n }, () => leaf),
    });
    expect(() => gradient(stack(63))).not.toThrow();
    expect(() => gradient(stack(64))).toThrow("more than 64 nodes");
  });

  it("still renders the costliest legitimate specs", () => {
    const stack: GradientSpec = {
      kind: "layers",
      size: { width: 60, height: 40 },
      layers: Array.from({ length: 8 }, () => fluted(256, leaf)),
    };
    expect(gradient(stack).defs.match(/<clipPath /g)).toHaveLength(2048);
    expect(() =>
      gradient(fluted(64, { kind: "conic", stops: leaf.stops })),
    ).not.toThrow();
    expect(() =>
      gradient({
        kind: "layers",
        layers: [fluted(16, fluted(16, leaf)), fluted(16, fluted(16, leaf))],
      }),
    ).not.toThrow();
  });
});
