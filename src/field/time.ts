import { VisError } from "../core/index.js";
import { describeValue } from "../core/validate.js";

/**
 * Time model shared by every field. A loop is a circle in noise space, so a
 * frame at t = 0 and at t = duration are the same frame.
 */
export interface TimeCoords {
  /** Third noise dimension. */
  z: number;
  /** Fourth noise dimension (0 without a loop). */
  w: number;
  /** Phase in radians for drifts (Lissajous paths); 2π per loop. */
  theta: number;
  /** Integer frame index for animated grain. */
  grainFrame: number;
}

/** Noise units travelled per second at speed 1. */
export const TIME_RATE = 0.15;
/** Animated grain re-seeds this many times per second. */
export const GRAIN_FPS = 24;
/** Drift phase advance per second without a loop (rad/s). */
const DRIFT_RATE = 0.4;

/** Pure: the same `t` (and loop duration) always gives the same coordinates. */
export function timeCoords(t: number, loop?: number): TimeCoords {
  if (typeof t !== "number" || !Number.isFinite(t))
    throw new VisError(`t must be a finite number, got ${describeValue(t)}`);
  // `+ 0` turns -0 into +0, so a negative zero never reaches the coordinates.
  const time = t + 0;
  if (loop === undefined)
    return {
      z: time * TIME_RATE,
      w: 0,
      theta: time * DRIFT_RATE,
      grainFrame: Math.floor(time * GRAIN_FPS),
    };
  if (typeof loop !== "number" || !Number.isFinite(loop) || loop <= 0)
    throw new VisError(
      `loop must be a positive finite number, got ${describeValue(loop)}`,
    );
  // (time mod T) first, so t = k·T lands on phase 0 EXACTLY (sin(2π) is -2.4e-16, not 0).
  const phase = (((time % loop) + loop) % loop) / loop;
  const theta = 2 * Math.PI * phase;
  const r = (TIME_RATE * loop) / (2 * Math.PI);
  const frames = Math.max(1, Math.round(loop * GRAIN_FPS));
  return {
    z: r * Math.cos(theta),
    w: r * Math.sin(theta),
    theta,
    grainFrame: Math.floor(phase * frames) % frames,
  };
}
