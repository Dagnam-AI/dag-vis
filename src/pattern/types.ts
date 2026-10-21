import { parseColor, toHex, withAlpha } from "../core/color.js";
import { VisError } from "../core/errors.js";
import type { Size } from "../core/geometry.js";
import type { Rng } from "../core/rng.js";

/**
 * Options every pattern accepts. Which ones a kind reads is stated on each
 * kind; the rest are validated but ignored.
 */
export interface PatternBase {
  /** Colour of the marks (alpha is honoured). Default brand red. Not used by `stripes` or `noise`. */
  color?: string;
  /** 0..1, multiplied into every mark. Default 1. For `noise` it is the strength. */
  opacity?: number;
  /** Tile side in px (1..16384), or the ring step for `contours`. Default 24. */
  spacing?: number;
  /** Stroke width in px (0.001..16384). Default 1. Read by grid, lines, dagMesh, contours. */
  strokeWidth?: number;
  /** Safe integer. Default 1. Seeds dagMesh, contours and noise, and the default id. */
  seed?: number;
  /** `<defs>` id namespace: a letter or `_`, then up to 63 letters, digits, `_` or `-`. Default `"vis" + seed`. */
  idPrefix?: string;
  /** Opaque backdrop behind the sample `svg` (not part of the tile). */
  background?: string;
  /**
   * Sample document size (each side 1..16384). Default: the tile repeated to
   * about 256px. For dagMesh, contours and noise it is also the tile (default 256x256).
   */
  size?: Size;
}

export interface DotsSpec extends PatternBase {
  kind: "dots";
  /** Dot radius in px (0.001..16384). Default 12% of `spacing`. */
  radius?: number;
}
export interface GridSpec extends PatternBase {
  kind: "grid";
}
export interface LinesSpec extends PatternBase {
  kind: "lines";
  /** Degrees, any finite number (reduced to one turn). 0 = horizontal. Default 0. */
  angle?: number;
}
export interface StripesSpec extends PatternBase {
  kind: "stripes";
  /** 1..64 colours, one bar each. Default the four brand LoadStripes colours. */
  colors?: readonly string[];
  /** Bar width in px (1..16384). Default 16. */
  barWidth?: number;
  /** Space after each bar in px (0..16384), and below the row. Default 4. */
  gap?: number;
  /** Bar height in px (1..16384). Default 44. */
  barHeight?: number;
}
export interface DagMeshSpec extends PatternBase {
  kind: "dagMesh";
  /** Node count, integer 2..400. Default 12. */
  density?: number;
  /** Node radius in px (0.001..16384). Default 3. */
  nodeRadius?: number;
  /** Nearest neighbours each node links to, integer 1..8. Default 2. */
  links?: number;
}
export interface ContoursSpec extends PatternBase {
  kind: "contours";
  /** Number of ring centres, integer 1..32. Default 2. */
  density?: number;
  /** Rings per centre, integer 1..32. Default 6. */
  rings?: number;
}
export interface NoiseSpec extends PatternBase {
  kind: "noise";
  /** Base frequency 0.001..10. Default 0.9. */
  frequency?: number;
  /** Octaves, integer 1..10. Default 3. */
  octaves?: number;
}

export type PatternSpec =
  | DotsSpec
  | GridSpec
  | LinesSpec
  | StripesSpec
  | DagMeshSpec
  | ContoursSpec
  | NoiseSpec;

export interface PatternResult {
  /** A standalone sample document: the pattern filling `size` (or the tile repeated to about 256px). */
  svg: string;
  /** The `<pattern>` element, to place in a `<defs>`. */
  defs: string;
  /** `url(#<id>-p)`: use as `fill`/`stroke`. */
  fill: string;
  /**
   * `url("data:image/svg+xml,…")` of `svg`: the same picture as a CSS image.
   * Repeating it is seamless only for dots, grid, stripes and `lines` at a
   * multiple of 90 degrees, and only when the sample is a whole number of
   * tiles (the default; an explicit `size` that is not shows a seam). Other
   * `lines` angles show a seam at the sample edge. `contours` rings run past
   * the tile edge and are cut there; `dagMesh` repeats as identical copies of
   * its tile; `noise` repeats seamlessly only where the engine honours
   * `stitchTiles` (see `NoiseSpec`).
   */
  cssBackground: string;
  tile: Size;
}

