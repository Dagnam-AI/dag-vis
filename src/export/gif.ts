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

/** Frames sampled for the shared palette (a stride over the animation). */
export const PALETTE_SAMPLES = 8;

/** Looping GIF with ONE palette quantised from frames across the whole animation (no per-frame flicker). */
export async function encodeGif(o: GifOptions): Promise<Uint8Array> {
  const { width, height, fps, count } = o;
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
  const palette = quantize(sample, o.maxColors ?? 256, { format: "rgb565" });
  const gif = GIFEncoder();
  const delay = Math.round(1000 / fps); // gifenc takes milliseconds and the GIF stores 10 ms units: 24 fps becomes ~23.8 fps
  for (let i = 0; i < count; i++) {
    const index = applyPalette(await rgbaAt(i), palette, "rgb565");
    gif.writeFrame(index, width, height, { palette, delay, repeat: 0 });
  }
  gif.finish();
  return gif.bytes();
}
