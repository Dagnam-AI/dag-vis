import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";

import { VisError } from "../core/errors.js";
import {
  bounded,
  describeValue,
  integerIn,
  MAX_DIMENSION,
  parseFlag,
  positive,
} from "../core/validate.js";
import { MAX_FPS } from "../export/limits.js";
import { messageOf } from "./util.js";

export type StillFormat = "jpeg" | "webp" | "avif";
export type VideoFormat = "mp4" | "webm" | "apng";

/** The environment variable that names the ffmpeg binary. */
const ENV_VAR = "DAG_VIS_FFMPEG";
/** Longest a `-version` probe may take before the binary counts as broken. */
const PROBE_TIMEOUT_MS = 10_000;
/** Longest an output path may be (PATH_MAX on the common platforms). */
const MAX_PATH_LENGTH = 4096;
/** Most characters of ffmpeg's stderr kept while it runs, and quoted in an error. */
const STDERR_KEEP = 4000;
const STDERR_QUOTE = 300;

/** A binary name or path: a non-empty string without NUL that no program could take for an option. */
function checkBinary(bin: unknown): string {
  if (
    typeof bin !== "string" ||
    bin === "" ||
    bin.includes("\0") ||
    bin.startsWith("-")
  )
    throw new VisError(
      `ffmpeg binary must be a non-empty path or name without NUL that does not start with "-", got ${describeValue(bin)}`,
    );
  return bin;
}

/**
 * ffmpeg binary: `$DAG_VIS_FFMPEG` (an empty value counts as unset), else
 * `ffmpeg` on PATH, verified by running `-version` under a timeout. Never
 * bundled (licence and size). Spawned with an argument array, never a shell.
 */
export function ffmpegPath(env: NodeJS.ProcessEnv = process.env): string {
  const bin = checkBinary(
    env[ENV_VAR] === undefined || env[ENV_VAR] === "" ? "ffmpeg" : env[ENV_VAR],
  );
  const probe = spawnSync(bin, ["-version"], {
    stdio: "ignore",
    timeout: PROBE_TIMEOUT_MS,
  });
  if (probe.error || probe.status !== 0) {
    throw new VisError(
      `ffmpeg not found (tried ${describeValue(bin)}): install ffmpeg on PATH or set ${ENV_VAR}. PNG, GIF and SVG exports work without it.`,
    );
  }
  return bin;
}

/** Quality in 0..1 → the encoder's scale. Out-of-range finite values clamp; NaN and non-numbers throw. */
function q01(quality: number): number {
  if (typeof quality !== "number" || Number.isNaN(quality))
    throw new VisError(
      `quality must be a number in 0..1, got ${describeValue(quality)}`,
    );
  return Math.min(1, Math.max(0, quality));
}

export function crfFor(
  format: "mp4" | "webm" | "avif",
  quality: number,
): number {
  const q = q01(quality);
  if (format === "mp4") return Math.round(35 - 20 * q);
  if (format === "webm") return Math.round(45 - 25 * q);
  return Math.round(50 - 30 * q);
}

/**
 * An output path ffmpeg will treat as a plain file name: it is the last
 * argument, so a leading "-" would be an option (or "-" alone, stdout), and a
 * URL-style prefix ("rtmp://", "pipe:", "concat:") would pick another protocol.
 * A Windows drive ("C:\\") and a relative "./a:b" are fine.
 */
function checkOut(out: unknown): string {
  if (
    typeof out !== "string" ||
    out === "" ||
    out.length > MAX_PATH_LENGTH ||
    out.includes("\0") ||
    out.startsWith("-") ||
    /^[A-Za-z][A-Za-z0-9+.-]+:/.test(out)
  )
    throw new VisError(
      `output path must be a file path of 1..${MAX_PATH_LENGTH} characters without NUL, not starting with "-" and not a URL or protocol (prefix "./" if needed), got ${describeValue(out)}`,
    );
  return out;
}

