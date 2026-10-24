import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { VisError } from "../../src/core/index.js";

vi.mock("../../src/export/video.js", () => ({
  encodeVideo: vi.fn((o: { count: number; frameAt(i: number): unknown }) => {
    for (let i = 0; i < o.count; i++) o.frameAt(i);
    return Promise.resolve(
      new Blob([new Uint8Array(4)], { type: "video/x-fake" }),
    );
  }),
}));
import { exportCanvas } from "../../src/export/index.js";
import { encodeVideo } from "../../src/export/video.js";

let webpSupported = true;
let ctxAvailable = true;
/** Everything the scratch canvas and the handle did, in order. */
let log: string[] = [];

class FakeOffscreen {
  static instances: FakeOffscreen[] = [];
  draws = 0;
  ctxOptions: unknown;
  converts: { type: string; quality?: number }[] = [];
  constructor(
    public width: number,
    public height: number,
  ) {
    FakeOffscreen.instances.push(this);
  }
  getContext(kind: string, options?: unknown) {
    if (kind !== "2d" || !ctxAvailable) return null;
    this.ctxOptions = options;
    return {
      clearRect: (x: number, y: number, w: number, h: number) => {
        log.push(`clear ${x},${y},${w},${h}`);
      },
      drawImage: (
        _src: unknown,
        x: number,
        y: number,
        w: number,
        h: number,
      ) => {
        this.draws++;
        log.push(`draw ${x},${y},${w},${h}`);
      },
      getImageData: () => ({
        data: new Uint8ClampedArray(this.width * this.height * 4).fill(120),
      }),
    };
  }
  convertToBlob(o: { type: string; quality?: number }) {
    this.converts.push(o);
    const type =
      o.type === "image/webp" && !webpSupported ? "image/png" : o.type;
    return Promise.resolve(
      new Blob(
        [
          new Uint8Array([
            o.quality === undefined ? 0 : Math.round(o.quality * 100),
          ]),
        ],
        { type },
      ),
    );
  }
}

function fakeHandle(duration?: number) {
  const renderAt = vi.fn((t: number) => {
    log.push(`render ${t}`);
  });
  return {
    handle: {
      renderAt,
      canvas: { width: 8, height: 4 },
      duration,
    } as unknown as Parameters<typeof exportCanvas>[0],
    renderAt,
  };
}
const scratch = () => FakeOffscreen.instances[0]!;

