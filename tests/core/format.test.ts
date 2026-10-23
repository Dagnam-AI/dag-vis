import { describe, expect, it } from "vitest";

import { VisError } from "../../src/core/errors.js";
import { fmt } from "../../src/core/format.js";

describe("fmt", () => {
  it.each([
    [1, "1"],
    [1.5, "1.5"],
    [1.23456, "1.235"],
    [1.0004, "1"],
    [-0, "0"],
    [-0.0004, "0"],
    [-2.5, "-2.5"],
    [1000000, "1000000"],
    [0.1 + 0.2, "0.3"],
  ])("fmt(%s) === %s", (n, s) => {
    expect(fmt(n)).toBe(s);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "throws VisError on %s",
    (n) => {
      expect(() => fmt(n)).toThrow(VisError);
    },
  );
});

describe("fmt range", () => {
  it("takes every number a generator can emit, up to 1e15 exclusive", () => {
    expect(fmt(16384)).toBe("16384");
    expect(fmt(999_999_999_999_999)).toBe("999999999999999");
    expect(fmt(-999_999_999_999_999)).toBe("-999999999999999");
  });

  it.each([1e15, -1e15, 1e21, 1e306, -1e306, Number.MAX_VALUE])(
    "throws VisError, not exponent form or Infinity, on %s",
    (n) => {
      expect(() => fmt(n)).toThrow(VisError);
      expect(() => fmt(n)).toThrow(/magnitude/);
    },
  );
});
