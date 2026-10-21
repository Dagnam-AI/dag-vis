import { describe, expect, it } from "vitest";

import { VisError } from "../../src/core/errors.js";
import { pattern } from "../../src/pattern/index.js";
import { expectGolden } from "../helpers/golden.js";
import { pixelAt, rasterize } from "../helpers/render.js";

interface Box {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  points: number;
}

/** Bounding box and vertex count of every `<path d="M…Z">` in the markup. */
function boxes(defs: string): Box[] {
  return [...defs.matchAll(/<path d="M([^"]+)Z"/g)].map((m) => {
    const pts = (m[1] ?? "")
      .split("L")
      .map((p) => p.split(" ").map(Number) as [number, number]);
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    return {
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minY: Math.min(...ys),
      maxY: Math.max(...ys),
      points: pts.length,
    };
  });
}

describe("contours", () => {
  it("draws seeded wobbly rings around seeded centres", () => {
    const p = pattern({
      kind: "contours",
      density: 2,
      rings: 3,
      size: { width: 100, height: 100 },
    });
    expect((p.defs.match(/<path /g) ?? []).length).toBe(6);
    expect(p.defs).toContain('fill="none"');
    expect(p.tile).toEqual({ width: 100, height: 100 });
  });

  it("nests the rings of one centre without crossing, `spacing` apart (derived from the output)", () => {
    // Ring k has radius k * spacing within +-0.4 * spacing, so ring k's
    // bounding box is strictly inside ring k + 1's, for every seed.
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const spacing = 20;
      const rings = 8;
      const b = boxes(
        pattern({
          kind: "contours",
          density: 1,
          rings,
          spacing,
          seed,
          size: { width: 400, height: 400 },
        }).defs,
      );
      expect(b).toHaveLength(rings);
      b.forEach((ring, i) => {
        const k = i + 1;
        expect(ring.points).toBe(48);
        for (const width of [ring.maxX - ring.minX, ring.maxY - ring.minY]) {
          expect(width).toBeGreaterThanOrEqual(2 * (k - 0.4) * spacing * 0.99);
          expect(width).toBeLessThanOrEqual(2 * (k + 0.4) * spacing + 0.01);
        }
        const outer = b[i + 1];
        if (outer) {
          expect(outer.minX).toBeLessThan(ring.minX);
          expect(outer.maxX).toBeGreaterThan(ring.maxX);
          expect(outer.minY).toBeLessThan(ring.minY);
          expect(outer.maxY).toBeGreaterThan(ring.maxY);
        }
      });
    }
  });

  it("puts the centres inside the tile (20%..80%)", () => {
    const [ring] = boxes(
      pattern({
        kind: "contours",
        density: 1,
        rings: 1,
        spacing: 10,
        size: { width: 200, height: 100 },
      }).defs,
    );
    const cx = ((ring?.minX ?? 0) + (ring?.maxX ?? 0)) / 2;
    const cy = ((ring?.minY ?? 0) + (ring?.maxY ?? 0)) / 2;
    expect(cx).toBeGreaterThan(0.2 * 200 - 4);
    expect(cx).toBeLessThan(0.8 * 200 + 4);
    expect(cy).toBeGreaterThan(0.2 * 100 - 4);
    expect(cy).toBeLessThan(0.8 * 100 + 4);
  });

  it("strokes rings only, never fills them (resvg)", () => {
    const p = pattern({
      kind: "contours",
      density: 1,
      rings: 2,
      spacing: 20,
      strokeWidth: 2,
      size: { width: 120, height: 120 },
    });
    const [inner] = boxes(p.defs);
    const r = rasterize(p.svg);
    const cx = Math.round(((inner?.minX ?? 0) + (inner?.maxX ?? 0)) / 2);
    const cy = Math.round(((inner?.minY ?? 0) + (inner?.maxY ?? 0)) / 2);
    // The inner ring has radius >= 0.6 * 20 = 12, so the centre is bare.
    expect(pixelAt(r, cx, cy)[3]).toBe(0);
    let painted = 0;
    for (let y = 0; y < 120; y++)
      for (let x = 0; x < 120; x++) if (pixelAt(r, x, y)[3] > 0) painted++;
    // Two closed curves of ~2*pi*(20 and 40) px, 2px wide, at most.
    expect(painted).toBeGreaterThan(200);
    expect(painted).toBeLessThan(2 * 2 * Math.PI * 60 * 1.3 + 400);
  });

  it("changes with the seed, repeats for the same seed", () => {
    expect(pattern({ kind: "contours", seed: 2 }).defs).not.toBe(
      pattern({ kind: "contours", seed: 3 }).defs,
    );
    expect(pattern({ kind: "contours", seed: 2 })).toEqual(
      pattern({ kind: "contours", seed: 2 }),
    );
  });

  it("validates density and rings", () => {
    const bad: [string, Record<string, unknown>][] = [
      ["rings", { rings: 0 }],
      ["rings", { rings: 33 }],
      ["rings", { rings: 2.5 }],
      ["rings", { rings: Number.NaN }],
      ["rings", { rings: "6" }],
      ["density", { density: 0 }],
      ["density", { density: 33 }],
      ["density", { density: 1.5 }],
      ["density", { density: Infinity }],
      ["density", { density: -2 }],
    ];
    for (const [name, extra] of bad) {
      expect(() => pattern({ kind: "contours", ...extra } as never)).toThrow(
        VisError,
      );
      expect(() => pattern({ kind: "contours", ...extra } as never)).toThrow(
        name,
      );
    }
  });

  it("bounds the output at the documented limits (32 centres x 32 rings)", () => {
    const p = pattern({ kind: "contours", density: 32, rings: 32 });
    expect((p.defs.match(/<path /g) ?? []).length).toBe(1024);
    expect(p.svg.length).toBeLessThan(1_500_000);
  });

  it("matches its golden", () => {
    expectGolden(
      "pattern/contours.svg",
      pattern({
        kind: "contours",
        spacing: 10,
        size: { width: 120, height: 80 },
      }).svg,
    );
  });
});
