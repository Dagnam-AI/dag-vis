import { parseColor, toCss, toHex, withAlpha } from "../core/color.js";
import type { Rgba } from "../core/color.js";
import { VisError } from "../core/errors.js";
import { fmt } from "../core/format.js";
import { el } from "../core/svg.js";
import type { Blend, Stop } from "./types.js";

export const BLENDS: readonly Blend[] = [
  "normal",
  "multiply",
  "screen",
  "overlay",
  "soft-light",
];

/** A non-empty array: JS callers can pass anything, and a type guard here would widen to any[]. */
export function assertList(message: string, list: unknown): void {
  if (!Array.isArray(list) || list.length === 0) throw new VisError(message);
}

export function assertBlend(blend: string | undefined): void {
  if (blend !== undefined && !BLENDS.includes(blend as Blend)) {
    throw new VisError(
      `unknown blend mode: ${blend} (known: ${BLENDS.join(", ")})`,
    );
  }
}

export interface NormalizedStop {
  color: Rgba;
  at: number;
}

function isStopObject(s: unknown): s is { color: string } {
  return (
    typeof s === "object" &&
    s !== null &&
    typeof (s as { color?: unknown }).color === "string"
  );
}

export function normalizeStops(
  stops: readonly Stop[],
  reverse = false,
): NormalizedStop[] {
  if (!Array.isArray(stops))
    throw new VisError(`gradient stops must be an array, got ${typeof stops}`);
  if (stops.length < 2)
    throw new VisError(
      `a gradient needs at least 2 stops, got ${stops.length}`,
    );
  const objects: { color: string; at?: number; opacity?: number }[] = stops.map(
    (s) => {
      if (typeof s === "string") return { color: s };
      if (!isStopObject(s))
        throw new VisError(
          `a gradient stop must be a colour string or { color, at?, opacity? }, got ${JSON.stringify(s)}`,
        );
      return s;
    },
  );
  const positioned = objects.filter((s) => s.at !== undefined).length;
  if (positioned !== 0 && positioned !== objects.length) {
    throw new VisError("gradient stops must all have `at` or none of them");
  }
  let prev = 0;
  const out = objects.map((s, i) => {
    const at = s.at ?? i / (objects.length - 1);
    if (!Number.isFinite(at) || at < 0 || at > 1)
      throw new VisError(`stop position must be in 0..1, got ${String(at)}`);
    if (at < prev)
      throw new VisError("gradient stop positions must be non-decreasing");
    prev = at;
    let color = parseColor(s.color);
    if (s.opacity !== undefined) {
      if (!Number.isFinite(s.opacity) || s.opacity < 0 || s.opacity > 1) {
        throw new VisError(
          `stop opacity must be in 0..1, got ${String(s.opacity)}`,
        );
      }
      color = withAlpha(color, color.a * s.opacity);
    }
    return { color, at };
  });
  return reverse
    ? out.map((s) => ({ color: s.color, at: snap(1 - s.at) })).reverse()
    : out;
}

/** 1e-9 snap so float noise (1 - 0.9) never reaches an offset or a comparison. */
function snap(n: number): number {
  return Math.round(n * 1e9) / 1e9;
}

/** Straight sRGB interpolation (alpha too): what SVG stops and plain CSS gradients do. */
function lerp(a: Rgba, b: Rgba, k: number): Rgba {
  return {
    r: a.r + (b.r - a.r) * k,
    g: a.g + (b.g - a.g) * k,
    b: a.b + (b.b - a.b) * k,
    a: a.a + (b.a - a.a) * k,
  };
}

/** Colour at t (0..1). With `repeat`, t wraps over the stops' span. */
export function sampleStops(
  stops: readonly NormalizedStop[],
  t: number,
  repeat = false,
): Rgba {
  const first = stops[0];
  const last = stops[stops.length - 1];
  if (!first || !last) throw new VisError("sampleStops needs at least 1 stop");
  let u = t;
  if (repeat) {
    const span = last.at - first.at;
    if (span <= 0) return { ...first.color };
    u = first.at + ((((t - first.at) % span) + span) % span);
  }
  // Strict `<` / `>=`: at a hard edge (duplicate positions) the later stop wins, as in CSS.
  if (u < first.at) return { ...first.color };
  if (u >= last.at) return { ...last.color };
  // first.at <= u < last.at. Walk the middle stops: `lo` ends as the last stop at or
  // before u, `hi` as the first one after it (the last stop closes the range), so
  // hi.at > u >= lo.at and the span is never zero.
  let lo = first;
  let hi = last;
  for (const s of stops.slice(1, -1)) {
    if (u < s.at) {
      hi = s;
      break;
    }
    lo = s;
  }
  return lerp(lo.color, hi.color, (u - lo.at) / (hi.at - lo.at));
}

/**
 * The window a repeating gradient cycles over, and the stops rescaled to 0..1 over it.
 * SVG's `spreadMethod="repeat"` repeats the whole gradient vector, not the stop span, so
 * the vector has to be mapped onto [from, to] and the offsets rescaled.
 */
export function repeatSpan(stops: readonly NormalizedStop[]): {
  from: number;
  to: number;
  unit: NormalizedStop[];
} {
  const from = Number(stops[0]?.at);
  const to = Number(stops[stops.length - 1]?.at);
  if (to <= from)
    throw new VisError(
      "a repeating gradient needs stops that span a non-zero range",
    );
  return {
    from,
    to,
    unit: stops.map((s) => ({
      color: s.color,
      at: snap((s.at - from) / (to - from)),
    })),
  };
}

/**
 * Rotate a 0..1 period so it starts `offset` periods in: the colour a repeating gradient
 * shows at a radius that sits `offset` of a period past a cycle start (CSS repeats before
 * the first stop too; SVG radial gradients start at the centre).
 */
export function phaseShift(
  unit: readonly NormalizedStop[],
  offset: number,
): NormalizedStop[] {
  const u0 = snap(snap(((offset % 1) + 1) % 1) % 1);
  if (u0 === 0) return [...unit];
  const start = sampleStops(unit, u0);
  return [
    { color: start, at: 0 },
    ...unit
      .filter((s) => s.at > u0)
      .map((s) => ({ color: s.color, at: snap(s.at - u0) })),
    ...unit
      .filter((s) => s.at <= u0)
      .map((s) => ({ color: s.color, at: snap(s.at + 1 - u0) })),
    { color: start, at: 1 },
  ];
}

export function cssStops(stops: readonly NormalizedStop[]): string {
  return stops.map((s) => `${toCss(s.color)} ${fmt(s.at * 100)}%`).join(", ");
}

export function svgStops(stops: readonly NormalizedStop[]): string {
  return stops
    .map((s) =>
      el("stop", {
        offset: s.at,
        "stop-color": toHex(withAlpha(s.color, 1)),
        "stop-opacity": s.color.a < 1 ? s.color.a : undefined,
      }),
    )
    .join("");
}
