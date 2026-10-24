import { describe, expect, it } from "vitest";
import { VisError } from "../../src/core/index.js";
import { GRAIN_FPS, TIME_RATE, timeCoords } from "../../src/field/time.js";

describe("timeCoords", () => {
  it("is linear without a loop", () => {
    expect(timeCoords(0)).toEqual({ z: 0, w: 0, theta: 0, grainFrame: 0 });
    const tc = timeCoords(2);
    expect(tc.z).toBeCloseTo(2 * TIME_RATE, 12);
    expect(tc.w).toBe(0);
    expect(tc.theta).toBeCloseTo(0.8, 12);
    expect(tc.grainFrame).toBe(2 * GRAIN_FPS);
  });

  it("is exactly periodic with a loop: t=0, t=T and t=2T give identical coords", () => {
    const a = timeCoords(0, 4);
    const b = timeCoords(4, 4);
    const c = timeCoords(8, 4);
    expect(b).toEqual(a);
    expect(c).toEqual(a);
    expect(a.w).toBe(0);
    expect(a.z).toBeCloseTo((TIME_RATE * 4) / (2 * Math.PI), 12);
  });

  it("walks a circle of radius TIME_RATE*T/2π with arc speed TIME_RATE", () => {
    const T = 6;
    const r = (TIME_RATE * T) / (2 * Math.PI);
    const tc = timeCoords(1.5, T);
    expect(Math.hypot(tc.z, tc.w)).toBeCloseTo(r, 12);
    expect(tc.theta).toBeCloseTo(Math.PI / 2, 12);
    expect(tc.grainFrame).toBe(Math.floor(0.25 * 6 * GRAIN_FPS));
  });

  it("wraps negative time into the loop and keeps the grain frame in range", () => {
    const tc = timeCoords(-1, 4);
    expect(tc.theta).toBeCloseTo((2 * Math.PI * 3) / 4, 12);
    expect(tc.grainFrame).toBe(72);
    expect(timeCoords(3.9999999, 4).grainFrame).toBeLessThan(4 * GRAIN_FPS);
  });

  it("keeps a loop shorter than one grain frame on a valid frame", () => {
    const tc = timeCoords(0.01, 0.02);
    expect(tc.grainFrame).toBe(0);
  });

  it("is periodic for a fractional loop and a large multiple", () => {
    const T = 2.5;
    expect(timeCoords(T * 1000, T)).toEqual(timeCoords(0, T));
    expect(timeCoords(-T, T)).toEqual(timeCoords(0, T));
  });

  it("is pure: the same input gives the same output", () => {
    expect(timeCoords(1.234, 5)).toEqual(timeCoords(1.234, 5));
    expect(timeCoords(1.234)).toEqual(timeCoords(1.234));
  });

  it.each<[string, number]>([
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["-Infinity", Number.NEGATIVE_INFINITY],
  ])("rejects a non-finite t (%s), naming t", (_name, t) => {
    expect(() => timeCoords(t)).toThrow(VisError);
    expect(() => timeCoords(t, 4)).toThrow(/\bt\b/);
  });

  it("rejects a non-number t", () => {
    expect(() => timeCoords("1" as unknown as number)).toThrow(/\bt\b/);
    expect(() => timeCoords(null as unknown as number)).toThrow(VisError);
  });

  it.each<[string, unknown]>([
    ["zero", 0],
    ["negative", -1],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["a string", "4"],
    ["null", null],
  ])("rejects a loop that is %s, naming loop", (_name, loop) => {
    expect(() => timeCoords(1, loop as number)).toThrow(VisError);
    expect(() => timeCoords(1, loop as number)).toThrow(/loop/);
  });
});
