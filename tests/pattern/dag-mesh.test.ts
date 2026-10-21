import { describe, expect, it } from "vitest";

import { VisError } from "../../src/core/errors.js";
import { pattern } from "../../src/pattern/index.js";
import type { PatternSpec } from "../../src/pattern/index.js";
import { expectGolden } from "../helpers/golden.js";
import { pixelAt, rasterize } from "../helpers/render.js";

type Pt = [number, number];

function parse(defs: string): { nodes: Pt[]; lines: [Pt, Pt][] } {
  const nodes = [...defs.matchAll(/<circle cx="([^"]+)" cy="([^"]+)"/g)].map(
    (m): Pt => [Number(m[1]), Number(m[2])],
  );
  const lines = [
    ...defs.matchAll(
      /<line x1="([^"]+)" y1="([^"]+)" x2="([^"]+)" y2="([^"]+)"/g,
    ),
  ].map((m): [Pt, Pt] => [
    [Number(m[1]), Number(m[2])],
    [Number(m[3]), Number(m[4])],
  ]);
  return { nodes, lines };
}

const key = (a: Pt, b: Pt): string =>
  [a.join(","), b.join(",")].sort().join("|");

describe("dagMesh", () => {
  it("scatters seeded nodes and links each to its nearest neighbours", () => {
    const p = pattern({
      kind: "dagMesh",
      density: 6,
      links: 2,
      size: { width: 100, height: 100 },
    });
    expect((p.defs.match(/<circle /g) ?? []).length).toBe(6);
    expect((p.defs.match(/<line /g) ?? []).length).toBeGreaterThanOrEqual(6);
    expect((p.defs.match(/<line /g) ?? []).length).toBeLessThanOrEqual(12);
    expect(p.tile).toEqual({ width: 100, height: 100 });
  });

  it("links exactly each node's nearest neighbours, once per pair (derived from the output)", () => {
    for (const links of [1, 2, 3]) {
      const { nodes, lines } = parse(
        pattern({
          kind: "dagMesh",
          density: 15,
          links,
          size: { width: 300, height: 200 },
        }).defs,
      );
      const want = new Set<string>();
      for (const n of nodes) {
        nodes
          .filter((m) => m !== n)
          .sort(
            (a, b) =>
              Math.hypot(a[0] - n[0], a[1] - n[1]) -
              Math.hypot(b[0] - n[0], b[1] - n[1]),
          )
          .slice(0, links)
          .forEach((m) => want.add(key(n, m)));
      }
      const got = lines.map(([a, b]) => key(a, b));
      expect(new Set(got).size, "no duplicate edges").toBe(got.length);
      expect(new Set(got)).toEqual(want);
    }
  });

  it("keeps every node inside the tile with a margin", () => {
    const { nodes } = parse(
      pattern({
        kind: "dagMesh",
        density: 200,
        size: { width: 300, height: 200 },
      }).defs,
    );
    expect(nodes).toHaveLength(200);
    for (const [x, y] of nodes) {
      expect(x).toBeGreaterThanOrEqual(0.05 * 300 - 0.001);
      expect(x).toBeLessThanOrEqual(0.95 * 300 + 0.001);
      expect(y).toBeGreaterThanOrEqual(0.05 * 200 - 0.001);
      expect(y).toBeLessThanOrEqual(0.95 * 200 + 0.001);
    }
  });

  it("draws the nodes and links where the markup says (resvg)", () => {
    const spec: PatternSpec = {
      kind: "dagMesh",
      density: 8,
      strokeWidth: 2,
      nodeRadius: 4,
      size: { width: 160, height: 100 },
    };
    const p = pattern(spec);
    const { nodes, lines } = parse(p.defs);
    const r = rasterize(p.svg);
    for (const [x, y] of nodes) {
      expect(pixelAt(r, Math.floor(x), Math.floor(y))).toEqual([
        239, 68, 68, 255,
      ]);
    }
    // The midpoint of a link lies on the 2px line: opaque unless a node sits there.
    for (const [a, b] of lines) {
      const mx = (a[0] + b[0]) / 2;
      const my = (a[1] + b[1]) / 2;
      expect(pixelAt(r, Math.floor(mx), Math.floor(my))[3]).toBeGreaterThan(
        100,
      );
    }
    expect(pixelAt(r, 0, 0)[3]).toBe(0);
  });

  it("changes with the seed, repeats for the same seed", () => {
    expect(pattern({ kind: "dagMesh", seed: 2 }).defs).not.toBe(
      pattern({ kind: "dagMesh", seed: 3 }).defs,
    );
    expect(pattern({ kind: "dagMesh", seed: 2 })).toEqual(
      pattern({ kind: "dagMesh", seed: 2 }),
    );
  });

  it("validates density, links and node radius", () => {
    const bad: [string, Record<string, unknown>][] = [
      ["density", { density: 1 }],
      ["density", { density: 0 }],
      ["density", { density: 2.5 }],
      ["density", { density: 401 }],
      ["density", { density: Number.NaN }],
      ["density", { density: Infinity }],
      ["density", { density: "6" }],
      ["links", { links: 0 }],
      ["links", { links: 9 }],
      ["links", { links: 1.5 }],
      ["links", { links: Number.NaN }],
      ["nodeRadius", { nodeRadius: 0 }],
      ["nodeRadius", { nodeRadius: -1 }],
      ["nodeRadius", { nodeRadius: Number.NaN }],
      ["nodeRadius", { nodeRadius: 1e9 }],
    ];
    for (const [name, extra] of bad) {
      expect(() => pattern({ kind: "dagMesh", ...extra } as never)).toThrow(
        VisError,
      );
      expect(() => pattern({ kind: "dagMesh", ...extra } as never)).toThrow(
        name,
      );
    }
  });

  it("bounds the output at the documented limits (400 nodes, 8 links)", () => {
    const p = pattern({ kind: "dagMesh", density: 400, links: 8 });
    expect((p.defs.match(/<circle /g) ?? []).length).toBe(400);
    expect((p.defs.match(/<line /g) ?? []).length).toBeLessThanOrEqual(3200);
    expect(p.svg.length).toBeLessThan(400_000);
    // More links than neighbours cannot add edges beyond the complete graph.
    const tiny = pattern({ kind: "dagMesh", density: 2, links: 8 });
    expect((tiny.defs.match(/<line /g) ?? []).length).toBe(1);
  });

  it("matches its golden", () => {
    expectGolden(
      "pattern/dag-mesh.svg",
      pattern({
        kind: "dagMesh",
        density: 8,
        size: { width: 160, height: 100 },
        background: "#0a0a0a",
      }).svg,
    );
  });
});
