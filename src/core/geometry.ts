import { VisError } from "./errors.js";
import { fmt } from "./format.js";

export interface Size {
  width: number;
  height: number;
}

export function assertSize(size: Size): void {
  for (const [k, v] of [
    ["width", size.width],
    ["height", size.height],
  ] as const) {
    if (!Number.isFinite(v) || v <= 0)
      throw new VisError(
        `${k} must be a positive finite number, got ${String(v)}`,
      );
  }
}

/** Contain-fit `inner` in `outer`, centred. */
export function fitAspect(
  inner: Size,
  outer: Size,
): { scale: number; dx: number; dy: number } {
  const scale = Math.min(
    outer.width / inner.width,
    outer.height / inner.height,
  );
  return {
    scale,
    dx: (outer.width - inner.width * scale) / 2,
    dy: (outer.height - inner.height * scale) / 2,
  };
}

/**
 * The scale `focalTransform` applies: `scale` x the canvas's short side over
 * the motif's larger side.
 */
export function focalScale(opts: {
  width: number;
  height: number;
  scale: number;
  motif: Size;
}): number {
  return (
    (opts.scale * Math.min(opts.width, opts.height)) /
    Math.max(opts.motif.width, opts.motif.height)
  );
}

/**
 * SVG `transform` placing a motif's centre at `focus` (unit coords of the
 * canvas). `scale` 1 = the motif's larger side equals the canvas's SHORT
 * side, so the motif keeps its shape on any aspect ratio and only the crop
 * changes.
 */
export function focalTransform(opts: {
  width: number;
  height: number;
  focus: readonly [number, number];
  scale: number;
  motif: Size;
}): string {
  assertSize({ width: opts.width, height: opts.height });
  const k = focalScale(opts);
  const tx = opts.focus[0] * opts.width - (opts.motif.width / 2) * k;
  const ty = opts.focus[1] * opts.height - (opts.motif.height / 2) * k;
  return `translate(${fmt(tx)} ${fmt(ty)}) scale(${fmt(k)})`;
}
