import { describe, expect, it } from "vitest";

import {
  easeInOutCubic,
  easeOutCubic,
  lerp,
  progress,
  settle,
} from "../../src/lib/ease.ts";

describe("progress", () => {
  it("is 0 before the span, 1 after it, linear inside", () => {
    expect(progress(5, 10, 20)).toBe(0);
    expect(progress(10, 10, 20)).toBe(0);
    expect(progress(15, 10, 20)).toBe(0.5);
    expect(progress(20, 10, 20)).toBe(1);
    expect(progress(99, 10, 20)).toBe(1);
  });

  it("is a step at the frame for an empty span", () => {
    expect(progress(9, 10, 10)).toBe(0);
    expect(progress(10, 10, 10)).toBe(1);
  });
});

describe("easing", () => {
  it.each([easeOutCubic, easeInOutCubic])(
    "runs from 0 to 1, rising, and clamps outside",
    (ease) => {
      expect(ease(0)).toBe(0);
      expect(ease(1)).toBe(1);
      expect(ease(-3)).toBe(0);
      expect(ease(7)).toBe(1);
      let last = 0;
      for (let i = 1; i <= 20; i++) {
        const v = ease(i / 20);
        expect(v).toBeGreaterThanOrEqual(last);
        last = v;
      }
    },
  );

  it("starts fast for ease-out and slow for ease-in-out, and is symmetric at the middle", () => {
    expect(easeOutCubic(0.1)).toBeGreaterThan(0.25);
    expect(easeInOutCubic(0.1)).toBeLessThan(0.05);
    expect(easeInOutCubic(0.5)).toBe(0.5);
    expect(easeInOutCubic(0.9)).toBeCloseTo(1 - easeInOutCubic(0.1), 12);
  });
});

describe("lerp", () => {
  it("interpolates and extrapolates", () => {
    expect(lerp(10, 20, 0)).toBe(10);
    expect(lerp(10, 20, 0.25)).toBe(12.5);
    expect(lerp(10, 20, 1)).toBe(20);
  });
});

describe("settle", () => {
  it("is the identity up to `from`", () => {
    expect(settle(0, 100, 160)).toBe(0);
    expect(settle(100, 100, 160)).toBe(100);
  });

  it("slows to a stop at `to`, with the same speed as the identity where it starts", () => {
    const at = (f: number): number => settle(f, 100, 160);
    expect(at(101) - at(100)).toBeCloseTo(1, 1);
    expect(at(160) - at(159)).toBeLessThan(0.05);
    expect(at(160)).toBe(130);
    expect(at(500)).toBe(130);
    let last = 0;
    for (let f = 0; f <= 200; f++) {
      expect(at(f)).toBeGreaterThanOrEqual(last);
      last = at(f);
    }
  });

  it("does not move after `from` when there is no span", () => {
    expect(settle(50, 40, 40)).toBe(40);
  });
});
