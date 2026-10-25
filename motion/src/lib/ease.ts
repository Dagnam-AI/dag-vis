/** Pure easing helpers for compositions: frames in, a number out. */
const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

/** 0 until frame `start`, 1 from frame `end`, linear between; an empty span is a step at `start`. */
export function progress(frame: number, start: number, end: number): number {
  return end <= start
    ? Number(frame >= start)
    : clamp01((frame - start) / (end - start));
}

/** Fast start, soft landing: for things that arrive. */
export const easeOutCubic = (x: number): number => 1 - (1 - clamp01(x)) ** 3;

/** Slow start and end: for things that move between two rest positions. */
export function easeInOutCubic(x: number): number {
  const t = clamp01(x);
  return t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
}

export const lerp = (a: number, b: number, t: number): number =>
  a + (b - a) * t;

/**
 * A clock that runs at 1 frame per frame up to frame `start`, then slows smoothly
 * to a stop at frame `stop` (it never passes the midpoint of the two): an effect
 * driven by it comes to rest instead of freezing with a jolt.
 */
export function settle(frame: number, start: number, stop: number): number {
  if (frame <= start) return frame;
  const span = stop - start;
  const u = progress(frame, start, stop);
  return start + (span * (1 - (1 - u) ** 2)) / 2;
}
