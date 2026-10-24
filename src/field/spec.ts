import { VisError } from "../core/index.js";
import type { Rgba } from "../core/index.js";
import {
  bounded,
  describeValue,
  integerIn,
  orDefault,
  parseFlag,
  parseRgba,
  within,
} from "../core/validate.js";

export type FlowShape =
  "swirl" | "wave" | "aurora" | "bloom" | "band" | "noise";
export const FLOW_SHAPES: readonly FlowShape[] = [
  "swirl",
  "wave",
  "aurora",
  "bloom",
  "band",
  "noise",
];
/** Most points a fluid field holds: the GPU twin sizes its uniform arrays to it. */
export const MAX_FLUID_POINTS = 8;
export type FlutedDirection = "vertical" | "horizontal";
const DIRECTIONS: readonly FlutedDirection[] = ["vertical", "horizontal"];

export interface FieldHighlight {
  at: readonly [number, number];
  strength?: number;
  radius?: number;
  color?: string;
}
export interface FlowFieldSpec {
  kind: "flow";
  palette: readonly string[];
  shape?: FlowShape;
  warp?: { octaves?: number; strength?: number; scale?: number };
  scale?: number;
  rotation?: number;
  light?: { vignette?: number; highlight?: FieldHighlight };
  grain?: number;
  animatedGrain?: boolean;
  seed?: number;
}
export interface FluidFieldPoint {
  at: readonly [number, number];
  color: string;
  spread?: number;
}
export interface FluidFieldSpec {
  kind: "fluid";
  points: readonly FluidFieldPoint[];
  softness?: number;
  drift?: number;
  base?: string;
  grain?: number;
  animatedGrain?: boolean;
  seed?: number;
}
export interface FlutedFieldSpec {
  kind: "fluted";
  source: FlowFieldSpec | FluidFieldSpec;
  reeds?: number;
  direction?: FlutedDirection;
  refraction?: number;
  shade?: number;
  jitter?: number;
  grain?: number;
  animatedGrain?: boolean;
  seed?: number;
}
export type FieldSpec = FlowFieldSpec | FluidFieldSpec | FlutedFieldSpec;

interface Common {
  grain: number;
  animatedGrain: boolean;
  seed: number;
}
export interface ResolvedFlow extends Common {
  kind: "flow";
  palette: string[];
  shape: FlowShape;
  warp: { octaves: number; strength: number; scale: number };
  scale: number;
  rotation: number;
  vignette: number;
  highlight: {
    at: [number, number];
    strength: number;
    radius: number;
    color: Rgba;
  } | null;
}
export interface ResolvedFluid extends Common {
  kind: "fluid";
  points: { at: [number, number]; color: Rgba; spread: number }[];
  softness: number;
  drift: number;
  base: Rgba;
}
export interface ResolvedFluted extends Common {
  kind: "fluted";
  source: ResolvedFlow | ResolvedFluid;
  reeds: number;
  direction: FlutedDirection;
  refraction: number;
  shade: number;
  jitter: number;
}
export type ResolvedField = ResolvedFlow | ResolvedFluid | ResolvedFluted;

type Obj = Record<string, unknown>;

/** Largest seed: the generators hash it as an unsigned 32-bit integer. */
const MAX_SEED = 4294967295;

const at = (path: string, key: string): string =>
  path === "" ? key : `${path}.${key}`;

function obj(v: unknown, what: string): Obj {
  if (typeof v !== "object" || v === null || Array.isArray(v))
    throw new VisError(`${what} must be an object, got ${describeValue(v)}`);
  return v as Obj;
}

/** `o[key]` as a number in [min, max]; `undefined` takes `def`, anything else is checked. */
function num(
  o: Obj,
  path: string,
  key: string,
  def: number,
  min: number,
  max: number,
): number {
  return bounded(at(path, key), orDefault(o[key], def), min, max);
}

function int(
  o: Obj,
  path: string,
  key: string,
  def: number,
  min: number,
  max: number,
): number {
  return integerIn(at(path, key), orDefault(o[key], def), min, max);
}

function oneOf<T extends string>(
  o: Obj,
  key: string,
  allowed: readonly T[],
  def: T,
): T {
  const v = orDefault<unknown>(o[key], def);
  // An array lookup, never an object one: "__proto__" and "toString" are not members.
  if (typeof v !== "string" || !allowed.includes(v as T))
    throw new VisError(
      `${key} must be one of ${allowed.join("|")}, got ${describeValue(v)}`,
    );
  return v as T;
}

/** A list of `min..max` entries, read by index so a sparse array fails instead of skipping its holes. */
function list(v: unknown, what: string, min: number, max: number): unknown[] {
  if (!Array.isArray(v) || v.length < min || v.length > max)
    throw new VisError(
      `${what} must have ${min}..${max} entries, got ${Array.isArray(v) ? v.length : describeValue(v)}`,
    );
  return Array.from({ length: v.length }, (_, i) => v[i] as unknown);
}