function checkSize(width: unknown, height: unknown, even: boolean): void {
  integerIn("width", width, 1, MAX_DIMENSION);
  integerIn("height", height, 1, MAX_DIMENSION);
  if (even && ((width as number) % 2 !== 0 || (height as number) % 2 !== 0))
    throw new VisError(
      `width and height must be even for this format (4:2:0 chroma), got ${String(width)}x${String(height)}`,
    );
}

function checkQuality(quality: unknown): number {
  return bounded("quality", quality, 0, 1);
}

function rawInput(width: number, height: number, fps: number): string[] {
  return [
    "-y",
    "-f",
    "rawvideo",
    "-pix_fmt",
    "rgba",
    "-s",
    `${width}x${height}`,
    "-r",
    String(fps),
    "-i",
    "-",
  ];
}

/**
 * Arguments for one RGBA frame on stdin → one still image at `out`. The codec
 * and container are named explicitly, so the file extension never decides
 * them. avif needs an ffmpeg with the avif muxer (6.0 or later). Alpha is kept
 * by webp only; jpeg and avif drop it.
 */
export function stillArgs(
  format: StillFormat,
  width: number,
  height: number,
  quality: number,
  out: string,
): string[] {
  checkSize(width, height, false);
  const q = checkQuality(quality);
  const path = checkOut(out);
  const base = [...rawInput(width, height, 1), "-frames:v", "1"];
  switch (format) {
    case "jpeg":
      return [
        ...base,
        "-c:v",
        "mjpeg",
        "-q:v",
        String(Math.round(2 + 29 * (1 - q))),
        "-f",
        "image2",
        "-update",
        "1",
        path,
      ];
    case "webp":
      return [
        ...base,
        "-c:v",
        "libwebp",
        "-quality",
        String(Math.round(100 * q)),
        "-f",
        "webp",
        path,
      ];
    case "avif":
      return [
        ...base,
        "-c:v",
        "libaom-av1",
        "-pix_fmt",
        "yuv420p",
        "-still-picture",
        "1",
        "-crf",
        String(crfFor("avif", q)),
        "-cpu-used",
        "6",
        "-f",
        "avif",
        path,
      ];
    default:
      throw new VisError(
        `still format must be jpeg|webp|avif, got ${describeValue(format)}`,
      );
  }
}

/**
 * Arguments for RGBA frames on stdin → a video (or APNG) at `out`; the
 * container is named explicitly, so the file extension never decides it. mp4
 * and webm need even sizes. `alpha` keeps transparency in webm and apng
 * (apng without it writes opaque rgb24); mp4 cannot and throws.
 */
export function videoArgs(
  format: VideoFormat,
  width: number,
  height: number,
  fps: number,
  quality: number,
  alpha: boolean,
  out: string,
): string[] {
  checkSize(width, height, format === "mp4" || format === "webm");
  bounded("fps", positive("fps", fps), 0, MAX_FPS);
  const q = checkQuality(quality);
  const withAlpha = parseFlag("alpha", alpha);
  if (withAlpha && format === "mp4")
    throw new VisError(
      "alpha is not supported by mp4 (H.264 yuv420p holds no transparency); use webm or apng",
    );
  const path = checkOut(out);
  const base = rawInput(width, height, fps);
  switch (format) {
    case "mp4":
      return [
        ...base,
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-crf",
        String(crfFor("mp4", q)),
        "-preset",
        "medium",
        "-movflags",
        "+faststart",
        "-f",
        "mp4",
        path,
      ];
    case "webm":
      return [
        ...base,
        "-c:v",
        "libvpx-vp9",
        "-pix_fmt",
        withAlpha ? "yuva420p" : "yuv420p",
        "-crf",
        String(crfFor("webm", q)),
        "-b:v",
        "0",
        ...(withAlpha ? ["-auto-alt-ref", "0"] : []),
        "-f",
        "webm",
        path,
      ];
    case "apng":
      return [
        ...base,
        "-c:v",
        "apng",
        "-pix_fmt",
        withAlpha ? "rgba" : "rgb24",
        "-plays",
        "0",
        "-f",
        "apng",
        path,
      ];
    default:
      throw new VisError(
        `video format must be mp4|webm|apng, got ${describeValue(format)}`,
      );
  }
}

