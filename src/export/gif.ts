import { VisError } from "../core/index.js";
import { gifenc } from "./gifenc.js";

export interface GifOptions {
  width: number;
  height: number;
  fps: number;
  count: number;
  /** RGBA bytes for frame i, sync or async (may return a reused buffer; it is consumed before the next call) */
  frameAt(
    i: number,
  ): Uint8Array | Uint8ClampedArray | Promise<Uint8Array | Uint8ClampedArray>;
  maxColors?: number;
}

/** The GIF logical screen stores each side in 16 bits. */
const MAX_SIDE = 65535;

/** Frames sampled for the shared palette (a stride over the animation). */
export const PALETTE_SAMPLES = 8;

/** GIF frame delays are whole centiseconds, and browsers play a delay under 2 as 10. */
const MIN_DELAY_CS = 2;

function integerIn(name: string, value: number, min: number, max: number) {
  if (!Number.isInteger(value) || value < min || value > max)
    throw new VisError(
      `encodeGif ${name} must be an integer in ${min}..${max}, got ${String(value)}`,
    );
}

/**
 * Looping GIF with ONE palette quantised from frames across the whole animation (no per-frame flicker).
 *
 * Timing: delays are whole centiseconds, so each frame's delay is the rounding
 * of its cumulative target time minus what was already shown (error diffusion).
 * The loop therefore lasts round(count / fps * 100) centiseconds, e.g. 30 fps
 * alternates 3 and 4 and a 6 s loop plays in 6 s. Browsers play a delay under
 * 2 centiseconds as 10, so a frame is never held less than 2: above 50 fps the
 * output is NOT honoured (it plays at 50 fps and the loop runs longer).
 */
export async function encodeGif(o: GifOptions): Promise<Uint8Array> {
  const { width, height, fps, count } = o;
  integerIn("width", width, 1, MAX_SIDE);
  integerIn("height", height, 1, MAX_SIDE);
  if (!Number.isInteger(count) || count < 1)
    throw new VisError(
      `encodeGif count must be a positive integer, got ${String(count)}`,
    );
  if (!Number.isFinite(fps) || fps <= 0)
    throw new VisError(
      `encodeGif fps must be a finite number above 0, got ${String(fps)}`,
    );
  const maxColors = o.maxColors ?? 256;
  integerIn("maxColors", maxColors, 2, 256);
  const { applyPalette, GIFEncoder, quantize } = gifenc;
  const frameBytes = width * height * 4;
  const rgbaAt = async (i: number) => {
    const rgba = await o.frameAt(i);
    if (rgba.length !== frameBytes)
      throw new VisError(
        `frame ${i} has ${rgba.length} bytes, expected ${frameBytes} (${width}x${height} RGBA)`,
      );
    return rgba;
  };
  const stride = Math.max(1, Math.ceil(count / PALETTE_SAMPLES));
  const sampleCount = Math.ceil(count / stride);
  const sample = new Uint8Array(sampleCount * frameBytes);
  for (let k = 0; k < sampleCount; k++)
    sample.set(await rgbaAt(k * stride), k * frameBytes);
  const palette = quantize(sample, maxColors, { format: "rgb565" });
  const gif = GIFEncoder();
  let shown = 0; // centiseconds already scheduled
  for (let i = 0; i < count; i++) {
    const index = applyPalette(await rgbaAt(i), palette, "rgb565");
    const cs = Math.max(
      MIN_DELAY_CS,
      Math.round(((i + 1) * 100) / fps) - shown,
    );
    shown += cs;
    // gifenc takes milliseconds and stores round(ms / 10) centiseconds.
    gif.writeFrame(index, width, height, {
      palette,
      delay: cs * 10,
      repeat: 0,
    });
  }
  gif.finish();
  return gif.bytes();
}
