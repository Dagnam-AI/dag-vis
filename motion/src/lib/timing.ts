/**
 * One timing file per video drives picture AND sound (remotion-video skill).
 * Pure: no imports, so scripts/*.ts run it under plain node.
 */
export interface Timing<B extends string = string> {
  readonly fps: number;
  readonly width: number;
  readonly height: number;
  /** Seconds. For a seamless loop this is the effect's `loop.duration`. */
  readonly duration: number;
  /** Named moments, seconds from 0, each in [0, duration). */
  readonly beats: Readonly<Record<B, number>>;
  /** Frames the contact sheet shows, with one line each about what is seen and heard. */
  readonly storyboard: readonly {
    readonly at: number;
    readonly caption: string;
  }[];
}

/** Whole frames for `seconds` at `fps`, or an error: a loop that is not a whole number of frames cannot be seamless. */
export function framesFor(seconds: number, fps: number): number {
  if (!Number.isInteger(fps) || fps < 1)
    throw new Error(`fps must be a positive integer, got ${String(fps)}`);
  const frames = seconds * fps;
  if (!Number.isFinite(frames) || Math.abs(frames - Math.round(frames)) > 1e-9)
    throw new Error(
      `${String(seconds)}s is not a whole number of frames at ${String(fps)} fps`,
    );
  return Math.round(frames);
}
export const loopFrames = framesFor;

export function beatFrame<B extends string>(t: Timing<B>, beat: B): number {
  return framesFor(t.beats[beat], t.fps);
}

export function defineTiming<B extends string>(t: Timing<B>): Timing<B> {
  for (const [name, v] of [
    ["width", t.width],
    ["height", t.height],
  ] as const)
    if (!Number.isInteger(v) || v < 2 || v % 2 !== 0)
      throw new Error(
        `${name} must be a positive even integer (H.264 yuv420p), got ${String(v)}`,
      );
  if (!(t.duration > 0) || !Number.isFinite(t.duration))
    throw new Error(
      `duration must be a positive number of seconds, got ${String(t.duration)}`,
    );
  framesFor(t.duration, t.fps);
  for (const [name, at] of Object.entries<number>(t.beats))
    if (!(at >= 0 && at < t.duration))
      throw new Error(
        `beat ${name} at ${String(at)}s is outside [0, ${String(t.duration)})`,
      );
  for (const s of t.storyboard) {
    if (!(s.at >= 0 && s.at < t.duration))
      throw new Error(
        `storyboard frame at ${String(s.at)}s is outside [0, ${String(t.duration)})`,
      );
    if (s.caption.trim() === "")
      throw new Error(`storyboard caption at ${String(s.at)}s is empty`);
  }
  return Object.freeze({
    ...t,
    beats: Object.freeze({ ...t.beats }),
    storyboard: Object.freeze(t.storyboard.map((s) => Object.freeze({ ...s }))),
  });
}