type Outcome =
  { error: Error } | { code: number | null; signal: NodeJS.Signals | null };

function checkArgs(args: unknown): string[] {
  if (
    !Array.isArray(args) ||
    args.some((a) => typeof a !== "string" || a.includes("\0"))
  )
    throw new VisError(
      "ffmpeg arguments must be an array of strings without NUL",
    );
  return args as string[];
}

/** The last non-empty line of ffmpeg's stderr, bounded: ffmpeg redraws progress with "\r". */
function lastLine(stderr: string): string {
  const line =
    stderr
      .split(/[\r\n]+/)
      .map((l) => l.trim())
      .filter(Boolean)
      .at(-1) ?? "";
  return line.length > STDERR_QUOTE
    ? `${line.slice(0, STDERR_QUOTE)}...`
    : line;
}

/**
 * Pipe raw RGBA frames into ffmpeg over stdin and wait for it to finish. The
 * binary is spawned with an argument array and no shell. Resolves on exit 0.
 * Rejects with a VisError carrying the last stderr line when ffmpeg exits
 * non-zero or is killed, or cannot start. Backpressure is honoured (a frame is
 * written only once the previous ones drained); a broken pipe (ffmpeg exited
 * early) is not an error by itself: iteration stops and the exit status
 * decides. If `frames` throws, ffmpeg is killed and reaped and that error
 * propagates (a partly written output file is left for the caller to remove).
 * There is no overall timeout: encodes are legitimately long.
 */
export async function runFfmpeg(
  args: string[],
  frames: Iterable<Uint8Array> | AsyncIterable<Uint8Array>,
  bin: string = ffmpegPath(),
): Promise<void> {
  const argv = checkArgs(args);
  const program = checkBinary(bin);
  const child = spawn(program, argv, { stdio: ["pipe", "ignore", "pipe"] });
  let stderr = "";
  child.stderr.on("data", (d: Buffer) => {
    stderr = (stderr + d.toString()).slice(-STDERR_KEEP);
  });
  // EPIPE when ffmpeg exits early: the exit status reports it.
  child.stdin.on("error", () => undefined);

  // Settles once, when ffmpeg could not start (`error`) or has exited and closed its pipes.
  const finished = new Promise<Outcome>((resolve) => {
    child.once("error", (error) => {
      resolve({ error });
    });
    child.once("close", (code, signal) => {
      resolve({ code, signal });
    });
  });
  let over = false;
  const isOver = (): boolean => over; // read through a call: TS cannot see the callback below set it
  void finished.then(() => {
    over = true;
  });

  try {
    for await (const frame of frames) {
      if (isOver()) break;
      if (!(frame instanceof Uint8Array))
        throw new VisError(
          `every frame must be a Uint8Array, got ${describeValue(frame)}`,
        );
      if (!child.stdin.write(frame)) {
        const stop = new AbortController();
        // A broken pipe rejects the drain wait: stop feeding, the exit status decides.
        const drained = await Promise.race([
          once(child.stdin, "drain", { signal: stop.signal }).then(
            () => true,
            () => false,
          ),
          finished.then(() => false),
        ]);
        stop.abort();
        if (!drained) break;
      }
    }
  } catch (error) {
    child.kill("SIGKILL");
    child.stdin.destroy();
    await finished;
    throw error;
  }
  child.stdin.end();
  const outcome = await finished;

  if ("error" in outcome)
    throw new VisError(
      `could not start ffmpeg (${describeValue(program)}): ${messageOf(outcome.error)}`,
    );
  if (outcome.code !== 0)
    throw new VisError(
      `ffmpeg ${outcome.code === null ? `was killed by ${String(outcome.signal)}` : `exited with ${String(outcome.code)}`}: ${lastLine(stderr)}`,
    );
}
