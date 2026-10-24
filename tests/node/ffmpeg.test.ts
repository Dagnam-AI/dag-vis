import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { VisError } from "../../src/core/index.js";

vi.mock("node:child_process", () => ({ spawn: vi.fn(), spawnSync: vi.fn() }));
import { spawn, spawnSync } from "node:child_process";
import {
  crfFor,
  ffmpegPath,
  runFfmpeg,
  stillArgs,
  videoArgs,
} from "../../src/node/ffmpeg.js";

type Child = EventEmitter & {
  stdin: PassThrough;
  stderr: PassThrough;
  received: Buffer[];
  kill: ReturnType<typeof vi.fn>;
};

interface FakeOptions {
  /** Exit code once stdin finishes; `"never"` leaves the child running until the test closes it. */
  exit?: number | null | "never";
  signal?: NodeJS.Signals | null;
  stderr?: string;
  highWaterMark?: number;
  /** Nothing reads stdin, so a write that exceeds the mark waits for a drain that never comes. */
  stalled?: boolean;
}

/** A stand-in for ffmpeg: collects stdin, prints `stderr`, closes with `exit` after stdin ends. */
function fakeChild(o: FakeOptions = {}): Child {
  const { exit = 0, signal = null, stderr = "", highWaterMark = 1 << 16 } = o;
  const child = new EventEmitter() as Child;
  child.stdin = new PassThrough({ highWaterMark });
  child.stderr = new PassThrough();
  child.received = [];
  child.kill = vi.fn(() => {
    setImmediate(() => child.emit("close", null, "SIGKILL"));
    return true;
  });
  if (!o.stalled) child.stdin.on("data", (d: Buffer) => child.received.push(d));
  child.stdin.on("finish", () => {
    if (stderr) child.stderr.write(stderr);
    if (exit !== "never")
      setTimeout(() => child.emit("close", exit, signal), 5);
  });
  return child;
}

function use(child: Child): void {
  vi.mocked(spawn).mockReturnValue(child as never);
}

const frame = (...bytes: number[]): Uint8Array => new Uint8Array(bytes);

beforeEach(() => {
  vi.mocked(spawn).mockReset();
  vi.mocked(spawnSync).mockReset();
});

describe("ffmpegPath", () => {
  it("prefers DAG_VIS_FFMPEG, otherwise ffmpeg on PATH, probing with -version under a timeout", () => {
    vi.mocked(spawnSync).mockReturnValue({ status: 0 } as never);
    expect(ffmpegPath({ DAG_VIS_FFMPEG: "/opt/ffmpeg" })).toBe("/opt/ffmpeg");
    expect(spawnSync).toHaveBeenCalledWith("/opt/ffmpeg", ["-version"], {
      stdio: "ignore",
      timeout: 10_000,
    });
    expect(ffmpegPath({})).toBe("ffmpeg");
    expect(ffmpegPath({ DAG_VIS_FFMPEG: "" })).toBe("ffmpeg");
  });
  it("never uses a shell and defaults to the process environment", () => {
    vi.mocked(spawnSync).mockReturnValue({ status: 0 } as never);
    ffmpegPath();
    const options = vi.mocked(spawnSync).mock.calls[0]![2];
    expect(options).not.toHaveProperty("shell");
  });
  it("throws one clear VisError naming the binary when missing, broken or hung", () => {
    vi.mocked(spawnSync).mockReturnValue({
      error: new Error("ENOENT"),
      status: null,
    } as never);
    expect(() => ffmpegPath({})).toThrow(/ffmpeg not found.*DAG_VIS_FFMPEG/);
    expect(() => ffmpegPath({})).toThrow(VisError);
    vi.mocked(spawnSync).mockReturnValue({ status: 1 } as never);
    expect(() => ffmpegPath({ DAG_VIS_FFMPEG: "/bad/ffmpeg" })).toThrow(
      /"\/bad\/ffmpeg"/,
    );
    vi.mocked(spawnSync).mockReturnValue({
      error: new Error("ETIMEDOUT"),
      status: null,
      signal: "SIGTERM",
    } as never);
    expect(() => ffmpegPath({})).toThrow(/ffmpeg not found/);
  });
  it("rejects a binary that could be parsed as an option or holds a NUL, without probing it", () => {
    for (const bad of ["-version", "-", "ffm\0peg"]) {
      expect(() => ffmpegPath({ DAG_VIS_FFMPEG: bad })).toThrow(
        /ffmpeg binary must be/,
      );
    }
    expect(spawnSync).not.toHaveBeenCalled();
  });
});

