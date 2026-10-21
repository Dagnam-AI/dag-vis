import { describe, expect, it } from "vitest";

import { VisError } from "../../src/core/errors.js";
import { pattern } from "../../src/pattern/index.js";
import { expectGolden } from "../helpers/golden.js";
import { pixelAt, rasterize } from "../helpers/render.js";

describe("dots", () => {
  it("draws one dot per tile at the default radius (12% of spacing)", () => {
    const p = pattern({ kind: "dots", spacing: 20 });
    expect(p.defs).toContain(
      '<circle cx="10" cy="10" r="2.4" fill="#ef4444"/>',
    );
    expect(pattern({ kind: "dots", spacing: 20, radius: 5 }).defs).toContain(
      'r="5"',
    );
  });

  it("puts a dot of the right size at the centre of every tile (resvg)", () => {
    const r = rasterize(
      pattern({ kind: "dots", spacing: 20, size: { width: 60, height: 40 } })
        .svg,
    );
    let area = 0;
    for (let y = 0; y < r.height; y++)
      for (let x = 0; x < r.width; x++) area += pixelAt(r, x, y)[3] / 255;
    // 3 x 2 tiles, one disc of radius 2.4 each.
    expect(area / 6).toBeGreaterThan(Math.PI * 2.4 ** 2 * 0.95);
    expect(area / 6).toBeLessThan(Math.PI * 2.4 ** 2 * 1.05);
    for (const cx of [10, 30, 50]) {
      for (const cy of [10, 30]) {
        expect(pixelAt(r, cx, cy)).toEqual([239, 68, 68, 255]);
        expect(pixelAt(r, cx - 10, cy - 10)[3]).toBe(0);
      }
    }
  });

  it("applies opacity to the dot, not the tile", () => {
    const r = rasterize(
      pattern({
        kind: "dots",
        spacing: 20,
        opacity: 0.4,
        size: { width: 20, height: 20 },
      }).svg,
    );
    expect(pixelAt(r, 10, 10)[3]).toBe(102);
  });

  it("rejects a radius that is not a positive finite number", () => {
    for (const radius of [
      0,
      -1,
      Number.NaN,
      Infinity,
      "3",
      1e9,
      0.0001,
      null,
    ]) {
      expect(() => pattern({ kind: "dots", radius } as never)).toThrow(
        VisError,
      );
      expect(() => pattern({ kind: "dots", radius } as never)).toThrow(
        "radius",
      );
    }
  });

  it("is deterministic and matches its golden", () => {
    const spec = {
      kind: "dots",
      spacing: 24,
      color: "#ffffff",
      opacity: 0.4,
      background: "#0a0a0a",
      size: { width: 72, height: 48 },
    } as const;
    expect(pattern(spec).svg).toBe(pattern(spec).svg);
    expectGolden("pattern/dots.svg", pattern(spec).svg);
  });
});
