import { mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type * as Cli from "../../scripts/cli.ts";
import { peak } from "../../src/lib/audio/synth.ts";
import { BED_TRUE_PEAK_MAX, TARGET } from "../../src/lib/loudness.ts";
import {
  SAMPLE_RATE,
  TICK_LENGTH,
  renderBackdrop,
  renderBed,
  renderPad,
} from "../../src/videos/quickstart/audio.ts";
import {
  EVENTS,
  FPS,
  TOTAL_FRAMES,
} from "../../src/videos/quickstart/timing.ts";
import { runScript } from "../scripts/harness.ts";

const AUDIO = fileURLToPath(new URL("../../scripts/audio.ts", import.meta.url));
const h = vi.hoisted(() => ({ motion: "" }));
vi.mock("../../scripts/cli.ts", async (original) => ({
  ...(await original<typeof Cli>()),
  get MOTION() {
    return h.motion;
  },
}));

const pictureSamples = (TOTAL_FRAMES / FPS) * SAMPLE_RATE;
const rms = (s: Float32Array): number =>
  Math.sqrt(s.reduce((sum, x) => sum + x * x, 0) / s.length);

// Synthesising 60 s of audio takes a few seconds on a busy machine: render once, give the suite room.
describe("quickstart bed", { timeout: 60_000 }, () => {
  const bed = renderBed();
  const backdrop = renderBackdrop();
  const padPeak = peak(renderPad());

  it("is exactly as long as the picture (1800 frames at 30 fps), not silent and not clipped", () => {
    expect(bed).toHaveLength(pictureSamples);
    expect(renderPad()).toHaveLength(pictureSamples);
    expect(peak(bed)).toBeGreaterThan(0.1);
    expect(peak(bed)).toBeLessThan(1);
    expect(bed.every(Number.isFinite)).toBe(true);
  });

  it("is deterministic", () => {
    expect(renderBed()).toEqual(bed);
  });

  it("fades in and out: the first and last samples are near silence", () => {
    expect(Math.abs(bed[0] ?? 1)).toBeLessThan(1e-3);
    expect(rms(bed.subarray(0, 480))).toBeLessThan(0.002);
    expect(rms(bed.subarray(-480))).toBeLessThan(0.01);
  });

  it("has a tick at every event and nowhere else: it equals the backdrop outside the tick windows", () => {
    const touched = new Uint8Array(bed.length);
    for (const e of EVENTS) {
      const from = Math.round((e.frame / FPS) * SAMPLE_RATE);
      // A step rings twice, the second blip 0.07 s after the first.
      const to = from + Math.round((TICK_LENGTH + 0.07) * SAMPLE_RATE);
      touched.fill(1, from, to);
      expect(to, e.beat).toBeLessThan(bed.length);
      const diff = bed
        .subarray(from, to)
        .map((v, i) => v - (backdrop[from + i] ?? 0));
      expect(
        peak(diff),
        `${e.beat} at frame ${String(e.frame)}`,
      ).toBeGreaterThan(0.02);
    }
    let strays = 0;
    for (let i = 0; i < bed.length; i += 1)
      if (touched[i] === 0 && bed[i] !== backdrop[i]) strays += 1;
    expect(strays).toBe(0);
  });

  it("keeps every tick soft: its peak is below the pad's own peak", () => {
    for (const e of EVENTS) {
      const from = Math.round((e.frame / FPS) * SAMPLE_RATE);
      const to = from + Math.round((TICK_LENGTH + 0.07) * SAMPLE_RATE);
      const tick = bed
        .subarray(from, to)
        .map((v, i) => v - (backdrop[from + i] ?? 0));
      expect(peak(tick)).toBeLessThan(padPeak / 2);
    }
  });
});

// The real scripts/audio.ts chain with the real ffmpeg, into a temp folder:
// synthesis, loudnorm measurement, exact gain, second measurement, publish. It
// cannot say the sound is good (nobody has listened); it says the file is not broken.
describe("quickstart: the normalised bed", () => {
  let tmp: string;
  let wav: Buffer;
  let report: {
    after: { integrated: number; truePeak: number; lra: number };
  };
  beforeAll(async () => {
    tmp = realpathSync(mkdtempSync(join(tmpdir(), "quickstart-sound-")));
    h.motion = tmp;
    const r = await runScript(AUDIO, ["quickstart"], { shared: true });
    expect(r.err).toBe("");
    expect(r.code).toBe(0);
    report = JSON.parse(r.out) as typeof report;
    wav = readFileSync(join(tmp, "public/generated/quickstart.wav"));
  }, 120_000);
  afterAll(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("is 16-bit stereo, as many samples as the picture is long", () => {
    const v = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
    expect([
      v.getUint16(22, true),
      v.getUint32(24, true),
      v.getUint16(34, true),
    ]).toEqual([2, SAMPLE_RATE, 16]);
    expect(v.getUint32(40, true) / 4).toBe(pictureSamples);
  });

  it("is at -16 LUFS within a unit, with the true peak at or below the bed ceiling", () => {
    expect(report.after.integrated).toBeGreaterThan(
      TARGET.integrated - TARGET.tolerance,
    );
    expect(report.after.integrated).toBeLessThan(
      TARGET.integrated + TARGET.tolerance,
    );
    expect(report.after.truePeak).toBeLessThanOrEqual(BED_TRUE_PEAK_MAX);
  });
});
