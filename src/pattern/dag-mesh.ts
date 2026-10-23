import { el } from "../core/svg.js";
import {
  MAX_DIMENSION,
  bounded,
  integerIn,
  orDefault,
} from "../core/validate.js";
import { MIN_RESOLUTION, fade } from "./types.js";
import type { DagMeshSpec, PatternCtx, TileOutput } from "./types.js";

/** 400 nodes x 8 links is at most 3200 links: about 190 KB of SVG (measured). */
const MAX_NODES = 400;
const MAX_LINKS = 8;

interface Node {
  i: number;
  x: number;
  y: number;
}

/**
 * Seeded nodes (5%..95% of the tile) each linked to their nearest
 * neighbours, one line per pair: the product's DAG motif. The tile is `size`.
 */
export function renderDagMesh(spec: DagMeshSpec, ctx: PatternCtx): TileOutput {
  const count = integerIn("density", orDefault(spec.density, 12), 2, MAX_NODES);
  const links = integerIn("links", orDefault(spec.links, 2), 1, MAX_LINKS);
  const radius = bounded(
    "nodeRadius",
    orDefault(spec.nodeRadius, 3),
    MIN_RESOLUTION,
    MAX_DIMENSION,
  );
  const { width, height } = ctx.size;
  const nodes = Array.from({ length: count }, (_, i): Node => {
    const x = ctx.rng.range(0.05, 0.95) * width;
    return { i, x, y: ctx.rng.range(0.05, 0.95) * height };
  });
  // Keyed by lower * count + higher index: a pair chosen from both ends is one line.
  const edges = new Map<number, [Node, Node]>();
  for (const n of nodes) {
    nodes
      .filter((m) => m !== n)
      .map((m) => ({ m, d: Math.hypot(m.x - n.x, m.y - n.y) }))
      // Array.sort is stable, so equal distances keep index order: deterministic.
      .sort((a, b) => a.d - b.d)
      .slice(0, links)
      .forEach(({ m }) => {
        const [a, b] = n.i < m.i ? [n, m] : [m, n];
        edges.set(a.i * count + b.i, [a, b]);
      });
  }
  const stroke = fade(ctx.alpha);
  const lines = [...edges]
    .sort(([a], [b]) => a - b)
    .map(([, [a, b]]) =>
      el("line", {
        x1: a.x,
        y1: a.y,
        x2: b.x,
        y2: b.y,
        stroke: ctx.color,
        "stroke-width": ctx.strokeWidth,
        "stroke-opacity": stroke,
      }),
    );
  const dots = nodes.map((n) =>
    el("circle", {
      cx: n.x,
      cy: n.y,
      r: radius,
      fill: ctx.color,
      "fill-opacity": stroke,
    }),
  );
  return { tile: { ...ctx.size }, body: lines.join("") + dots.join("") };
}
