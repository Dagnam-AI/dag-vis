import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { VisError } from "../../src/core/index.js";

interface MuxLog {
  chunks: unknown[];
  finalized: boolean;
  opts: unknown;
  /** thrown by addVideoChunk when not null */
  throwOnAdd: unknown;
}
const mux = vi.hoisted((): { mp4: MuxLog; webm: MuxLog } => ({
  mp4: { chunks: [], finalized: false, opts: null, throwOnAdd: null },
  webm: { chunks: [], finalized: false, opts: null, throwOnAdd: null },
}));

vi.mock("mp4-muxer", () => ({
  ArrayBufferTarget: class {
    buffer = new ArrayBuffer(8);
  },
  Muxer: class {
    target: { buffer: ArrayBuffer };
    constructor(opts: { target: { buffer: ArrayBuffer } }) {
      mux.mp4.opts = opts;
      this.target = opts.target;
    }
    addVideoChunk(c: unknown, m: unknown) {
      if (mux.mp4.throwOnAdd !== null) throw mux.mp4.throwOnAdd; // eslint-disable-line @typescript-eslint/only-throw-error -- exercising the non-Error branch
      mux.mp4.chunks.push([c, m]);
    }
    finalize() {
      mux.mp4.finalized = true;
    }
  },
}));
vi.mock("webm-muxer", () => ({
  ArrayBufferTarget: class {
    buffer = new ArrayBuffer(8);
  },
  Muxer: class {
    target: { buffer: ArrayBuffer };
    constructor(opts: { target: { buffer: ArrayBuffer } }) {
      mux.webm.opts = opts;
      this.target = opts.target;
    }
    addVideoChunk(c: unknown, m: unknown) {
      mux.webm.chunks.push([c, m]);
    }
    finalize() {
      mux.webm.finalized = true;
    }
  },
}));

import { encodeVideo } from "../../src/export/video.js";

interface Init {
  output(chunk: unknown, meta?: unknown): void;
  error(e: Error): void;
}

class FakeEncoder {
  static supported = true;
  /** isConfigSupported rejects, as it does for a malformed config */
  static rejectSupport: Error | null = null;
  static instances: FakeEncoder[] = [];
  /** error callback fired from inside encode (a failing codec) */
  static failOnEncode = false;
  /** encode throws, as a real encoder does once it has failed and closed */
  static throwOnEncode = false;
  static rejectFlush = false;
  /** a second error follows the first, as a codec that keeps failing does */
  static errorAfterOutput = false;
  /** queued frames drain on the next microtask */
  static autoDrain = true;
  /** a codec error arrives from a later task while the loop waits */
  static lateError = false;
  config: unknown;
  encoded: [FakeFrame, { keyFrame: boolean }][] = [];
  closed = false;
  state = "unconfigured";
  encodeQueueSize = 0;
  listeners: { fn: () => void; once: boolean | undefined }[] = [];
  constructor(public init: Init) {
    FakeEncoder.instances.push(this);
  }
  static isConfigSupported(c: unknown) {
    if (FakeEncoder.rejectSupport !== null)
      return Promise.reject(FakeEncoder.rejectSupport);
    return Promise.resolve({ supported: FakeEncoder.supported, config: c });
  }
  configure(c: unknown) {
    this.config = c;
    this.state = "configured";
  }
  encode(frame: FakeFrame, opts: { keyFrame: boolean }) {
    this.encoded.push([frame, opts]);
    if (FakeEncoder.throwOnEncode) {
      this.state = "closed";
      throw new Error("encoder closed");
    }
    if (FakeEncoder.failOnEncode) {
      this.state = "closed";
      this.init.error(new Error("boom"));
      return;
    }
    this.init.output({ type: "key", timestamp: 0 }, { decoderConfig: {} });
    if (FakeEncoder.errorAfterOutput) this.init.error(new Error("second"));
    this.encodeQueueSize++;
    if (FakeEncoder.autoDrain)
      queueMicrotask(() => {
        this.encodeQueueSize = 0;
        for (const l of this.listeners.splice(0)) l.fn();
      });
    if (FakeEncoder.lateError && this.encodeQueueSize === 5)
      setTimeout(() => {
        this.state = "closed";
        this.init.error(new Error("lost"));
      }, 0);
  }
  addEventListener(_type: string, fn: () => void, o?: { once?: boolean }) {
    this.listeners.push({ fn, once: o?.once });
  }
  flush() {
    return FakeEncoder.rejectFlush
      ? Promise.reject(new Error("flush boom"))
      : Promise.resolve();
  }
  close() {
    if (this.state === "closed") throw new Error("InvalidStateError");
    this.closed = true;
    this.state = "closed";
  }
}
class FakeFrame {
  closed = false;
  constructor(
    public src: unknown,
    public init: { timestamp: number; duration: number },
  ) {}
  close() {
    this.closed = true;
  }
}

