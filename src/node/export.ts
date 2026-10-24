import { randomBytes } from "node:crypto";
import { mkdir, rename, rm, rmdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { VisError } from "../core/index.js";
import {
  assertOptions,
  describeValue,
  orDefault,
  parseFlag,
  parsePaint,
} from "../core/validate.js";
import { encodeGif } from "../export/gif.js";
import { animationPlan } from "../export/limits.js";
import { ffmpegPath, runFfmpeg, stillArgs, videoArgs } from "./ffmpeg.js";
import { frameSource } from "./frames.js";
import type { FrameSource } from "./frames.js";
import { messageOf } from "./util.js";

export const STATIC_FORMATS = ["png", "svg", "jpeg", "webp", "avif"] as const;
export const ANIMATION_FORMATS = [
  "gif",
  "apng",
  "mp4",
  "webm",
  "png-seq",
] as const;
export type StaticFormat = (typeof STATIC_FORMATS)[number];
export type AnimationFormat = (typeof ANIMATION_FORMATS)[number];

export interface StaticOptions {
  /** Whole pixels, 1..16384. */
  width: number;
  height: number;
  format: StaticFormat;
  /** File to write: resolved against the working directory, its folder must exist. An existing file is replaced, and only once the new one is complete. */
  out: string;
  /** Seconds into the animation; default 0. */
  t?: number;
  /** Loop period, so `t` lands on the same frame the animated export would produce. */
  loop?: number;
  /** 0..1 for jpeg, webp and avif; default 0.8. */
  quality?: number;
  /**
   * Opaque CSS colour that transparency is flattened onto for jpeg and avif,
   * which cannot hold it. Default black. png, svg and webp keep transparency
   * and ignore it; field specs are opaque anyway.
   */
  background?: string;
}

export interface AnimationOptions {
  /** Whole pixels, 1..16384; mp4 and webm need even sizes. */
  width: number;
  height: number;
  format: AnimationFormat;
  /** A file path, or for png-seq the folder (created if missing) that receives `frame-00000.png`, `frame-00001.png`, ... */
  out: string;
  /** Integer 1..60; default 30. */
  fps?: number;
  /** Seconds, up to 60; default 6. */
  duration?: number;
  /** 0..1 for mp4, webm; default 0.8. */
  quality?: number;
  /** Make the motion periodic over the whole clip (frames / fps) so the file loops without a seam. */
  loop?: boolean;
  /** Keep transparency: webm and apng only (png-seq always does); mp4 and gif cannot and throw. */
  alpha?: boolean;
  /**
   * Opaque CSS colour that transparency is flattened onto in the formats that
   * do not keep it (gif, mp4, and webm or apng without `alpha`). Default black.
   */
  background?: string;
  /** Also write frame 0 as a PNG (transparency kept) to this path, after the animation itself. */
  poster?: string;
  /** Receives advisories (default console.warn). */
  warn?: (message: string) => void;
}

/** Longest output path accepted (PATH_MAX on the common platforms). */
const MAX_PATH_LENGTH = 4096;
/** Formats that cannot hold transparency in a still. */
const OPAQUE_STILLS: readonly string[] = ["jpeg", "avif"];

function oneOf<T extends string>(
  name: string,
  value: unknown,
  list: readonly T[],
): T {
  const found = list.find((item) => item === value);
  if (found === undefined)
    throw new VisError(
      `${name} must be one of ${list.join("|")}, got ${describeValue(value)}`,
    );
  return found;
}

/** An absolute path from a user path; no shell ever sees it. */
function pathOf(name: string, value: unknown): string {
  if (
    typeof value !== "string" ||
    value === "" ||
    value.length > MAX_PATH_LENGTH ||
    value.includes("\0")
  )
    throw new VisError(
      `${name} must be a file path of 1..${MAX_PATH_LENGTH} characters without NUL, got ${describeValue(value)}`,
    );
  return resolve(value);
}

/** The opaque colour to flatten onto, as hex. */
function backgroundOf(value: unknown): string {
  const paint = parsePaint("background", orDefault<unknown>(value, "#000000"));
  if (paint.alpha !== 1)
    throw new VisError(
      `background must be an opaque colour, got ${describeValue(value)}`,
    );
  return paint.hex;
}

/** A filesystem step, with any failure reported as a VisError naming the parameter and path. */
function io<T>(name: string, path: string, step: Promise<T>): Promise<T> {
  return step.catch((error: unknown) => {
    throw new VisError(
      `could not write ${name} ${describeValue(path)}: ${messageOf(error)}`,
    );
  });
}

/**
 * Produce a file at `out` through a temporary file in the same folder and a
 * rename: the file only ever appears whole. A failure at any point removes the
 * temporary file (best effort) and leaves whatever was at `out` untouched, so
 * a half-written output never survives and an existing file is replaced only
 * by a complete one. The folder must exist.
 */
async function publish(
  name: string,
  out: string,
  produce: (temp: string) => Promise<void>,
): Promise<void> {
  const temp = join(
    dirname(out),
    `.dag-vis-${randomBytes(6).toString("hex")}.tmp`,
  );
  try {
    await produce(temp);
    await io(name, out, rename(temp, out));
  } catch (error) {
    await Promise.allSettled([rm(temp, { force: true })]);
    throw error;
  }
}

/** Write bytes or text to the temporary file `publish` hands over. */
const contents =
  (name: string, out: string, data: Uint8Array | string) =>
  (temp: string): Promise<void> =>
    io(name, out, writeFile(temp, data));

/**
 * Write one still: png and svg directly; jpeg, webp and avif through ffmpeg
 * (one frame piped in; needs ffmpeg, see `ffmpegPath`). Everything that can be
 * checked is checked before a frame is rendered or a file touched. Throws a
 * VisError naming the parameter.
 */
export async function exportStatic(
  spec: unknown,
  o: StaticOptions,
): Promise<void> {
  assertOptions(o);
  const format = oneOf("format", o.format, STATIC_FORMATS);
  const out = pathOf("out", o.out);
  const background = backgroundOf(o.background);
  const src = frameSource(spec, o.width, o.height, o.loop);
  const t = o.t ?? 0;
  switch (format) {
    case "svg": {
      const svg = src.svg(t);
      await publish("out", out, contents("out", out, svg));
      return;
    }
    case "png": {
      const png = await src.png(t);
      await publish("out", out, contents("out", out, png));
      return;
    }
    case "jpeg":
    case "webp":
    case "avif": {
      const argsFor = (path: string): string[] =>
        stillArgs(format, o.width, o.height, o.quality ?? 0.8, path);
      argsFor(out); // checks size, quality and path before anything is rendered
      const bin = ffmpegPath();
      const frame = await src.rgba(
        t,
        OPAQUE_STILLS.includes(format) ? background : undefined,
      );
      await publish("out", out, (temp) =>
        runFfmpeg(argsFor(temp), [frame], bin),
      );
      return;
    }
  }
}

/** frame-00000.png ... into the folder `out`; on failure the frames written so far (and a folder this call created) are removed. */
async function writeSequence(
  src: FrameSource,
  out: string,
  count: number,
  fps: number,
): Promise<void> {
  const created = await io("out", out, mkdir(out, { recursive: true }));
  const written: string[] = [];
  try {
    for (let i = 0; i < count; i++) {
      const file = join(out, `frame-${String(i).padStart(5, "0")}.png`);
      await publish("out", file, contents("out", file, await src.png(i / fps)));
      written.push(file);
    }
  } catch (error) {
    await Promise.allSettled(written.map((file) => rm(file, { force: true })));
    // Only the folder itself, and only if empty: a parent this call created may be left behind.
    if (created !== undefined) await Promise.allSettled([rmdir(out)]);
    throw error;
  }
}

/**
 * Write an animation by rendering frame i at t = i / fps: deterministic, with
 * no dropped frames. gif, png-seq and apng/mp4/webm (the last three through
 * ffmpeg, which must be installed). Everything that can be checked is checked
 * before a frame is rendered or a file touched; the frames are then rendered
 * and the file appears whole (see `StaticOptions.out`). `loop` makes frame
 * `count` equal frame 0. Throws a VisError naming the parameter.
 */
export async function exportAnimation(
  spec: unknown,
  o: AnimationOptions,
): Promise<void> {
  assertOptions(o);
  const format = oneOf("format", o.format, ANIMATION_FORMATS);
  const out = pathOf("out", o.out);
  const poster =
    o.poster === undefined ? undefined : pathOf("poster", o.poster);
  if (poster === out)
    throw new VisError("poster must be a different path from out");
  const alpha = parseFlag("alpha", orDefault<unknown>(o.alpha, false));
  const loop = parseFlag("loop", orDefault<unknown>(o.loop, false));
  if (alpha && (format === "gif" || format === "mp4"))
    throw new VisError(
      `alpha is not supported by ${format}; use webm or apng (png-seq always keeps transparency)`,
    );
  const background = backgroundOf(o.background);
  if (o.warn !== undefined && typeof o.warn !== "function")
    throw new VisError(`warn must be a function, got ${describeValue(o.warn)}`);
  const plan = animationPlan(
    {
      ...(o.fps === undefined ? {} : { fps: o.fps }),
      ...(o.duration === undefined ? {} : { duration: o.duration }),
      format,
      width: o.width,
    },
    o.warn,
  );
  // The clip plays count / fps seconds: that, not the requested duration, is the period of a seamless loop.
  const src = frameSource(
    spec,
    o.width,
    o.height,
    loop ? plan.count / plan.fps : undefined,
  );
  if (!src.animated)
    throw new VisError(
      `${(spec as { kind: string }).kind} specs are static; animate a field or ribbon spec`,
    );
  const flat =
    format === "gif" ||
    format === "mp4" ||
    ((format === "webm" || format === "apng") && !alpha)
      ? background
      : undefined;
  const at = (i: number): Promise<Uint8Array> => src.rgba(i / plan.fps, flat);

  let job: () => Promise<void>;
  switch (format) {
    case "gif":
      job = async () => {
        const gif = await encodeGif({
          width: o.width,
          height: o.height,
          fps: plan.fps,
          count: plan.count,
          frameAt: at,
        });
        await publish("out", out, contents("out", out, gif));
      };
      break;
    case "png-seq":
      job = () => writeSequence(src, out, plan.count, plan.fps);
      break;
    case "apng":
    case "mp4":
    case "webm": {
      const argsFor = (path: string): string[] =>
        videoArgs(
          format,
          o.width,
          o.height,
          plan.fps,
          o.quality ?? 0.8,
          alpha,
          path,
        );
      argsFor(out); // checks size, quality and path before anything is rendered
      const bin = ffmpegPath();
      async function* frames(): AsyncGenerator<Uint8Array> {
        for (let i = 0; i < plan.count; i++) yield await at(i);
      }
      job = () =>
        publish("out", out, (temp) => runFfmpeg(argsFor(temp), frames(), bin));
      break;
    }
  }
  const posterPng = poster === undefined ? undefined : await src.png(0);
  await job();
  if (poster !== undefined && posterPng !== undefined)
    await publish("poster", poster, contents("poster", poster, posterPng));
}