/** A parsed colour: opaque hex plus its alpha, so output never needs 8-digit hex. */
export interface Paint {
  hex: string;
  alpha: number;
}

export interface PatternCtx {
  id: string;
  rng: Rng;
  /** Opaque hex of `spec.color`. */
  color: string;
  /** `spec.opacity` x the colour's own alpha: what a mark in `color` is drawn with. */
  alpha: number;
  /** `spec.opacity` alone, for kinds that bring their own colours. */
  opacity: number;
  spacing: number;
  strokeWidth: number;
  /** Sample size, or the tile for dagMesh, contours and noise. */
  size: Size;
}

export interface TileOutput {
  tile: Size;
  body: string;
  patternTransform?: string;
}

/** Largest size, spacing or tile side: keeps every number far from exponent notation. */
export const MAX_DIMENSION = 16384;
/** Smallest non-zero value `fmt` (3 decimals) can still write. */
export const MIN_RESOLUTION = 0.001;

/** Longest string an error message quotes, and the longest colour accepted. */
const QUOTE_LIMIT = 80;

/** A value for an error message. Never throws and never runs long, whatever the caller passed. */
export function describeValue(v: unknown): string {
  switch (typeof v) {
    case "string":
      return JSON.stringify(
        v.length > QUOTE_LIMIT ? `${v.slice(0, QUOTE_LIMIT)}...` : v,
      );
    case "number":
    case "bigint":
    case "boolean":
      return String(v);
    default:
      return v === null ? "null" : typeof v;
  }
}

/** Finite number in [min, max]. JS callers can pass anything, so the type is checked too. */
export function bounded(
  name: string,
  v: unknown,
  min: number,
  max: number,
): number {
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max)
    throw new VisError(
      `${name} must be a number in ${min}..${max}, got ${describeValue(v)}`,
    );
  return v;
}

export function finite(name: string, v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v))
    throw new VisError(
      `${name} must be a finite number, got ${describeValue(v)}`,
    );
  return v;
}

/** Integer in [min, max]. */
export function integerIn(
  name: string,
  v: unknown,
  min: number,
  max: number,
): number {
  if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max)
    throw new VisError(
      `${name} must be an integer in ${min}..${max}, got ${describeValue(v)}`,
    );
  return v;
}

/** A colour string → opaque hex + alpha. Errors name the parameter. */
export function parsePaint(name: string, v: unknown): Paint {
  if (typeof v !== "string")
    throw new VisError(
      `${name} must be a colour string, got ${describeValue(v)}`,
    );
  // No colour is this long; do not hand a megabyte string to the parser or an error.
  if (v.length > QUOTE_LIMIT)
    throw new VisError(
      `${name} must be a colour of at most ${QUOTE_LIMIT} characters, got ${describeValue(v)}`,
    );
  try {
    const c = parseColor(v);
    return { hex: toHex(withAlpha(c, 1)), alpha: c.a };
  } catch (e) {
    throw new VisError(`${name}: ${(e as VisError).message}`);
  }
}

const ID = /^[A-Za-z_][\w-]{0,63}$/;

/** An id that is a valid XML name and safe inside `url(#…)`. */
export function parseId(name: string, v: unknown): string {
  if (typeof v !== "string" || !ID.test(v))
    throw new VisError(
      `${name} must be a valid id (a letter or "_", then up to 63 letters, digits, "_" or "-"), got ${describeValue(v)}`,
    );
  return v;
}

/**
 * `v`, or `fallback` ONLY when `v` is undefined. Unlike `??` it leaves `null`
 * (from a JS caller) for the validator to reject, naming the parameter.
 */
export function orDefault<T>(v: T | undefined, fallback: T): T {
  if (v === undefined) return fallback;
  return v;
}

/** An opacity attribute value: omitted when fully opaque. */
export function fade(alpha: number): number | undefined {
  return alpha < 1 ? alpha : undefined;
}
