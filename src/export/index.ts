import { VisError } from "../core/index.js";
import { encodeGif } from "./gif.js";
import { animationPlan } from "./limits.js";
import { encodeVideo } from "./video.js";
import { zipStore } from "./zip.js";

export type BrowserFormat =
  "png" | "jpeg" | "webp" | "gif" | "mp4" | "webm" | "png-seq";

/**
 * Structural on purpose: the animate entry re-exports this module, so naming
 * its `EffectHandle` here would be an import cycle. Every effect handle fits.
 */
export interface ExportHandle {
  readonly canvas: HTMLCanvasElement;
  readonly duration?: number | undefined;
  renderAt(t: number): void;
}

export interface ExportCanvasOptions {
  format: BrowserFormat;
  /** Integer frames per second, 1..60. Default 30. GIF delays are whole centiseconds, so GIF is exact only up to 50. */
  fps?: number | undefined;
  /** Seconds, up to 60. Default: the handle's `duration`, else 6. */
  duration?: number | undefined;
  /** Whole pixels. Resample to this size (default: the handle's canvas size). mp4 and webm need even sizes. */
  width?: number | undefined;
  height?: number | undefined;
  /** 0..1 for jpeg, webp, mp4 and webm. */
  quality?: number | undefined;
  /** Keep transparency: png, webp, png-seq and webm. jpeg, gif and mp4 have none, so true is an error there. */
  alpha?: boolean | undefined;
  /** Receives advisories (default console.warn). */
  warn?: ((message: string) => void) | undefined;
}

const MIME = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
} as const;
const FORMATS: readonly string[] = [
  "png",
  "jpeg",
  "webp",
  "gif",
  "mp4",
  "webm",
  "png-seq",
];
/** Formats that cannot hold transparency. */
const OPAQUE: readonly string[] = ["jpeg", "gif", "mp4"];
/** The largest canvas side browsers accept. */
const MAX_SIDE = 16384;
/** Browsers play a GIF delay under 2 centiseconds as 10. */
const GIF_MAX_FPS = 50;

function side(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 1 || value > MAX_SIDE)
    throw new VisError(
      `${name} must be an integer in 1..${MAX_SIDE}, got ${String(value)}`,
    );
}

async function toBlob(
  c: OffscreenCanvas,
  type: string,
  quality: number | undefined,
): Promise<Blob> {
  const blob = await c.convertToBlob({
    type,
    ...(quality === undefined ? {} : { quality }),
  });
  if (blob.type !== type)
    throw new VisError(`${type} export is not supported by this browser`);
  return blob;
}

/** Both encoders allocate plain ArrayBuffers; their declared `ArrayBufferLike` is just the TS 5.9 default. */
const blobOf = (bytes: Uint8Array, type: string): Blob =>
  new Blob([bytes as Uint8Array<ArrayBuffer>], { type });

/**
 * Export any effect from the browser by driving `handle.renderAt` frame by
 * frame: deterministic, with no dropped frames, whatever the machine's speed.
 * Each frame is copied out in the same task that rendered it, which is what
 * lets a WebGL canvas without a preserved drawing buffer be read at all.
 * Rendering happens on the handle's own canvas, so pause or stop a running
 * effect first and expect it to show the last exported frame afterwards. For a
 * seamless loop, create the effect with `loop: { duration }` equal to the
 * export duration.
 *
 * An effect sizes its canvas to its element, so the default output size is the
 * canvas's pixel size when the call starts: pass `width` and `height` for a
 * fixed result, and keep the element's size steady while a long export runs
 * (frames are resampled to one size, so a change of aspect would stretch them).
 */
export async function exportCanvas(
  handle: ExportHandle,
  opts: ExportCanvasOptions,
): Promise<Blob> {
  if (typeof handle.renderAt !== "function")
    throw new VisError("exportCanvas handle must have a renderAt(t) method");
  const given: unknown = opts.format; // typed, but plain JS callers pass anything
  if (!FORMATS.includes(given as string))
    throw new VisError(
      `format must be one of ${FORMATS.join("|")}, got ${String(given)}`,
    );
  const src = handle.canvas;
  const width = opts.width ?? src.width;
  const height = opts.height ?? src.height;
  side("width", width);
  side("height", height);
  const { quality } = opts;
  if (quality !== undefined && !(quality >= 0 && quality <= 1))
    throw new VisError(`quality must be in 0..1, got ${String(quality)}`);
  if (opts.alpha === true && OPAQUE.includes(opts.format))
    throw new VisError(
      `alpha is not supported by ${opts.format}; use png, webp, png-seq or webm`,
    );
  const warn =
    opts.warn ??
    ((m: string) => {
      console.warn(m);
    });

  if (typeof OffscreenCanvas === "undefined")
    throw new VisError(
      "exportCanvas needs OffscreenCanvas, which this browser lacks",
    );
  const scratch = new OffscreenCanvas(width, height);
  const ctx = scratch.getContext("2d", {
    willReadFrequently: opts.format === "gif",
  });
  if (!ctx) throw new VisError("exportCanvas could not create a 2d context");
  const frame = (t: number): void => {
    handle.renderAt(t);
    // Clear first: drawImage composites, so a transparent frame would otherwise show the one before.
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(src, 0, 0, width, height);
  };

  if (
    opts.format === "png" ||
    opts.format === "jpeg" ||
    opts.format === "webp"
  ) {
    frame(0);
    return toBlob(scratch, MIME[opts.format], quality);
  }

  const duration = opts.duration ?? handle.duration;
  const plan = animationPlan(
    {
      ...(opts.fps === undefined ? {} : { fps: opts.fps }),
      ...(duration === undefined ? {} : { duration }),
      format: opts.format,
      width,
    },
    warn,
  );
  if (opts.format === "gif") {
    if (plan.fps > GIF_MAX_FPS)
      warn(
        `GIF delays are whole centiseconds and browsers play under 2 as 10, so ${plan.fps} fps plays at ${GIF_MAX_FPS}; use mp4 or webm`,
      );
    return blobOf(
      await encodeGif({
        width,
        height,
        fps: plan.fps,
        count: plan.count,
        frameAt: (i) => {
          frame(i / plan.fps);
          return ctx.getImageData(0, 0, width, height).data;
        },
      }),
      "image/gif",
    );
  }
  if (opts.format === "png-seq") {
    const entries = [];
    for (let i = 0; i < plan.count; i++) {
      frame(i / plan.fps);
      const png = await toBlob(scratch, MIME.png, undefined);
      entries.push({
        name: `frame-${String(i).padStart(5, "0")}.png`,
        data: new Uint8Array(await png.arrayBuffer()),
      });
    }
    return blobOf(zipStore(entries), "application/zip");
  }
  return encodeVideo({
    format: opts.format,
    width,
    height,
    fps: plan.fps,
    count: plan.count,
    quality,
    alpha: opts.alpha,
    frameAt: (i) => {
      frame(i / plan.fps);
      return scratch;
    },
  });
}
