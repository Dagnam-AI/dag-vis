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
/** Every flow shape, in shader order. Frozen: it is also the list `resolveField` accepts. */
export const FLOW_SHAPES: readonly FlowShape[] = Object.freeze([
  "swirl",
  "wave",
  "aurora",
  "bloom",
  "band",
  "noise",
]);
/** Most points a fluid field holds: the GPU twin sizes its uniform arrays to it. */
export const MAX_FLUID_POINTS = 8;
/** Most reeds a fluted field holds: the GPU twin sizes its offsets uniform to it (a multiple of 4). */
export const MAX_REEDS = 256;
/** Direction of the reeds of a fluted field. */
export type FlutedFieldDirection = "vertical" | "horizontal";
const DIRECTIONS: readonly FlutedFieldDirection[] = ["vertical", "horizontal"];

/** A soft light spot on a flow field. */
export interface FieldHighlight {
  /** Centre as [x, y] in picture units (0 to 1 across the frame; -1 to 2 allowed). */
  at: readonly [number, number];
  /** Opacity of the spot at its centre, 0 to 1. Default 0.4. */
  strength?: number;
  /** Radius in picture heights, 0.01 to 2. Default 0.5. */
  radius?: number;
  /** Colour of the spot. Default white. */
  color?: string;
}
/** A shaped, domain-warped noise mapped through a palette. Colours are hex, rgb() or oklch() strings. */
export interface FlowFieldSpec {
  kind: "flow";
  /** 2 to 6 colours, blended in OKLab from the first to the last. */
  palette: readonly string[];
  /** Default "noise". */
  shape?: FlowShape;
  /** Domain warp: octaves 1 to 5 (default 3), strength 0 to 3 (default 1), scale 0.05 to 10 (default 1). */
  warp?: { octaves?: number; strength?: number; scale?: number };
  /** Zoom of the whole pattern, 0.05 to 10. Default 1. */
  scale?: number;
  /** Rotation in radians, -2π to 2π. Default 0. */
  rotation?: number;
  /** Vignette amount (0 to 1, default 0) and an optional highlight. */
  light?: { vignette?: number; highlight?: FieldHighlight };
  /** Film grain amount, 0 to 1. Default 0.3. */
  grain?: number;
  /** Re-seed the grain 24 times a second. Default true. */
  animatedGrain?: boolean;
  /** Integer 0 to 4294967295. Default 1. */
  seed?: number;
}
/** One colour blob of a fluid field. */
export interface FluidFieldPoint {
  /** Centre as [x, y] in picture units (0 to 1 across the frame; -1 to 2 allowed). */
  at: readonly [number, number];
  /** Colour of the blob. */
  color: string;
  /** Size of this blob relative to `softness`, 0.1 to 4. Default 1. */
  spread?: number;
}
/** Soft blobs of colour that drift on a closed path, blended in OKLab. */
export interface FluidFieldSpec {
  kind: "fluid";
  /** 1 to 8 blobs. */
  points: readonly FluidFieldPoint[];
  /** Blob size in picture heights, 0.01 to 2. Default 0.35. */
  softness?: number;
  /** How far the blobs wander, 0 to 0.5 picture units. Default 0.08. */
  drift?: number;
  /** Background colour. Default the mean of the point colours. */
  base?: string;
  /** Film grain amount, 0 to 1. Default 0.3. */
  grain?: number;
  /** Re-seed the grain 24 times a second. Default true. */
  animatedGrain?: boolean;
  /** Integer 0 to 4294967295. Default 1. */
  seed?: number;
}
/** A flow or fluid field seen through ribbed glass. */
export interface FlutedFieldSpec {
  kind: "fluted";
  /** The picture behind the glass. Its own grain is ignored: the fluted `grain` applies instead. */
  source: FlowFieldSpec | FluidFieldSpec;
  /** Number of reeds, integer 2 to 256. Default 24. */
  reeds?: number;
  /** Default "vertical". */
  direction?: FlutedFieldDirection;
  /** How strongly each reed bends the picture, 0 to 1. Default 0.6. */
  refraction?: number;
  /** Shading across each reed, 0 to 1. Default 0.5. */
  shade?: number;
  /** Per-reed random offset, 0 to 1. Default 0.3. */
  jitter?: number;
  /** Film grain amount, 0 to 1. Default 0.3. */
  grain?: number;
  /** Re-seed the grain 24 times a second. Default true. */
  animatedGrain?: boolean;
  /** Integer 0 to 4294967295. Default 1. */
  seed?: number;
}
/** Any field spec; `kind` picks the member. */
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
  direction: FlutedFieldDirection;
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

