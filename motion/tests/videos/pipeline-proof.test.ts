import { describe, expect, it } from "vitest";

import { framesFor, loopFrames } from "../../src/lib/timing.ts";
import { peak } from "../../src/lib/audio/synth.ts";
import {
  SAMPLE_RATE,
  renderBed,
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

  it("is exactly one loop long and not silent", () => {
    expect(bed).toHaveLength(TIMING.duration * SAMPLE_RATE);
    expect(peak(bed)).toBeGreaterThan(0.1);
    expect(peak(bed)).toBeLessThan(1);
  });

  it("is deterministic", () => {
    expect(renderBed()).toEqual(bed);
  });

  it("wraps without a step: the jump from the last sample to the first is no bigger than the steps inside the loop", () => {
    let largest = 0;
    for (let i = 1; i < bed.length; i++)
      largest = Math.max(largest, Math.abs(bed[i]! - bed[i - 1]!));
    const seam = Math.abs(bed[0]! - bed.at(-1)!);
    expect(seam).toBeLessThanOrEqual(largest);
  });

  it("ends every swell before the seam, so the noise is quiet around it", () => {
    const tail = bed.subarray(Math.round(5.8 * SAMPLE_RATE));
    const head = bed.subarray(0, Math.round(0.05 * SAMPLE_RATE));
    // the only things sounding at the seam are the two sines
    expect(peak(tail)).toBeLessThan(0.3);
    expect(peak(head)).toBeLessThan(0.3);
  });
});
