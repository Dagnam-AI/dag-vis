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