beforeEach(() => {
  vi.stubGlobal("OffscreenCanvas", FakeOffscreen);
  FakeOffscreen.instances = [];
  webpSupported = true;
  ctxAvailable = true;
  log = [];
  vi.mocked(encodeVideo).mockClear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("exportCanvas", () => {
  it("static png renders frame 0 at the canvas size", async () => {
    const { handle, renderAt } = fakeHandle();
    const blob = await exportCanvas(handle, { format: "png" });
    expect(blob.type).toBe("image/png");
    expect(renderAt).toHaveBeenCalledWith(0);
    expect(scratch()).toMatchObject({ width: 8, height: 4, draws: 1 });
    expect(scratch().converts).toEqual([{ type: "image/png" }]);
    // Read in the same task as the render, over a cleared canvas.
    expect(log).toEqual(["render 0", "clear 0,0,8,4", "draw 0,0,8,4"]);
  });

  it("jpeg forwards quality; width/height override the scratch size", async () => {
    const { handle } = fakeHandle();
    const blob = await exportCanvas(handle, {
      format: "jpeg",
      quality: 0.5,
      width: 16,
      height: 8,
    });
    expect(new Uint8Array(await blob.arrayBuffer())[0]).toBe(50);
    expect(scratch()).toMatchObject({ width: 16, height: 8 });
    expect(log).toContain("draw 0,0,16,8");
  });

  it("webp throws when the browser silently returns png", async () => {
    await expect(
      exportCanvas(fakeHandle().handle, { format: "webp" }),
    ).resolves.toHaveProperty("type", "image/webp");
    webpSupported = false;
    await expect(
      exportCanvas(fakeHandle().handle, { format: "webp" }),
    ).rejects.toThrow(VisError);
  });

  it("gif drives renderAt at i/fps for count (+ palette sample) frames and uses handle.duration as the default", async () => {
    const { handle, renderAt } = fakeHandle(1);
    const blob = await exportCanvas(handle, { format: "gif", fps: 4 });
    expect(blob.type).toBe("image/gif");
    expect(
      new TextDecoder().decode(
        new Uint8Array(await blob.arrayBuffer()).subarray(0, 6),
      ),
    ).toBe("GIF89a");
    // count 4, palette stride 1: four sample renders, then the four frames
    expect(renderAt.mock.calls.map((c) => c[0])).toEqual([
      0, 0.25, 0.5, 0.75, 0, 0.25, 0.5, 0.75,
    ]);
    expect(scratch().ctxOptions).toEqual({ willReadFrequently: true });
  });

  it("gif clears before every frame so a transparent frame cannot show the last one", async () => {
    await exportCanvas(fakeHandle(0.5).handle, { format: "gif", fps: 4 });
    const draws = log.filter((l) => l.startsWith("draw")).length;
    expect(draws).toBe(4);
    for (const [i, l] of log.entries())
      if (l.startsWith("draw")) expect(log[i - 1]).toMatch(/^clear/);
  });

  it("warns that a GIF above 50 fps is not honoured, and not at 50", async () => {
    const warn = vi.fn();
    await exportCanvas(fakeHandle(0.1).handle, {
      format: "gif",
      fps: 50,
      warn,
    });
    expect(warn).not.toHaveBeenCalled();
    await exportCanvas(fakeHandle(0.1).handle, {
      format: "gif",
      fps: 60,
      warn,
    });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toMatch(/60 fps plays at 50/);
  });

  it("forwards the wide-GIF advisory and defaults to console.warn", async () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await exportCanvas(
      {
        renderAt: () => undefined,
        canvas: { width: 900, height: 2 },
      } as unknown as Parameters<typeof exportCanvas>[0],
      { format: "gif", fps: 1, duration: 1 },
    );
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]?.[0]).toMatch(/900px/);
  });

  it("png-seq zips one PNG per frame", async () => {
    const { handle } = fakeHandle();
    const blob = await exportCanvas(handle, {
      format: "png-seq",
      fps: 2,
      duration: 1.5,
    });
    expect(blob.type).toBe("application/zip");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const dv = new DataView(bytes.buffer);
    expect(dv.getUint16(bytes.length - 22 + 10, true)).toBe(3);
    expect(new TextDecoder().decode(bytes.subarray(30, 45))).toBe(
      "frame-00000.png",
    );
    expect(scratch().converts).toHaveLength(3);
  });

  it("mp4/webm delegate to encodeVideo with a scratch-canvas frame source", async () => {
    const { handle, renderAt } = fakeHandle();
    const blob = await exportCanvas(handle, {
      format: "webm",
      fps: 2,
      duration: 1,
      alpha: true,
      quality: 0.7,
    });
    expect(blob.type).toBe("video/x-fake");
    expect(encodeVideo).toHaveBeenCalledWith(
      expect.objectContaining({
        format: "webm",
        width: 8,
        height: 4,
        fps: 2,
        count: 2,
        alpha: true,
        quality: 0.7,
      }),
    );
    expect(renderAt.mock.calls.map((c) => c[0])).toEqual([0, 0.5]);
    expect(scratch().ctxOptions).toEqual({ willReadFrequently: false });
  });

  it("defaults to 30 fps over 6 s when neither the call nor the handle says", async () => {
    await exportCanvas(fakeHandle().handle, { format: "mp4" });
    expect(encodeVideo).toHaveBeenCalledWith(
      expect.objectContaining({ fps: 30, count: 180 }),
    );
  });

  it("treats explicit undefined options like absent ones", async () => {
    await exportCanvas(fakeHandle(undefined).handle, {
      format: "mp4",
      fps: undefined,
      duration: undefined,
      width: undefined,
      height: undefined,
      quality: undefined,
      alpha: undefined,
      warn: undefined,
    });
    expect(encodeVideo).toHaveBeenCalledWith(
      expect.objectContaining({ fps: 30, count: 180, width: 8, height: 4 }),
    );
  });

  it("rejects an invalid fps or duration before rendering anything", async () => {
    const { handle, renderAt } = fakeHandle();
    await expect(
      exportCanvas(handle, { format: "mp4", fps: 0 }),
    ).rejects.toThrow(/fps/);
    await expect(
      exportCanvas(handle, { format: "gif", duration: 61 }),
    ).rejects.toThrow(/duration/);
    expect(renderAt).not.toHaveBeenCalled();
  });

  it("validates the handle, format, sizes, quality and alpha by name", async () => {
    const ok = fakeHandle().handle;
    await expect(
      exportCanvas({} as unknown as typeof ok, { format: "png" }),
    ).rejects.toThrow(/renderAt/);
    await expect(
      exportCanvas(ok, { format: "tiff" as unknown as "png" }),
    ).rejects.toThrow(/format must be one of .*tiff/);
    await expect(exportCanvas(ok, { format: "png", width: 0 })).rejects.toThrow(
      /width must be an integer/,
    );
    await expect(
      exportCanvas(ok, { format: "png", width: 10.5 }),
    ).rejects.toThrow(/width/);
    await expect(
      exportCanvas(ok, { format: "png", height: Number.NaN }),
    ).rejects.toThrow(/height/);
    await expect(
      exportCanvas(ok, { format: "png", height: 16385 }),
    ).rejects.toThrow(/height/);
    for (const quality of [-0.1, 1.1, Number.NaN])
      await expect(
        exportCanvas(ok, { format: "jpeg", quality }),
      ).rejects.toThrow(/quality must be a number in 0\.\.1/);
    for (const format of ["jpeg", "gif", "mp4"] as const)
      await expect(exportCanvas(ok, { format, alpha: true })).rejects.toThrow(
        new RegExp(`alpha is not supported by ${format}`),
      );
    for (const format of ["png", "webp", "png-seq", "webm"] as const)
      await expect(
        exportCanvas(ok, { format, alpha: true, duration: 1, fps: 1 }),
      ).resolves.toBeInstanceOf(Blob);
    await expect(
      exportCanvas(ok, { format: "png", alpha: false }),
    ).resolves.toBeInstanceOf(Blob);
  });

  it("hands encodeVideo the scratch canvas, rendered and drawn per frame", async () => {
    const { handle, renderAt } = fakeHandle();
    await exportCanvas(handle, { format: "mp4", fps: 1, duration: 2 });
    expect(renderAt).toHaveBeenCalledTimes(2);
    const call = vi.mocked(encodeVideo).mock.calls[0]?.[0];
    log = [];
    expect(call?.frameAt(1)).toBe(scratch());
    expect(log).toEqual(["render 1", "clear 0,0,8,4", "draw 0,0,8,4"]);
  });

  it("requires even sizes for mp4 and webm, naming width and height, before touching the environment", async () => {
    vi.stubGlobal("OffscreenCanvas", undefined);
    const ok = fakeHandle().handle;
    for (const format of ["mp4", "webm"] as const) {
      await expect(exportCanvas(ok, { format, width: 7 })).rejects.toThrow(
        /even width and height.*got 7x4; pass an even/,
      );
      await expect(exportCanvas(ok, { format, height: 5 })).rejects.toThrow(
        /got 8x5/,
      );
    }
    // Other formats take odd sizes.
    vi.stubGlobal("OffscreenCanvas", FakeOffscreen);
    await expect(
      exportCanvas(ok, { format: "png", width: 7, height: 5 }),
    ).resolves.toBeInstanceOf(Blob);
  });

  it("rejects null options by name instead of falling back, and a missing options bag", async () => {
    const ok = fakeHandle().handle;
    const bad = (o: object) =>
      o as unknown as Parameters<typeof exportCanvas>[1];
    for (const key of [
      "width",
      "height",
      "quality",
      "alpha",
      "fps",
      "duration",
      "warn",
    ])
      await expect(
        exportCanvas(ok, bad({ format: "mp4", [key]: null })),
      ).rejects.toThrow(new RegExp(`^${key} must`));
    await expect(
      exportCanvas(ok, bad({ format: "png", warn: "loud" })),
    ).rejects.toThrow(/warn must be a function/);
    await expect(
      exportCanvas(ok, bad({ format: "mp4", alpha: 1 })),
    ).rejects.toThrow(/alpha must be true or false/);
    for (const options of [undefined, null, 3])
      await expect(
        exportCanvas(
          ok,
          options as unknown as Parameters<typeof exportCanvas>[1],
        ),
      ).rejects.toThrow(/^options must be an object/);
    for (const handle of [null, undefined, 3])
      await expect(
        exportCanvas(handle as unknown as typeof ok, { format: "png" }),
      ).rejects.toThrow(/handle must have a renderAt/);
  });

  it("names a canvas with no size", async () => {
    await expect(
      exportCanvas(
        {
          renderAt: () => undefined,
          canvas: { width: 0, height: 0 },
        } as unknown as Parameters<typeof exportCanvas>[0],
        { format: "png" },
      ),
    ).rejects.toThrow(/width must be an integer/);
  });

  it("fails clearly without OffscreenCanvas or a 2d context", async () => {
    ctxAvailable = false;
    await expect(
      exportCanvas(fakeHandle().handle, { format: "png" }),
    ).rejects.toThrow(/2d/);
    vi.stubGlobal("OffscreenCanvas", undefined);
    await expect(
      exportCanvas(fakeHandle().handle, { format: "png" }),
    ).rejects.toThrow(/OffscreenCanvas/);
  });
});
