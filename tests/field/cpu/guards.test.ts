import { describe, expect, it } from "vitest";
import { VisError } from "../../../src/core/index.js";
import {
  assertPixelCount,
  assertPositiveSize,
  UV_REACH,
  uvError,
} from "../../../src/field/cpu/guards.js";

describe("assertPositiveSize", () => {
  it("accepts positive finite numbers, fractions included", () => {
    expect(() => {
      assertPositiveSize("width", 1);
    }).not.toThrow();
    expect(() => {
      assertPositiveSize("width", 0.5);
    }).not.toThrow();
  });

  it.each([0, -1, NaN, Infinity, -Infinity, "8", null, undefined])(
    "rejects %s, naming the parameter",
    (bad) => {
      expect(() => {
        assertPositiveSize("height", bad as number);
      }).toThrow(VisError);
      expect(() => {
        assertPositiveSize("height", bad as number);
      }).toThrow(/^height must be a positive finite number, got /);
    },
  );
});

describe("assertPixelCount", () => {
  it("accepts positive integers", () => {
    expect(() => {
      assertPixelCount("width", 1);
    }).not.toThrow();
    expect(() => {
      assertPixelCount("width", 16384);
    }).not.toThrow();
  });

  it.each([0, -1, 0.5, 2.5, NaN, Infinity, "8", null, undefined])(
    "rejects %s, naming the parameter",
    (bad) => {
      expect(() => {
        assertPixelCount("height", bad as number);
      }).toThrow(VisError);
      expect(() => {
        assertPixelCount("height", bad as number);
      }).toThrow(/^height must be a positive integer number of pixels, got /);
    },
  );
});

describe("UV_REACH", () => {
  it("is the shared coordinate limit of the Gaussian-based samplers", () => {
    expect(UV_REACH).toBe(1e6);
  });
});

describe("uvError", () => {
  it("always throws a VisError naming the coordinate, the value and the limit", () => {
    expect(() => uvError("u", NaN, 5)).toThrow(VisError);
    expect(() => uvError("v", 7, 5)).toThrow(
      /^v must be a finite number within ±5, got 7/,
    );
  });
});
