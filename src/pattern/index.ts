import { VisError } from "../core/errors.js";
import type { Size } from "../core/geometry.js";
import { createRng } from "../core/rng.js";
import { el, svgDoc } from "../core/svg.js";
import {
  MAX_DIMENSION,
  bounded,
  describeValue,
  orDefault,
  parseId,
  parsePaint,
  parseSeed,
} from "../core/validate.js";
import { renderContours } from "./contours.js";
import { renderDagMesh } from "./dag-mesh.js";
import { renderDots } from "./dots.js";
import { renderGrid } from "./grid.js";
import { renderLines } from "./lines.js";
import { renderNoise } from "./noise.js";
import { renderStripes } from "./stripes.js";
import { MIN_RESOLUTION, fade } from "./types.js";
import type {
  PatternCtx,
  PatternResult,
  PatternSpec,
  TileOutput,
} from "./types.js";

export type {
  ContoursSpec,
  DagMeshSpec,
  DotsSpec,
  GridSpec,
  LinesSpec,
  NoiseSpec,
  PatternBase,
  PatternCtx,
  PatternResult,
  PatternSpec,
  StripesSpec,
  TileOutput,
} from "./types.js";

/** The sample is the tile repeated to about this many px per side. */
const SAMPLE = 256;

function renderKind(spec: PatternSpec, ctx: PatternCtx): TileOutput {
  switch (spec.kind) {
    case "dots":
      return renderDots(spec, ctx);
    case "grid":
      return renderGrid(spec, ctx);
    case "lines":
      return renderLines(spec, ctx);
    case "stripes":
      return renderStripes(spec, ctx);
    case "dagMesh":
      return renderDagMesh(spec, ctx);
    case "contours":
      return renderContours(spec, ctx);
    case "noise":
      return renderNoise(spec, ctx);
    default:
      throw new VisError(
        `unknown pattern kind: ${describeValue((spec as { kind?: unknown }).kind)}`,
      );
  }
}

/** `size` as given: an object with both sides in 1..MAX_DIMENSION. */
function parseSize(v: unknown): Size {
  if (typeof v !== "object" || v === null)
    throw new VisError(
      `size must be { width, height }, got ${describeValue(v)}`,
    );
  const { width, height } = v as { width?: unknown; height?: unknown };
  return {
    width: bounded("size.width", width, 1, MAX_DIMENSION),
    height: bounded("size.height", height, 1, MAX_DIMENSION),
  };
}

/**
 * A tiling pattern: the `<pattern>` for SVG `<defs>` plus the `fill` that uses
 * it, a standalone sample document, and that sample as a CSS data-URI image.
 * Dots, grid, lines and stripes are unseeded; dagMesh, contours and noise are
 * seeded (same spec and seed give byte-identical output). Every option is
 * validated and bounded, so a bad spec throws a `VisError` naming it.
 */
export function pattern(spec: PatternSpec): PatternResult {
  // JS callers can pass anything.
  const input: unknown = spec;
  if (typeof input !== "object" || input === null)
    throw new VisError(
      `pattern spec must be an object, got ${describeValue(input)}`,
    );
  const opacity = bounded("opacity", orDefault(spec.opacity, 1), 0, 1);
  const spacing = bounded(
    "spacing",
    orDefault(spec.spacing, 24),
    1,
    MAX_DIMENSION,
  );
  const strokeWidth = bounded(
    "strokeWidth",
    orDefault(spec.strokeWidth, 1),
    MIN_RESOLUTION,
    MAX_DIMENSION,
  );
  const seed = parseSeed(spec.seed);
  const id = parseId(
    "idPrefix",
    orDefault<unknown>(spec.idPrefix, `vis${seed}`),
    64,
  );
  const color = parsePaint("color", orDefault<unknown>(spec.color, "#ef4444"));
  const background =
    spec.background === undefined
      ? undefined
      : parsePaint("background", spec.background);
  const given = spec.size === undefined ? undefined : parseSize(spec.size);
  const out = renderKind(spec, {
    id,
    rng: createRng(seed),
    color: color.hex,
    alpha: opacity * color.alpha,
    opacity,
    spacing,
    strokeWidth,
    size: given ?? { width: SAMPLE, height: SAMPLE },
  });
  const pid = `${id}-p`;
  const defs = el(
    "pattern",
    {
      id: pid,
      patternUnits: "userSpaceOnUse",
      width: out.tile.width,
      height: out.tile.height,
      patternTransform: out.patternTransform,
    },
    out.body,
  );
  const fill = `url(#${pid})`;
  // The sample: the explicit size, else the tile repeated to roughly SAMPLE px.
  const size: Size = given ?? {
    width: out.tile.width * Math.max(1, Math.round(SAMPLE / out.tile.width)),
    height: out.tile.height * Math.max(1, Math.round(SAMPLE / out.tile.height)),
  };
  const children = [el("defs", {}, defs)];
  if (background !== undefined)
    children.push(
      el("rect", {
        width: size.width,
        height: size.height,
        fill: background.hex,
        "fill-opacity": fade(background.alpha),
      }),
    );
  children.push(el("rect", { width: size.width, height: size.height, fill }));
  const svg = svgDoc(size, ...children);
  return {
    svg,
    defs,
    fill,
    cssBackground: `url("data:image/svg+xml,${encodeURIComponent(svg)}")`,
    tile: out.tile,
  };
}
