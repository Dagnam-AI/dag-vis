import { VisError } from "../core/index.js";

export interface VideoOptions {
  format: "mp4" | "webm";
  /** Even integers (4:2:0 chroma). */
  width: number;
  height: number;
  /** Integer frames per second. */
  fps: number;
  count: number;
  /** 0..1, default 0.8 */
  quality?: number | undefined;
  /** webm only: keep the alpha channel */
  alpha?: boolean | undefined;
  frameAt(i: number): OffscreenCanvas;
}

/** Frames the encoder may hold before the loop waits for it: each queued frame is a full bitmap. */
const MAX_QUEUE = 4;

function bitrateFor(o: VideoOptions): number {
  const q = o.quality ?? 0.8;
  return Math.round(o.width * o.height * o.fps * 0.1 * (0.5 + q));
}

/** The two muxers behind one shape. They are loaded here, on first use, so importing the animate entry stays cheap. */
async function createMuxer(o: VideoOptions, alpha: boolean) {
  const video = { width: o.width, height: o.height };
  if (o.format === "mp4") {
    const { ArrayBufferTarget, Muxer } = await import("mp4-muxer");
    const muxer = new Muxer({
      target: new ArrayBufferTarget(),
      video: { codec: "avc", ...video },
      fastStart: "in-memory",
    });
    return {
      add: (c: EncodedVideoChunk, m?: EncodedVideoChunkMetadata) => {
        muxer.addVideoChunk(c, m);
      },
      finish: () => {
        muxer.finalize();
        return muxer.target.buffer;
      },
    };
  }
  const { ArrayBufferTarget, Muxer } = await import("webm-muxer");
  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: "V_VP9", ...video, frameRate: o.fps, alpha },
  });
  return {
    add: (c: EncodedVideoChunk, m?: EncodedVideoChunkMetadata) => {
      muxer.addVideoChunk(c, m);
    },
    finish: () => {
      muxer.finalize();
      return muxer.target.buffer;
    },
  };
}

/**
 * WebCodecs into mp4-muxer (H.264) or webm-muxer (VP9, optional alpha), all in
 * memory. Frames come from `frameAt`, never from the clock. The loop waits when
 * the encoder's queue is full, so a long export holds a few frames, not all.
 */
export async function encodeVideo(o: VideoOptions): Promise<Blob> {
  if (typeof VideoEncoder === "undefined" || typeof VideoFrame === "undefined")
    throw new VisError(
      "WebCodecs (VideoEncoder) is not available in this browser; export png-seq or gif instead",
    );
  if (o.width % 2 !== 0 || o.height % 2 !== 0)
    throw new VisError(
      `${o.format} needs even dimensions (yuv420), got ${o.width}x${o.height}`,
    );
  const isMp4 = o.format === "mp4";
  const alpha = !isMp4 && o.alpha === true;
  const codec = isMp4
    ? o.width * o.height <= 1920 * 1080
      ? "avc1.640028"
      : "avc1.640033"
    : "vp09.00.10.08";
  const config: VideoEncoderConfig = {
    codec,
    width: o.width,
    height: o.height,
    bitrate: bitrateFor(o),
    framerate: o.fps,
    ...(isMp4 ? { avc: { format: "avc" as const } } : {}),
    ...(alpha ? { alpha: "keep" as const } : {}),
  };
  const support = await VideoEncoder.isConfigSupported(config);
  if (!support.supported)
    throw new VisError(
      `codec ${codec}${alpha ? " with alpha" : ""} at ${o.width}x${o.height} is unsupported by this browser's encoder`,
    );

  const muxer = await createMuxer(o, alpha);
  // An object, so TS does not narrow a value assigned inside a callback to null.
  const state: { failure: Error | null; wake: (() => void) | null } = {
    failure: null,
    wake: null,
  };
  const fail = (e: unknown): void => {
    state.failure ??= e instanceof Error ? e : new Error(String(e));
    state.wake?.();
  };
  const failed = (): boolean => state.failure !== null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      // A throw in here would surface on the window, not in this promise.
      try {
        muxer.add(chunk, meta);
      } catch (e) {
        fail(e);
      }
    },
    error: fail,
  });
  try {
    encoder.configure(config);
    const frameMicros = Math.round(1e6 / o.fps);
    for (let i = 0; i < o.count && !failed(); i++) {
      const frame = new VideoFrame(o.frameAt(i), {
        timestamp: i * frameMicros,
        duration: frameMicros,
      });
      try {
        encoder.encode(frame, { keyFrame: i % (o.fps * 2) === 0 });
      } catch (e) {
        fail(e); // an encoder that already failed throws here; report its error
      } finally {
        frame.close();
      }
      while (encoder.encodeQueueSize > MAX_QUEUE && !failed())
        await new Promise<void>((resolve) => {
          state.wake = resolve;
          encoder.addEventListener(
            "dequeue",
            () => {
              resolve();
            },
            { once: true },
          );
        });
    }
    if (!failed()) await encoder.flush().catch(fail);
  } finally {
    if (encoder.state !== "closed") encoder.close();
  }
  if (state.failure)
    throw new VisError(`video encoding failed: ${state.failure.message}`);
  return new Blob([muxer.finish()], {
    type: isMp4 ? "video/mp4" : "video/webm",
  });
}
