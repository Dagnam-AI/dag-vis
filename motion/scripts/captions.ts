// `npm run captions -- <video>`: write the video's English WebVTT captions,
// from the CAPTIONS list of src/videos/<video>/timing.ts, to out/<video>/<video>.vtt.
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { cuesFromFrames, formatVtt, type Cue } from "../src/lib/vtt.ts";
import { MOTION, cli, fail, nameOrFail } from "./cli.ts";

const USAGE = "node scripts/captions.ts <video>";
const [name] = cli(USAGE, [], 1).positionals as [string];
const video = nameOrFail(USAGE, name);
const timing = (await import(`../src/videos/${video}/timing.ts`)) as {
  CAPTIONS?: { start: number; end: number; text: string }[];
  TIMING: { fps: number };
};
if (timing.CAPTIONS === undefined)
  fail(USAGE, `src/videos/${video}/timing.ts exports no CAPTIONS`);
let vtt: string;
try {
  const cues: Cue[] = cuesFromFrames(timing.CAPTIONS, timing.TIMING.fps);
  vtt = formatVtt(cues);
} catch (e) {
  fail(USAGE, `captions of ${video}: ${(e as Error).message}`);
}
const dir = resolve(MOTION, "out", video);
mkdirSync(dir, { recursive: true });
const out = resolve(dir, `${video}.vtt`);
writeFileSync(out, vtt);
console.log(out);