describe("argument builders", () => {
  const input = [
    "-y",
    "-f",
    "rawvideo",
    "-pix_fmt",
    "rgba",
    "-s",
    "64x36",
    "-r",
    "30",
    "-i",
    "-",
  ];
  it("mp4: libx264 yuv420p crf +faststart", () => {
    expect(videoArgs("mp4", 64, 36, 30, 0.8, false, "o.mp4")).toEqual([
      ...input,
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-crf",
      "19",
      "-preset",
      "medium",
      "-movflags",
      "+faststart",
      "-f",
      "mp4",
      "o.mp4",
    ]);
  });
  it("webm: libvpx-vp9 with optional alpha", () => {
    expect(videoArgs("webm", 64, 36, 30, 0.8, false, "o.webm")).toEqual([
      ...input,
      "-c:v",
      "libvpx-vp9",
      "-pix_fmt",
      "yuv420p",
      "-crf",
      "25",
      "-b:v",
      "0",
      "-f",
      "webm",
      "o.webm",
    ]);
    expect(videoArgs("webm", 64, 36, 30, 0.8, true, "o.webm")).toEqual([
      ...input,
      "-c:v",
      "libvpx-vp9",
      "-pix_fmt",
      "yuva420p",
      "-crf",
      "25",
      "-b:v",
      "0",
      "-auto-alt-ref",
      "0",
      "-f",
      "webm",
      "o.webm",
    ]);
  });
  it("apng: lossless infinite loop, odd sizes allowed", () => {
    expect(videoArgs("apng", 64, 36, 30, 0.8, false, "o.apng")).toEqual([
      ...input,
      "-c:v",
      "apng",
      "-pix_fmt",
      "rgb24",
      "-plays",
      "0",
      "-f",
      "apng",
      "o.apng",
    ]);
    expect(videoArgs("apng", 64, 36, 30, 0.8, true, "o.apng")).toEqual([
      ...input,
      "-c:v",
      "apng",
      "-pix_fmt",
      "rgba",
      "-plays",
      "0",
      "-f",
      "apng",
      "o.apng",
    ]);
    expect(videoArgs("apng", 63, 35, 30, 0.8, false, "o.apng")).toContain(
      "63x35",
    );
  });
  it("stills: one frame in, jpeg/webp/avif out, odd sizes allowed", () => {
    const one = [
      "-y",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgba",
      "-s",
      "64x36",
      "-r",
      "1",
      "-i",
      "-",
      "-frames:v",
      "1",
    ];
    expect(stillArgs("jpeg", 64, 36, 0.8, "o.jpg")).toEqual([
      ...one,
      "-c:v",
      "mjpeg",
      "-q:v",
      "8",
      "-f",
      "image2",
      "-update",
      "1",
      "o.jpg",
    ]);
    expect(stillArgs("webp", 64, 36, 0.8, "o.webp")).toEqual([
      ...one,
      "-c:v",
      "libwebp",
      "-quality",
      "80",
      "-f",
      "webp",
      "o.webp",
    ]);
    expect(stillArgs("avif", 64, 36, 0.8, "o.avif")).toEqual([
      ...one,
      "-c:v",
      "libaom-av1",
      "-pix_fmt",
      "yuv420p",
      "-still-picture",
      "1",
      "-crf",
      "26",
      "-cpu-used",
      "6",
      "-f",
      "avif",
      "o.avif",
    ]);
    expect(stillArgs("jpeg", 63, 35, 1, "o.jpg")).toContain("63x35");
  });
  it("covers the quality endpoints", () => {
    expect(stillArgs("jpeg", 8, 8, 0, "o.jpg")).toContain("31");
    expect(stillArgs("jpeg", 8, 8, 1, "o.jpg")).toContain("2");
    expect(stillArgs("webp", 8, 8, 0, "o.webp")).toContain("0");
    expect(stillArgs("webp", 8, 8, 1, "o.webp")).toContain("100");
  });
  it("crfFor clamps finite quality into 0..1 and rejects NaN and non-numbers", () => {
    expect(crfFor("mp4", 2)).toBe(15);
    expect(crfFor("mp4", -1)).toBe(35);
    expect(crfFor("webm", 1)).toBe(20);
    expect(crfFor("avif", 0)).toBe(50);
    expect(() => crfFor("mp4", Number.NaN)).toThrow(/quality must be/);
    expect(() => crfFor("mp4", "0.5" as never)).toThrow(VisError);
  });

  it("rejects an invalid size naming the parameter", () => {
    for (const bad of [0, -2, 1.5, Number.NaN, Infinity, 16385, "64", null]) {
      expect(() =>
        videoArgs("apng", bad as never, 36, 30, 0.8, false, "o"),
      ).toThrow(/width must be an integer in 1\.\.16384/);
      expect(() => stillArgs("jpeg", 64, bad as never, 0.8, "o")).toThrow(
        /height must be an integer in 1\.\.16384/,
      );
    }
  });
  it("requires even sizes for mp4 and webm only", () => {
    for (const format of ["mp4", "webm"] as const) {
      expect(() => videoArgs(format, 63, 36, 30, 0.8, false, "o")).toThrow(
        /must be even.*63x36/,
      );
      expect(() => videoArgs(format, 64, 35, 30, 0.8, false, "o")).toThrow(
        /must be even/,
      );
    }
  });
  it("rejects fps outside (0, 60] or not a number, naming the parameter", () => {
    for (const bad of [0, -1, Number.NaN, Infinity, 61, "30", null]) {
      expect(() =>
        videoArgs("mp4", 64, 36, bad as never, 0.8, false, "o"),
      ).toThrow(/fps must be/);
    }
    expect(videoArgs("apng", 64, 36, 29.97, 0.8, false, "o")).toContain(
      "29.97",
    );
    expect(videoArgs("apng", 64, 36, 60, 0.8, false, "o")).toContain("60");
  });
  it("rejects quality outside 0..1 or not a number, naming the parameter", () => {
    for (const bad of [-0.1, 1.1, Number.NaN, Infinity, "0.8", undefined]) {
      expect(() =>
        videoArgs("mp4", 64, 36, 30, bad as never, false, "o"),
      ).toThrow(/quality must be a number in 0\.\.1/);
      expect(() => stillArgs("webp", 64, 36, bad as never, "o")).toThrow(
        /quality must be a number in 0\.\.1/,
      );
    }
  });
  it("names the container whatever the extension says, and keeps a path pattern out of jpeg's way", () => {
    const wrong = (a: string[]): string[] => a.slice(-3, -1);
    expect(wrong(stillArgs("jpeg", 8, 8, 0.8, "x.png"))).toEqual([
      "-update",
      "1",
    ]);
    expect(stillArgs("jpeg", 8, 8, 0.8, "frame%d.jpg")).toContain("-update");
    expect(videoArgs("mp4", 8, 8, 30, 0.8, false, "x.webm")).toContain("mp4");
    expect(videoArgs("apng", 8, 8, 30, 0.8, false, "x")).toContain("apng");
  });
  it("rejects alpha for mp4, naming the parameter, but not for webm or apng", () => {
    expect(() => videoArgs("mp4", 64, 36, 30, 0.8, true, "o.mp4")).toThrow(
      /alpha is not supported by mp4/,
    );
    expect(() => videoArgs("webm", 64, 36, 30, 0.8, true, "o")).not.toThrow();
    expect(() => videoArgs("apng", 64, 36, 30, 0.8, true, "o")).not.toThrow();
  });
  it("rejects a non-boolean alpha and an unknown format", () => {
    expect(() => videoArgs("webm", 64, 36, 30, 0.8, 1 as never, "o")).toThrow(
      /alpha must be true or false/,
    );
    expect(() =>
      videoArgs("gif" as never, 64, 36, 30, 0.8, false, "o.gif"),
    ).toThrow(/video format must be mp4\|webm\|apng/);
    expect(() => stillArgs("png" as never, 64, 36, 0.8, "o.png")).toThrow(
      /still format must be jpeg\|webp\|avif/,
    );
  });
  it("rejects an output path ffmpeg could read as an option, a protocol or a NUL", () => {
    const bad = [
      "",
      "-",
      "-f",
      "--out.mp4",
      "o\0.mp4",
      "rtmp://host/app",
      "pipe:1",
      "concat:a|b",
      "file:o.mp4",
      "a".repeat(5000),
      undefined,
      42,
    ];
    for (const out of bad) {
      expect(() =>
        videoArgs("apng", 64, 36, 30, 0.8, false, out as never),
      ).toThrow(/output path must be/);
      expect(() => stillArgs("jpeg", 64, 36, 0.8, out as never)).toThrow(
        VisError,
      );
    }
  });
  it("accepts ordinary paths, a leading ./ and a Windows drive, as one argument each", () => {
    for (const out of [
      "o.mp4",
      "./-o.mp4",
      "dir with space/o (1).mp4",
      "C:\\out\\o.mp4",
      "../up/o;rm -rf.mp4",
      "$(touch x).mp4",
    ]) {
      const args = videoArgs("apng", 64, 36, 30, 0.8, false, out);
      expect(args.at(-1)).toBe(out);
      expect(args.filter((a) => a === out)).toHaveLength(1);
    }
  });
});

