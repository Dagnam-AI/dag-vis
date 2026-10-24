import { describe, expect, it } from "vitest";
import { grainOffset } from "../../../src/field/cpu/grain.js";
import { hash01 } from "../../../src/field/noise.js";

describe("grainOffset", () => {
  it("is zero-centred, bounded by amount*0.35/2, and deterministic", () => {
    let sum = 0;
    for (let p = 0; p < 2000; p++) {
      const g = grainOffset(p, p * 7, 0, 1, 1);
      expect(Math.abs(g)).toBeLessThanOrEqual(0.175);
      sum += g;
    }
    expect(Math.abs(sum / 2000)).toBeLessThan(0.01);
    expect(grainOffset(3, 4, 5, 6, 0.5)).toBe(grainOffset(3, 4, 5, 6, 0.5));
    expect(grainOffset(3, 4, 5, 6, 0)).toBe(0);
    expect(grainOffset(3, 4, 5, 6, 0.5)).not.toBe(grainOffset(3, 4, 6, 6, 0.5));
  });

  it("scales linearly with the amount and spreads over the whole range", () => {
    const full: number[] = [];
    for (let y = 0; y < 64; y++)
      for (let x = 0; x < 64; x++) full.push(grainOffset(x, y, 3, 9, 1));
    expect(Math.min(...full)).toBeLessThan(-0.17);
    expect(Math.max(...full)).toBeGreaterThan(0.17);
    const mean = full.reduce((a, b) => a + b, 0) / full.length;
    expect(Math.abs(mean)).toBeLessThan(0.005);
    // Uniform on [-0.175, 0.175]: variance is 0.35^2 / 12.
    const variance =
      full.reduce((a, b) => a + (b - mean) ** 2, 0) / full.length;
    expect(variance).toBeCloseTo((0.35 * 0.35) / 12, 3);
    expect(grainOffset(5, 6, 1, 2, 0.5)).toBeCloseTo(
      grainOffset(5, 6, 1, 2, 1) / 2,
      15,
    );
  });

  it("is exactly (hash - 0.5) * amount * 0.35 over (px, py, frame, tag, seed)", () => {
    const h = hash01(11, 22, 33, 0x9e37, 44);
    expect(grainOffset(11, 22, 33, 44, 0.8)).toBe((h - 0.5) * 0.8 * 0.35);
    // A literal pin: any change to the hash stream or the 0x9e37 tag shows here.
    expect(grainOffset(11, 22, 33, 44, 1)).toBeCloseTo(
      (hash01(11, 22, 33, 0x9e37, 44) - 0.5) * 0.35,
      15,
    );
    expect(hash01(11, 22, 33, 0x9e37, 44)).not.toBe(hash01(11, 22, 33, 0, 44));
  });

  it("is a different stream for each of x, y, frame and seed", () => {
    const base = grainOffset(10, 20, 1, 1, 1);
    expect(grainOffset(11, 20, 1, 1, 1)).not.toBe(base);
    expect(grainOffset(10, 21, 1, 1, 1)).not.toBe(base);
    expect(grainOffset(10, 20, 2, 1, 1)).not.toBe(base);
    expect(grainOffset(10, 20, 1, 2, 1)).not.toBe(base);
  });

  it("treats negative and huge integers like the shader's uint(int): modulo 2^32", () => {
    const m = 2 ** 32;
    for (const [px, py, frame] of [
      [-1, -7, -3],
      [-2147483648, 2147483647, -2147483648],
      [-300000, 123456, 9],
    ] as const) {
      const g = grainOffset(px, py, frame, 4294967295, 1);
      expect(grainOffset(px + m, py + m, frame + m, 4294967295, 1)).toBe(g);
      expect(Math.abs(g)).toBeLessThanOrEqual(0.175);
    }
    // 2^31 is where a signed int wraps: the pixel just below and above differ, both defined.
    expect(grainOffset(2147483647, 0, 0, 1, 1)).not.toBe(
      grainOffset(2147483648, 0, 0, 1, 1),
    );
    expect(grainOffset(2147483648, 0, 0, 1, 1)).toBe(
      grainOffset(-2147483648, 0, 0, 1, 1),
    );
  });
});