beforeEach(() => {
  vi.stubGlobal("VideoEncoder", FakeEncoder);
  vi.stubGlobal("VideoFrame", FakeFrame);
  FakeEncoder.instances = [];
  FakeEncoder.supported = true;
  FakeEncoder.rejectSupport = null;
  FakeEncoder.failOnEncode = false;
  FakeEncoder.throwOnEncode = false;
  FakeEncoder.rejectFlush = false;
  FakeEncoder.autoDrain = true;
  FakeEncoder.lateError = false;
  FakeEncoder.errorAfterOutput = false;
  mux.mp4.chunks = [];
  mux.mp4.finalized = false;
  mux.mp4.throwOnAdd = null;
  mux.webm.chunks = [];
  mux.webm.finalized = false;
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const canvas = {} as OffscreenCanvas;
const first = () => FakeEncoder.instances[0]!;
const base = { width: 64, height: 36, fps: 1, count: 1, frameAt: () => canvas };

describe("encodeVideo", () => {
  it("encodes count frames to mp4 with avc, keyframes every 2 s, and finalizes the muxer", async () => {
    const blob = await encodeVideo({
      ...base,
      format: "mp4",
      fps: 2,
      count: 5,
    });
    expect(blob.type).toBe("video/mp4");
    expect(blob.size).toBe(8);
    expect(first().config).toMatchObject({
      codec: "avc1.640028",
      width: 64,
      height: 36,
      framerate: 2,
      avc: { format: "avc" },
    });
    expect(first().config).not.toHaveProperty("alpha");
    expect(mux.mp4.opts).toMatchObject({
      video: { codec: "avc", width: 64, height: 36 },
      fastStart: "in-memory",
    });
    expect(first().encoded).toHaveLength(5);
    expect(first().encoded.map(([, o]) => o.keyFrame)).toEqual([
      true,
      false,
      false,
      false,
      true,
    ]);
    expect(first().encoded[0]?.[0].init).toEqual({
      timestamp: 0,
      duration: 500000,
    });
    expect(first().encoded[3]?.[0].init.timestamp).toBe(1500000);
    expect(first().encoded.every(([f]) => f.closed)).toBe(true);
    expect(mux.mp4.chunks).toHaveLength(5);
    expect(mux.mp4.finalized).toBe(true);
    expect(first().closed).toBe(true);
  });

  it.each([
    ["1080p30", 1920, 1080, 30, "avc1.640028"],
    ["1080p60", 1920, 1080, 60, "avc1.64002a"],
    ["1080x1080 at 60", 1080, 1080, 60, "avc1.64002a"],
    ["1080x1920 at 60", 1080, 1920, 60, "avc1.64002a"],
    ["1922x1078 (8228 macroblocks)", 1922, 1078, 30, "avc1.64002a"],
    ["4K at 1 fps (frame size forces 5.1)", 3840, 2160, 1, "avc1.640033"],
    ["4K30", 3840, 2160, 30, "avc1.640033"],
    ["4K60", 3840, 2160, 60, "avc1.640034"],
    ["640x360 at 30", 640, 360, 30, "avc1.640028"],
    ["8192x4320 at 60 (beyond every level)", 8192, 4320, 60, "avc1.640034"],
  ])(
    "picks the H.264 level for %s",
    async (_name, width, height, fps, codec) => {
      await encodeVideo({ ...base, format: "mp4", width, height, fps });
      expect(first().config).toMatchObject({ codec });
    },
  );

  it("uses VP9 profile 0 regardless of size", async () => {
    await encodeVideo({ ...base, format: "webm", width: 3840, height: 2160 });
    expect(first().config).toMatchObject({ codec: "vp09.00.10.08" });
  });

  it("encodes webm vp9 with optional alpha", async () => {
    const blob = await encodeVideo({
      ...base,
      format: "webm",
      count: 2,
      alpha: true,
    });
    expect(blob.type).toBe("video/webm");
    expect(first().config).toMatchObject({
      codec: "vp09.00.10.08",
      alpha: "keep",
    });
    expect(mux.webm.opts).toMatchObject({
      video: {
        codec: "V_VP9",
        width: 64,
        height: 36,
        frameRate: 1,
        alpha: true,
      },
    });
    expect(mux.webm.finalized).toBe(true);
  });

  it("keeps alpha off for webm by default and for mp4", async () => {
    await encodeVideo({ ...base, format: "webm" });
    expect(first().config).not.toHaveProperty("alpha");
    expect(mux.webm.opts).toMatchObject({ video: { alpha: false } });
    await encodeVideo({ ...base, format: "mp4", alpha: true });
    expect(FakeEncoder.instances[1]?.config).not.toHaveProperty("alpha");
  });

  it("maps quality to bitrate (higher quality, more bits)", async () => {
    await encodeVideo({ ...base, format: "webm", quality: 0.2 });
    await encodeVideo({ ...base, format: "webm", quality: 1 });
    await encodeVideo({ ...base, format: "webm" });
    const [lo, hi, dflt] = FakeEncoder.instances.map(
      (e) => (e.config as { bitrate: number }).bitrate,
    ) as [number, number, number];
    expect(hi).toBeGreaterThan(lo);
    expect(dflt).toBe(Math.round(64 * 36 * 1 * 0.1 * 1.3));
  });

  it("waits for a full encoder queue instead of buffering every frame", async () => {
    await encodeVideo({ ...base, format: "webm", fps: 30, count: 12 });
    expect(first().encoded).toHaveLength(12);
    expect(first().listeners).toHaveLength(0);
    expect(first().encodeQueueSize).toBeLessThanOrEqual(5);
    expect(mux.webm.chunks).toHaveLength(12);
  });

  it("registers a one-shot dequeue listener while it waits", async () => {
    FakeEncoder.autoDrain = false;
    const run = encodeVideo({ ...base, format: "webm", fps: 30, count: 6 });
    await vi.waitFor(() => {
      expect(first().listeners).toHaveLength(1);
    });
    expect(first().listeners[0]?.once).toBe(true);
    first().encodeQueueSize = 0;
    first().listeners[0]?.fn();
    await run;
    expect(first().encoded).toHaveLength(6);
  });

  it("stops waiting when the codec fails while the queue is full", async () => {
    FakeEncoder.autoDrain = false;
    FakeEncoder.lateError = true;
    await expect(
      encodeVideo({ ...base, format: "webm", fps: 30, count: 9 }),
    ).rejects.toThrow(/video encoding failed: lost/);
    expect(first().encoded).toHaveLength(5);
  });

  it("fails clearly on odd sizes, unsupported configs and encoder errors", async () => {
    await expect(
      encodeVideo({ ...base, format: "mp4", width: 63 }),
    ).rejects.toThrow(VisError);
    await expect(
      encodeVideo({ ...base, format: "mp4", height: 35 }),
    ).rejects.toThrow(/even width and height/);
    FakeEncoder.supported = false;
    await expect(encodeVideo({ ...base, format: "mp4" })).rejects.toThrow(
      /unsupported/,
    );
    expect(FakeEncoder.instances).toHaveLength(0);
    await expect(
      encodeVideo({ ...base, format: "webm", alpha: true }),
    ).rejects.toThrow(/vp09.00.10.08 with alpha at 64x36 is unsupported/);
    FakeEncoder.supported = true;
    FakeEncoder.failOnEncode = true;
    await expect(
      encodeVideo({ ...base, format: "webm", count: 3 }),
    ).rejects.toThrow(/boom/);
    // The failed encoder stopped the loop and was not closed twice.
    expect(first().encoded).toHaveLength(1);
    expect(first().encoded[0]?.[0].closed).toBe(true);
    expect(mux.webm.finalized).toBe(false);
  });

  it("turns a rejecting support check into a video error", async () => {
    FakeEncoder.rejectSupport = new TypeError("bad config");
    await expect(encodeVideo({ ...base, format: "mp4" })).rejects.toThrow(
      VisError,
    );
    await expect(encodeVideo({ ...base, format: "mp4" })).rejects.toThrow(
      /could not check codec avc1.640028 support: bad config/,
    );
    FakeEncoder.rejectSupport = "plain text" as unknown as Error; // a codec may reject with anything
    await expect(encodeVideo({ ...base, format: "mp4" })).rejects.toThrow(
      /support: plain text/,
    );
    FakeEncoder.rejectSupport = null;
    expect(FakeEncoder.instances).toHaveLength(0);
  });

  it("hands each frameAt result to VideoFrame, in order, with its own timestamp", async () => {
    const sources = [
      { n: 0 },
      { n: 1 },
      { n: 2 },
    ] as unknown as OffscreenCanvas[];
    await encodeVideo({
      ...base,
      format: "webm",
      fps: 2,
      count: 3,
      frameAt: (i) => sources[i]!,
    });
    expect(first().encoded.map(([f]) => f.src)).toEqual(sources);
    first().encoded.forEach(([f], i) => {
      expect(f.src).toBe(sources[i]);
      expect(f.init.timestamp).toBe(i * 500000);
    });
  });

  it("reports a throwing encode, a rejecting flush and a throwing muxer as video errors", async () => {
    FakeEncoder.throwOnEncode = true;
    await expect(
      encodeVideo({ ...base, format: "webm", count: 3 }),
    ).rejects.toThrow(/video encoding failed: encoder closed/);
    expect(first().encoded[0]?.[0].closed).toBe(true);
    FakeEncoder.throwOnEncode = false;
    FakeEncoder.rejectFlush = true;
    await expect(encodeVideo({ ...base, format: "webm" })).rejects.toThrow(
      /flush boom/,
    );
    expect(FakeEncoder.instances[1]?.closed).toBe(true);
    FakeEncoder.rejectFlush = false;
    mux.mp4.throwOnAdd = new Error("mux full");
    await expect(encodeVideo({ ...base, format: "mp4" })).rejects.toThrow(
      /mux full/,
    );
    expect(mux.mp4.finalized).toBe(false);
  });

  it("wraps a thrown non-Error and keeps the first failure", async () => {
    mux.mp4.throwOnAdd = "plain text";
    FakeEncoder.errorAfterOutput = true;
    await expect(encodeVideo({ ...base, format: "mp4" })).rejects.toThrow(
      /video encoding failed: plain text/,
    );
  });

  it("closes the encoder and frees nothing twice when the frame source throws", async () => {
    await expect(
      encodeVideo({
        ...base,
        format: "webm",
        frameAt: () => {
          throw new VisError("render failed");
        },
      }),
    ).rejects.toThrow("render failed");
    expect(first().closed).toBe(true);
  });

  it("fails clearly without WebCodecs", async () => {
    vi.stubGlobal("VideoEncoder", undefined);
    await expect(encodeVideo({ ...base, format: "mp4" })).rejects.toThrow(
      /WebCodecs/,
    );
    vi.stubGlobal("VideoEncoder", FakeEncoder);
    vi.stubGlobal("VideoFrame", undefined);
    await expect(encodeVideo({ ...base, format: "mp4" })).rejects.toThrow(
      /WebCodecs/,
    );
  });
});
