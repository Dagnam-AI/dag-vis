// `npm run check:render -- <file.mp4> <video> [--json]`: picture and sound of a finished render.
import { resolve } from "node:path";

import { checkLoudness } from "../src/lib/loudness.ts";
import { checkSync, parseProbe } from "../src/lib/probe.ts";
import { loopFrames, type Timing } from "../src/lib/timing.ts";
import { ffprobe, measureLoudness } from "./ffmpeg.ts";

const [arg, video] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (!arg || !video || !/^[\w-]+$/.test(video))
  throw new Error(
    "usage: node scripts/check-render.ts <file.mp4> <video> [--json]",
  );
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
// A file without sound has nothing to measure; checkSync reports "no audio track".
const loudness = probe.audioDuration === null ? null : measureLoudness(file);
const problems = [
  ...checkSync(probe, {
    width: TIMING.width,
    height: TIMING.height,
    fps: TIMING.fps,
    frames: loopFrames(TIMING.duration, TIMING.fps),
  }),
  ...(loudness ? checkLoudness(loudness) : []),
];
const report = { file, video, probe, loudness, problems };
console.log(
  process.argv.includes("--json")
    ? JSON.stringify(report)
    : JSON.stringify(report, null, 2),
);
if (problems.length > 0) process.exit(1);
