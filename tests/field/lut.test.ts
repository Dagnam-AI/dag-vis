import { describe, expect, it } from "vitest";
import { VisError, parseColor } from "../../src/core/index.js";
import { LUT_SIZE, paletteLut, sampleLut } from "../../src/field/lut.js";

/** A palette with a hole at index 1 (an array literal with an elision trips lint). */
function holey(): string[] {
  const a = new Array<string>(3);
  a[0] = "#000000";
  a[2] = "#ffffff";
  return a;
}

describe("paletteLut", () => {
  it("has 256 RGB entries from the first to the last stop", () => {
    const lut = paletteLut(["#000000", "#ffffff"]);
    expect(lut).toBeInstanceOf(Float32Array);
    expect(lut.length).toBe(768);
    expect(LUT_SIZE).toBe(256);
    expect(lut[0]).toBe(0);
    expect(lut[765]).toBeCloseTo(1, 6);
    expect(lut[384]).toBeGreaterThan(0.3);
    expect(lut[384]).toBeLessThan(0.7);
  });
  it("starts and ends exactly on the first and last palette colours", () => {
    const palette = ["#ef4444", "oklch(0.7 0.15 250)", "rgb(10 200 30)"];
    const lut = paletteLut(palette);
    const first = parseColor(palette[0]!);
    const last = parseColor(palette[2]!);
    expect(Array.from(lut.slice(0, 3))).toEqual(
      [first.r, first.g, first.b].map(Math.fround),
    );
    expect(Array.from(lut.slice(765, 768))).toEqual(
      [last.r, last.g, last.b].map(Math.fround),
    );
  });
  it("passes through the interior stops", () => {
    // With 4 stops, entries 85 and 170 of 256 sit exactly on stops 1 and 2.
    const palette = ["#ff0000", "#00ff00", "#0000ff", "#ffff00"];
    const lut = paletteLut(palette);
    for (const [entry, stop] of [
      [85, 1],
      [170, 2],
    ] as const) {
      const c = parseColor(palette[stop]!);
      expect(lut[entry * 3]).toBeCloseTo(c.r, 5);
      expect(lut[entry * 3 + 1]).toBeCloseTo(c.g, 5);
      expect(lut[entry * 3 + 2]).toBeCloseTo(c.b, 5);
    }
  });
  it("is smooth and monotone for a black-to-white ramp", () => {
    const lut = paletteLut(["#000000", "#ffffff"]);
    for (let c = 0; c < 3; c++) {
      for (let i = 1; i < LUT_SIZE; i++) {
        const step = lut[i * 3 + c]! - lut[(i - 1) * 3 + c]!;
        expect(step).toBeGreaterThanOrEqual(0);
        expect(step).toBeLessThan(0.02);
      }
    }
    // Neutral greys: all three channels agree at every entry.
    for (let i = 0; i < LUT_SIZE; i++) {
      expect(lut[i * 3 + 1]).toBeCloseTo(lut[i * 3]!, 6);
      expect(lut[i * 3 + 2]).toBeCloseTo(lut[i * 3]!, 6);
    }
  });
  it("keeps every entry inside 0..1 for saturated stops", () => {
    for (const v of paletteLut(["#ff00ff", "#00ffff", "#ffff00"])) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
  it("ignores alpha (the texture is opaque RGB)", () => {
    expect(paletteLut(["#00000080", "#ffffff40"])).toEqual(
      paletteLut(["#000000", "#ffffff"]),
    );
  });
  it("rejects a bad palette with an error that names the parameter", () => {
    expect(() => paletteLut("#000" as unknown as string[])).toThrow(
      /palette must be an array/,
    );
    expect(() => paletteLut(["#000"])).toThrow(/palette needs at least 2/);
    expect(() => paletteLut([])).toThrow(VisError);
    expect(() => paletteLut(["#000", "nope"])).toThrow(/palette\[1\]/);
    expect(() => paletteLut(["#000", 5 as unknown as string])).toThrow(
      /palette\[1\] must be a colour string/,
    );
    expect(() => paletteLut(holey())).toThrow(/palette\[1\]/);
  });
});

describe("sampleLut", () => {
  it("interpolates and hits both ends exactly", () => {
    const lut = paletteLut(["#ff0000", "#0000ff"]);
    const out = new Float64Array(3);
    sampleLut(lut, 0, out);
    expect([out[0], out[1], out[2]]).toEqual([1, 0, 0]);
    sampleLut(lut, 1, out);
    expect(out[0]).toBeCloseTo(0, 6);
    expect(out[2]).toBeCloseTo(1, 6);
    sampleLut(lut, 0.5, out);
    expect(out[0]).toBeGreaterThan(0.2);
    expect(out[2]).toBeGreaterThan(0.2);
  });
  it("returns the stored entry at an exact index and blends between two", () => {
    const lut = paletteLut(["#102030", "#f0e0d0"]);
    const out = new Float64Array(3);
    sampleLut(lut, 100 / 255, out);
    for (let c = 0; c < 3; c++)
      expect(out[c]).toBeCloseTo(lut[100 * 3 + c]!, 6);
    sampleLut(lut, 100.25 / 255, out);
    for (let c = 0; c < 3; c++) {
      const a = lut[100 * 3 + c]!;
      const b = lut[101 * 3 + c]!;
      expect(out[c]).toBeCloseTo(a * 0.75 + b * 0.25, 6);
    }
  });
  it("clamps v to [0, 1] and rejects NaN", () => {
    const lut = paletteLut(["#ff0000", "#0000ff"]);
    const a = new Float64Array(3);
    const b = new Float64Array(3);
    sampleLut(lut, -3, a);
    sampleLut(lut, 0, b);
    expect(a).toEqual(b);
    sampleLut(lut, Infinity, a);
    sampleLut(lut, 1, b);
    expect(a).toEqual(b);
    expect(() => {
      sampleLut(lut, NaN, a);
    }).toThrow(/v must be/);
  });
  it("rejects an array that is not a palette LUT", () => {
    expect(() => {
      sampleLut(new Float32Array(10), 0.5, new Float64Array(3));
    }).toThrow(/lut must have/);
  });
});
