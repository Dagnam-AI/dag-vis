import { describe, expect, it } from "vitest";

import { VisError } from "../../src/core/errors.js";
import { pattern } from "../../src/pattern/index.js";
import { expectGolden } from "../helpers/golden.js";
import { pixelAt, rasterize } from "../helpers/render.js";

describe("noise", () => {
  it("fills the tile with monochrome fractal noise at the given frequency/octaves", () => {
    const p = pattern({
      kind: "noise",
      frequency: 0.5,
      octaves: 4,
      opacity: 0.2,
    });
    expect(p.defs).toContain(
      '<feTurbulence type="fractalNoise" baseFrequency="0.5" numOctaves="4"',
    );
    expect(p.defs).toContain('stitchTiles="stitch"');
    expect(p.defs).toContain('opacity="0.2"');
    expect(p.tile).toEqual({ width: 256, height: 256 });
  });

  it("namespaces the filter id with the prefix", () => {
    const p = pattern({ kind: "noise", idPrefix: "n" });
    expect(p.defs).toContain('<filter id="n-noise"');
    expect(p.defs).toContain('filter="url(#n-noise)"');
    expect(p.fill).toBe("url(#n-p)");
  });

  it("renders grey, varied, and no stronger than its opacity (resvg)", () => {
    const size = { width: 64, height: 64 };
    const strength = (opacity: number) => {
      const r = rasterize(pattern({ kind: "noise", size, opacity }).svg);
      const alphas = new Set<number>();
      let max = 0;
      for (let y = 0; y < 64; y++) {
        for (let x = 0; x < 64; x++) {
          const [red, green, blue, a] = pixelAt(r, x, y);
          if (a > 0) {
            expect(Math.abs(red - green)).toBeLessThanOrEqual(2);
            expect(Math.abs(green - blue)).toBeLessThanOrEqual(2);
          }
          alphas.add(a);
          max = Math.max(max, a);
        }
      }
      return { distinct: alphas.size, max };
    };
    const full = strength(1);
    expect(full.distinct).toBeGreaterThan(40);
    const faint = strength(0.2);
    expect(faint.max).toBeLessThanOrEqual(Math.ceil(0.2 * 255) + 1);
    expect(faint.max).toBeGreaterThan(0.2 * full.max * 0.8);
  });

  it("is seeded: same seed repeats, another seed looks different (resvg)", () => {
    const size = { width: 32, height: 32 };
    const px = (seed: number) =>
      Buffer.from(rasterize(pattern({ kind: "noise", size, seed }).svg).pixels);
    expect(px(5).equals(px(5))).toBe(true);
    expect(px(5).equals(px(6))).toBe(false);
    expect(pattern({ kind: "noise", seed: 5 }).defs).not.toBe(
      pattern({ kind: "noise", seed: 6 }).defs,
    );
  });

  it("validates frequency and octaves", () => {
    const bad: [string, Record<string, unknown>][] = [
      ["frequency", { frequency: 0 }],
      ["frequency", { frequency: -1 }],
      ["frequency", { frequency: 0.0001 }],
      ["frequency", { frequency: 11 }],
      ["frequency", { frequency: Number.NaN }],
      ["frequency", { frequency: Infinity }],
      ["frequency", { frequency: "0.5" }],
      ["octaves", { octaves: 0 }],
      ["octaves", { octaves: 11 }],
      ["octaves", { octaves: 2.5 }],
      ["octaves", { octaves: Number.NaN }],
      ["octaves", { octaves: Infinity }],
      ["octaves", { octaves: "3" }],
    ];
    for (const [name, extra] of bad) {
      expect(() => pattern({ kind: "noise", ...extra } as never)).toThrow(
        VisError,
      );
      expect(() => pattern({ kind: "noise", ...extra } as never)).toThrow(name);
    }
  });

  it("accepts the documented extremes", () => {
    expect(
      pattern({ kind: "noise", frequency: 0.001, octaves: 1 }).defs,
    ).toContain('baseFrequency="0.001" numOctaves="1"');
    expect(
      pattern({ kind: "noise", frequency: 10, octaves: 10 }).defs,
    ).toContain('baseFrequency="10" numOctaves="10"');
  });

  it("matches its golden", () => {
    expectGolden(
      "pattern/noise.svg",
      pattern({ kind: "noise", size: { width: 64, height: 64 } }).svg,
    );
  });
});
