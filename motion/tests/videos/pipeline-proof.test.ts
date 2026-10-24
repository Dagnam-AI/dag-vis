import { describe, expect, it } from "vitest";

import { framesFor, loopFrames } from "../../src/lib/timing.ts";
import { peak } from "../../src/lib/audio/synth.ts";
import {
  SAMPLE_RATE,
  SWELL_LENGTH,
  renderBed,
  renderDrone,
} from "../../src/videos/pipeline-proof/audio.ts";
import { TIMING } from "../../src/videos/pipeline-proof/timing.ts";

describe("pipeline-proof timing", () => {
  it("is a 6 s, 30 fps, 1920x1080 loop of 180 whole frames", () => {
    expect(TIMING).toMatchObject({ fps: 30, width: 1920, height: 1080 });
    expect(loopFrames(TIMING.duration, TIMING.fps)).toBe(180);
  });

  it("puts every storyboard frame on a whole frame inside the loop, in order", () => {
    const frames = TIMING.storyboard.map((s) => framesFor(s.at, TIMING.fps));
    expect(frames).toEqual([...frames].sort((a, b) => a - b));
    expect(frames[0]).toBe(0);
    expect(frames.at(-1)).toBe(179);
  });

  it("puts every beat on a whole frame", () => {
    for (const at of Object.values(TIMING.beats))
      expect(() => framesFor(at, TIMING.fps)).not.toThrow();
  });
});

describe("pipeline-proof bed", () => {
  const bed = renderBed();
  const drone = renderDrone();
  const lastSwellEnd = Math.max(...Object.values(TIMING.beats)) + SWELL_LENGTH;
  const stepsOf = (b: Float32Array): number[] =>
    Array.from(b.subarray(1), (v, i) => Math.abs(v - b[i]!));

  it("is exactly one loop long and not silent", () => {
    expect(bed).toHaveLength(TIMING.duration * SAMPLE_RATE);
    expect(peak(bed)).toBeGreaterThan(0.1);
    expect(peak(bed)).toBeLessThan(1);
  });

  it("is deterministic", () => {
    expect(renderBed()).toEqual(bed);
  });

  it("has swells at all (so the next tests compare against something)", () => {
    expect(bed).not.toEqual(drone);
  });

  it("is the bare drone from the last swell's end to the seam, sample for sample", () => {
    const from = Math.round(lastSwellEnd * SAMPLE_RATE);
    expect(from).toBeLessThan(bed.length);
    expect(bed.subarray(from)).toEqual(drone.subarray(from));
  });

  it("is the bare drone at the first sample, so the join sees no swell either side", () => {
    expect(bed[0]).toBe(drone[0]);
  });

  it("wraps with an ordinary step: the jump from the last sample to the first is no bigger than the drone's own steps", () => {
    const steps = stepsOf(drone);
    const seam = Math.abs(bed[0]! - bed.at(-1)!);
    expect(seam).toBeLessThanOrEqual(steps.reduce((m, v) => Math.max(m, v), 0));
    expect(seam).toBeGreaterThan(0);
  });
});
