// `npm run check:render -- <file.mp4> <video> [--json]`: picture and sound of a finished render.
import { resolve } from "node:path";

import {
  SilentAudioError,
  checkLoudness,
  type Loudness,
} from "../src/lib/loudness.ts";
import { checkSync, parseProbe } from "../src/lib/probe.ts";
import { loopFrames, type Timing } from "../src/lib/timing.ts";
import { cli, fail } from "./cli.ts";
import { ffprobe, measureLoudness } from "./ffmpeg.ts";

const USAGE = "node scripts/check-render.ts <file.mp4> <video> [--json]";
const { flags, positionals } = cli(USAGE, ["json"], 2);
const [arg, video] = positionals as [string, string];
if (!/^[\w-]+$/.test(video)) fail(USAGE, `invalid video name: ${video}`);
// The ffmpeg wrapper runs from motion/, so hand it an absolute path.
const file = resolve(arg);
const { TIMING } = (await import(`../src/videos/${video}/timing.ts`)) as {
  TIMING: Timing;
};
const probed = ffprobe([
  "-v",
  "error",
  "-show_streams",
  "-show_format",
  "-of",
  "json",
  file,
]);
if (probed.status !== 0)
  throw new Error(`ffprobe exited ${String(probed.status)}: ${probed.stderr}`);
const probe = parseProbe(probed.stdout);
const problems = checkSync(probe, {
  width: TIMING.width,
  height: TIMING.height,
  fps: TIMING.fps,
  frames: loopFrames(TIMING.duration, TIMING.fps),
});
// A file without sound has nothing to measure (checkSync already says "no audio
// track"); a silent track is a named problem too, never a crash with no report.
let loudness: Loudness | null = null;
if (probe.audioDuration !== null)
  try {
    loudness = measureLoudness(file);
    problems.push(...checkLoudness(loudness));
  } catch (e) {
    if (!(e instanceof SilentAudioError)) throw e;
    problems.push(e.message);
  }
const report = { file, video, probe, loudness, problems };
console.log(
  flags.has("json") ? JSON.stringify(report) : JSON.stringify(report, null, 2),
);
if (problems.length > 0) process.exitCode = 1;
