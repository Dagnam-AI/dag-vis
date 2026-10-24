// `npm run audio -- <video>`: synthesise the bed from the video's audio.ts,
// normalise it to -16 LUFS, write public/generated/<video>.wav.
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { applyGain, peak } from "../src/lib/audio/synth.ts";
import { encodeWav } from "../src/lib/audio/wav.ts";
import {
  checkLoudness,
  dbToLinear,
  gainToTarget,
} from "../src/lib/loudness.ts";
import { MOTION, measureLoudness } from "./ffmpeg.ts";

const video = process.argv[2];
if (!video || !/^[\w-]+$/.test(video))
  throw new Error("usage: node scripts/audio.ts <video>");
const { SAMPLE_RATE, renderBed } = (await import(
  `../src/videos/${video}/audio.ts`
)) as { SAMPLE_RATE: number; renderBed: () => Float32Array };

mkdirSync(resolve(MOTION, "public/generated"), { recursive: true });
const out = resolve(MOTION, `public/generated/${video}.wav`);
let bed = renderBed();
writeFileSync(out, encodeWav(bed, SAMPLE_RATE));
const before = measureLoudness(out);
bed = applyGain(bed, dbToLinear(gainToTarget(before)));
writeFileSync(out, encodeWav(bed, SAMPLE_RATE));
const after = measureLoudness(out);
console.log(JSON.stringify({ video, out, before, after, peak: peak(bed) }));
const problems = checkLoudness(after);
if (problems.length > 0) {
  console.error(
    problems.join("\n"),
    "\nLower the bed's dynamics (true peak) or its quiet parts (LRA) in audio.ts; the gain stage is exact, so a failure here is the material.",
  );
  process.exit(1);
}
