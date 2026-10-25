import { mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type * as Cli from "../../scripts/cli.ts";
import { BED_TRUE_PEAK_MAX, TARGET } from "../../src/lib/loudness.ts";
import { loopFrames } from "../../src/lib/timing.ts";
import {
  SAMPLE_RATE,
  renderBed,
} from "../../src/videos/pipeline-proof/audio.ts";
import { TIMING } from "../../src/videos/pipeline-proof/timing.ts";
import { runScript } from "../scripts/harness.ts";

// Nobody can listen to the pipeline proof here, so this is the objective proxy:
// the real `scripts/audio.ts` chain (synthesis, ffmpeg loudnorm measurement, exact
// gain, second measurement, publish) runs into a temp folder with the real
// ffmpeg, and the WAV it publishes is analysed sample by sample. It cannot say
// the sound is good; it says the file is not broken.
const AUDIO = fileURLToPath(new URL("../../scripts/audio.ts", import.meta.url));
const h = vi.hoisted(() => ({ motion: "" }));
vi.mock("../../scripts/cli.ts", async (original) => ({
  ...(await original<typeof Cli>()),
  get MOTION() {
    return h.motion;
  },
}));

interface Wav {
  sampleRate: number;
  channels: number;
  bits: number;
  /** Frames, each channel's samples scaled to [-1, 1). */
  left: Float64Array;
  right: Float64Array;
  raw: Int16Array;
}
function readWav(file: string): Wav {
  const b = readFileSync(file);
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const channels = v.getUint16(22, true);
  const bytes = v.getUint32(40, true);
  const raw = new Int16Array(bytes / 2);
  for (let i = 0; i < raw.length; i++) raw[i] = v.getInt16(44 + i * 2, true);
  const frames = raw.length / channels;
  const left = new Float64Array(frames);
  const right = new Float64Array(frames);
  for (let i = 0; i < frames; i++) {
    left[i] = raw[i * channels]! / 32768;
    right[i] = raw[i * channels + 1]! / 32768;
  }
  return {
    sampleRate: v.getUint32(24, true),
    channels,
    bits: v.getUint16(34, true),
    left,
    right,
    raw,
  };
}

const db = (x: number): number => 20 * Math.log10(x);
const rms = (s: Float64Array): number =>
  Math.sqrt(s.reduce((sum, x) => sum + x * x, 0) / s.length);

/**
 * True peak by 4x oversampling with a windowed sinc (ITU-R BS.1770's method in
 * outline), independent of ffmpeg: the largest absolute interpolated value.
 */
function truePeak(s: Float64Array): number {
  const taps = 16;
  let max = 0;
  for (let i = 0; i < s.length; i++) {
    for (let phase = 1; phase < 4; phase++) {
      const at = i + phase / 4;
      let sum = 0;
      for (let k = -taps + 1; k <= taps; k++) {
        const j = i + k;
        if (j < 0 || j >= s.length) continue;
        const x = at - j;
        const sinc = Math.sin(Math.PI * x) / (Math.PI * x);
        const window = 0.5 + 0.5 * Math.cos((Math.PI * x) / (taps + 1));
        sum += s[j]! * sinc * window;
      }
      max = Math.max(max, Math.abs(sum));
    }
    max = Math.max(max, Math.abs(s[i]!));
  }
  return max;
}

let tmp: string;
let wav: Wav;
let report: {
  before: { integrated: number };
  after: { integrated: number; truePeak: number; lra: number };
};
beforeAll(async () => {
  tmp = realpathSync(mkdtempSync(join(tmpdir(), "proof-sound-")));
  h.motion = tmp;
  const r = await runScript(AUDIO, ["pipeline-proof"], { shared: true });
  expect(r.err).toBe("");
  expect(r.code).toBe(0);
  report = JSON.parse(r.out) as typeof report;
  wav = readWav(join(tmp, "public/generated/pipeline-proof.wav"));
}, 60_000);
afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("pipeline-proof: the generated sound", () => {
  it("is as long as the picture, in samples", () => {
    const seconds = loopFrames(TIMING.duration, TIMING.fps) / TIMING.fps;
    expect(seconds).toBe(6);
    expect(wav.left).toHaveLength(seconds * SAMPLE_RATE);
    expect(wav.raw).toHaveLength(seconds * SAMPLE_RATE * 2);
  });

  it("is 16-bit stereo at the bed's sample rate", () => {
    expect([wav.sampleRate, wav.channels, wav.bits]).toEqual([
      SAMPLE_RATE,
      2,
      16,
    ]);
  });

  it("has no NaN or infinite sample in the synthesised bed (a NaN would be written as a silent 0)", () => {
    const bed = renderBed();
    expect(bed.every(Number.isFinite)).toBe(true);
  });

  it("does not clip: no sample at full scale, and the peak leaves the headroom the bed check demands", () => {
    expect(wav.raw.every((x) => x > -32768 && x < 32767)).toBe(true);
    const peak = wav.left.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
    expect(peak).toBeLessThan(1);
    // A sample peak is never above the true peak, which loudnorm measured at or below the ceiling (0.1 dB for 16-bit rounding).
    expect(db(peak)).toBeLessThanOrEqual(BED_TRUE_PEAK_MAX + 0.1);
  });

  it("is well above silence: RMS over the whole loop and in every second", () => {
    expect(db(rms(wav.left))).toBeGreaterThan(-30);
    for (let s = 0; s < 6; s++) {
      const second = wav.left.subarray(s * SAMPLE_RATE, (s + 1) * SAMPLE_RATE);
      expect(db(rms(second)), `second ${String(s)}`).toBeGreaterThan(-45);
    }
  });

  it("puts the same signal in both channels", () => {
    expect(wav.right).toEqual(wav.left);
  });

  it("has a true peak below -1 dBTP by an oversampling measurement that does not use ffmpeg", () => {
    expect(db(truePeak(wav.left))).toBeLessThan(TARGET.truePeakMax);
  });

  it("reaches -16 LUFS within a unit, with true peak at or below the bed ceiling, by ffmpeg's loudnorm", () => {
    expect(report.after.integrated).toBeGreaterThan(
      TARGET.integrated - TARGET.tolerance,
    );
    expect(report.after.integrated).toBeLessThan(
      TARGET.integrated + TARGET.tolerance,
    );
    expect(report.after.truePeak).toBeLessThanOrEqual(BED_TRUE_PEAK_MAX);
    // The gain stage moved it: the raw bed was not already at target.
    expect(report.before.integrated).not.toBeCloseTo(
      report.after.integrated,
      0,
    );
  });
});
