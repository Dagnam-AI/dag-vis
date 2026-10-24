import { describe, expect, it } from "vitest";

import {
  beatFrame,
  defineTiming,
  framesFor,
  loopFrames,
} from "../../src/lib/timing.ts";
import type { Timing } from "../../src/lib/timing.ts";

const base = {
  fps: 30,
  width: 1920,
  height: 1080,
  duration: 6,
  beats: { a: 0, b: 1.5 },
  storyboard: [{ at: 0, caption: "start" }],
};

describe("framesFor", () => {
  it("converts whole seconds and exact fractions", () => {
    expect(framesFor(6, 30)).toBe(180);
    expect(framesFor(1.5, 30)).toBe(45);
    expect(loopFrames).toBe(framesFor);
  });
  it("rejects a non-integer frame count and a bad fps", () => {
    expect(() => framesFor(1.01, 30)).toThrow(/whole number of frames/);
    expect(() => framesFor(1, 29.97)).toThrow(/positive integer/);
    expect(() => framesFor(1, 0)).toThrow(/positive integer/);
    expect(() => framesFor(Number.POSITIVE_INFINITY, 30)).toThrow(
      /whole number/,
    );
  });
});

describe("defineTiming", () => {
  it("returns the timing frozen and typed by its beat names", () => {
    const t = defineTiming(base);
    expect(Object.isFrozen(t)).toBe(true);
    expect(Object.isFrozen(t.beats)).toBe(true);
    expect(Object.isFrozen(t.storyboard[0])).toBe(true);
    expect(beatFrame(t, "b")).toBe(45);
  });
  it.each<[Partial<Timing>, RegExp]>([
    [{ width: 1919 }, /even/],
    [{ height: 0 }, /even/],
    [{ duration: 0 }, /duration/],
    [{ duration: Number.POSITIVE_INFINITY }, /duration/],
    [{ duration: 1.01 }, /whole number of frames/],
    [{ beats: { a: 7 } }, /beat a/],
    [{ storyboard: [{ at: 6, caption: "x" }] }, /storyboard/],
    [{ storyboard: [{ at: 1, caption: "" }] }, /caption/],
  ])("rejects %j", (patch, re) => {
    expect(() => defineTiming({ ...base, ...patch })).toThrow(re);
  });
});
