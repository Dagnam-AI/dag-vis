import { VisError } from "../core/index.js";

/** Size shortcuts for exports. */
export const SIZES: Readonly<Record<string, readonly [number, number]>> =
  Object.freeze({
    og: [1200, 630],
    square: [1080, 1080],
    story: [1080, 1920],
    wallpaper: [2560, 1440],
    "4k": [3840, 2160],
    header: [1500, 500],
  });
export const MAX_FPS = 60;
export const MAX_DURATION = 60;
export const GIF_MAX_WIDTH = 800;

export function sizeOf(name: string): [number, number] {
  const s = Object.hasOwn(SIZES, name) ? SIZES[name] : undefined;
  if (!s)
    throw new VisError(
      `unknown size "${name}"; use one of ${Object.keys(SIZES).join("|")}`,
    );
  return [s[0], s[1]];
}

export interface AnimationPlan {
  fps: number;
  duration: number;
  count: number;
}

/** Validate fps/duration and compute the frame count BEFORE any frame is rendered. */
export function animationPlan(
  o: { fps?: number; duration?: number; format: string; width: number },
  warn: (message: string) => void = (m) => {
    console.warn(m);
  },
): AnimationPlan {
  const fps = o.fps ?? 30;
  const duration = o.duration ?? 6;
  if (!Number.isInteger(fps) || fps < 1 || fps > MAX_FPS)
    throw new VisError(
      `fps must be an integer in 1..${MAX_FPS}, got ${String(fps)}`,
    );
  if (!(duration > 0) || duration > MAX_DURATION)
    throw new VisError(
      `duration must be in (0, ${MAX_DURATION}] seconds, got ${String(duration)}`,
    );
  const count = Math.round(fps * duration);
  if (count < 1)
    throw new VisError(
      `animation has no frames (fps ${fps} x duration ${duration})`,
    );
  if (o.format === "gif" && o.width > GIF_MAX_WIDTH)
    warn(
      `GIF wider than ${GIF_MAX_WIDTH}px (${o.width}px) grows fast; consider mp4/webm`,
    );
  return { fps, duration, count };
}
