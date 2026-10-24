// `npm run audio -- <video>`: synthesise the bed from the video's audio.ts,
// normalise it to -16 LUFS, write public/generated/<video>.wav.
import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { applyGain, peak } from "../src/lib/audio/synth.ts";
import { encodeWav } from "../src/lib/audio/wav.ts";
import {
  SilentAudioError,
  checkBed,
  dbToLinear,
  gainToTarget,
} from "../src/lib/loudness.ts";
import { MOTION, cli, nameOrFail } from "./cli.ts";
import { measureLoudness } from "./ffmpeg.ts";

const USAGE = "node scripts/audio.ts <video>";
const [name] = cli(USAGE, [], 1).positionals as [string];
const video = nameOrFail(USAGE, name);
const { SAMPLE_RATE, renderBed } = (await import(
  `../src/videos/${video}/audio.ts`
)) as { SAMPLE_RATE: number; renderBed: () => Float32Array };

mkdirSync(resolve(MOTION, "public/generated"), { recursive: true });
const out = resolve(MOTION, `public/generated/${video}.wav`);
// An earlier bed is removed first, so a failed run leaves no WAV at the
// deliverable path for a later render to mux. The new one is built under a
// temporary name and published by rename only when the bed passes.
rmSync(out, { force: true });
const work = resolve(MOTION, `public/generated/${video}.work.wav`);
try {
  let bed = renderBed();
  writeFileSync(work, encodeWav(bed, SAMPLE_RATE));
  const before = measureLoudness(work);
  bed = applyGain(bed, dbToLinear(gainToTarget(before)));
  writeFileSync(work, encodeWav(bed, SAMPLE_RATE));
  const after = measureLoudness(work);
  console.log(JSON.stringify({ video, out, before, after, peak: peak(bed) }));
  const problems = checkBed(after);
  if (problems.length > 0) {
    console.error(
      [
        ...problems,
        "Lower the bed's dynamics (true peak) or its quiet parts (LRA) in audio.ts; the gain stage is exact, so a failure here is the material.",
        `Nothing was written to ${out}`,
      ].join("\n"),
    );
    process.exitCode = 1;
  } else renameSync(work, out);
} catch (e) {
  if (!(e instanceof SilentAudioError)) throw e;
  console.error(`${e.message}. Nothing was written to ${out}`);
  process.exitCode = 1;
} finally {
  rmSync(work, { force: true });
}
