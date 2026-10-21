import { mix, parseColor, toCss, toHex, withAlpha } from "../core/color.js";
import type { Rgba } from "../core/color.js";
import { VisError } from "../core/errors.js";
import { fmt } from "../core/format.js";
import { el } from "../core/svg.js";
import type { Stop } from "./types.js";

export interface NormalizedStop {
  color: Rgba;
  at: number;
}

export function normalizeStops(
  stops: readonly Stop[],
  reverse = false,
): NormalizedStop[] {
  if (stops.length < 2)
    throw new VisError(
      `a gradient needs at least 2 stops, got ${stops.length}`,
    );
  const objects: { color: string; at?: number; opacity?: number }[] = stops.map(
    (s) => (typeof s === "string" ? { color: s } : s),
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
  // Rounded so 1 - 0.9 is 0.1, not 0.09999999999999998.
  return reverse
    ? out
        .map((s) => ({
          color: s.color,
          at: Math.round((1 - s.at) * 1e9) / 1e9,
        }))
        .reverse()
    : out;
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
  // Strict `<` / `>=`: at a hard edge on the first/last position the later stop wins, as in CSS.
  if (u < first.at) return { ...first.color };
  if (u >= last.at) return { ...last.color };
  // first.at <= u < last.at: find the segment [lo, hi] holding u (the last stop closes it).
  let lo = first;
  let hi = last;
  for (const s of stops.slice(1, -1)) {
    if (u <= s.at) {
      hi = s;
      break;
    }
    lo = s;
  }
  const span = hi.at - lo.at;
  return mix(lo.color, hi.color, span === 0 ? 1 : (u - lo.at) / span);
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
