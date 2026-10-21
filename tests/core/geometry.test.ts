import { describe, expect, it } from "vitest";

import { VisError } from "../../src/core/errors.js";
import {
  assertSize,
  fitAspect,
  focalTransform,
} from "../../src/core/geometry.js";

describe("assertSize", () => {
  it("accepts positive finite sizes", () => {
    expect(() => {
      assertSize({ width: 1, height: 0.5 });
    }).not.toThrow();
  });

  it.each([
    [{ width: 0, height: 1 }],
    [{ width: 1, height: -1 }],
    [{ width: Number.NaN, height: 1 }],
    [{ width: 1, height: Number.POSITIVE_INFINITY }],
  ])("rejects %j with VisError", (size) => {
    expect(() => {
      assertSize(size);
    }).toThrow(VisError);
  });
});

describe("fitAspect", () => {
  it("contains a wide motif in a tall box, centred", () => {
    expect(
      fitAspect({ width: 200, height: 100 }, { width: 100, height: 100 }),
    ).toEqual({ scale: 0.5, dx: 0, dy: 25 });
  });

  it("contains a tall motif in a wide box, centred", () => {
    expect(
      fitAspect({ width: 100, height: 200 }, { width: 100, height: 100 }),
    ).toEqual({ scale: 0.5, dx: 25, dy: 0 });
  });
});

describe("focalTransform", () => {
  it("places the motif centre at the focus and scales to the short side", () => {
    // scale 1: the motif's larger side equals min(width, height) = 100.
    // motif 50x100 -> k = 1; centre (25,50) must land at focus (0.5*200, 0.5*100) = (100,50).
    expect(
      focalTransform({
        width: 200,
        height: 100,
        focus: [0.5, 0.5],
        scale: 1,
        motif: { width: 50, height: 100 },
      }),
    ).toBe("translate(75 0) scale(1)");
  });

  it("keeps the motif shape across aspect ratios (only the crop changes)", () => {
    const wide = focalTransform({
      width: 400,
      height: 100,
      focus: [0, 0],
      scale: 2,
      motif: { width: 10, height: 10 },
    });
    const tall = focalTransform({
      width: 100,
      height: 400,
      focus: [0, 0],
      scale: 2,
      motif: { width: 10, height: 10 },
    });
    expect(wide).toBe("translate(-100 -100) scale(20)");
    expect(tall).toBe(wide);
  });

  it("validates the canvas size", () => {
    expect(() =>
      focalTransform({
        width: 0,
        height: 1,
        focus: [0, 0],
        scale: 1,
        motif: { width: 1, height: 1 },
      }),
    ).toThrow(VisError);
  });
});
