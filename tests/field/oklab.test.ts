import { describe, expect, it } from "vitest";
import {
  linearToSrgb,
  oklabToRgb,
  rgbToOklab,
  srgbToLinear,
} from "../../src/field/oklab.js";

describe("oklab", () => {
  it("round-trips sRGB colours within 1e-6", () => {
    const out = new Float64Array(3);
    for (const [r, g, b] of [
      [0, 0, 0],
      [1, 1, 1],
      [0.937, 0.267, 0.267],
      [0.1, 0.5, 0.9],
      [0.002, 0.5, 0.004],
    ] as const) {
      const [L, a, bb] = rgbToOklab(r, g, b);
      oklabToRgb(L, a, bb, out, 0);
      expect(out[0]).toBeCloseTo(r, 6);
      expect(out[1]).toBeCloseTo(g, 6);
      expect(out[2]).toBeCloseTo(b, 6);
    }
  });
  it("matches the published reference values for the sRGB primaries", () => {
    // Björn Ottosson's reference table (rounded to 5 digits).
    const cases: [number[], number[]][] = [
      [
        [1, 0, 0],
        [0.62796, 0.22486, 0.12585],
      ],
      [
        [0, 1, 0],
        [0.86644, -0.23389, 0.1795],
      ],
      [
        [0, 0, 1],
        [0.45201, -0.03246, -0.31153],
      ],
      [
        [1, 1, 1],
        [1, 0, 0],
      ],
      [
        [0, 0, 0],
        [0, 0, 0],
      ],
    ];
    for (const [rgb, lab] of cases) {
      const got = rgbToOklab(rgb[0]!, rgb[1]!, rgb[2]!);
      lab.forEach((v, i) => {
        expect(got[i]).toBeCloseTo(v, 4);
      });
    }
  });
  it("converts reference OKLab values back to the primaries", () => {
    const out = new Float64Array(3);
    oklabToRgb(0.62796, 0.22486, 0.12585, out, 0);
    expect(out[0]).toBeCloseTo(1, 3);
    expect(out[1]).toBeCloseTo(0, 3);
    expect(out[2]).toBeCloseTo(0, 3);
  });
  it("white is L=1, neutral a/b; black is L=0", () => {
    const [L, a, b] = rgbToOklab(1, 1, 1);
    expect(L).toBeCloseTo(1, 4);
    expect(a).toBeCloseTo(0, 4);
    expect(b).toBeCloseTo(0, 4);
    expect(rgbToOklab(0, 0, 0)[0]).toBe(0);
  });
  it("writes at the given offset and leaves the rest of the array alone", () => {
    const out = new Float64Array([9, 9, 9, 9, 9]);
    oklabToRgb(1, 0, 0, out, 1);
    expect(out[0]).toBe(9);
    expect(out[1]).toBeCloseTo(1, 6);
    expect(out[3]).toBeCloseTo(1, 6);
    expect(out[4]).toBe(9);
  });
  it("clamps out-of-gamut lab to [0,1] rgb", () => {
    const out = new Float64Array(3);
    oklabToRgb(0.5, 0.6, -0.6, out, 0);
    for (const c of out) {
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(1);
    }
    oklabToRgb(1.4, 0, 0, out, 0);
    for (const c of out) expect(c).toBeCloseTo(1, 12);
    oklabToRgb(-0.2, 0, 0, out, 0);
    for (const c of out) expect(c).toBe(0);
  });
  it("companding is piecewise and continuous at the knee", () => {
    expect(srgbToLinear(0.04045)).toBeCloseTo(srgbToLinear(0.040451), 5);
    expect(linearToSrgb(0.0031308)).toBeCloseTo(linearToSrgb(0.0031309), 5);
  });
  it("companding matches the sRGB definition and inverts itself", () => {
    expect(srgbToLinear(0.5)).toBeCloseTo(0.21404114, 7);
    expect(linearToSrgb(0.21404114)).toBeCloseTo(0.5, 7);
    expect(srgbToLinear(0.02)).toBeCloseTo(0.02 / 12.92, 12);
    expect(linearToSrgb(0.001)).toBeCloseTo(0.001 * 12.92, 12);
    for (let i = 0; i <= 20; i++)
      expect(linearToSrgb(srgbToLinear(i / 20))).toBeCloseTo(i / 20, 9);
  });
});
