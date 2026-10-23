import { describe, expect, it } from "vitest";

import { pattern } from "../../src/pattern/index.js";
import { expectGolden } from "../helpers/golden.js";
import { pixelAt, rasterize } from "../helpers/render.js";

describe("grid", () => {
  it("strokes the top and left edge of each tile, inset by half the stroke", () => {
    const p = pattern({ kind: "grid", spacing: 32, strokeWidth: 2 });
    expect(p.defs).toContain(
      '<path d="M0 1H32M1 0V32" fill="none" stroke="#ef4444" stroke-width="2"/>',
    );
  });

  it("draws full-width lines, one per tile edge (resvg)", () => {
    // A stroke centred ON the tile edge would be clipped to half its width.
    for (const sw of [1, 2, 3]) {
      const r = rasterize(
        pattern({
          kind: "grid",
          spacing: 16,
          strokeWidth: sw,
          size: { width: 64, height: 48 },
        }).svg,
      );
      for (let y = 0; y < r.height; y++) {
        for (let x = 0; x < r.width; x++) {
          const on = x % 16 < sw || y % 16 < sw;
          expect(pixelAt(r, x, y), `sw=${sw} (${x},${y})`).toEqual(
            on ? [239, 68, 68, 255] : [0, 0, 0, 0],
          );
        }
      }
    }
  });

  it("does not double up where the two lines cross", () => {
    const r = rasterize(
      pattern({
        kind: "grid",
        spacing: 16,
        strokeWidth: 2,
        opacity: 0.5,
        size: { width: 32, height: 32 },
      }).svg,
    );
    const along = pixelAt(r, 8, 0)[3];
    expect(along).toBe(128);
    expect(pixelAt(r, 0, 0)[3]).toBe(along);
    expect(pixelAt(r, 1, 1)[3]).toBe(along);
  });

  it("matches its golden", () => {
    expectGolden(
      "pattern/grid.svg",
      pattern({
        kind: "grid",
        spacing: 16,
        color: "#10abba",
        size: { width: 64, height: 32 },
      }).svg,
    );
  });
});
