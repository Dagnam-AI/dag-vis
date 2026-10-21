import { parseColor, toCss, withAlpha } from "../core/color.js";
import { VisError } from "../core/errors.js";
import { fmt } from "../core/format.js";
import { createRng } from "../core/rng.js";
import { el } from "../core/svg.js";
import {
  assertOptions,
  bounded,
  orDefault,
  parseRgba,
  parseSeed,
} from "../core/validate.js";
import { assertUnit } from "./radial.js";
import { assertList, cssStops, svgStops } from "./stops.js";
import type { NormalizedStop } from "./stops.js";
import type { Ctx, FreeformPoint, FreeformSpec, KindOutput } from "./types.js";

/** Each point is two outputs' worth of stops; this keeps a spec to a few hundred KB. */
const MAX_POINTS = 64;
/** Stops sampled along a blurred point's profile. */
const PROFILE_STOPS = 40;
/** A blurred point reaches this many feather deviations past its radius. */
const FEATHER_REACH = 3;

/** One frozen point: presets are shared by every caller, so nobody may edit them. */
const point = (
  x: number,
  y: number,
  color: string,
  spread: number,
): FreeformPoint =>
  Object.freeze({ at: Object.freeze([x, y] as const), color, spread });

/** Presets. `dawn` is the reference: white top-left, violet top, coral bottom-left, pink right, blue bottom-right. */
export const FREEFORM_PALETTES: Readonly<
  Record<"dawn" | "aurora" | "ember" | "brand", readonly FreeformPoint[]>
> = Object.freeze({
  dawn: Object.freeze([
    point(0.1, 0.1, "#ffffff", 0.7),
    point(0.5, 0.05, "#7c3aed", 0.6),
    point(0.15, 0.85, "#ff7f6e", 0.6),
    point(0.95, 0.5, "#f472b6", 0.7),
    point(0.85, 0.9, "#3b82f6", 0.6),
  ]),
  aurora: Object.freeze([
    point(0.1, 0.9, "#0a0a0a", 0.9),
    point(0.3, 0.3, "#1bd766", 0.6),
    point(0.7, 0.2, "#10abba", 0.6),
    point(0.9, 0.7, "#7c3aed", 0.6),
  ]),
  ember: Object.freeze([
    point(0.1, 0.1, "#0a0a0a", 0.9),
    point(0.8, 0.3, "#7f1d1d", 0.7),
    point(0.9, 0.8, "#ef4444", 0.6),
    point(0.4, 0.9, "#edc41c", 0.5),
  ]),
  brand: Object.freeze([
    point(0.2, 0.2, "#0a0a0a", 0.9),
    point(0.85, 0.5, "#ef4444", 0.7),
    point(0.6, 0.95, "#7f1d1d", 0.6),
  ]),
});

export function freeformPalette(name: string): readonly FreeformPoint[] {
  // hasOwn: "constructor" and "toString" must not resolve to inherited members.
  if (!Object.hasOwn(FREEFORM_PALETTES, name))
    throw new VisError(
      `unknown freeform palette: ${name} (known: ${Object.keys(FREEFORM_PALETTES).join(", ")})`,
    );
  return FREEFORM_PALETTES[name as keyof typeof FREEFORM_PALETTES];
}

/** Seeded scatter of `count` points coloured from `palette`. */
export function freeformRandom(opts: {
  count: number;
  palette: readonly string[];
  seed?: number;
}): FreeformPoint[] {
  assertOptions(opts);
  if (
    !Number.isInteger(opts.count) ||
    opts.count < 1 ||
    opts.count > MAX_POINTS
  )
    throw new VisError(
      `freeformRandom count must be an integer in 1..${MAX_POINTS}, got ${String(opts.count)}`,
    );
  assertList("freeformRandom needs a non-empty palette", opts.palette);
  opts.palette.forEach((c) => {
    if (typeof c !== "string")
      throw new VisError(
        `freeformRandom palette entries must be colour strings, got ${JSON.stringify(c)}`,
      );
    parseColor(c); // throws a VisError naming the value
  });
  const seed = parseSeed(opts.seed);
  const rng = createRng(seed);
  const round = (n: number): number => Math.round(n * 1000) / 1000;
  return Array.from({ length: opts.count }, () => ({
    at: [round(rng.next()), round(rng.next())] as const,
    color: rng.pick(opts.palette),
    spread: round(rng.range(0.4, 0.8)),
  }));
}

/** JS callers can pass anything: name the bad point instead of failing on a property read. */
function assertPoint(p: unknown, i: number): asserts p is FreeformPoint {
  if (typeof p !== "object" || p === null)
    throw new VisError(
      `freeform point ${i} must be an object, got ${JSON.stringify(p)}`,
    );
  const { at, color, spread } = p as {
    at?: unknown;
    color?: unknown;
    spread?: number; // declared type; a JS caller's string still fails isFinite
  };
  if (!Array.isArray(at) || at.length !== 2)
    throw new VisError(
      `freeform point ${i} needs \`at\` as [x, y], got ${JSON.stringify(at)}`,
    );
  assertUnit("freeform point `at`", at as [number, number]);
  if (typeof color !== "string")
    throw new VisError(
      `freeform point ${i} needs a \`color\` string, got ${JSON.stringify(color)}`,
    );
  if (spread !== undefined && (!Number.isFinite(spread) || spread <= 0))
    throw new VisError(
      `freeform spread must be positive, got ${String(spread)}`,
    );
}

