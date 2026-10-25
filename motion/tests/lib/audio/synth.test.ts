import { describe, expect, it } from "vitest";

import {
  FLAT,
  applyGain,
  envelopeAt,
  noise,
  peak,
  silence,
  tone,
} from "../../../src/lib/audio/synth.ts";

const SR = 1000;

describe("envelopeAt", () => {
  const env = { attack: 0.1, decay: 0.1, sustain: 0.5, release: 0.2 };
  it("is 0 outside the note, ramps up, decays to sustain, holds, releases to 0", () => {
    expect(envelopeAt(env, -0.01, 1)).toBe(0);
    expect(envelopeAt(env, 1, 1)).toBe(0);
    expect(envelopeAt(env, 0.05, 1)).toBeCloseTo(0.5);
    expect(envelopeAt(env, 0.15, 1)).toBeCloseTo(0.75);
    expect(envelopeAt(env, 0.5, 1)).toBe(0.5);
    expect(envelopeAt(env, 0.9, 1)).toBeCloseTo(0.25);
  });
  it("FLAT is 1 for the whole note", () => {
    expect(envelopeAt(FLAT, 0, 1)).toBe(1);
    expect(envelopeAt(FLAT, 0.999, 1)).toBe(1);
  });
});

describe("tone", () => {
  it("adds a sine of the given frequency and gain inside [start, start+length), additive", () => {
    const buf = silence(1, SR);
    tone(buf, SR, {
      freq: 250,
      start: 0.25,
      length: 0.5,
      gain: 0.5,
      env: FLAT,
    });
    expect(buf[0]).toBe(0);
    expect(buf[999]).toBe(0);
    expect(buf[251]).toBeCloseTo(
      0.5 * Math.sin(2 * Math.PI * 250 * (1 / SR)),
      6,
    );
    tone(buf, SR, {
      freq: 250,
      start: 0.25,
      length: 0.5,
      gain: 0.5,
      env: FLAT,
    });
    expect(buf[251]).toBeCloseTo(Math.sin(2 * Math.PI * 250 * (1 / SR)), 6);
  });
  it("applies amplitude modulation when lfo is given, and clips the note at the buffer end", () => {
    const buf = silence(0.5, SR);
    tone(buf, SR, {
      freq: 100,
      start: 0.25,
      length: 10,
      gain: 1,
      env: FLAT,
      lfo: { freq: 1, depth: 0.5 },
    });
    expect(buf.length).toBe(500);
    expect(buf[250 + 2]).toBeCloseTo(
      (1 + 0.5 * Math.sin(2 * Math.PI * 1 * 0.002)) *
        Math.sin(2 * Math.PI * 100 * 0.002),
      6,
    );
  });
});

describe("noise", () => {
  it("is seeded (same seed, same samples), bounded, low-passed, and silent outside the note", () => {
    const a = silence(1, SR);
    const b = silence(1, SR);
    const c = silence(1, SR);
    const spec = {
      start: 0.1,
      length: 0.5,
      gain: 0.3,
      env: FLAT,
      seed: 3,
      cutoff: 200,
    };
    noise(a, SR, spec);
    noise(b, SR, spec);
    noise(c, SR, { ...spec, seed: 4 });
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    expect(a[0]).toBe(0);
    expect(a[700]).toBe(0);
    expect(peak(a)).toBeLessThanOrEqual(0.3);
    expect(peak(a)).toBeGreaterThan(0.01);
  });
  it("a lower cutoff is smoother than a higher one (sample-to-sample change)", () => {
    const rough = (cutoff: number): number => {
      const buf = silence(1, 8000);
      noise(buf, 8000, {
        start: 0,
        length: 1,
        gain: 1,
        env: FLAT,
        seed: 1,
        cutoff,
      });
      return buf.reduce((s, v, i) => s + Math.abs(v - (buf[i - 1] ?? 0)), 0);
    };
    expect(rough(100)).toBeLessThan(rough(2000));
  });
});

describe("peak / applyGain", () => {
  it("measures the absolute peak and scales a copy", () => {
    const buf = Float32Array.from([0.1, -0.6, 0.3]);
    expect(peak(buf)).toBeCloseTo(0.6);
    const scaled = applyGain(buf, 0.5);
    expect(Array.from(scaled)).toEqual(
      [0.05, -0.3, 0.15].map((v) => Math.fround(v)),
    );
    expect(buf[1]).toBeCloseTo(-0.6);
    expect(peak(silence(0, SR))).toBe(0);
  });
});
