// Remotion's bundled ffmpeg/ffprobe (n7.1, size-reduced: loudnorm and silencedetect
// are present; ebur128, astats and volumedetect are not). MOTION_FFMPEG /
// MOTION_FFPROBE point at a system build instead. Arguments always go as an array.
// The local remotion bin is spawned by path, never through npx, so a missing
// install fails with an error instead of reaching for the registry.
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseLoudnorm, type Loudness } from "../src/lib/loudness.ts";

// Run from motion/ whatever the caller's cwd is: the remotion bin and the output folders are relative to it.
export const MOTION = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const REMOTION_BIN = resolve(MOTION, "node_modules/.bin/remotion");

export interface Run {
  stdout: string;
  stderr: string;
  status: number;
}
const run = (cmd: string, args: string[]): Run => {
  const r = spawnSync(cmd, args, {
    cwd: MOTION,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.error) throw r.error;
  return { stdout: r.stdout, stderr: r.stderr, status: r.status ?? 1 };
};
export const ffmpeg = (args: string[]): Run =>
  process.env.MOTION_FFMPEG
    ? run(process.env.MOTION_FFMPEG, args)
    : run(REMOTION_BIN, ["ffmpeg", ...args]);
export const ffprobe = (args: string[]): Run =>
  process.env.MOTION_FFPROBE
    ? run(process.env.MOTION_FFPROBE, args)
    : run(REMOTION_BIN, ["ffprobe", ...args]);

export const LOUDNORM_ARGS = (file: string): string[] => [
  "-hide_banner",
  "-nostats",
  "-i",
  file,
  // Audio only: a video stream cannot go to the null muxer in this size-reduced build.
  "-vn",
  "-af",
  "loudnorm=I=-16:TP=-1:LRA=11:print_format=json",
  "-f",
  "null",
  "-",
];

/** Integrated loudness, true peak and range of `file` (absolute path), measured with loudnorm. */
export function measureLoudness(file: string): Loudness {
  const r = ffmpeg(LOUDNORM_ARGS(file));
  if (r.status !== 0)
    throw new Error(
      `ffmpeg exited ${String(r.status)} measuring ${file}: ${r.stderr.slice(-500)}`,
    );
  return parseLoudnorm(r.stderr);
}
