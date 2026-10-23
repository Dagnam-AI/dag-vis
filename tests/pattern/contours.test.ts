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

type Pt = [number, number];

/** The vertex list of every `<path d="M…Z">` in the markup. */
function polygons(defs: string): Pt[][] {
  return [...defs.matchAll(/<path d="M([^"]+)Z"/g)].map((m) =>
    (m[1] ?? "").split("L").map((p) => p.split(" ").map(Number) as Pt),
  );
}

const cross = (o: Pt, a: Pt, b: Pt): number =>
  (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

/** The closed polygon's edges as [from, to] pairs. */
const edges = (poly: Pt[]): [Pt, Pt][] =>
  poly.map((a, i): [Pt, Pt] => [a, poly[(i + 1) % poly.length] ?? a]);

/** Number of proper intersections between the edges of two closed polygons. */
function crossings(p: Pt[], q: Pt[]): number {
  let n = 0;
  for (const [a, b] of edges(p)) {
    for (const [c, d] of edges(q)) {
      if (
        cross(a, b, c) * cross(a, b, d) < 0 &&
        cross(c, d, a) * cross(c, d, b) < 0
      )
        n++;
    }
  }
  return n;
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

  it("never crosses adjacent rings of one centre, whatever the seed (segment tests on the output)", () => {
    for (let seed = 1; seed <= 12; seed++) {
      const polys = polygons(
        pattern({
          kind: "contours",
          density: 1,
          rings: 10,
          spacing: 12,
          seed,
          size: { width: 600, height: 600 },
        }).defs,
      );
      expect(polys).toHaveLength(10);
      for (let k = 0; k + 1 < polys.length; k++) {
        const inner = polys[k] ?? [];
        const outer = polys[k + 1] ?? [];
        expect(inner).toHaveLength(48);
        expect(
          crossings(inner, outer),
          `seed ${seed} rings ${k}/${k + 1}`,
        ).toBe(0);
      }
    }
  });

  it("detects a crossing when there is one (the checker itself)", () => {
    const square = (r: number): [number, number][] => [
      [-r, -r],
      [r, -r],
      [r, r],
      [-r, r],
    ];
    expect(crossings(square(1), square(2))).toBe(0);
    expect(
      crossings(
        square(1),
        square(2).map(([x, y]) => [x + 1.5, y]),
      ),
    ).toBe(2);
  });

  it("spaces ring k about k * spacing out, wobble growing with k (derived from the output)", () => {
    // Radius k * spacing * (1 +- 0.13), so a ring's width is 2k * spacing * (0.87..1.13).
    const spacing = 20;
    const b = boxes(
      pattern({
        kind: "contours",
        density: 1,
        rings: 8,
        spacing,
        seed: 3,
        size: { width: 600, height: 600 },
      }).defs,
    );
    expect(b).toHaveLength(8);
    b.forEach((ring, i) => {
      const k = i + 1;
      for (const width of [ring.maxX - ring.minX, ring.maxY - ring.minY]) {
        expect(width).toBeGreaterThanOrEqual(2 * k * spacing * 0.87 * 0.99);
        expect(width).toBeLessThanOrEqual(2 * k * spacing * 1.13 + 0.01);
      }
    });
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
      ["rings", { rings: null }],
      ["density", { density: null }],
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