const isColourObject = (v: unknown): boolean =>
  typeof v === "object" && v !== null && "r" in v && "g" in v && "b" in v;

/**
 * A raw spec never carries what only a RESOLVED spec has: flow's flattened `vignette` and
 * `highlight` (raw spells them `light.vignette` and `light.highlight`) and the colour
 * objects of a fluid's `base` and points (raw takes colour strings). A structured clone,
 * JSON round trip or spread of a `resolveField` result has them, and treating it as raw
 * would silently drop options or fail on an unrelated message, so it is rejected here.
 */
function assertRaw(o: Obj, path: string): void {
  const reject = (name: string): never => {
    throw new VisError(
      `${name} belongs to a resolved spec, not a raw one (a copy of a resolveField() result?): pass the original resolveField() result or the raw spec`,
    );
  };
  for (const key of ["vignette", "highlight"])
    if (o.kind === "flow" && Object.hasOwn(o, key)) reject(at(path, key));
  if (o.kind !== "fluid") return;
  if (isColourObject(o.base)) reject(at(path, "base"));
  if (Array.isArray(o.points))
    o.points.forEach((p: unknown, i) => {
      if (
        typeof p === "object" &&
        p !== null &&
        isColourObject((p as Obj).color)
      )
        reject(at(path, `points[${i}].color`));
    });
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
  assertRaw(src, "source");
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
    reeds: int(o, "", "reeds", 24, 2, MAX_REEDS),
    direction: oneOf(o, "direction", DIRECTIONS, "vertical"),
    refraction: num(o, "", "refraction", 0.6, 0, 1),
    shade: num(o, "", "shade", 0.5, 0, 1),
    jitter: num(o, "", "jitter", 0.3, 0, 1),
    ...common(o),
  };
}

/**
 * Each object `resolveField` returned, mapped to a private, deeply frozen copy made at
 * that moment: the only way `resolvedField` recognises one. The copy is what gets
 * rendered, so editing the returned object afterwards cannot smuggle an unchecked
 * value in, and no internal caller can alter the copy either.
 */
const RESOLVED = new WeakMap<object, ResolvedField>();

/**
 * The validated snapshot behind an object `resolveField` returned, or `undefined`
 * for anything else: a clone, a hand-built look-alike or a raw spec is not one,
 * whatever fields it carries (and `resolveField` refuses a copy of a resolved spec).
 */
export function resolvedField(v: unknown): ResolvedField | undefined {
  return typeof v === "object" && v !== null ? RESOLVED.get(v) : undefined;
}

/** Freeze `v` and everything below it (specs are plain data: objects, arrays, numbers, strings). */
export function deepFreeze<T>(v: T): T {
  if (typeof v === "object" && v !== null && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const k of Object.keys(v)) deepFreeze((v as Obj)[k]);
  }
  return v;
}

function resolve(o: Obj): ResolvedField {
  assertRaw(o, "");
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

/**
 * Validate a field spec and fill every default. Throws a VisError naming the
 * offending parameter; never mutates `spec`. The result is remembered
 * (`resolvedField`), so a renderer can take it without validating again.
 */
export function resolveField(spec: unknown): ResolvedField {
  const r = resolve(obj(spec, "field spec"));
  RESOLVED.set(r, deepFreeze(structuredClone(r)));
  return r;
}
