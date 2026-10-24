// `npm run check:render -- <file.mp4> <video> [--json]`: picture and sound of a finished render.
// Every failure, including an unreadable file or an unknown video, is a named
// problem in the report (text and --json) and exit 1; none is a stack trace.
import { resolve } from "node:path";

import {
  SilentAudioError,
  checkLoudness,
  type Loudness,
} from "../src/lib/loudness.ts";
import { checkSync, parseProbe, type Probe } from "../src/lib/probe.ts";
import { loopFrames, type Timing } from "../src/lib/timing.ts";
import { cli, nameOrFail } from "./cli.ts";
import { ffprobe, measureLoudness } from "./ffmpeg.ts";

const USAGE = "node scripts/check-render.ts <file.mp4> <video> [--json]";
const { flags, positionals } = cli(USAGE, ["json"], 2);
const [arg, name] = positionals as [string, string];
const video = nameOrFail(USAGE, name);
// The ffmpeg wrapper runs from motion/, so hand it an absolute path.
const file = resolve(arg);

function finish(
  probe: Probe | null,
  loudness: Loudness | null,
  problems: string[],
): never {
  const report = { file, video, probe, loudness, problems };
  console.log(
    flags.has("json")
      ? JSON.stringify(report)
      : JSON.stringify(report, null, 2),
  );
  return process.exit(problems.length > 0 ? 1 : 0);
}
const message = (e: unknown): string =>
  e instanceof Error ? e.message : String(e);
const firstLine = (text: string): string => text.trim().split("\n")[0] ?? "";

let timing: Timing;
try {
  timing = (
    (await import(`../src/videos/${video}/timing.ts`)) as { TIMING: Timing }
  ).TIMING;
} catch (e) {
  finish(null, null, [
    `cannot load the timing of video ${video}: ${firstLine(message(e))}`,
  ]);
}

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
  finish(null, null, [
    `cannot read ${file}: ${firstLine(probed.stderr) === "" ? `ffprobe exited ${String(probed.status)}` : firstLine(probed.stderr)}`,
  ]);
let probe: Probe;
try {
  probe = parseProbe(probed.stdout);
} catch (e) {
  finish(null, null, [`cannot read ${file}: ${message(e)}`]);
}

const problems = checkSync(probe, {
  width: timing.width,
  height: timing.height,
  fps: timing.fps,
  frames: loopFrames(timing.duration, timing.fps),
});
// A file without sound has nothing to measure (checkSync already says "no audio
// track"); a silent track or a failed measurement is a named problem too.
let loudness: Loudness | null = null;
if (probe.audioDuration !== null)
  try {
    loudness = measureLoudness(file);
    problems.push(...checkLoudness(loudness));
  } catch (e) {
    problems.push(
      e instanceof SilentAudioError
        ? e.message
        : `cannot measure the loudness of ${file}: ${firstLine(message(e))}`,
    );
  }
finish(probe, loudness, problems);
