import { describe, expect, it } from "vitest";

import { VisError } from "../../src/core/errors.js";
import { gradient, gradientSvg } from "../../src/gradient/index.js";
import type { GradientSpec } from "../../src/gradient/index.js";
import { expectGolden } from "../helpers/golden.js";
import { pixelAt, rasterize } from "../helpers/render.js";

const spec = {
  kind: "layers",
  layers: [
    { kind: "linear", angle: 0, stops: ["#000000", "#ffffff"] },
    { kind: "linear", angle: 90, stops: ["#ef4444", "#10abba"] },
  ],
  blend: "multiply",
  size: { width: 40, height: 20 },
} as const;

describe("layers gradient", () => {
  it("stacks sub-gradients bottom→top in SVG, top→bottom in CSS, with the blend on every layer above the first", () => {
    const g = gradient(spec);
    expect(g.css).toBe(
      "background: linear-gradient(90deg, #ef4444 0%, #10abba 100%), linear-gradient(0deg, #000000 0%, #ffffff 100%); background-blend-mode: multiply, normal;",
    );
    expect(g.defs).toContain('<linearGradient id="vis1-l0-g"');
    expect(g.defs).toContain('<linearGradient id="vis1-l1-g"');
    expect(g.defs).toMatch(
      /<rect width="40" height="20" fill="url\(#vis1-l0-g\)"\/><rect width="40" height="20" fill="url\(#vis1-l1-g\)" style="mix-blend-mode:multiply"\/>/,
    );
  });

  it("rasterises to what the emitted CSS paints: multiply is per-channel product", () => {
    // Bottom: 0deg black→white on a 20px-high box, so grey = 255 * (1 - (y + 0.5) / 20).
    // Top: 90deg #ef4444→#10abba on 40px, t = (x + 0.5) / 40. multiply = a * b / 255.
    const raster = rasterize(gradientSvg(spec));
    const top = [
      [0xef, 0x44, 0x44],
      [0x10, 0xab, 0xba],
    ] as const;
    for (const [x, y] of [
      [0, 0],
      [10, 5],
      [20, 10],
      [39, 19],
      [30, 2],
    ] as const) {
      const grey = 255 * (1 - (y + 0.5) / 20);
      const t = (x + 0.5) / 40;
      const px = pixelAt(raster, x, y);
      for (let c = 0; c < 3; c++) {
        const lo = Number(top[0][c]);
        const hi = Number(top[1][c]);
        const want = (grey * (lo + (hi - lo) * t)) / 255;
        expect(Math.abs(Number(px[c]) - want)).toBeLessThanOrEqual(3);
      }
    }
  });

  it("defaults to normal blending and nests composite kinds", () => {
    const g = gradient({
      kind: "layers",
      layers: [spec.layers[0], { kind: "conic", stops: ["#000", "#fff"] }],
      size: spec.size,
    });
    expect(g.css).not.toContain("blend-mode");
    expect(g.defs).toContain('<pattern id="vis1-l1-g"');
  });

  it("keeps each nested layer's own CSS images in top-first order", () => {
    const g = gradient({
      kind: "layers",
      layers: [
        { kind: "linear", stops: ["#111111", "#222222"] },
        {
          kind: "mesh",
          base: "#333333",
          points: [
            { at: [0.2, 0.2], color: "#444444" },
            { at: [0.8, 0.8], color: "#555555" },
          ],
        },
      ],
      size: { width: 10, height: 10 },
    });
    const order = ["#555555 0%", "#444444 0%", "#333333,", "#111111 0%"].map(
      (needle) => g.css.indexOf(needle),
    );
    expect(order.every((i) => i >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("draws a composite layer over the one below it, as CSS stacks it", () => {
    // An opaque mesh over a linear gradient hides it: every pixel is the mesh's.
    const ok: GradientSpec = {
      kind: "layers",
      layers: [
        { kind: "linear", stops: ["#ff0000", "#00ff00"] },
        {
          kind: "mesh",
          base: "#102030",
          points: [{ at: [0.5, 0.5], color: "#ffffff", radius: 0.5 }],
        },
      ],
      size: { width: 20, height: 20 },
    };
    const raster = rasterize(gradientSvg(ok));
    expect(pixelAt(raster, 0, 0)).toEqual([0x10, 0x20, 0x30, 255]);
    // 0.707px from the centre of a 10px-radius circle: alpha 1 - 0.707/10
    const a = 1 - Math.hypot(0.5, 0.5) / 10;
    const px = pixelAt(raster, 10, 10);
    expect(Math.abs(px[0] - (0x10 + (255 - 0x10) * a))).toBeLessThanOrEqual(3);
  });

  it("applies the layer blend to nested blend lists without losing the inner ones", () => {
    const g = gradient({
      kind: "layers",
      blend: "multiply",
      layers: [
        { kind: "linear", stops: ["#111", "#222"] },
        {
          kind: "layers",
          blend: "screen",
          layers: [
            { kind: "linear", stops: ["#333", "#444"] },
            { kind: "linear", stops: ["#555", "#666"] },
          ],
        },
      ],
    });
    // images: inner top (screen), inner bottom (re-blended by the outer), outer bottom
    expect(g.css).toMatch(/background-blend-mode: screen, multiply, normal;$/);
  });

  it("composes with overlay: the overlay's blend leads the list", () => {
    const g = gradient({
      ...spec,
      overlay: { image: "data:image/png;base64,AAAA", blend: "screen" },
    });
    expect(g.css).toMatch(/background-blend-mode: screen, multiply, normal;$/);
  });

  it("validates", () => {
    expect(() => gradient({ ...spec, layers: [] })).toThrow(VisError);
    expect(() => gradient({ ...spec, layers: "x" as never })).toThrow(VisError);
    expect(() => gradient({ ...spec, blend: "burn" as never })).toThrow(
      VisError,
    );
    expect(() =>
      gradient({ ...spec, layers: [{ kind: "plaid" } as never] }),
    ).toThrow(VisError);
  });

  it("matches its golden", () => {
    expectGolden("gradient/layers.svg", gradientSvg(spec));
  });
});