/** exp(-x) * I0(x): the scaled modified Bessel function, series below 30, asymptotic above. */
function i0e(x: number): number {
  if (x >= 30) {
    let term = 1;
    let sum = 1;
    for (let k = 1; k <= 8; k++) {
      term *= (2 * k - 1) ** 2 / (8 * k * x);
      sum += term;
    }
    return sum / Math.sqrt(2 * Math.PI * x);
  }
  const q = (x * x) / 4;
  let term = 1;
  let sum = 1;
  for (let k = 1; term > 1e-16 * sum; k++) {
    term *= q / (k * k);
    sum += term;
  }
  return sum * Math.exp(-x);
}

/**
 * Height at distance `d` of the cone `max(0, 1 - rho/r)` blurred by a 2-D Gaussian of
 * deviation `sigma`. Radially symmetric, so the Gaussian integrates over the angle to a
 * Bessel term:  (1/s^2) * int_0^r (1 - rho/r) rho exp(-(d - rho)^2 / 2s^2) i0e(d rho / s^2) drho
 * (Simpson over the window where the Gaussian is not negligible).
 */
function blurredCone(d: number, r: number, sigma: number): number {
  const lo = Math.max(0, d - 8 * sigma);
  const hi = Math.min(r, d + 8 * sigma);
  // Step <= sigma/4. lo < hi because d <= r + 3 sigma.
  const n = 2 * Math.ceil(Math.max(4, ((hi - lo) / sigma) * 2));
  const h = (hi - lo) / n;
  const s2 = sigma * sigma;
  const f = (rho: number): number =>
    (1 - rho / r) *
    rho *
    Math.exp(-((d - rho) ** 2) / (2 * s2)) *
    i0e((d * rho) / s2);
  let sum = f(lo) + f(hi);
  for (let i = 1; i < n; i++) sum += f(lo + i * h) * (i % 2 === 1 ? 4 : 2);
  return (sum * h) / 3 / s2;
}

/**
 * The alpha stops of one point: a cone of radius `r` blurred by `sigma`, sampled out to
 * where the blur ends. Because the blur lives in the stops, SVG and CSS draw the same thing.
 */
function profile(
  color: ReturnType<typeof parseColor>,
  r: number,
  sigma: number,
): { extent: number; stops: NormalizedStop[] } {
  const at = (a: number, t: number): NormalizedStop => ({
    color: withAlpha(color, color.a * a),
    at: t,
  });
  if (sigma === 0) return { extent: r, stops: [at(1, 0), at(0, 1)] };
  const extent = r + FEATHER_REACH * sigma;
  return {
    extent,
    stops: Array.from({ length: PROFILE_STOPS + 1 }, (_, i) =>
      at(
        i === PROFILE_STOPS
          ? 0
          : blurredCone((i / PROFILE_STOPS) * extent, r, sigma),
        i / PROFILE_STOPS,
      ),
    ),
  };
}

/**
 * Soft colour blobs over a base. Each point is a radial gradient whose alpha follows a
 * cone of radius `spread` x short side, blurred by `softness` x short side (a Gaussian,
 * integrated numerically into the stops). SVG and CSS use the same stops, so the two
 * outputs agree to rounding; later points paint over earlier ones (first in CSS).
 */
export function renderFreeform(spec: FreeformSpec, ctx: Ctx): KindOutput {
  assertList("freeform needs at least one point", spec.points);
  if (spec.points.length > MAX_POINTS)
    throw new VisError(
      `freeform takes at most ${MAX_POINTS} points, got ${spec.points.length}`,
    );
  const softness = bounded(
    "freeform softness",
    orDefault<unknown>(spec.softness, 0.12),
    0,
    1,
  );
  const first: unknown = spec.points[0];
  assertPoint(first, 0);
  const { width, height } = ctx.size;
  const minSide = Math.min(width, height);
  const sigma = softness * minSide;
  const base = toCss(
    spec.base === undefined
      ? parseRgba("freeform point 0 color", first.color)
      : parseRgba("freeform base", spec.base),
  );
  const id = `${ctx.id}-g`;
  const defs: string[] = [];
  const rects: string[] = [];
  const css: string[] = [];
  spec.points.forEach((p: unknown, i) => {
    assertPoint(p, i);
    const { extent, stops } = profile(
      parseRgba(`freeform point ${i} color`, p.color),
      (p.spread ?? 0.6) * minSide,
      sigma,
    );
    const pid = `${id}-p${i}`;
    defs.push(
      el(
        "radialGradient",
        {
          id: pid,
          gradientUnits: "userSpaceOnUse",
          cx: p.at[0] * width,
          cy: p.at[1] * height,
          r: extent,
        },
        svgStops(stops),
      ),
    );
    rects.push(el("rect", { width, height, fill: `url(#${pid})` }));
    css.push(
      `radial-gradient(circle ${fmt(extent)}px at ${fmt(p.at[0] * 100)}% ${fmt(p.at[1] * 100)}%, ${cssStops(stops)})`,
    );
  });
  return {
    defs:
      defs.join("") +
      el(
        "pattern",
        { id, patternUnits: "userSpaceOnUse", width, height },
        el("rect", { width, height, fill: base }),
        ...rects,
      ),
    fill: `url(#${id})`,
    cssImages: [...css.reverse(), base],
  };
}