describe("runFfmpeg", () => {
  it("spawns without a shell, stdin piped, writes every frame in order, ends stdin and resolves on exit 0", async () => {
    const child = fakeChild();
    use(child);
    await runFfmpeg(["-x"], [frame(1, 2), frame(3)], "/opt/ffmpeg");
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(spawn).toHaveBeenCalledWith("/opt/ffmpeg", ["-x"], {
      stdio: ["pipe", "ignore", "pipe"],
    });
    expect(Buffer.concat(child.received)).toEqual(Buffer.from([1, 2, 3]));
  });
  it("passes arguments untouched as one array (no shell parsing)", async () => {
    use(fakeChild());
    const hostile = ["-i", "$(touch pwned)", "; rm -rf /", "a b", "`x`"];
    await runFfmpeg(hostile, [], "ffmpeg");
    expect(vi.mocked(spawn).mock.calls[0]![1]).toEqual(hostile);
    expect(vi.mocked(spawn).mock.calls[0]![2]).not.toHaveProperty("shell");
  });
  it("honours backpressure (waits for drain) and accepts async iterables", async () => {
    const child = fakeChild({ highWaterMark: 1 });
    use(child);
    async function* frames() {
      await Promise.resolve();
      yield new Uint8Array(64);
      yield new Uint8Array(64);
    }
    await runFfmpeg([], frames(), "ffmpeg");
    expect(Buffer.concat(child.received).length).toBe(128);
  });
  it("defaults the binary to ffmpegPath()", async () => {
    vi.mocked(spawnSync).mockReturnValue({ status: 0 } as never);
    use(fakeChild());
    await runFfmpeg([], []);
    expect(spawn).toHaveBeenCalledWith("ffmpeg", [], expect.anything());
  });

  it("rejects with the last stderr line on a non-zero exit", async () => {
    use(fakeChild({ exit: 1, stderr: "frame=1\nUnknown encoder 'libwebp'\n" }));
    await expect(runFfmpeg([], [frame(1)], "ffmpeg")).rejects.toThrow(
      /exited with 1: Unknown encoder 'libwebp'$/,
    );
  });
  it("quotes a bounded tail of stderr only, split on carriage returns too", async () => {
    use(
      fakeChild({
        exit: 1,
        stderr: `${"x".repeat(10_000)}\nframe=1\rframe=2\r${"y".repeat(1000)}\n\n`,
      }),
    );
    const error = await runFfmpeg([], [], "ffmpeg").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(VisError);
    const message = (error as VisError).message;
    expect(message.length).toBeLessThan(400);
    expect(message).toMatch(/exited with 1: y{300}\.\.\.$/);
    use(fakeChild({ exit: 1 }));
    await expect(runFfmpeg([], [], "ffmpeg")).rejects.toThrow(
      /exited with 1: $/,
    );
  });
  it("reports a signal exit and a spawn error, naming the binary", async () => {
    use(fakeChild({ exit: null, signal: "SIGSEGV" }));
    await expect(runFfmpeg([], [], "ffmpeg")).rejects.toThrow(
      /ffmpeg was killed by SIGSEGV/,
    );
    const dead = fakeChild({ exit: "never" });
    dead.stdin.on("finish", () => {
      dead.emit("error", new Error("spawn EACCES"));
    });
    use(dead);
    await expect(runFfmpeg([], [], "/no/ffmpeg")).rejects.toThrow(
      /could not start ffmpeg \("\/no\/ffmpeg"\): spawn EACCES/,
    );
  });

  it("rejects bad arguments or binary before spawning", async () => {
    await expect(runFfmpeg("-x" as never, [], "ffmpeg")).rejects.toThrow(
      /arguments must be an array of strings/,
    );
    await expect(runFfmpeg(["a\0b"], [], "ffmpeg")).rejects.toThrow(VisError);
    await expect(runFfmpeg([1 as never], [], "ffmpeg")).rejects.toThrow(
      VisError,
    );
    await expect(runFfmpeg([], [], "-evil")).rejects.toThrow(
      /ffmpeg binary must be/,
    );
    await expect(runFfmpeg([], [], "")).rejects.toThrow(VisError);
    expect(spawn).not.toHaveBeenCalled();
  });
  it("kills ffmpeg and rejects when a frame is not a Uint8Array", async () => {
    const child = fakeChild({ exit: "never" });
    use(child);
    await expect(
      runFfmpeg([], [frame(1), "oops" as never], "ffmpeg"),
    ).rejects.toThrow(/every frame must be a Uint8Array, got "oops"/);
    expect(child.kill).toHaveBeenCalledWith("SIGKILL");
    expect(child.stdin.destroyed).toBe(true);
  });
  it("kills and reaps ffmpeg and rethrows the very error when the frame source throws", async () => {
    const child = fakeChild({ exit: "never" });
    use(child);
    const boom = new Error("render failed");
    async function* frames() {
      yield frame(1);
      await Promise.resolve();
      throw boom;
    }
    await expect(runFfmpeg([], frames(), "ffmpeg")).rejects.toBe(boom);
    expect(child.kill).toHaveBeenCalledWith("SIGKILL");
  });

  it("stops feeding once ffmpeg has exited and closes the frame source", async () => {
    const child = fakeChild({ exit: "never" });
    use(child);
    let closed = false;
    let pulled = 0;
    async function* frames() {
      try {
        for (;;) {
          pulled += 1;
          yield frame(1);
          await new Promise((r) => setImmediate(r));
          if (pulled === 2) child.emit("close", 0, null);
        }
      } finally {
        closed = true;
      }
    }
    await runFfmpeg([], frames(), "ffmpeg");
    expect(closed).toBe(true);
    expect(pulled).toBeLessThanOrEqual(3);
  });
  it("does not hang when ffmpeg exits while a write waits for drain", async () => {
    const child = fakeChild({ stalled: true, highWaterMark: 1, exit: "never" });
    use(child);
    setTimeout(() => {
      child.stderr.write("moov atom not found\n");
      setTimeout(() => child.emit("close", 1, null), 5);
    }, 10);
    await expect(
      runFfmpeg([], [frame(1, 2, 3), frame(4)], "ffmpeg"),
    ).rejects.toThrow(/exited with 1: moov atom not found/);
  });
  it("treats a broken pipe during a drain wait as the exit status, not as an error", async () => {
    const child = fakeChild({ stalled: true, highWaterMark: 1, exit: "never" });
    use(child);
    setTimeout(() => {
      child.stdin.emit("error", new Error("write EPIPE"));
      setTimeout(() => child.emit("close", 0, null), 5);
    }, 10);
    await expect(
      runFfmpeg([], [frame(1, 2, 3), frame(4)], "ffmpeg"),
    ).resolves.toBeUndefined();
  });
  it("ignores a stdin error outside a drain wait", async () => {
    const child = fakeChild({ exit: "never" });
    use(child);
    async function* frames() {
      yield frame(1);
      child.stdin.emit("error", new Error("write EPIPE"));
      await Promise.resolve();
      child.emit("close", 0, null);
    }
    await expect(runFfmpeg([], frames(), "ffmpeg")).resolves.toBeUndefined();
  });
});