function pair(v: unknown, what: string): [number, number] {
  const p = list(v, what, 2, 2);
  return [
    bounded(`${what}[0]`, p[0], -1, 2),
    bounded(`${what}[1]`, p[1], -1, 2),
  ];
}

function common(o: Obj): Common {
  return {
    grain: num(o, "", "grain", 0.3, 0, 1),
    animatedGrain: parseFlag(
      "animatedGrain",
      orDefault<unknown>(o.animatedGrain, true),
    ),
    seed: int(o, "", "seed", 1, 0, MAX_SEED),
  };
}

function resolveFlow(o: Obj): ResolvedFlow {
  const palette = list(o.palette, "palette", 2, 6).map((c, i) => {
    parseRgba(`palette[${i}]`, c);
    return c as string;
  });
  const warp = obj(orDefault<unknown>(o.warp, {}), "warp");
  const light = obj(orDefault<unknown>(o.light, {}), "light");
  let highlight: ResolvedFlow["highlight"] = null;
  if (light.highlight !== undefined) {
    const path = "light.highlight";
    const h = obj(light.highlight, path);
    highlight = {
      at: pair(h.at, `${path}.at`),
      strength: num(h, path, "strength", 0.4, 0, 1),
      radius: num(h, path, "radius", 0.5, 0.01, 2),
      color: parseRgba(`${path}.color`, orDefault<unknown>(h.color, "#ffffff")),
    };
  }
  return {
    kind: "flow",
    palette,
    shape: oneOf(o, "shape", FLOW_SHAPES, "noise"),
    warp: {
      octaves: int(warp, "warp", "octaves", 3, 1, 5),
      strength: num(warp, "warp", "strength", 1, 0, 3),
      scale: num(warp, "warp", "scale", 1, 0.05, 10),
    },
    scale: num(o, "", "scale", 1, 0.05, 10),
    rotation: num(o, "", "rotation", 0, -2 * Math.PI, 2 * Math.PI),
    vignette: num(light, "light", "vignette", 0, 0, 1),
    highlight,
    ...common(o),
  };
}

function resolveFluid(o: Obj): ResolvedFluid {
  const points = list(o.points, "points", 1, MAX_FLUID_POINTS).map((p, i) => {
    const name = `points[${i}]`;
    const q = obj(p, name);
    return {
      at: pair(q.at, `${name}.at`),
      color: parseRgba(`${name}.color`, q.color),
      spread: num(q, name, "spread", 1, 0.1, 4),
    };
  });
  const n = points.length;
  const mean = points.reduce(
    (acc, p) => ({
      r: acc.r + p.color.r / n,
      g: acc.g + p.color.g / n,
      b: acc.b + p.color.b / n,
      a: 1,
    }),
    { r: 0, g: 0, b: 0, a: 1 },
  );
  return {
    kind: "fluid",
    points,
    softness: num(o, "", "softness", 0.35, 0.01, 2),
    drift: num(o, "", "drift", 0.08, 0, 0.5),
    base: o.base === undefined ? mean : parseRgba("base", o.base),
    ...common(o),
  };
}

function resolveFluted(o: Obj): ResolvedFluted {
  const src = obj(o.source, "source");
  // Own property only: the spread below copies own properties, so an inherited kind would resolve against nothing.
  const kind = Object.hasOwn(src, "kind") ? src.kind : undefined;
  if (kind !== "flow" && kind !== "fluid")
    throw new VisError(
      `source must be a flow or fluid spec, got ${describeValue(kind)}`,
    );
  const source = within("source", () => {
    // Checked, then zeroed: the fluted stage applies grain after shading, so the source's own grain would double up.
    num(src, "", "grain", 0.3, 0, 1);
    return kind === "flow"
      ? resolveFlow({ ...src, grain: 0 })
      : resolveFluid({ ...src, grain: 0 });
  });
  return {
    kind: "fluted",
    source,
    reeds: int(o, "", "reeds", 24, 2, 256),
    direction: oneOf(o, "direction", DIRECTIONS, "vertical"),
    refraction: num(o, "", "refraction", 0.6, 0, 1),
    shade: num(o, "", "shade", 0.5, 0, 1),
    jitter: num(o, "", "jitter", 0.3, 0, 1),
    ...common(o),
  };
}

/**
 * Validate a field spec and fill every default. Throws a VisError naming the
 * offending parameter; never mutates `spec`.
 */
export function resolveField(spec: unknown): ResolvedField {
  const o = obj(spec, "field spec");
  switch (o.kind) {
    case "flow":
      return resolveFlow(o);
    case "fluid":
      return resolveFluid(o);
    case "fluted":
      return resolveFluted(o);
    default:
      throw new VisError(
        `kind must be one of flow|fluid|fluted, got ${describeValue(o.kind)}`,
      );
  }
}
